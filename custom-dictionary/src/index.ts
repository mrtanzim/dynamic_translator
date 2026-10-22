/**
 * Custom Dictionary Package System — Public API.
 *
 * Phase 0 placeholder. This file exists so that `tsc -b` has a rootDir
 * to compile and so later phases have a single import point.
 */

export const VERSION = '0.1.0'

export function version(): string {
  return VERSION
}

export interface DictionaryEntry {
  headword: string
  bn: string
  bnAlts: string[]
  trans: string
  transAlts: string[]
  def: string
  pos: string
  syn: string[]
  ant: string[]
  ex: string
  pron: string
}

export interface LookupResult {
  word: string
  query: string
  headword?: string
  bengaliMeaning?: string
  englishDefinition?: string
  transcription?: string
  pronunciation?: string
  synonyms?: string[]
  antonyms?: string[]
  exampleEn?: string
  exampleBn?: string
  partOfSpeech?: string
  source: 'offline'
  requestId: string
  timestamp: number
}
