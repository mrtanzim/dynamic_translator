import { describe, expect, it } from 'vitest'
import { groqLookup } from '../src/providers/groq'

/**
 * Live smoke test against the Groq API.
 *
 * It is skipped unless a real key is available, so the default test run stays
 * offline and deterministic. To run it, provide the key in the environment:
 *
 *   GROQ_API_KEY=gsk_... npm test
 */
const API_KEY = process.env.GROQ_API_KEY ?? ''
const MODEL = process.env.GROQ_MODEL ?? 'qwen/qwen3.8-27b'

describe.skipIf(!API_KEY)('groq provider (live)', () => {
  it('translates an English word to Bengali', async () => {
    const result = await groqLookup('serendipity', false, { apiKey: API_KEY, model: MODEL, enabled: true }, 't1')
    expect(result.source).toBe('groq')
    expect(result.englishDefinition).toBeTruthy()
    expect(result.bengaliMeaning).toBeTruthy()
    // The Bengali meaning must contain Bengali-script characters.
    expect(/[\u0980-\u09FF]/.test(result.bengaliMeaning ?? '')).toBe(true)
  }, 30000)

  it('translates a Bengali word to English', async () => {
    const result = await groqLookup('জল', true, { apiKey: API_KEY, model: MODEL, enabled: true }, 't2')
    expect(result.englishDefinition).toBeTruthy()
    expect(/[\u0980-\u09FF]/.test(result.englishDefinition)).toBe(false)
  }, 30000)

  it('fails cleanly on an invalid model', async () => {
    await expect(
      groqLookup('hello', false, { apiKey: API_KEY, model: 'no/such-model', enabled: true }, 't3'),
    ).rejects.toThrow()
  }, 30000)
})
