export type RepositoryFileInput = {
  path: string;
  mediaType: string;
  sha256: string;
  content: string;
  delete?: boolean;
};

export type RepositoryAssetReference = {
  repositoryPath: string;
  previewUrl: string;
  mediaType: string;
  sha256: string;
  bytes: number;
};

type StoredAsset = {
  namespace: string;
  path: string;
  mediaType: string;
  sha256: string;
  content: ArrayBuffer;
  delete?: boolean;
};

const databaseName = 'rinspace-markdown-assets-v1';
const objectStoreName = 'assets';
const maxImageBytes = 10 * 1024 * 1024;

function openAssetDatabase() {
  if (!('indexedDB' in window)) return Promise.resolve<IDBDatabase | null>(null);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(objectStoreName)) {
        request.result.createObjectStore(objectStoreName, { keyPath: ['namespace', 'path'] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open the Markdown asset store.'));
  });
}

async function sha256Hex(content: ArrayBuffer) {
  const digest = await window.crypto.subtle.digest('SHA-256', content);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function imageExtension(mediaType: string) {
  switch (mediaType.toLowerCase().split(';')[0]) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    default: throw new Error('Only PNG, JPEG, GIF and WebP images can be stored in Markdown repositories.');
  }
}

function arrayBufferToBase64(content: ArrayBuffer) {
  const bytes = new Uint8Array(content);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(content: string) {
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function validManagedRepositoryPath(path: string) {
  return /^assets\/images\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/.test(path) ||
    /^assets\/quiver\/[a-z0-9][a-z0-9_-]{0,63}\.(?:svg|tikzcd|pending\.tikzcd)$/.test(path);
}

function replaceAllLiteral(value: string, search: string, replacement: string) {
  return search ? value.split(search).join(replacement) : value;
}

function repositoryPathFromPreview(value: string) {
  const marker = '#rin-repository-path=';
  const index = value.indexOf(marker);
  if (index < 0) return '';
  try {
    return decodeURIComponent(value.slice(index + marker.length));
  } catch {
    return '';
  }
}

function quiverIDFromPath(value: string) {
  const path = repositoryPathFromPreview(value) || value.replace(/^\.\//, '');
  return path.match(/^assets\/quiver\/([a-z0-9][a-z0-9_-]{0,63})\.svg$/)?.[1] || '';
}

function markdownReferencesQuiver(markdown: string, pendingPath: string) {
  const id = pendingPath.match(/^assets\/quiver\/([a-z0-9][a-z0-9_-]{0,63})\.pending\.tikzcd$/)?.[1];
  return Boolean(id && markdown.includes(`assets/quiver/${id}.svg`));
}

export class MilkdownRepositoryAssetHost {
  private readonly namespace: string;
  private resolveRepositoryUrl?: (path: string) => string;
  private readonly assets = new Map<string, StoredAsset>();
  private readonly pathToPreview = new Map<string, string>();
  private readonly previewToPath = new Map<string, string>();
  private readonly objectUrls = new Set<string>();
  private database: IDBDatabase | null = null;
  private readonly readyPromise: Promise<void>;

  constructor(namespace: string, resolveRepositoryUrl?: (path: string) => string) {
    this.namespace = namespace;
    this.resolveRepositoryUrl = resolveRepositoryUrl;
    this.readyPromise = this.restore().catch(() => {
      this.database = null;
    });
  }

  ready() {
    return this.readyPromise;
  }

  setRepositoryUrlResolver(resolveRepositoryUrl?: (path: string) => string) {
    this.resolveRepositoryUrl = resolveRepositoryUrl;
    if (!resolveRepositoryUrl) return;
    this.pathToPreview.forEach((previewUrl, repositoryPath) => {
      if (previewUrl.startsWith('blob:')) return;
      const nextUrl = resolveRepositoryUrl(repositoryPath) || repositoryPath;
      this.previewToPath.delete(previewUrl);
      this.pathToPreview.set(repositoryPath, nextUrl);
      this.previewToPath.set(nextUrl, repositoryPath);
    });
  }

  private async restore() {
    this.database = await openAssetDatabase();
    if (!this.database) return;
    const records = await new Promise<StoredAsset[]>((resolve, reject) => {
      const namespaceRange = IDBKeyRange.bound(
        [this.namespace, ''],
        [this.namespace, '\uffff'],
      );
      const request = this.database?.transaction(objectStoreName).objectStore(objectStoreName).getAll(namespaceRange);
      if (!request) return resolve([]);
      request.onsuccess = () => resolve(request.result as StoredAsset[]);
      request.onerror = () => reject(request.error || new Error('Unable to restore Markdown assets.'));
    });
    records.forEach((record) => this.remember(record));
  }

  private remember(record: StoredAsset) {
    const previous = this.pathToPreview.get(record.path);
    const existing = this.assets.get(record.path);
    this.assets.set(record.path, record);
    if (record.delete) {
      this.pathToPreview.delete(record.path);
      return '';
    }
    if (previous && existing?.sha256 === record.sha256) {
      this.previewToPath.set(previous, record.path);
      return previous;
    }
    const objectUrl = URL.createObjectURL(new Blob([record.content], { type: record.mediaType }));
    this.objectUrls.add(objectUrl);
    const preview = `${objectUrl}#rin-repository-path=${encodeURIComponent(record.path)}`;
    this.pathToPreview.set(record.path, preview);
    this.previewToPath.set(preview, record.path);
    return preview;
  }

  private async persist(record: StoredAsset) {
    this.remember(record);
    if (!this.database) return;
    await new Promise<void>((resolve, reject) => {
      const request = this.database?.transaction(objectStoreName, 'readwrite').objectStore(objectStoreName).put(record);
      if (!request) return resolve();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Unable to persist the Markdown asset.'));
    });
  }

  private async stageDeletion(repositoryPath: string) {
    await this.persist({
      namespace: this.namespace,
      path: repositoryPath,
      mediaType: '',
      sha256: '',
      content: new ArrayBuffer(0),
      delete: true,
    });
  }

  async stageImage(file: File): Promise<RepositoryAssetReference> {
    if (file.size <= 0 || file.size > maxImageBytes) throw new Error('The image must be between 1 byte and 10 MB.');
    const mediaType = file.type.toLowerCase().split(';')[0];
    const extension = imageExtension(mediaType);
    const content = await file.arrayBuffer();
    const sha256 = await sha256Hex(content);
    const repositoryPath = `assets/images/${sha256}.${extension}`;
    await this.persist({ namespace: this.namespace, path: repositoryPath, mediaType, sha256, content });
    return {
      repositoryPath,
      previewUrl: this.pathToPreview.get(repositoryPath) || repositoryPath,
      mediaType,
      sha256,
      bytes: content.byteLength,
    };
  }

  async stageQuiver(source: string, svg: string, replacingImageSrc = ''): Promise<RepositoryAssetReference> {
    const existingID = quiverIDFromPath(replacingImageSrc);
    const logicalID = existingID || window.crypto.randomUUID().toLowerCase();
    const svgPath = `assets/quiver/${logicalID}.svg`;
    const sourcePath = `assets/quiver/${logicalID}.tikzcd`;
    const svgContent = new TextEncoder().encode(svg).buffer;
    const sourceContent = new TextEncoder().encode(source.trim()).buffer;
    const [svgHash, sourceHash] = await Promise.all([sha256Hex(svgContent), sha256Hex(sourceContent)]);
    await this.persist({ namespace: this.namespace, path: svgPath, mediaType: 'image/svg+xml', sha256: svgHash, content: svgContent });
    await this.persist({ namespace: this.namespace, path: sourcePath, mediaType: 'text/x-tex', sha256: sourceHash, content: sourceContent });
    await this.stageDeletion(`assets/quiver/${logicalID}.pending.tikzcd`);
    return {
      repositoryPath: svgPath,
      previewUrl: this.pathToPreview.get(svgPath) || svgPath,
      mediaType: 'image/svg+xml',
      sha256: svgHash,
      bytes: svgContent.byteLength,
    };
  }

  async stagePendingQuiver(source: string, replacingImageSrc = '') {
    const existingID = quiverIDFromPath(replacingImageSrc);
    const logicalID = existingID || window.crypto.randomUUID().toLowerCase();
    const repositoryPath = `assets/quiver/${logicalID}.pending.tikzcd`;
    const content = new TextEncoder().encode(source.trim()).buffer;
    const sha256 = await sha256Hex(content);
    await this.persist({
      namespace: this.namespace,
      path: repositoryPath,
      mediaType: 'text/x-tex',
      sha256,
      content,
    });
    return repositoryPath;
  }

  hasPendingQuiver(markdown?: string) {
    return Array.from(this.assets.values()).some((asset) =>
      !asset.delete &&
      asset.path.endsWith('.pending.tikzcd') &&
      (markdown === undefined || markdownReferencesQuiver(markdown, asset.path)),
    );
  }

  serializeMarkdown(markdown: string) {
    let result = markdown;
    this.previewToPath.forEach((repositoryPath, previewUrl) => {
      result = replaceAllLiteral(result, previewUrl, repositoryPath);
    });
    return result;
  }

  hydrateMarkdown(markdown: string) {
    let result = markdown;
    this.pathToPreview.forEach((previewUrl, repositoryPath) => {
      result = replaceAllLiteral(result, repositoryPath, previewUrl);
    });
    if (!this.resolveRepositoryUrl) return result;
    return result.replace(/(!\[[^\]]*\]\()((?:\.\/)?assets\/(?:images|quiver)\/[^)\s]+)(?=[\s)])/g, (_match, prefix: string, rawPath: string) => {
      const repositoryPath = rawPath.replace(/^\.\//, '');
      const previewUrl = this.resolveRepositoryUrl?.(repositoryPath) || repositoryPath;
      this.pathToPreview.set(repositoryPath, previewUrl);
      this.previewToPath.set(previewUrl, repositoryPath);
      return prefix + previewUrl;
    });
  }

  async readQuiverSource(imageSrc: string) {
    const id = quiverIDFromPath(imageSrc);
    if (!id) throw new Error('Missing Quiver repository asset identifier.');
    const pendingPath = `assets/quiver/${id}.pending.tikzcd`;
    const pending = this.assets.get(pendingPath);
    if (pending && !pending.delete) return new TextDecoder().decode(pending.content);
    const sourcePath = `assets/quiver/${id}.tikzcd`;
    const local = this.assets.get(sourcePath);
    if (local && !local.delete) return new TextDecoder().decode(local.content);
    for (const repositoryPath of [pendingPath, sourcePath]) {
      const sourceUrl = this.resolveRepositoryUrl?.(repositoryPath);
      if (!sourceUrl) continue;
      const response = await fetch(sourceUrl, { redirect: 'error' });
      if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
        return response.text();
      }
    }
    throw new Error('The Quiver repository source could not be loaded.');
  }

  async collectRepositoryFiles(markdown?: string): Promise<RepositoryFileInput[]> {
    await this.ready();
    return this.snapshotRepositoryFiles(markdown);
  }

  snapshotRepositoryFiles(markdown?: string): RepositoryFileInput[] {
    return Array.from(this.assets.values())
      .filter((asset) =>
        markdown === undefined ||
        asset.delete ||
        !asset.path.endsWith('.pending.tikzcd') ||
        markdownReferencesQuiver(markdown, asset.path),
      )
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((asset) => ({
        path: asset.path,
        mediaType: asset.mediaType,
        sha256: asset.sha256,
        content: arrayBufferToBase64(asset.content),
        ...(asset.delete ? { delete: true } : {}),
      }));
  }

  async importRepositoryFiles(files: RepositoryFileInput[] = []) {
    await this.ready();
    for (const file of files) {
      if (!validManagedRepositoryPath(file.path)) {
        continue;
      }
      if (file.delete) {
        if (file.path.endsWith('.pending.tikzcd')) await this.stageDeletion(file.path);
        continue;
      }
      if (!/^[a-f0-9]{64}$/.test(file.sha256)) continue;
      let content: ArrayBuffer;
      try {
        content = base64ToArrayBuffer(file.content);
      } catch {
        continue;
      }
      if (content.byteLength <= 0 || content.byteLength > maxImageBytes) continue;
      if (await sha256Hex(content) !== file.sha256) continue;
      await this.persist({
        namespace: this.namespace,
        path: file.path,
        mediaType: file.mediaType,
        sha256: file.sha256,
        content,
      });
    }
  }

  async clearPersistedRepositoryFiles() {
    await this.ready();
    const keepRecords = Array.from(this.assets.values()).filter(
      (asset) => !asset.delete && asset.path.endsWith('.pending.tikzcd'),
    );
    this.assets.clear();
    keepRecords.forEach((record) => {
      this.assets.set(record.path, record);
    });
    if (!this.database) return;
    const namespaceRange = IDBKeyRange.bound(
      [this.namespace, ''],
      [this.namespace, '\uffff'],
    );
    await new Promise<void>((resolve, reject) => {
      const request = this.database?.transaction(objectStoreName, 'readwrite').objectStore(objectStoreName).delete(namespaceRange);
      if (!request) return resolve();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Unable to clear committed Markdown assets.'));
    });
    await Promise.all(keepRecords.map((record) => this.persist(record)));
  }

  dispose() {
    this.objectUrls.forEach((value) => URL.revokeObjectURL(value));
    this.objectUrls.clear();
    this.database?.close();
  }
}

export function repositoryAssetUrl(post: { id: string; type?: string; repositorySource?: { commit: string; entrypoint: string; url: string }; pendingCommit?: string }, path: string) {
  const source = post.repositorySource;
  if (!source) return path;
  const commit = post.pendingCommit || source.commit;
  if (!/^[a-f0-9]{40}$/.test(commit)) return path;
  const owner = post.type === 'book' ? 'b' : 'a';
  const repositoryPath = path.replace(/^\.\//, '');
  return `/repos/${owner}/${encodeURIComponent(post.id)}/raw/commit/${commit}/${repositoryPath.split('/').map(encodeURIComponent).join('/')}#rin-repository-path=${encodeURIComponent(repositoryPath)}`;
}
