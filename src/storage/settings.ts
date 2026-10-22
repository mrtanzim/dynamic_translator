export type ProviderId = 'groq' | 'openrouter' | 'gemini'

export interface ProviderConfig {
  apiKey: string
  enabled: boolean
  model: string
}

export type ProviderSettings = Record<ProviderId, ProviderConfig>

/**
 * Default model per provider.
 *
 * The Groq default is `qwen/qwen3.8-27b`: it is a current, fast and
 * JSON-mode capable model on Groq, and it is reachable with the seeded key.
 *
 * The Gemini default is `gemini-3.8-flash`. The whole Gemini 2.x line was
 * shut down on 2026-06-01, and `gemini-2.5-flash` has been returning 404
 * since 2026-07, so the previous 2.0/2.5 defaults could never succeed.
 *
 * The OpenRouter default is `qwen/qwen3.8-flash`: it is cheap, supports
 * `response_format`, and — unlike the previous `openai/gpt-4o-mini` and
 * `anthropic/claude-3.5-sonnet` defaults — is still in the OpenRouter
 * catalog.
 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  groq: 'qwen/qwen3.8-27b',
  openrouter: 'qwen/qwen3.8-flash',
  gemini: 'gemini-3.8-flash',
}

/**
 * Selectable models per provider.
 *
 * Groq model access is account-scoped, so the list here is only a curated
 * set of known-good choices; the live list can also be fetched from the
 * provider (see `src/providers/groq/models.ts`).
 *
 * Retired models are deliberately absent: `llama-3.3-70b-versatile` and
 * `llama-3.1-8b-instant` were shut down on 2026-08-16, `gemini-2.0-flash`
 * on 2026-06-01, and `gemini-2.5-flash` is no longer served at all.
 */
export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  groq: [
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'minimaxai/minimax-m2.7',
  ],
  openrouter: [
    'qwen/qwen3.8-flash',
    'google/gemini-3.8-flash',
    'z-ai/glm-5.3-flash',
    'anthropic/claude-sonnet-5',
  ],
  gemini: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'],
}

export const DEFAULT_SETTINGS: ProviderSettings = {
  groq: { apiKey: '', enabled: false, model: DEFAULT_MODELS.groq },
  openrouter: { apiKey: '', enabled: false, model: DEFAULT_MODELS.openrouter },
  gemini: { apiKey: '', enabled: false, model: DEFAULT_MODELS.gemini },
}

const SETTINGS_KEY = 'vocabflow.providers'

export function loadSettings(): Promise<ProviderSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (r) => {
      const stored = r?.[SETTINGS_KEY] as Partial<ProviderSettings> | undefined
      resolve({
        groq: { ...DEFAULT_SETTINGS.groq, ...stored?.groq },
        openrouter: { ...DEFAULT_SETTINGS.openrouter, ...stored?.openrouter },
        gemini: { ...DEFAULT_SETTINGS.gemini, ...stored?.gemini },
      })
    })
  })
}

export async function saveSettings(s: ProviderSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s })
}

