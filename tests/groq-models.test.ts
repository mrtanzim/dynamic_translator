import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listGroqModels } from '../src/providers/groq/models'

/** Mocks `fetch` with a Groq-shaped /models payload. */
function mockFetch(ids: string[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
  })
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('listGroqModels', () => {
  it('returns the chat models and drops speech/guard models', async () => {
    mockFetch([
      'whisper-large-v3',
      'meta-llama/llama-prompt-guard-2-86m',
      'openai/gpt-oss-safeguard-20b',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
    ])
    const models = await listGroqModels('k')
    expect(models).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'])
  })

  it('sends the api key as a bearer token', async () => {
    const fetchMock = mockFetch(['qwen/qwen3.8-27b'])
    await listGroqModels('secret-key')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key')
  })

  it('surfaces provider errors', async () => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })
    await expect(listGroqModels('bad')).rejects.toThrow(/401/)
  })
})
