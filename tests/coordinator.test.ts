import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { OFFLINE_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent, LookupResult } from '../src/shared/types'

const sendMessage = vi.fn()

/** A minimal offline entry, as the service worker would return it. */
function offlineEntry(headword: string, bn: string, trans = '') {
  return {
    headword,
    bn,
    bnAlts: [],
    trans,
    transAlts: [],
    def: `${headword} definition`,
    pos: 'noun',
    syn: [],
    ant: [],
    ex: '',
  }
}

/**
 * Mocks `chrome.runtime.sendMessage` so that the offline bridge message
 * resolves with an entry and the AI messages never resolve.
 */
function mockBridge(options: { offline?: (query: string) => unknown | null } = {}) {
  sendMessage.mockImplementation((req: { type?: string; query?: string }) => {
    if (req.type === OFFLINE_LOOKUP_MESSAGE) {
      const entry = options.offline ? options.offline(req.query ?? '') : null
      return Promise.resolve({ ok: true, result: entry })
    }
    return new Promise(() => {})
  })
}

beforeEach(() => {
  sendMessage.mockReset()
  // The coordinator talks to the service worker through chrome.runtime.sendMessage.
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
  }
})

function aiResult(source: 'groq' | 'openrouter' | 'gemini', extra: Partial<LookupResult> = {}): LookupResult {
  return {
    word: 'hello',
    query: 'hello',
    source,
    requestId: 'x',
    timestamp: 1,
    englishDefinition: 'a greeting',
    bengaliMeaning: 'অভিবাদন',
    exampleEn: 'Hello!',
    exampleBn: 'হ্যালো!',
    ...extra,
  }
}


const settings = {
  groq: { apiKey: 'k', enabled: true, model: 'm' },
  openrouter: { apiKey: 'k', enabled: true, model: 'm' },
  gemini: { apiKey: 'k', enabled: true, model: 'm' },
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  sendMessage.mockReset()
  // The coordinator talks to the service worker through chrome.runtime.sendMessage.
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    storage: {
      local: {
        get: (_key: string, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: (_items: Record<string, unknown>, cb?: () => void) => cb?.(),
      },
    },
  }
})

