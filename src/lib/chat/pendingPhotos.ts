// The picked file behind a queued chat photo, kept in IndexedDB (localStorage
// can't hold it) so a photo still uploading when the app is closed or reloaded
// resumes on the next open. Keyed by the echo id, which starts with the author's
// uid. Best-effort: every call resolves (null / no-op) when storage is missing,
// blocked or full, and the outbox then shows the photo as not sent.

const DB_NAME = '3c-chat-outbox';
const STORE = 'photos';

interface StoredPhoto {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    if (!db) dbPromise = null;
    return db;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const request = work(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(request ? (request.result ?? null) : null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export async function savePendingPhoto(id: string, file: File): Promise<void> {
  const record: StoredPhoto = { id, blob: file, name: file.name, type: file.type, savedAt: Date.now() };
  await run('readwrite', (store) => store.put(record));
}

export async function loadPendingPhoto(id: string): Promise<File | null> {
  const record = (await run<StoredPhoto | undefined>('readonly', (store) => store.get(id))) as StoredPhoto | null;
  if (!record || !(record.blob instanceof Blob)) return null;
  return new File([record.blob], record.name || 'photo', { type: record.type || record.blob.type });
}

// Drops this user's stored photos that no queued message needs any more.
export async function prunePendingPhotos(uid: string, keepIds: ReadonlySet<string>): Promise<void> {
  const keys = (await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys())) ?? [];
  const stale = keys.filter(
    (key): key is string => typeof key === 'string' && key.startsWith(`${uid}_`) && !keepIds.has(key)
  );
  if (stale.length === 0) return;
  await run('readwrite', (store) => {
    for (const key of stale) store.delete(key);
  });
}
