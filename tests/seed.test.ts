import { describe, expect, it, vi, beforeEach } from 'vitest'

// The seed module reads the build-time key from `import.meta.env`, so the env
// module is mocked before importing it.
vi.mock('../src/config/env', () => ({
  SEED_GROQ_API_KEY: 'seed-key',
  SEED_GROQ_MODEL: 'qwen/qwen3.8-27b',
  HAS_GROQ_SEED: true,
}))

import { seedProviderSettings } from '../src/storage/seed'
import { DEFAULT_MODELS, type ProviderSettings } from '../src/storage/settings'

const store = new Map<string, unknown>()

/** Installs a minimal `chrome.storage.local` backed by an in-memory map. */
function installChrome() {
  const local = {
    get: (key: string, cb: (r: Record<string, unknown>) => void) => {
      cb(store.has(key) ? { [key]: store.get(key) } : {})
    },
    set: (items: Record<string, unknown>, cb?: () => void) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v)
      cb?.()
    },
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } }
}

/** Reads the currently persisted provider settings. */
function stored(): ProviderSettings {
  return store.get('vocabflow.providers') as ProviderSettings
}

beforeEach(() => {
  store.clear()
  installChrome()
})

describe('seedProviderSettings', () => {
  it('seeds the key and enables Groq on a fresh profile', async () => {
    await seedProviderSettings()
    expect(stored().groq.apiKey).toBe('seed-key')
    expect(stored().groq.enabled).toBe(true)
    expect(stored().groq.model).toBe('qwen/qwen3.8-27b')
  })

  it('never overwrites a user-supplied key', async () => {
    store.set('vocabflow.providers', {
      groq: { apiKey: 'user-key', enabled: false, model: 'custom/model' },
      openrouter: { apiKey: '', enabled: false, model: DEFAULT_MODELS.openrouter },
      gemini: { apiKey: '', enabled: false, model: DEFAULT_MODELS.gemini },
    })
    await seedProviderSettings()
    expect(stored().groq.apiKey).toBe('user-key')
    expect(stored().groq.enabled).toBe(false)
    expect(stored().groq.model).toBe('custom/model')
  })

  it('leaves the other providers untouched', async () => {
    store.set('vocabflow.providers', {
      groq: { apiKey: '', enabled: false, model: DEFAULT_MODELS.groq },
      openrouter: { apiKey: 'or-key', enabled: true, model: DEFAULT_MODELS.openrouter },
      gemini: { apiKey: '', enabled: false, model: DEFAULT_MODELS.gemini },
    })
    await seedProviderSettings()
    expect(stored().openrouter).toEqual({
      apiKey: 'or-key',
      enabled: true,
      model: DEFAULT_MODELS.openrouter,
    })
    expect(stored().gemini.apiKey).toBe('')
  })

  it('is idempotent', async () => {
    await seedProviderSettings()
    const first = JSON.stringify(stored())
    await seedProviderSettings()
    expect(JSON.stringify(stored())).toBe(first)
  })
})
