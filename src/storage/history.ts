const DB_NAME = 'vocabflow'
const DB_VERSION = 2
const STORE = 'history'

export interface HistoryEntry {
  id?: number
  query: string
  direction: 'en->bn' | 'bn->en'
  result: unknown
  source: string
  timestamp: number
  saved: boolean
}

/**
 * The shape actually written to IndexedDB.
 *
 * `saved` is stored as 0/1 rather than as a boolean: IndexedDB cannot use a
 * boolean as an index key, so an index on a boolean field would silently
 * contain no entries at all.
 */
interface StoredEntry extends Omit<HistoryEntry, 'saved'> {
  saved: 0 | 1
}

function toStored(entry: HistoryEntry): StoredEntry {
  return { ...entry, saved: entry.saved ? 1 : 0 }
}

function fromStored(entry: StoredEntry): HistoryEntry {
  return { ...entry, saved: entry.saved === 1 }
}

/**
 * The open database connection.
 *
 * A single connection is shared by every operation. Opening a connection
 * per operation is expensive, and the previous implementation also leaked
 * them: the connection was only closed when the transaction completed, so
 * a failed request left the connection open for good.
 */
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const created = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        created.createIndex('timestamp', 'timestamp')
        created.createIndex('query', 'query')
        created.createIndex('saved', 'saved')
      } else {
        // Version 2 adds the `saved` index, so the saved words can be read
        // without scanning the whole table. The existing rows still hold a
        // boolean, which the index skips; they are migrated below.
        const store = req.transaction!.objectStore(STORE)
        if (!store.indexNames.contains('saved')) {
          store.createIndex('saved', 'saved')
          const cursorReq = store.openCursor()
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) return
            const value = cursor.value as { saved: unknown }
            if (typeof value.saved === 'boolean') {
              cursor.update({ ...value, saved: value.saved ? 1 : 0 })
            }
            cursor.continue()
          }
        }
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // Another context wants a newer version: let go of the connection so
      // the upgrade is not blocked.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('IndexedDB open failed'))
    }
  })
  return dbPromise
}

/** Closes the shared connection; used by the tests to isolate them. */
export function closeDb(): void {
  void dbPromise?.then((db) => db.close())
  dbPromise = null
}

/**
 * Runs a transaction on the history store.
 *
 * `fn` receives the object store and returns the request whose result is
 * the operation's result. The promise resolves when the transaction has
 * completed, so a write is durable when the caller continues.
 */
async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction
    try {
      t = db.transaction(STORE, mode)
    } catch (err) {
      // The connection was closed (e.g. by a version change); drop it so the
      // next call opens a fresh one.
      dbPromise = null
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }
    const req = fn(t.objectStore(STORE))
    let result: T
    req.onsuccess = () => {
      result = req.result
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'))
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function addHistory(entry: HistoryEntry): Promise<number> {
  const key = await tx<IDBValidKey>('readwrite', (s) => s.add(toStored(entry)))
  return Number(key)
}

export async function updateHistory(id: number, patch: Partial<HistoryEntry>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const store = t.objectStore(STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredEntry | undefined
      if (!existing) return
      const merged: HistoryEntry = { ...fromStored(existing), ...patch, id }
      store.put(toStored(merged))
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'))
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = await tx<StoredEntry[]>('readonly', (s) => s.getAll())
  return all.map(fromStored).sort((a, b) => b.timestamp - a.timestamp)
}

export async function deleteHistory(id: number): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export async function clearHistory(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}

export async function listSaved(): Promise<HistoryEntry[]> {
  // The `saved` index makes this a lookup instead of a full table scan.
  // The key is passed directly rather than as an IDBKeyRange, so the module
  // does not depend on another global.
  const saved = await tx<StoredEntry[]>('readonly', (s) => s.index('saved').getAll(1))
  return saved.map(fromStored).sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Deletes the oldest entries beyond the limit.
 *
 * All deletions happen in a single read-write transaction. The previous
 * implementation deleted the entries one by one, each in its own
 * transaction and its own database connection, which turned a routine
 * cleanup into dozens of round trips.
 */
export async function pruneHistory(limit: number): Promise<void> {
  if (!Number.isFinite(limit) || limit <= 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const store = t.objectStore(STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result as StoredEntry[])
        .map(fromStored)
        .sort((a, b) => b.timestamp - a.timestamp)
      for (const entry of all.slice(limit)) {
        if (entry.id !== undefined) store.delete(entry.id)
      }
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'))
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'))
  })
}
