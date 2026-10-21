/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Seed API key for the Groq provider, injected at build time from `.env.local`. */
  readonly VITE_GROQ_API_KEY?: string
  /** Optional seed model for the Groq provider. */
  readonly VITE_GROQ_MODEL?: string
}