describe('LookupCoordinator', () => {
  it('asks the service worker to apply the seed before reading the settings', async () => {
    const order: string[] = []
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) {
        order.push('seed')
        return { ok: true }
      }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        order.push('offline')
        return { ok: true, result: null }
      }
      order.push('ai')
      return { ok: true, result: aiResult('groq') }
    })
    const c = new LookupCoordinator({ onEvent: () => {} })
    await c.lookup('hello')
    // The seed handshake must come first, so that a first-run lookup never
    // reads the settings before the built-in key has been written.
    expect(order[0]).toBe('seed')
  })

  it('still looks up when the seed handshake fails', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) throw new Error('no service worker')
      if (req.type === OFFLINE_LOOKUP_MESSAGE) return { ok: true, result: null }
      return { ok: true, result: aiResult('groq') }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('hello', settings)
    expect(events.find((e) => e.type === 'AI_RESULT')).toBeTruthy()
  })

  it('emits an offline result immediately without waiting for AI', async () => {
    mockBridge({ offline: () => offlineEntry('hello', 'হ্যালো') })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    void c.lookup('hello', settings)
    await new Promise((r) => setTimeout(r, 10))
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local).toBeTruthy()
    expect(local && local.type === 'LOCAL_RESULT' && local.result.source).toBe('offline')
  })

  it('replaces the offline result with a valid AI result', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: true, result: offlineEntry('hello', 'হ্যালো') }
      }
      return { ok: true, result: aiResult('groq') }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('hello', settings)
    const ai = events.find((e) => e.type === 'AI_RESULT')
    expect(ai && ai.type === 'AI_RESULT' && ai.result.source).toBe('groq')
  })

  it('replaces the offline result even when the AI result carries fewer fields', async () => {
    // The offline entry has more populated fields than this AI result, so a
    // pure completeness comparison would keep the offline one. The offline
    // result is provisional: the first valid provider result always wins.
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: true, result: offlineEntry('hello', 'হ্যালো') }
      }
      return {
        ok: true,
        result: {
          word: 'hello',
          query: 'hello',
          source: 'groq',
          requestId: 'x',
          timestamp: 1,
          englishDefinition: 'a greeting',
        } satisfies LookupResult,
      }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('hello', settings)
    const ai = events.find((e) => e.type === 'AI_RESULT')
    expect(ai, 'expected the AI result to replace the offline one').toBeTruthy()
    expect(ai && ai.type === 'AI_RESULT' && ai.result.source).toBe('groq')
  })

  it('never lets the offline result replace a provider result', async () => {
    // The offline lookup resolves after the provider did, so the provisional
    // result must not overwrite the accepted one.
    const slowOffline = deferred<{ ok: boolean; result: unknown }>()
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) return slowOffline.promise
      return { ok: true, result: aiResult('groq') }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    const p = c.lookup('hello', settings)
    await new Promise((r) => setTimeout(r, 10))
    slowOffline.resolve({ ok: true, result: offlineEntry('hello', 'হ্যালো') })
    await p
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local, 'the offline result must not be shown once a provider answered').toBeUndefined()
  })

  it('keeps a superior result when a later inferior response arrives', async () => {
    const slow = deferred<{ ok: boolean; result: LookupResult }>()
    sendMessage.mockImplementation((req: { type?: string; provider: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return Promise.resolve({ ok: true, result: offlineEntry('hello', 'হ্যালো') })
      }
      if (req.provider === 'groq') return slow.promise
      return Promise.resolve({ ok: true, result: aiResult('openrouter') })
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    const p = c.lookup('hello', settings)
    await new Promise((r) => setTimeout(r, 10))
    slow.resolve({
      ok: true,
      result: {
        word: 'hello', source: 'groq', requestId: 'x', timestamp: 2,
        englishDefinition: 'greeting',
      },
    })
    await p
    const aiEvents = events.filter((e) => e.type === 'AI_RESULT')
    expect(aiEvents.length).toBeGreaterThan(0)
    const last = aiEvents[aiEvents.length - 1]
    expect(last && last.type === 'AI_RESULT' && last.result.source).toBe('openrouter')
  })

  it('ignores stale results from a previous query', async () => {
    const first = deferred<{ ok: boolean; result: LookupResult }>()
    sendMessage.mockImplementation((req: { type?: string; query: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return Promise.resolve({ ok: true, result: null })
      }
      if (req.query === 'alpha') return first.promise
      return Promise.resolve({ ok: true, result: aiResult('groq', { word: 'beta', englishDefinition: 'fresh' }) })
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    void c.lookup('alpha', settings)
    void c.lookup('beta', settings)
    first.resolve({ ok: true, result: aiResult('groq', { word: 'alpha', englishDefinition: 'stale' }) })
    await new Promise((r) => setTimeout(r, 20))
    const stale = events.find(
      (e) => e.type === 'AI_RESULT' && e.result.word === 'alpha',
    )
    expect(stale).toBeUndefined()
  })

  it('keeps the offline answer when the provider fails', async () => {
    // The AI provider is down: the answer must still come from the offline
    // dictionary instead of leaving the user with nothing.
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: true, result: offlineEntry('hello', 'হ্যালো') }
      }
      return { ok: false, error: 'provider is down' }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('hello', settings)

    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local, 'expected the offline dictionary to answer').toBeTruthy()
    expect(events.some((e) => e.type === 'LOOKUP_ERROR')).toBe(true)
    // No provider result replaced the offline answer.
    expect(events.some((e) => e.type === 'AI_RESULT')).toBe(false)
  })

  it('reports provider errors without breaking other providers', async () => {
    sendMessage.mockImplementation(async (req: { type?: string; provider: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: true, result: null }
      }
      if (req.provider === 'groq') return { ok: false, error: 'boom' }
      return { ok: true, result: aiResult('openrouter') }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('hello', settings)
    expect(events.some((e) => e.type === 'LOOKUP_ERROR')).toBe(true)
    expect(events.some((e) => e.type === 'AI_RESULT')).toBe(true)
  })

  it('looks up a Bengali word offline', async () => {
    // Providers never resolve here; the offline result must be emitted without waiting.
    mockBridge({
      offline: (query) => (query === 'বই' ? offlineEntry('book', 'বই') : null),
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    void c.lookup('বই', settings)
    await new Promise((r) => setTimeout(r, 10))
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local, 'expected an offline result for the Bengali query').toBeTruthy()
    if (local && local.type === 'LOCAL_RESULT') {
      // The query is the stable identity; the resolved English headword is
      // carried separately so the display does not change between sources.
      expect(local.result.query).toBe('বই')
      expect(local.result.headword).toBe('book')
    }
  })

  it('normalizes a Bengali query without stripping its characters', async () => {
    mockBridge({
      offline: (query) => (query.includes('বই') ? offlineEntry('book', 'বই') : null),
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    void c.lookup('  বই  ', settings)
    await new Promise((r) => setTimeout(r, 10))
    expect(events.some((e) => e.type === 'LOCAL_RESULT')).toBe(true)
  })

  it('keeps working when the offline dictionary is unavailable', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: false, error: 'dictionary unavailable' }
      }
      return { ok: true, result: aiResult('groq') }
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('hello', settings)
    expect(events.some((e) => e.type === 'AI_RESULT')).toBe(true)
  })

  it('carries the offline part of speech into the result', async () => {
    mockBridge({ offline: () => offlineEntry('hello', 'হ্যালো') })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    void c.lookup('hello', settings)
    await new Promise((r) => setTimeout(r, 10))
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local && local.type === 'LOCAL_RESULT' && local.result.partOfSpeech).toBe('noun')
  })

  it('carries the romanized spelling of a Bengali word into the result', async () => {
    // The Latin-script spelling comes from the dataset, so the offline answer
    // carries it even when no AI provider is reachable.
    mockBridge({
      offline: (query) => (query === 'বই' ? offlineEntry('book', 'বই', 'boi') : null),
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    void c.lookup('বই', settings)
    await new Promise((r) => setTimeout(r, 10))
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local && local.type === 'LOCAL_RESULT' && local.result.transcription).toBe('boi')
  })
})
