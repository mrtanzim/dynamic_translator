import { describe, expect, it, vi, beforeEach } from 'vitest'
import { OFFLINE_LOOKUP_MESSAGE } from '../src/providers/bridge'
import { offlineBengaliLookup, offlineLookupWithMatch } from '../src/providers/offline'

const sendMessage = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage } }
})

describe('offline bridge direction', () => {
  it('passes the resolved direction to the service worker', async () => {
    sendMessage.mockResolvedValue({ ok: true, result: null, via: 'bengali' })
    await offlineLookupWithMatch('ki khobor', true, 'bn-en')
    expect(sendMessage).toHaveBeenCalledWith({
      type: OFFLINE_LOOKUP_MESSAGE,
      query: 'ki khobor',
      isBengali: true,
      direction: 'bn-en',
    })
  })

  it('offlineBengaliLookup forwards direction for Latin-script Banglish', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      result: { headword: 'How are you?', bn: 'কি খবর', bnAlts: [], trans: 'ki khobor', transAlts: [], def: '', pos: 'phrase', syn: [], ant: [] },
      via: 'bengali',
    })
    const hit = await offlineBengaliLookup('ki khobor', 'bn-en')
    expect(hit?.headword).toBe('How are you?')
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ isBengali: true, direction: 'bn-en' }))
  })
})
