import { publicEnv } from '@/app/config/env';
export type RinRenderer = 'katex' | 'mathjax';
export type RinView = 'split' | 'source' | 'preview';
export type RinEventName = 'change' | 'error' | 'preview' | 'ready' | 'save';
export type RinWriterMode = 'article' | 'book';
export type RinLatexTemplateKind = 'latex-article' | 'latex-book';

export type RinProjectFile = {
  path: string;
  kind: string;
  body: string;
  encoding?: string;
  mime?: string;
};

export type RinProject = {
  title?: string;
  slug?: string;
  status?: string;
  mode?: RinWriterMode;
  syncKey?: string;
  renderer?: RinRenderer;
  mainFile?: string;
  activePath?: string;
  folders?: string[];
  files?: RinProjectFile[];
  view?: RinView;
  citationResolver?: RinCitationResolverConfig;
};

export type RinCitationResolverConfig = {
  kind: 'rinspace';
  searchUrl: string;
  resolveUrl: string;
  keySyntax: string[];
  targetTypes: Array<'tag' | 'blog' | 'book'>;
};

export type RinArchive = {
  filename: string;
  mime: string;
  data: ArrayBuffer;
  bytes?: number;
};

export type RinHtmlFile = {
  filename: string;
  mime: string;
  text: string;
};

export type RinAssetFile = {
  path: string;
  filename?: string;
  mime?: string;
  encoding?: string;
  body?: string;
  bytes?: number;
  referenced?: boolean;
  htmlSource?: string;
};

export type RinAssetManifest = {
  version?: string;
  files?: RinAssetFile[];
  references?: unknown[];
  missing?: unknown[];
  unused?: unknown[];
  graphicsPaths?: string[];
  graphicsExtensions?: string[];
};

export type RinBundle = {
  archive: RinArchive;
  html: string;
  htmlFile: RinHtmlFile;
  standaloneHtml?: string;
  project?: RinProject;
  source?: string;
  texSource?: string;
  tex_source?: string;
  resolvedSource?: string;
  analysisSource?: string;
  abstract?: string;
  diagnostics?: string[];
  assetManifest?: RinAssetManifest;
  assetFiles?: RinAssetFile[];
  assets?: RinAssetFile[];
};

export type RinRenderedProject = Omit<RinBundle, 'archive' | 'htmlFile'> & {
  title?: string;
  reader?: unknown;
};

export type RinArchiveInfo = {
  filename: string;
  mime?: string;
  bytes?: number;
  url: string;
};

export type RinUploadedAsset = {
  path: string;
  filename: string;
  mime: string;
  bytes?: number;
  url: string;
};

export type RinUploader = (file: File) => Promise<string>;

export type RinEditorOptions = {
  target: HTMLElement | string;
  baseUrl: string;
  chrome?: boolean;
  view?: RinView;
  height?: string;
  parentOrigin?: string;
  persist?: boolean;
  timeout?: number;
  longTimeout?: number;
  saveTimeout?: number;
  bundleTimeout?: number;
  renderTimeout?: number;
  requestTimeouts?: Record<string, number>;
  mode?: RinWriterMode;
  title?: string;
  project?: RinProject;
  citationResolver?: RinCitationResolverConfig;
  onReady?: (payload: unknown) => void;
  onError?: (payload: unknown) => void;
};

export type RinEditorInstance = {
  ready: Promise<RinEditorInstance>;
  importArchive: (
    file: File | Blob,
    options?: { mode?: 'merge' | 'replace'; activePath?: string; activeLine?: number },
  ) => Promise<unknown>;
  save: () => Promise<RinBundle>;
  exportBundle: () => Promise<RinBundle>;
  getPublishPayload?: () => Promise<RinBundle>;
  getTitle: () => Promise<string>;
  setTitle: (title: string) => Promise<unknown>;
  getActiveFile?: () => Promise<RinProjectFile | null>;
  getFiles?: () => Promise<RinProjectFile[]>;
  getMainFile?: () => Promise<string>;
  setMainFile?: (path: string, options?: { activate?: boolean }) => Promise<unknown>;
  getFile?: (path: string) => Promise<RinProjectFile | null>;
  setProject?: (project: RinProject) => Promise<unknown>;
  setFile?: (
    path: string,
    body: string,
    options?: { activate?: boolean; main?: boolean; kind?: string },
  ) => Promise<unknown>;
  createFile?: (
    path: string,
    body?: string,
    options?: { activate?: boolean; main?: boolean; kind?: string },
  ) => Promise<unknown>;
  createFolder?: (path: string, options?: { allowExisting?: boolean }) => Promise<unknown>;
  renameFile?: (from: string, to: string, options?: Record<string, unknown>) => Promise<unknown>;
  deleteFile?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
  renameFolder?: (from: string, to: string, options?: Record<string, unknown>) => Promise<unknown>;
  deleteFolder?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
  setActiveFile?: (path: string, options?: { line?: number }) => Promise<unknown>;
  setView: (view: RinView) => Promise<unknown>;
  insertText: (text: string) => Promise<unknown>;
  destroy: () => void;
  on: (
    name: RinEventName,
    handler: (payload: unknown) => void,
  ) => RinEditorInstance;
  off: (
    name: RinEventName,
    handler: (payload: unknown) => void,
  ) => RinEditorInstance;
};

