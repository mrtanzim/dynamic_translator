/**
 * Build-time configuration.
 *
 * The Groq API key is supplied through `.env.local` (git-ignored) and injected
 * by Vite as `import.meta.env`. It is used only to *seed* `chrome.storage.local`
 * on first run, so that the extension works without any manual configuration.
 *
 * SECURITY WARNING
 * ----------------
 * Because Vite inlines `import.meta.env` at build time, the key is embedded
 * verbatim in the built service-worker bundle (`dist/assets/service-worker.*.js`).
 * Anyone who obtains the built extension can extract it. This is therefore
 * only suitable for controlled testing / internal distribution.
 *
 * The key is NOT embedded in the content script bundle, so it is not exposed to
 * the pages the extension runs on.
 *
 * @see src/storage/seed.ts
 */

/** The seeded Groq API key, or an empty string when none was provided. */
export const SEED_GROQ_API_KEY: string = import.meta.env?.VITE_GROQ_API_KEY ?? ''

/** The seeded Groq model, falling back to the built-in default. */
export const SEED_GROQ_MODEL: string = import.meta.env?.VITE_GROQ_MODEL ?? ''

/** Whether a build-time Groq seed is available. */
export const HAS_GROQ_SEED: boolean = SEED_GROQ_API_KEY.trim().length > 0
