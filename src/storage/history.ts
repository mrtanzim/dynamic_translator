const DB_NAME = 'vocabflow'
const DB_VERSION = 1
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp')
        store.createIndex('query', 'query')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
        t.oncomplete = () => db.close()
      }),
  )
}

export async function addHistory(entry: HistoryEntry): Promise<number> {
  const key = await tx<IDBValidKey>('readwrite', (s) => s.add(entry))
  return Number(key)
}

export async function updateHistory(id: number, patch: Partial<HistoryEntry>): Promise<void> {
  const existing = await tx<HistoryEntry | undefined>('readonly', (s) => s.get(id))
  if (!existing) return
  await tx('readwrite', (s) => s.put({ ...existing, ...patch, id }))
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = await tx<HistoryEntry[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => b.timestamp - a.timestamp)
}

export async function deleteHistory(id: number): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export async function clearHistory(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}

export async function listSaved(): Promise<HistoryEntry[]> {
  const all = await listHistory()
  return all.filter((h) => h.saved)
}
