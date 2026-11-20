import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { OFFLINE_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent } from '../src/shared/types'

const sendMessage = vi.fn()
const BN_PAYLOAD = {
  headword: 'How are you?', bn: '', bnAlts: [], trans: 'ki khobor', transAlts: [],
  def: 'A casual greeting', pos: 'phrase', syn: ['How are you doing?'],
  ant: [], ex: 'How are you?', exBn: 'কি খবর?', pron: '', usageNote: 'Casual greeting',
}

beforeEach(() => {
  sendMessage.mockReset()
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

function pinBengali() {
  ;(globalThis as unknown as { chrome: { storage: { local: { get: unknown } } } }).chrome.storage.local.get =
    (_key: string, cb: (r: Record<string, unknown>) => void) =>
      cb({ 'vocabflow.languages': { source: 'bn', target: 'en' } })
}

function mockBridge() {
  sendMessage.mockImplementation(async (req: { type?: string }) => {
    if (req.type === SEED_MESSAGE) return { ok: true }
    if (req.type === OFFLINE_LOOKUP_MESSAGE) {
      return { ok: true, result: BN_PAYLOAD, via: 'bengali' }
    }
    return new Promise(() => {})
  })
}

const settings = {
  groq: { apiKey: '', enabled: false, model: '' },
  openrouter: { apiKey: '', enabled: false, model: '' },
  gemini: { apiKey: '', enabled: false, model: '' },
}

describe('Bengali-first coordinator integration', () => {
  it('pinned bn→en Banglish query uses the Bengali dataset and its rich fields', async () => {
    pinBengali()
    mockBridge()
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('ki khobor', settings)
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result.headword).toBe('How are you?')
    expect(local.result.synonyms).toEqual(['How are you doing?'])
    expect(local.result.exampleEn).toBe('How are you?')
    expect(local.result.exampleBn).toBe('কি খবর?')
    expect(local.result.transcription).toBe('ki khobor')
    expect(local.result.usageNote).toBe('Casual greeting')
    const offlineMessage = sendMessage.mock.calls.find((c) => c[0]?.type === OFFLINE_LOOKUP_MESSAGE)
    expect(offlineMessage?.[0]).toMatchObject({ isBengali: true, direction: 'bn-en' })
  })

  it('English query still uses the English path', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: true, result: { headword: 'book', bn: 'বই', bnAlts: [], trans: 'boi', transAlts: [], def: 'a written work', pos: 'noun', syn: [], ant: [], ex: '' }, via: 'english' }
      }
      return new Promise(() => {})
    })
    const c = new LookupCoordinator({ onEvent: () => {} })
    await c.lookup('book', settings)
    const offlineMessage = sendMessage.mock.calls.find((c) => c[0]?.type === OFFLINE_LOOKUP_MESSAGE)
    expect(offlineMessage?.[0]).toMatchObject({ isBengali: false })
  })

  it('drops a stale Bengali result after the query changes', async () => {
    pinBengali()
    mockBridge()
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    const first = c.lookup('ki khobor', settings)
    c.cancel()
    await first
    // The stale provisional result must never be surfaced after cancellation.
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local).toBeUndefined()
  })
})
