import type { ReaderDocument, ReaderFileSelection, ReaderProgress, ReaderThumbnail } from './types';
import { rememberReaderFile, clearReaderFiles } from './files';

const DB_NAME = 'rinspace-local-reader';
const DOCUMENTS = 'documents';
const THUMBNAILS = 'thumbnails';
const AGENT = 'agent';
const THUMBNAIL_BUDGET = 32 * 1024 * 1024;
const LEARNING_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
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

export class ReaderConversationChangedError extends Error {}

const archivedConversationKey = (key: string, id: string) => JSON.stringify(['reader-conversation', key, id]);
export function readReaderConversation<T>(key: string, id: string): Promise<T | undefined> {
  return readReaderAgent<T>(archivedConversationKey(key, id));
}

function learningActivity(value: object): number | undefined {
  if ('activityAt' in value && typeof value.activityAt === 'number' && Number.isFinite(value.activityAt)) return value.activityAt;
  if ('createdAt' in value && typeof value.createdAt === 'string') {
    const at = Date.parse(value.createdAt);
    if (Number.isFinite(at)) return at;
  }
  return undefined; // Undated legacy records are preserved.
}

export function readerLearningContentExpired(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object' || !('learning' in value) || !value.learning || 'deleting' in value && value.deleting) return false;
  const at = learningActivity(value);
  return at !== undefined && at <= now - LEARNING_IDLE_MS;
}

export function readerLearningHistoryExpired(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object' || !('cloud' in value) || value.cloud !== true || 'deleting' in value && value.deleting) return false;
  const at = learningActivity(value);
  return at !== undefined && at <= now - LEARNING_IDLE_MS;
}

function pruneLearningHistory(store: IDBObjectStore, key: string, value: unknown): unknown {
  let parts: unknown;
  try { parts = JSON.parse(key); } catch { return value; }
  if (!Array.isArray(parts) || parts.length !== 4 || parts[0] !== 'reader-learning/v1' ||
    !value || typeof value !== 'object' || !('history' in value) || !Array.isArray(value.history)) return value;
  const history: unknown[] = value.history;
  const kept = history.filter(item => {
    if (!readerLearningHistoryExpired(item) || !item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string') return true;
    store.delete(archivedConversationKey(key, item.id));
    return false;
  });
  return kept.length === history.length ? value : { ...value, history: kept };
}

/** Local cache expiry uses one IndexedDB transaction. It does not delete the
 * PDF, advance any model, or use the browser clock to delete server content. */
export async function pruneExpiredReaderLearning(key: string): Promise<boolean> {
  let parts: unknown;
  try { parts = JSON.parse(key); } catch { return false; }
  if (!Array.isArray(parts) || parts.length !== 4 || parts[0] !== 'reader-learning/v1') return false;
  const db = await openDatabase(), tx = db.transaction(AGENT, 'readwrite'), done = transactionDone(tx), store = tx.objectStore(AGENT);
  let changed = false;
  const lookup = store.get(key) as IDBRequest<unknown>;
  lookup.onsuccess = () => {
    const previous: unknown = lookup.result;
    let next = pruneLearningHistory(store, key, previous);
    if (readerLearningContentExpired(next)) {
      const history = next && typeof next === 'object' && 'history' in next && Array.isArray(next.history) ? next.history : [];
      next = { conversationId: crypto.randomUUID(), createdAt: new Date().toISOString(), activityAt: Date.now(), history,
        snapshot: { messages: [], draft: '', running: false }, learning: { openingRequestId: crypto.randomUUID() } };
    }
    if (next !== previous) { store.put(next, key); changed = true; }
  };
  await done;
  return changed;
}

export async function writeReaderAgent(key: string, value: unknown, expected?: { conversationId?: string }, archive?: { id: string; value: unknown }, removeArchive?: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(AGENT, 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore(AGENT);
  let changed = false;
  const write = () => {
    if (archive) store.put(archive.value, archivedConversationKey(key, archive.id));
    if (removeArchive) store.delete(archivedConversationKey(key, removeArchive));
    // Apply archive TTL to every write, including a host with an older in-memory
    // history index, so active questions cannot resurrect expired local bodies.
    store.put(pruneLearningHistory(store, key, value), key);
  };
  if (expected) {
    // A tab displaying an archived conversation must not replace a newer one.
    // Compare inside the same IndexedDB write transaction, including legacy
    // records whose conversation ID has not been assigned yet.
    const lookup = store.get(key) as IDBRequest<{ conversationId?: string } | undefined>;
    lookup.onsuccess = () => {
      if (lookup.result?.conversationId !== expected.conversationId) { changed = true; tx.abort(); return; }
      write();
    };
  } else write();
  try { await done; } catch (error) {
    if (changed) throw new ReaderConversationChangedError('另一个页面已切换对话，请刷新。');
    throw error;
  }
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
