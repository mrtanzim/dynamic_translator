import { describe, expect, it, vi, beforeEach } from 'vitest'
import { openRouterLookup } from '../src/providers/openrouter'
import { geminiLookup } from '../src/providers/gemini'
import { buildUserPrompt, SYSTEM_PROMPT } from '../src/providers/common'
import { DEFAULT_MODELS } from '../src/storage/settings'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('openRouterLookup request shape', () => {
  it('sends correct URL, method, auth header, model, and response_format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"bengaliMeaning":"x","englishDefinition":"y"}' } }],
      }),
      text: async () => '',
    })
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

    await openRouterLookup(
      'hello',
      false,
      { apiKey: 'test-key', enabled: true, model: 'openai/gpt-4o-mini' },
      'r1',
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    // (a) URL
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    // (b) method
    expect(init.method).toBe('POST')
    // (c) Authorization header
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-key')
    // (d) model in body
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('openai/gpt-4o-mini')
    // (e) response_format
    expect(body.response_format.type).toBe('json_object')
  })
})

describe('geminiLookup request shape', () => {
  it('sends correct URL, generationConfig, and contents', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"bengaliMeaning":"x"}' }] } }],
      }),
      text: async () => '',
    })
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

    await geminiLookup(
      'hello',
      false,
      { apiKey: 'test-gemini-key', enabled: true, model: 'gemini-3.8-flash' },
      'r1',
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    // (a) URL contains :generateContent
    expect(url).toContain(':generateContent')
    // (b) URL contains model name
    expect(url).toContain('gemini-3.8-flash')
    // (c) the key must not leak into the query string
    expect(url).not.toContain('test-gemini-key')
    // (d) the key travels in the x-goog-api-key header
    const headers = init.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe('test-gemini-key')
    // (e) generationConfig.responseMimeType
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    // (f) contents is array with role 'user' entry
    expect(Array.isArray(body.contents)).toBe(true)
    const userEntry = (body.contents as Array<{ role: string }>).find((c) => c.role === 'user')
    expect(userEntry).toBeDefined()
  })

  it('does not send sampling parameters, which the Gemini 3.x line rejects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"bengaliMeaning":"x"}' }] } }],
      }),
      text: async () => '',
    })
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

    await geminiLookup(
      'hello',
      false,
      { apiKey: 'test-gemini-key', enabled: true, model: 'gemini-3.8-flash' },
      'r1',
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    // temperature / top_p / top_k are deprecated on Gemini 3.x and answer 400.
    expect(body.generationConfig).not.toHaveProperty('temperature')
    expect(body.generationConfig).not.toHaveProperty('top_p')
    expect(body.generationConfig).not.toHaveProperty('top_k')
    // thinkingBudget was replaced by thinkingLevel on the Gemini 3 line.
    expect(body.generationConfig).not.toHaveProperty('thinkingBudget')
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('low')
  })

  it('ignores reasoning parts in the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'thinking about the word', thought: true },
                { text: '{"bengaliMeaning":"হ্যালো"}' },
              ],
            },
          },
        ],
      }),
      text: async () => '',
    })
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

    const result = await geminiLookup(
      'hello',
      false,
      { apiKey: 'test-gemini-key', enabled: true, model: 'gemini-3.8-flash' },
      'r1',
    )

    expect(result.bengaliMeaning).toBe('হ্যালো')
  })
})

describe('provider prompt', () => {
  it('asks for a transcription and a pronunciation', () => {
    // A translation alone is not enough: the learner also needs to know how
    // the word is written in the other script and how it sounds.
    expect(SYSTEM_PROMPT).toContain('transcription')
    expect(SYSTEM_PROMPT).toContain('pronunciation')
  })

  it('asks for the script the learner cannot read yet', () => {
    expect(buildUserPrompt('cucumber', false)).toContain('Bengali script')
    expect(buildUserPrompt('বই', true)).toContain('Latin script')
  })

  it('carries the transcription and the pronunciation into the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"bengaliMeaning":"শসা","transcription":"শসা","pronunciation":"/kʌmˈbʌmbər/"}',
            },
          },
        ],
      }),
      text: async () => '',
    })
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

    const result = await openRouterLookup(
      'cucumber',
      false,
      { apiKey: 'test-key', enabled: true, model: 'qwen/qwen3.8-flash' },
      'r1',
    )

    expect(result.transcription).toBe('শসা')
    expect(result.pronunciation).toBe('/kʌmˈbʌmbər/')
  })
})

describe('provider model defaults', () => {
  it('does not ship models that the providers have retired', () => {
    // Gemini 2.x was shut down on 2026-06-01; the Groq llama line was shut
    // down on 2026-08-16; OpenRouter dropped gpt-4o-mini and claude-3.5.
    expect(DEFAULT_MODELS.gemini).not.toMatch(/^gemini-2\./)
    expect(DEFAULT_MODELS.openrouter).not.toBe('openai/gpt-4o-mini')
    expect(DEFAULT_MODELS.openrouter).not.toBe('anthropic/claude-3.5-sonnet')
    expect(DEFAULT_MODELS.groq).not.toMatch(/llama-3\.[13]-/)
  })
})
