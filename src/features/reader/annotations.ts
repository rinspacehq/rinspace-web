import type { ReaderAnnotationEdit } from '@rinspacehq/embedpdf-snippet/dist/reader-api';

const databaseName = 'rinspace-reader-annotations';
const storeName = 'edits';
let opening: Promise<IDBDatabase> | undefined;

function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName).createIndex('version', 'version');
    };
    request.onerror = () => { opening = undefined; reject(request.error); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
  });
  return opening;
}

type Entry = { version: string; edit: ReaderAnnotationEdit };

export async function readReaderAnnotationEdits(version: string): Promise<ReaderAnnotationEdit[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).index('version').getAll(version);
    request.onsuccess = () => resolve((request.result as Entry[]).map(entry => entry.edit));
    request.onerror = () => reject(request.error);
  });
}

function write(db: IDBDatabase, change: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Annotation storage write was aborted'));
    change(tx.objectStore(storeName));
  });
}

export async function saveReaderAnnotationEdit(version: string, edit: ReaderAnnotationEdit): Promise<void> {
  const entry: Entry = { version, edit: structuredClone(edit) };
  const db = await database();
  const key = [version, edit.pageIndex, edit.anchor];
  return write(db, store => {
    if (!entry.edit.item && typeof entry.edit.anchor === 'string') {
      store.delete(key);
      return;
    }
    // Upstream sends stamp creation context with binary appearance data only on create.
    const previous = store.get(key);
    previous.onsuccess = () => {
      const old = previous.result as Entry | undefined;
      if (entry.edit.item && !entry.edit.item.ctx && old?.edit.item?.ctx) {
        entry.edit.item.ctx = old.edit.item.ctx;
      }
      store.put(entry, key);
    };
  });
}

export async function clearReaderAnnotationEdits(): Promise<void> {
  const db = await database();
  await write(db, store => { store.clear(); });
}
