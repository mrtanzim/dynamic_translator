import { HAS_GROQ_SEED, SEED_GROQ_API_KEY, SEED_GROQ_MODEL } from '../config/env'
import { DEFAULT_MODELS, loadSettings, saveSettings } from './settings'

/**
 * Seeds the build-time Groq credentials into `chrome.storage.local`.
 *
 * Rules:
 * - A key already present in storage always wins, so a user-entered key is
 *   never overwritten by the build-time seed.
 * - The Groq provider is enabled when seeded, so AI translation works
 *   immediately after install.
 * - The seed only fills empty fields; it never resets other providers.
 *
 * @returns the settings after seeding.
 */
export async function seedProviderSettings(): Promise<void> {
  if (!HAS_GROQ_SEED) return

  const settings = await loadSettings()
  const seedKey = SEED_GROQ_API_KEY.trim()
  const seedModel = SEED_GROQ_MODEL.trim() || DEFAULT_MODELS.groq

  const groq = settings.groq
  const next = {
    ...settings,
    groq: {
      apiKey: groq.apiKey.trim() ? groq.apiKey : seedKey,
      enabled: groq.apiKey.trim() ? groq.enabled : true,
      model: groq.model && groq.model !== DEFAULT_MODELS.groq ? groq.model : seedModel,
    },
  }

  if (
    next.groq.apiKey === groq.apiKey &&
    next.groq.enabled === groq.enabled &&
    next.groq.model === groq.model
  ) {
    // Already seeded; nothing to write.
    return
  }

  await saveSettings(next)
}
