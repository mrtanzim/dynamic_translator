import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { OFFLINE_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent } from '../src/shared/types'

const sendMessage = vi.fn()
const ENTRY = {
  headword: 'reluctant', bn: 'অনিচ্ছুক', bnAlts: [], trans: 'onichchuk', transAlts: [],
  def: 'unwilling', pos: 'adjective', syn: [], ant: [], ex: 'She was reluctant.', exBn: '', pron: '',
  formalMeaning: 'unwilling', conversationalMeaning: 'not keen',
  exampleFormal: 'He was reluctant to commit.', exampleConversational: 'I am not keen.',
  collocations: ['reluctant to go'], wordFamily: { noun: 'reluctance', adv: 'reluctantly' },
  bandLevel: '7.0', commonMistake: 'Use "to", not "of".', usageNote: 'IELTS writing',
}

const settings = {
  groq: { apiKey: '', enabled: false, model: '' },
  openrouter: { apiKey: '', enabled: false, model: '' },
  gemini: { apiKey: '', enabled: false, model: '' },
}

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    storage: {
      local: {
        get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: (_i: unknown, cb?: () => void) => cb?.(),
      },
    },
  }
})

describe('offline results carry AI-style fields', () => {
  it('maps every enriched field for an English query', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) return { ok: true, result: ENTRY, via: 'english' }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('reluctant', settings)
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result).toMatchObject({
      formalMeaning: 'unwilling', conversationalMeaning: 'not keen',
      exampleFormal: 'He was reluctant to commit.', exampleConversational: 'I am not keen.',
      collocations: ['reluctant to go'], wordFamily: { noun: 'reluctance' },
      bandLevel: '7.0', commonMistake: 'Use "to", not "of".', usageNote: 'IELTS writing',
    })
  })

  it('maps every enriched field for a Bengali query', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) return { ok: true, result: ENTRY, via: 'bengali' }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('অনিচ্ছুক', settings)
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result.bandLevel).toBe('7.0')
    expect(local.result.collocations).toEqual(['reluctant to go'])
  })
})
