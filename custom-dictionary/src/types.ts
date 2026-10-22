// Shared data models for the custom dictionary lookup system.
//
// Mirrors the types used in the main `Translator extention` overlay
// (`src/shared/types.ts`, `src/providers/bridge.ts`, `src/providers/offline/dataset.ts`)
// so that the offline dictionary built here can be dropped directly into
// the extension's overlay with no type changes.

export type ResultSource = 'offline'

/**
 * A single dictionary lookup result.
 *
 * `word` is the original user query (stable identity for history/saved words).
 * `headword` is the canonical English headword when the offline dictionary
 * resolved one (absent when the query is not in the dictionary).
 */
export interface LookupResult {
  /** The word being displayed, i.e. the query exactly as the user typed it. */
  word: string
  /** The original user query that produced this result. */
  query: string
  /** The canonical English headword, when the offline dictionary resolved one. */
  headword?: string
  /** The primary Bengali meaning of the headword. */
  bengaliMeaning?: string
  /** English definition. */
  englishDefinition?: string
  /** The word written in the other script (English -> Bengali script, Bengali -> Latin). */
  transcription?: string
  /** How the word is pronounced, in IPA or respelling. */
  pronunciation?: string
  /** Synonyms. */
  synonyms?: string[]
  /** Antonyms. */
  antonyms?: string[]
  /** Example sentence in English. */
  exampleEn?: string
  /** Example sentence in Bengali. */
  exampleBn?: string
  /** Part of speech. */
  partOfSpeech?: string
  /** Source of the result. */
  source: ResultSource
  /** Stable identity of this lookup action (shared by offline + AI results of one search). */
  requestId: string
  /** Lookup timestamp in milliseconds. */
  timestamp: number
}

/**
 * A single dictionary entry as stored in the columnar dataset.
 * All arrays share the same index space.
 */
export interface DictionaryEntry {
  /** English headword. */
  headword: string
  /** Primary Bengali meaning. */
  bn: string
  /** All other Bengali meanings. */
  bnAlts: string[]
  /** The romanized spelling of the primary meaning ("বই" -> "boi"). */
  trans: string
  /** The romanized spelling of each alternative meaning. */
  transAlts: string[]
  /** English definition. */
  def: string
  /** Part of speech. */
  pos: string
  /** Synonyms. */
  syn: string[]
  /** Antonyms. */
  ant: string[]
  /** Example sentence (English). */
  ex: string
  /** Example sentence (Bengali). */
  exBn?: string
  /** Pronunciation guide (IPA). */
  pron: string
}

/**
 * The raw columnar dataset as stored on disk.
 * Every array has the same length and shares the same index space.
 */
export interface DictionaryDataset {
  v: number
  headwords: string[]
  bn: string[]
  bnAlt: string[]
  trans: string[]
  transAlt: string[]
  def: string[]
  pos: string[]
  syn: string[]
  ant: string[]
  ex: string[]
  exBn?: string[]
  pron: string[]
}

/**
 * A type-ahead suggestion, as transferred over the message channel.
 */
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

/** Message types for chrome.runtime messaging between content script and service worker. */
export const DICT_LOOKUP_MESSAGE = 'VOCABFLOW_DICT_LOOKUP'
export const DICT_SUGGEST_MESSAGE = 'VOCABFLOW_DICT_SUGGEST'

/** A single dictionary lookup request sent over the message channel. */
export interface DictLookupRequest {
  type: typeof DICT_LOOKUP_MESSAGE
  query: string
  isBengali: boolean
  packageId?: string
}

/** Response to a dictionary lookup request. */
export type DictLookupResponse =
  | { ok: true; result: LookupResult }
  | { ok: false; error: string }

/** A single dictionary suggestion request sent over the message channel. */
export interface DictSuggestRequest {
  type: typeof DICT_SUGGEST_MESSAGE
  query: string
  limit?: number
}

/** Response to a suggestion request. */
export type DictSuggestResponse =
  | { ok: true; suggestions: SuggestionPayload[] }
  | { ok: false; error: string }
