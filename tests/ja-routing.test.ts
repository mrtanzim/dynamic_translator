import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isSupportedPair } from '../src/storage/languages'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { JA_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent } from '../src/shared/types'

const sendMessage = vi.fn()

const JA_ENTRY = {
  surface: 'こんにちは', kana: 'こんにちは', romaji: 'konnichiwa',
  en: 'Hello', enAlt: ['Hi'], pos: 'greeting', synEn: ['Hi'], antEn: [],
  exampleJa: 'こんにちは。', exampleEn: 'Hello.',
  formalMeaning: 'Hello', conversationalMeaning: 'Hi',
  exampleFormal: '', exampleConversational: '', collocations: [], wordFamily: '',
  bandLevel: '5.5', commonMistake: '',
}

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    storage: {
      local: {
        get: (_k: string, cb: (r: Record<string, unknown>) => void) =>
          cb({ 'vocabflow.languages': { source: 'ja', target: 'en' } }),
        set: (_i: unknown, cb?: () => void) => cb?.(),
      },
    },
  }
})

describe('Japanese routing', () => {
  it('accepts both Japanese language pairs', () => {
    expect(isSupportedPair({ source: 'ja', target: 'en' })).toBe(true)
    expect(isSupportedPair({ source: 'en', target: 'ja' })).toBe(true)
  })

  it('sends a Japanese query to the JA bridge message', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === JA_LOOKUP_MESSAGE) return { ok: true, result: JA_ENTRY }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('こんにちは')
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result.headword).toBe('Hello')
    expect(local.result.kana).toBe('こんにちは')
    expect(local.result.romaji).toBe('konnichiwa')
    expect(local.result.exampleJa).toBe('こんにちは。')
  })

  it('does not break when the JA dataset is unavailable', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === JA_LOOKUP_MESSAGE) return { ok: false, error: 'no dataset' }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('こんにちは')
    expect(events.some((e) => e.type === 'LOCAL_RESULT')).toBe(false)
    expect(events.some((e) => e.type === 'LOOKUP_COMPLETE')).toBe(true)
  })
})