export type RinEditorGlobal = {
  create: (options: RinEditorOptions) => RinEditorInstance;
  version: string;
};

declare global {
  interface Window {
    RinEditor?: RinEditorGlobal;
  }
}

const rinSdkVersion = '0.1.18';
const rinSdkPath = `/rin/rin-embed.js?v=${encodeURIComponent(rinSdkVersion)}`;
const publicBase = publicEnv.publicBasePath || '';

function publicAssetPath(relativePath: string) {
  const base = publicBase.replace(/\/+$/, '');
  const clean = relativePath.replace(/^\/+/, '');
  return base ? `${base}/${clean}` : `/${clean}`;
}

export function initialRinView(): RinView {
  if (window.matchMedia('(max-width: 760px)').matches) return 'source';
  return 'split';
}

export function slugify(value: string) {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function rinspaceCitationResolver(): RinCitationResolverConfig {
  return {
    kind: 'rinspace',
    searchUrl: `${publicBase}/api/wiki/citations/search`,
    resolveUrl: `${publicBase}/api/wiki/citations/resolve`,
    keySyntax: ['tags/:id', 'a/:id', 'books/:id'],
    targetTypes: ['tag', 'blog', 'book'],
  };
}

export async function fileFromLatexTemplate(kind: RinLatexTemplateKind): Promise<File> {
  const filename = `${kind}.tar.gz`;
  const response = await fetch(publicAssetPath(`templates/${filename}`));
  if (!response.ok) {
    throw new Error(`无法读取 LaTeX 模板包：${filename}`);
  }
  const blob = await response.blob();
  return new File([blob], filename, {
    type: blob.type || 'application/gzip',
  });
}

function defaultMainSource() {
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{float}',
    '\\graphicspath{{figures/}}',
    '',
    '\\title{}',
    '\\author{}',
    '\\date{}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\input{sections/intro}',
    '',
    '\\bibliographystyle{plain}',
    '\\bibliography{refs}',
    '',
    '\\end{document}',
  ].join('\n');
}

function hasLatexDocument(source: string) {
  return /\\begin\{document\}/.test(source) && /\\end\{document\}/.test(source);
}

function appendToMainDocument(mainSource: string, insertion: string) {
  const trimmedInsertion = insertion.trim();
  if (!trimmedInsertion) return mainSource;
  const trimmedMain = mainSource.trimEnd();
  const endDocument = '\\end{document}';
  const endIndex = trimmedMain.lastIndexOf(endDocument);
  if (endIndex < 0) return `${trimmedMain}\n\n${trimmedInsertion}`;
  const beforeEnd = trimmedMain.slice(0, endIndex).trimEnd();
  const afterEnd = trimmedMain.slice(endIndex);
  return `${beforeEnd}\n\n${trimmedInsertion}\n\n${afterEnd}`;
}

export function rinArchiveFilename(bundle: RinBundle, fallback = 'rin-source.zip') {
  const raw = bundle.archive?.filename?.trim() || fallback;
  if (/\.(zip|tar|gz|tgz|tex|ltx|txt|md|pdf)$/i.test(raw)) return raw;
  return `${raw || fallback.replace(/\.[^.]+$/, '')}.zip`;
}

export async function uploadRinArchiveFromBundle(
  bundle: RinBundle,
  upload: RinUploader,
  fallbackFilename = 'rin-source.zip',
): Promise<RinArchiveInfo | null> {
  if (!bundle.archive?.data?.byteLength) return null;
  const filename = rinArchiveFilename(bundle, fallbackFilename);
  const mime = bundle.archive.mime || 'application/zip';
  const file = new File([bundle.archive.data], filename, { type: mime });
  const url = await upload(file);
  return {
    filename,
    mime: file.type || mime,
    bytes: bundle.archive.bytes || bundle.archive.data.byteLength,
    url,
  };
}

