import type { ReaderDocument, ReaderFileSelection, ReaderProgress, ReaderThumbnail } from './types';
import { rememberReaderFile, clearReaderFiles } from './files';

const DB_NAME = 'rinspace-local-reader';
const DOCUMENTS = 'documents';
const THUMBNAILS = 'thumbnails';
const AGENT = 'agent';
const THUMBNAIL_BUDGET = 32 * 1024 * 1024;
let database: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local reader storage failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Local reader storage was not saved'));
    tx.onerror = () => reject(tx.error || new Error('Local reader storage failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DOCUMENTS)) {
        const docs = request.result.createObjectStore(DOCUMENTS, { keyPath: 'id' });
        docs.createIndex('contentVersion', 'contentVersion', { unique: true });
        request.result.createObjectStore(THUMBNAILS, { keyPath: 'documentId' });
      }
      if (!request.result.objectStoreNames.contains(AGENT)) request.result.createObjectStore(AGENT);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Close other Reader tabs to update local storage')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  });
  return database;
}

async function mutateDocument(id: string, update: (value: ReaderDocument) => ReaderDocument): Promise<ReaderDocument> {
  const db = await openDatabase();
  const tx = db.transaction(DOCUMENTS, 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore(DOCUMENTS);
  const lookup = store.get(id) as IDBRequest<ReaderDocument | undefined>;
  let result: ReaderDocument | undefined;
  lookup.onsuccess = () => {
    if (!lookup.result) { tx.abort(); return; }
    result = update(lookup.result);
    store.put(result);
  };
  await done;
  if (!result) throw new Error('Local PDF record is missing');
  window.dispatchEvent(new Event('rinspace-reader-library-change'));
  return result;
}

export async function listReaderDocuments(): Promise<ReaderDocument[]> {
  const db = await openDatabase();
  return requestResult(db.transaction(DOCUMENTS).objectStore(DOCUMENTS).getAll() as IDBRequest<ReaderDocument[]>);
}

export async function getReaderDocument(id: string): Promise<ReaderDocument | undefined> {
  const db = await openDatabase();
  return requestResult(db.transaction(DOCUMENTS).objectStore(DOCUMENTS).get(id) as IDBRequest<ReaderDocument | undefined>);
}

export async function registerReaderDocument(selection: ReaderFileSelection, contentVersion: string): Promise<ReaderDocument> {
  const db = await openDatabase();
  const tx = db.transaction(DOCUMENTS, 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore(DOCUMENTS);
  const lookup = store.index('contentVersion').get(contentVersion) as IDBRequest<ReaderDocument | undefined>;
  let result: ReaderDocument | undefined;
  lookup.onsuccess = () => {
    result = {
      ...lookup.result,
      id: lookup.result?.id || crypto.randomUUID(),
      title: selection.file.name,
      size: selection.file.size,
      lastModified: selection.file.lastModified,
      contentVersion,
      ...(selection.handle ? { handle: selection.handle } : {}),
    };
    store.put(result);
  };
  await done;
  if (!result) throw new Error('Local PDF was not saved');
  rememberReaderFile(result.id, selection.file);
  return result;
}

export function markReaderOpened(id: string, pageCount: number) {
  return mutateDocument(id, doc => ({ ...doc, pageCount, lastOpenedAt: Date.now() }));
}

export function setReaderShelf(id: string, onShelf: boolean) {
  return mutateDocument(id, doc => ({ ...doc, shelfAddedAt: onShelf ? Date.now() : undefined }));
}

export function removeReaderRecent(id: string) {
  return mutateDocument(id, doc => ({ ...doc, lastOpenedAt: undefined }));
}

export function saveReaderProgress(id: string, contentVersion: string, progress: ReaderProgress, expectedRevision: number) {
  return mutateDocument(id, doc => {
    if (doc.contentVersion !== contentVersion || (doc.progress?.revision ?? 0) !== expectedRevision) return doc;
    if (!Number.isInteger(progress.pageIndex) || progress.pageIndex < 0 || progress.pageIndex >= (doc.pageCount ?? Infinity)) return doc;
    if (!Number.isFinite(progress.pageOffsetRatio) || typeof progress.zoom === 'number' && (!Number.isFinite(progress.zoom) || progress.zoom <= 0)) return doc;
    return { ...doc, progress: { ...progress, pageOffsetRatio: Math.max(0, Math.min(1, progress.pageOffsetRatio)), revision: expectedRevision + 1 } };
  });
}

export async function readReaderAgent<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return requestResult(db.transaction(AGENT).objectStore(AGENT).get(key) as IDBRequest<T | undefined>);
}

export async function writeReaderAgent(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(AGENT, 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(AGENT).put(value, key);
  await done;
}

export async function clearReaderLocalData(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([DOCUMENTS, THUMBNAILS, AGENT], 'readwrite');
  const done = transactionDone(tx);
  for (const name of [DOCUMENTS, THUMBNAILS, AGENT]) tx.objectStore(name).clear();
  await done;
  clearReaderFiles();
  window.dispatchEvent(new Event('rinspace-reader-library-change'));
}

export async function getReaderThumbnail(documentId: string): Promise<ReaderThumbnail | undefined> {
  const db = await openDatabase();
  return requestResult(db.transaction(THUMBNAILS).objectStore(THUMBNAILS).get(documentId) as IDBRequest<ReaderThumbnail | undefined>);
}

export async function saveReaderThumbnail(documentId: string, blob: Blob): Promise<void> {
  if (blob.size > THUMBNAIL_BUDGET) return;
  const db = await openDatabase();
  const tx = db.transaction(THUMBNAILS, 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore(THUMBNAILS);
  const all = store.getAll() as IDBRequest<ReaderThumbnail[]>;
  all.onsuccess = () => {
    const entries = all.result.filter(item => item.documentId !== documentId).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    let total = entries.reduce((sum, item) => sum + item.blob.size, blob.size);
    for (const item of entries) {
      if (total <= THUMBNAIL_BUDGET) break;
      store.delete(item.documentId); total -= item.blob.size;
    }
    store.put({ documentId, blob, lastUsedAt: Date.now() } satisfies ReaderThumbnail);
  };
  await done;
}
