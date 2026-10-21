import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ProviderSettings } from '../src/storage/settings'

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
  vi.resetModules()
  vi.unstubAllEnvs()
  store.clear()
  installChrome()
})

/**
 * Stubs all relevant env vars then dynamically imports env + seed modules
 * so each test gets a fresh module instance with the correct env values.
 */
async function loadModules(env: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v)
  }
  const env_module = await import('../src/config/env')
  const seed_module = await import('../src/storage/seed')
  return { env: env_module, seed: seed_module }
}

describe('seedProviderSettings', () => {
  it('seeds the key and enables Groq on a fresh profile', async () => {
    const { seed } = await loadModules({
      DEV: 'true',
      VITE_GROQ_API_KEY: 'seed-key',
      VITE_GROQ_MODEL: 'qwen/qwen3.8-27b',
    })
    await seed.seedProviderSettings()
    expect(stored().groq.apiKey).toBe('seed-key')
    expect(stored().groq.enabled).toBe(true)
    expect(stored().groq.model).toBe('qwen/qwen3.8-27b')
  })

  it('never overwrites a user-supplied key', async () => {
    const { seed } = await loadModules({
      DEV: 'true',
      VITE_GROQ_API_KEY: 'seed-key',
      VITE_GROQ_MODEL: 'qwen/qwen3.8-27b',
    })
    const { DEFAULT_MODELS } = await import('../src/storage/settings')
    store.set('vocabflow.providers', {
      groq: { apiKey: 'user-key', enabled: false, model: 'custom/model' },
      openrouter: { apiKey: '', enabled: false, model: DEFAULT_MODELS.openrouter },
      gemini: { apiKey: '', enabled: false, model: DEFAULT_MODELS.gemini },
    })
    await seed.seedProviderSettings()
    expect(stored().groq.apiKey).toBe('user-key')
    expect(stored().groq.enabled).toBe(false)
    expect(stored().groq.model).toBe('custom/model')
  })

  it('leaves the other providers untouched', async () => {
    const { seed } = await loadModules({
      DEV: 'true',
      VITE_GROQ_API_KEY: 'seed-key',
      VITE_GROQ_MODEL: 'qwen/qwen3.8-27b',
    })
    const { DEFAULT_MODELS } = await import('../src/storage/settings')
    store.set('vocabflow.providers', {
      groq: { apiKey: '', enabled: false, model: DEFAULT_MODELS.groq },
      openrouter: { apiKey: 'or-key', enabled: true, model: DEFAULT_MODELS.openrouter },
      gemini: { apiKey: '', enabled: false, model: DEFAULT_MODELS.gemini },
    })
    await seed.seedProviderSettings()
    expect(stored().openrouter).toEqual({
      apiKey: 'or-key',
      enabled: true,
      model: DEFAULT_MODELS.openrouter,
    })
    expect(stored().gemini.apiKey).toBe('')
  })

  it('is idempotent', async () => {
    const { seed } = await loadModules({
      DEV: 'true',
      VITE_GROQ_API_KEY: 'seed-key',
      VITE_GROQ_MODEL: 'qwen/qwen3.8-27b',
    })
    await seed.seedProviderSettings()
    const first = JSON.stringify(stored())
    await seed.seedProviderSettings()
    expect(JSON.stringify(stored())).toBe(first)
  })

  it('production-gate: does not seed or store key when DEV is false', async () => {
    const { env, seed } = await loadModules({
      DEV: '',
      VITE_GROQ_API_KEY: 'gsk_test_leak',
      VITE_GROQ_MODEL: '',
    })
    expect(env.HAS_GROQ_SEED).toBe(false)
    expect(env.SEED_GROQ_API_KEY).toBe('')
    await seed.seedProviderSettings()
    // Nothing should have been stored
    expect(stored()).toBeUndefined()
  })

  it('dev-gate: seeds key and model when DEV is true', async () => {
    const { env, seed } = await loadModules({
      DEV: 'true',
      VITE_GROQ_API_KEY: 'sk_dev_key',
      VITE_GROQ_MODEL: 'test/model',
    })
    expect(env.HAS_GROQ_SEED).toBe(true)
    expect(env.SEED_GROQ_API_KEY).toBe('sk_dev_key')
    await seed.seedProviderSettings()
    expect(stored().groq.apiKey).toBe('sk_dev_key')
  })
})