export async function exportRinProjectArchive(
  project: RinProject,
  title: string,
): Promise<File> {
  const response = await fetch('/rin/api/projects/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      mainFile: project.mainFile || 'main.tex',
      files: project.files || [],
    }),
  });
  const blob = await response.blob();
  if (!response.ok) {
    let message = 'Rin 项目打包失败。';
    try {
      const payload: unknown = JSON.parse(await blob.text());
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // Keep the fallback message from above.
    }
    throw new Error(message);
  }
  const filename = `${slugify(title) || 'rinspace-book'}.tar.gz`;
  return new File([blob], filename, {
    type: blob.type || 'application/gzip',
  });
}

function filenameFromPath(path: string) {
  return path.split('/').filter(Boolean).pop() || path || 'rin-asset';
}

function assetFileFromBundleAsset(asset: RinAssetFile): File | null {
  if (!asset.body) return null;
  const filename = asset.filename?.trim() || filenameFromPath(asset.path);
  const mime = asset.mime?.trim() || 'application/octet-stream';
  if (asset.encoding === 'base64') {
    const binary = window.atob(asset.body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], filename, { type: mime });
  }
  return new File([asset.body], filename, { type: mime });
}

export async function uploadRinAssetsFromBundle(
  bundle: Pick<RinBundle, 'assetFiles' | 'assets'>,
  upload: RinUploader,
): Promise<RinUploadedAsset[]> {
  const candidates = bundle.assetFiles || bundle.assets || [];
  const uploadable = candidates.filter(
    (asset) => asset.referenced !== false && Boolean(asset.path && asset.body),
  );
  return Promise.all(
    uploadable.map(async (asset) => {
      const file = assetFileFromBundleAsset(asset);
      if (!file) {
        throw new Error(`无法读取 Rin 资产：${asset.path}`);
      }
      const url = await upload(file);
      return {
        path: asset.path,
        filename: asset.filename?.trim() || file.name || filenameFromPath(asset.path),
        mime: asset.mime?.trim() || file.type || 'application/octet-stream',
        bytes: asset.bytes || file.size,
        url,
      };
    }),
  );
}

export function replaceRinAssetHtml(html: string, assets: RinUploadedAsset[]) {
  if (!assets.length || !html.trim()) return html;
  const byPath = new Map(assets.map((asset) => [asset.path, asset]));
  const document = new DOMParser().parseFromString(
    `<div data-rin-root>${html}</div>`,
    'text/html',
  );
  const root = document.querySelector('[data-rin-root]');
  if (!root) return html;
  root.querySelectorAll<HTMLElement>('[data-rin-asset-path]').forEach((node) => {
    const assetPath = node.dataset.rinAssetPath || '';
    const asset = byPath.get(assetPath);
    if (!asset) return;
    node.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
      image.setAttribute('src', asset.url);
    });
    node.querySelectorAll<HTMLObjectElement>('object[data]').forEach((object) => {
      object.setAttribute('data', asset.url);
    });
    node.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
      link.setAttribute('href', asset.url);
      link.setAttribute('download', asset.filename);
    });
  });
  return root.innerHTML;
}

export function sourceFromRinBundle(bundle: RinBundle) {
  return (
    bundle.texSource ||
    bundle.tex_source ||
    bundle.source ||
    bundle.analysisSource ||
    bundle.resolvedSource ||
    ''
  ).trim();
}

export async function fileFromRinArchiveInfo(
  archive: RinArchiveInfo,
  fallbackFilename = 'rin-source.zip',
): Promise<File> {
  const response = await fetch(archive.url);
  if (!response.ok) {
    throw new Error('无法读取 Rin 源包。');
  }
  const blob = await response.blob();
  return new File([blob], archive.filename || fallbackFilename, {
    type: archive.mime || blob.type || 'application/zip',
  });
}

