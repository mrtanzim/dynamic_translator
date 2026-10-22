import { geminiLookup } from '../providers/gemini'
import { groqLookup } from '../providers/groq'
import { listGroqModels } from '../providers/groq/models'
import { openRouterLookup } from '../providers/openrouter'
import type { ProviderId } from '../storage/settings'
import type { LookupResult } from '../shared/types'

export const LOOKUP_MESSAGE = 'VOCABFLOW_AI_LOOKUP'
export const OFFLINE_LOOKUP_MESSAGE = 'VOCABFLOW_OFFLINE_LOOKUP'
export const SUGGEST_MESSAGE = 'VOCABFLOW_SUGGEST'
export const LIST_MODELS_MESSAGE = 'VOCABFLOW_LIST_MODELS'
export const SEED_MESSAGE = 'VOCABFLOW_SEED'
export const TOGGLE_MESSAGE = 'VOCABFLOW_TOGGLE'

export interface AiLookupRequest {
  type: typeof LOOKUP_MESSAGE
  provider: ProviderId
  query: string
  isBengali: boolean
  model: string
  apiKey: string
  requestId: string
}

export type AiLookupResponse =
  | { ok: true; result: LookupResult }
  | { ok: false; error: string }

/** A single dictionary entry as transferred over the message channel. */
export interface OfflineEntryPayload {
  headword: string
  bn: string
  bnAlts: string[]
  def: string
  pos: string
  syn: string[]
  ant: string[]
  ex: string
}

export interface OfflineLookupRequest {
  type: typeof OFFLINE_LOOKUP_MESSAGE
  query: string
  isBengali: boolean
}

export type OfflineLookupResponse =
  | { ok: true; result: OfflineEntryPayload | null }
  | { ok: false; error: string }

/** A type-ahead suggestion, as transferred over the message channel. */
export interface SuggestionPayload {
  /** The word to show and to look up. */
  word: string
  /** The English headword the word resolves to. */
  headword: string
  /** Whether the word is written in Bengali. */
  bengali: boolean
  /** A short hint: the Bengali meaning of an English word, the headword of a Bengali one. */
  hint: string
}

export interface SuggestRequest {
  type: typeof SUGGEST_MESSAGE
  query: string
  limit?: number
}

export type SuggestResponse =
  | { ok: true; suggestions: SuggestionPayload[] }
  | { ok: false; error: string }

export interface ListModelsRequest {
  type: typeof LIST_MODELS_MESSAGE
  provider: ProviderId
  apiKey: string
}

export type ListModelsResponse =
  | { ok: true; models: string[] }
  | { ok: false; error: string }

export async function runProviderLookup(
  provider: ProviderId,
  query: string,
  isBengaliInput: boolean,
  apiKey: string,
  model: string,
  requestId: string,
): Promise<LookupResult> {
  const config = { apiKey, model, enabled: true }
  switch (provider) {
    case 'groq':
      return groqLookup(query, isBengaliInput, config, requestId)
    case 'openrouter':
      return openRouterLookup(query, isBengaliInput, config, requestId)
    case 'gemini':
      return geminiLookup(query, isBengaliInput, config, requestId)
  }
}

/**
 * Lists the models an account can actually use.
 *
 * Groq model access is account-scoped, so the curated static list is not
 * always accurate — this queries the provider for the live set.
 */
export async function runListModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  switch (provider) {
    case 'groq':
      return listGroqModels(apiKey)
    default:
      throw new Error(`Listing models is not supported for ${provider}`)
  }
}
