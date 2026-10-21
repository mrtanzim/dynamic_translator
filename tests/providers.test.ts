import { describe, expect, it, vi, beforeEach } from 'vitest'
import { openRouterLookup } from '../src/providers/openrouter'
import { geminiLookup } from '../src/providers/gemini'

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
      { apiKey: 'test-gemini-key', enabled: true, model: 'gemini-2.0-flash' },
      'r1',
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    // (a) URL contains :generateContent?key=
    expect(url).toContain(':generateContent?key=test-gemini-key')
    // (b) URL contains model name
    expect(url).toContain('gemini-2.0-flash')
    // (c) generationConfig.responseMimeType
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    // (d) contents is array with role 'user' entry
    expect(Array.isArray(body.contents)).toBe(true)
    const userEntry = (body.contents as Array<{ role: string }>).find((c) => c.role === 'user')
    expect(userEntry).toBeDefined()
  })
})
