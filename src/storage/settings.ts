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
 * (`llama-3.3-70b-versatile` returns HTTP 404 on accounts that do not have
 * that model enabled, so it is no longer a safe default.)
 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  groq: 'qwen/qwen3.8-27b',
  openrouter: 'openai/gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
}

/**
 * Selectable models per provider.
 *
 * Groq model access is account-scoped, so the list here is only a curated
 * set of known-good choices; the live list can also be fetched from the
 * provider (see `src/providers/groq/models.ts`).
 */
export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  groq: [
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
  ],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash'],
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

