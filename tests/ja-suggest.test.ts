import { describe, expect, it, vi, beforeEach } from 'vitest'
import { JA_SUGGEST_MESSAGE, SUGGEST_MESSAGE } from '../src/providers/bridge'
import { suggestWords } from '../src/providers/offline'

const sendMessage = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage } }
})

describe('Japanese type-ahead', () => {
  it('sends the JA suggestion message for Japanese input', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === JA_SUGGEST_MESSAGE) {
        return { ok: true, suggestions: [{ word: 'こんにちは', headword: 'Hello', japanese: true, hint: 'Hello' }] }
      }
      return { ok: true, suggestions: [] }
    })
    const suggestions = await suggestWords('こんにちは')
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: JA_SUGGEST_MESSAGE }))
    expect(suggestions[0]?.word).toBe('こんにちは')
  })

  it('still uses the English suggestion message for English input', async () => {
    sendMessage.mockResolvedValue({ ok: true, suggestions: [] })
    await suggestWords('hello')
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: SUGGEST_MESSAGE }))
  })
})
