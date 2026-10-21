import { fetchWithTimeout } from '../common'

const MODELS_URL = 'https://api.groq.com/openai/v1/models'

/**
 * Models that cannot serve a chat completion and are therefore never offered
 * as a translation model (speech-to-text and guard models).
 */
const NON_CHAT_MODELS = ['whisper-', 'meta-llama/llama-prompt-guard', 'openai/gpt-oss-safeguard']

/**
 * Lists the chat models the given Groq account can use.
 *
 * Model access is account-scoped, so this is the authoritative list for the
 * current key rather than any static catalogue.
 */
export async function listGroqModels(apiKey: string): Promise<string[]> {
  const res = await fetchWithTimeout(MODELS_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { data?: Array<{ id?: string }> }
  const models = (data.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string' && !!id)
    .filter((id) => !NON_CHAT_MODELS.some((prefix) => id.startsWith(prefix)))
  return [...new Set(models)].sort()
}
