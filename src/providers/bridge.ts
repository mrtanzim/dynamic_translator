import { geminiLookup } from '../providers/gemini'
import { groqLookup } from '../providers/groq'
import { listGroqModels } from '../providers/groq/models'
import { openRouterLookup } from '../providers/openrouter'
import type { ProviderId } from '../storage/settings'
import type { LookupDirection, LookupResult } from '../shared/types'

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
  /** The romanized spelling of the primary meaning ("বই" -> "boi"). */
  trans: string
  /** The romanized spelling of every alternative, in the same order. */
  transAlts: string[]
  def: string
  pos: string
  syn: string[]
  ant: string[]
  ex: string
  /** Example sentence (Bengali). */
  exBn?: string
  /** Pronunciation guide (IPA). */
  pron: string
  /** Register / idiom note, present on Bengali-first results. */
  usageNote?: string
  /** Rich fields generated offline for both lookup directions. */
  formalMeaning?: string
  conversationalMeaning?: string
  exampleFormal?: string
  exampleConversational?: string
  collocations?: string[]
  wordFamily?: { noun?: string; verb?: string; adj?: string; adv?: string }
  bandLevel?: string
  commonMistake?: string
  /** Japanese fields (present only on JA-backed results). */
  kana?: string
  romaji?: string
  exampleJa?: string
}

export interface OfflineLookupRequest {
  type: typeof OFFLINE_LOOKUP_MESSAGE
  query: string
  isBengali: boolean
  /** Resolved direction; needed for Banglish queries where isBengali is false. */
  direction?: LookupDirection
}

export type OfflineLookupMatch = 'english' | 'bengali' | 'roman' | 'japanese'

export type OfflineLookupResponse =
  | { ok: true; result: OfflineEntryPayload | null; via?: OfflineLookupMatch }
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

/** Japanese lookup and suggestion messages (service-worker side only). */
export const JA_LOOKUP_MESSAGE = 'VOCABFLOW_JA_LOOKUP'
export const JA_SUGGEST_MESSAGE = 'VOCABFLOW_JA_SUGGEST'

export interface JaLookupRequest {
  type: typeof JA_LOOKUP_MESSAGE
  query: string
  direction: 'ja-en' | 'en-ja'
}

export interface JaSuggestRequest {
  type: typeof JA_SUGGEST_MESSAGE
  query: string
  limit?: number
}

export interface JaEntryPayload {
  surface: string
  kana: string
  romaji: string
  en: string
  enAlt: string[]
  pos: string
  synEn: string[]
  antEn: string[]
  exampleJa: string
  exampleEn: string
  formalMeaning: string
  conversationalMeaning: string
  exampleFormal: string
  exampleConversational: string
  collocations: string[]
  wordFamily: string
  bandLevel: string
  commonMistake: string
}

export type JaLookupResponse =
  | { ok: true; result: JaEntryPayload | null }
  | { ok: false; error: string }

export type JaSuggestResponse =
  | { ok: true; suggestions: Array<{ word: string; headword: string; japanese: boolean; hint: string }> }
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
