import { describe, expect, it, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { HistoryEntry } from '../src/storage/history'

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    query: 'hello',
    direction: 'en->bn',
    result: { bengaliMeaning: 'হ্যালো' },
    source: 'groq',
    timestamp: Date.now(),
    saved: false,
    ...overrides,
  }
}

beforeEach(() => {
  // Fresh in-memory IDB instance per test — no cross-test state
  ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
})

// Dynamic imports so each test gets the module bound to the fresh IDBFactory
async function getHistory() {
  return await import('../src/storage/history')
}

describe('addHistory', () => {
  it('returns a positive number id', async () => {
    const { addHistory } = await getHistory()
    const id = await addHistory(makeEntry())
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })
})

describe('listHistory', () => {
  it('returns entries sorted descending by timestamp', async () => {
    const { addHistory, listHistory } = await getHistory()
    await addHistory(makeEntry({ timestamp: 1 }))
    await addHistory(makeEntry({ timestamp: 2 }))
    const entries = await listHistory()
    expect(entries[0].timestamp).toBe(2)
    expect(entries[1].timestamp).toBe(1)
  })
})

describe('updateHistory', () => {
  it('patches the entry', async () => {
    const { addHistory, updateHistory, listHistory } = await getHistory()
    const id = await addHistory(makeEntry({ saved: false }))
    await updateHistory(id, { saved: true })
    const entries = await listHistory()
    expect(entries[0].saved).toBe(true)
  })
})

describe('deleteHistory', () => {
  it('removes the entry', async () => {
    const { addHistory, deleteHistory, listHistory } = await getHistory()
    const id = await addHistory(makeEntry())
    await deleteHistory(id)
    const entries = await listHistory()
    expect(entries).toHaveLength(0)
  })
})

describe('clearHistory', () => {
  it('empties the store', async () => {
    const { addHistory, clearHistory, listHistory } = await getHistory()
    await addHistory(makeEntry())
    await addHistory(makeEntry())
    await clearHistory()
    const entries = await listHistory()
    expect(entries).toHaveLength(0)
  })
})

describe('listSaved', () => {
  it('returns only saved entries', async () => {
    const { addHistory, listSaved } = await getHistory()
    await addHistory(makeEntry({ saved: false }))
    await addHistory(makeEntry({ saved: true }))
    const saved = await listSaved()
    expect(saved).toHaveLength(1)
    expect(saved[0].saved).toBe(true)
  })
})

describe('pruneHistory', () => {
  it('deletes oldest entries beyond the limit', async () => {
    const { addHistory, pruneHistory, listHistory } = await getHistory()
    await addHistory(makeEntry({ timestamp: 100 }))
    await addHistory(makeEntry({ timestamp: 200 }))
    await addHistory(makeEntry({ timestamp: 300 }))
    await pruneHistory(2)
    const entries = await listHistory()
    expect(entries).toHaveLength(2)
    const timestamps = entries.map((e) => e.timestamp)
    expect(timestamps).toContain(300)
    expect(timestamps).toContain(200)
    expect(timestamps).not.toContain(100)
  })

  it('is a no-op when limit is 0', async () => {
    const { addHistory, pruneHistory, listHistory } = await getHistory()
    await addHistory(makeEntry({ timestamp: 100 }))
    await pruneHistory(0)
    const entries = await listHistory()
    expect(entries).toHaveLength(1)
  })

  it('is a no-op when limit is Infinity', async () => {
    const { addHistory, pruneHistory, listHistory } = await getHistory()
    await addHistory(makeEntry({ timestamp: 100 }))
    await pruneHistory(Infinity)
    const entries = await listHistory()
    expect(entries).toHaveLength(1)
  })
})
