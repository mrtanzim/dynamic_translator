/**
 * Build-time configuration.
 *
 * The Groq API key is supplied through `.env.local` (git-ignored) and injected
 * by Vite as `import.meta.env`. It is used only to *seed* `chrome.storage.local`
 * on first run, so that the extension works without any manual configuration.
 *
 * SECURITY WARNING
 * ----------------
 * The key is seeded ONLY when running vite dev (local development).
 * npm run build (production) never embeds it.
 *
 * @see src/storage/seed.ts
 */

function readSeed(): { key: string; model: string } {
  // import.meta.env.DEV is statically replaced with `false` by Vite in
  // production builds, enabling dead-code elimination of the key literal.
  // In vitest: stub DEV as '' for falsy (production-like) or '1' for truthy.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (import.meta.env.DEV) {
    return {
      key: import.meta.env.VITE_GROQ_API_KEY ?? '',
      model: import.meta.env.VITE_GROQ_MODEL ?? '',
    }
  }
  return { key: '', model: '' }
}

const seed = readSeed()

/** The seeded Groq API key, or an empty string when none was provided. */
export const SEED_GROQ_API_KEY: string = seed.key

/** The seeded Groq model, falling back to the built-in default. */
export const SEED_GROQ_MODEL: string = seed.model

/** Whether a build-time Groq seed is available. */
export const HAS_GROQ_SEED: boolean = SEED_GROQ_API_KEY.trim().length > 0