export async function renderRinProjectArchive(
  file: File,
  options: { title?: string; renderer?: RinRenderer; status?: string } = {},
): Promise<RinRenderedProject> {
  const form = new FormData();
  form.set('source', file, file.name || 'rin-source.tar.gz');
  if (options.title) form.set('title', options.title);
  if (options.renderer) form.set('renderer', options.renderer);
  if (options.status) form.set('status', options.status);
  const response = await fetch('/rin/api/projects/render', {
    method: 'POST',
    body: form,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Rin 项目渲染失败。';
    throw new Error(message);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Rin 项目渲染返回格式异常。');
  }
  return payload as RinRenderedProject;
}

export function defaultProject(title: string, source?: string): RinProject {
  const trimmedSource = source?.trim() || '';
  const body = trimmedSource
    ? hasLatexDocument(trimmedSource)
      ? trimmedSource
      : appendToMainDocument(defaultMainSource(), trimmedSource)
    : defaultMainSource();
  return {
    title,
    slug: slugify(title) || 'rinspace-article',
    status: 'draft',
    renderer: 'katex',
    mainFile: 'main.tex',
    activePath: 'main.tex',
    folders: ['sections', 'figures'],
    files: [
      {
        path: 'main.tex',
        kind: 'tex',
        body,
      },
      {
        path: 'sections/intro.tex',
        kind: 'tex',
        body: '',
      },
      {
        path: 'refs.bib',
        kind: 'bib',
        body: '',
      },
    ],
    view: 'split',
  };
}

export function sourceOnlyProject(title: string, source: string): RinProject {
  return {
    title,
    slug: slugify(title) || 'rinspace-wiki',
    status: 'draft',
    renderer: 'katex',
    mainFile: 'main.tex',
    activePath: 'main.tex',
    folders: [],
    files: [
      {
        path: 'main.tex',
        kind: 'tex',
        body: source,
      },
    ],
    view: 'split',
  };
}

export function loadRinSdk(): Promise<RinEditorGlobal> {
  if (window.RinEditor?.version === rinSdkVersion) {
    return Promise.resolve(window.RinEditor);
  }
  if (window.RinEditor) {
    window.RinEditor = undefined;
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-rin-editor-sdk="true"]',
  );
  if (existing) {
    existing.remove();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = rinSdkPath;
    script.async = true;
    script.dataset.rinEditorSdk = 'true';
    script.addEventListener('load', () => {
      if (window.RinEditor?.version === rinSdkVersion) {
        resolve(window.RinEditor);
      } else {
        reject(new Error('Rin SDK 版本不匹配。'));
      }
    });
    script.addEventListener('error', () =>
      reject(new Error('无法加载 /rin/rin-embed.js。')),
    );
    document.head.appendChild(script);
  });
}

function texUnescape(value: string) {
  return value.replace(/\\([\\{}_%$#&])/g, '$1');
}

function titleFromTexSource(source: string) {
  const match = source.match(/\\title\s*\{([^{}]*)\}/);
  return match ? texUnescape(match[1].trim()) : '';
}

function recordTitle(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const titleValue = (value as Record<string, unknown>).title;
  return typeof titleValue === 'string' ? titleValue.trim() : '';
}

function projectMainSource(project: unknown) {
  if (!project || typeof project !== 'object') return '';
  const projectRecord = project as Record<string, unknown>;
  const mainFile =
    typeof projectRecord.mainFile === 'string'
      ? projectRecord.mainFile
      : 'main.tex';
  const files = Array.isArray(projectRecord.files) ? projectRecord.files : [];
  const mainSource = files
    .map((file) =>
      file && typeof file === 'object'
        ? (file as Record<string, unknown>)
        : null,
    )
    .find((file) => file?.path === mainFile || file?.path === 'main.tex');
  return typeof mainSource?.body === 'string' ? mainSource.body : '';
}

export function titleFromRinPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const metadataTitle = recordTitle(record.metadata);
  if (metadataTitle) return metadataTitle;
  const project = record.project;
  const projectTitle = recordTitle(project);
  if (projectTitle) return projectTitle;
  const mainSource = projectMainSource(project);
  if (mainSource) {
    return titleFromTexSource(mainSource);
  }
  return typeof record.resolvedSource === 'string'
    ? titleFromTexSource(record.resolvedSource)
    : '';
}

export function sourceFromRinPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  if (typeof record.texSource === 'string') return record.texSource;
  if (typeof record.tex_source === 'string') return record.tex_source;
  if (typeof record.source === 'string') return record.source;
  if (typeof record.analysisSource === 'string') return record.analysisSource;
  const mainSource = projectMainSource(record.project);
  if (mainSource) return mainSource;
  return typeof record.resolvedSource === 'string' ? record.resolvedSource : '';
}

export function diagnosticsFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('diagnostics' in payload))
    return [];
  const diagnostics = (payload as { diagnostics?: unknown }).diagnostics;
  return Array.isArray(diagnostics)
    ? diagnostics.filter((item): item is string => typeof item === 'string')
    : [];
}
