export type ProviderId = 'groq' | 'openrouter' | 'gemini'

export interface ProviderConfig {
  apiKey: string
  enabled: boolean
  model: string
}

export type ProviderSettings = Record<ProviderId, ProviderConfig>

/**
 * Default model per provider.
 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  groq: 'qwen/qwen3.8-27b',
  openrouter: 'qwen/qwen3.8-flash',
  gemini: 'gemini-3.8-flash',
}

/**
 * Selectable models per provider.
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
    try {
      if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
        resolve(DEFAULT_SETTINGS)
        return
      }
      chrome.storage.local.get(SETTINGS_KEY, (r) => {
        if (chrome.runtime?.lastError) {
          resolve(DEFAULT_SETTINGS)
          return
        }
        const stored = r?.[SETTINGS_KEY] as Partial<ProviderSettings> | undefined
        resolve({
          groq: { ...DEFAULT_SETTINGS.groq, ...stored?.groq },
          openrouter: { ...DEFAULT_SETTINGS.openrouter, ...stored?.openrouter },
          gemini: { ...DEFAULT_SETTINGS.gemini, ...stored?.gemini },
        })
      })
    } catch {
      resolve(DEFAULT_SETTINGS)
    }
  })
}

export async function saveSettings(s: ProviderSettings): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) return
    await chrome.storage.local.set({ [SETTINGS_KEY]: s })
  } catch {
    // Ignore invalidated context
  }
}
