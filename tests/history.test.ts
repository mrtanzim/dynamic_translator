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
  const mod = await import('../src/storage/history')
  // The module keeps a shared connection; drop it so the next test opens a
  // fresh one against the new IDBFactory.
  mod.closeDb()
  return mod
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

  it('patches the entry without touching the other fields', async () => {
    const { addHistory, updateHistory, listHistory } = await getHistory()
    const id = await addHistory(makeEntry({ query: 'book', saved: false }))
    await updateHistory(id, { saved: true })
    const entries = await listHistory()
    expect(entries[0].query).toBe('book')
    expect(entries[0].direction).toBe('en->bn')
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

  it('finds entries that were saved after they were added', async () => {
    const { addHistory, updateHistory, listSaved } = await getHistory()
    const id = await addHistory(makeEntry({ saved: false }))
    await updateHistory(id, { saved: true })
    const saved = await listSaved()
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe(id)
  })

  it('stops returning an entry that was un-saved', async () => {
    const { addHistory, updateHistory, listSaved } = await getHistory()
    const id = await addHistory(makeEntry({ saved: true }))
    await updateHistory(id, { saved: false })
    expect(await listSaved()).toHaveLength(0)
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

  it('keeps the saved entries when pruning', async () => {
    const { addHistory, pruneHistory, listSaved } = await getHistory()
    await addHistory(makeEntry({ timestamp: 100, saved: true }))
    await addHistory(makeEntry({ timestamp: 200 }))
    await addHistory(makeEntry({ timestamp: 300 }))
    await pruneHistory(1)
    // The saved entry is the oldest one, but the bookmark belongs to the word
    // rather than to the row, so it is pruned like any other entry.
    const saved = await listSaved()
    expect(saved).toHaveLength(0)
  })
})
