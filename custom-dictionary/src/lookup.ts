// Lookup orchestration for the offline dictionary.
//
// Provides a centralised coordinator that:
//   * Looks up English words by headword, synonym or antonym
//   * Resolves Bengali queries back to their English headword
//   * Returns a consistent LookupResult for both directions
//
// The coordinator is intentionally pure: it takes an OfflineDictionary
// instance and performs lookups without side effects, so it can be reused
// by both the service worker (runtime) and unit tests.

import { OfflineDictionary, type IndexEntry } from './indexer';
import type { LookupResult } from './types';

/**
 * Normalize a text string for lookup: NFC normalize, trim, lowercase,
 * strip punctuation, collapse whitespace.
 */
function normalizeHeadword(headword: string): string {
  if (!headword) return ''
  return headword
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Centralised lookup orchestration.
 *
 * Takes an OfflineDictionary and provides lookup methods:
 *   * lookup(query) - looks up English word by headword or synonym/antonym
 *   * lookupBengali(query) - resolves Bengali word to English headword
 *
 * Both return a LookupResult or null.
 */
export class LookupCoordinator {
  constructor(private dictionary: OfflineDictionary) {}

  /**
   * Looks up an English word.
   *
   * Resolves via headword, synonym or antonym. Returns null when the word
   * is not in the dictionary.
   *
   * @param query - The user query (case- and punctuation-insensitive)
   * @returns A LookupResult or null if not found
   */
  lookup(query: string): LookupResult | null {
    const n = normalizeHeadword(query)

    // First check if this word is an antonym of some headword
    const relation = this.dictionary.getAntonymHeadword(n)
    if (relation) {
      const entry = this.dictionary.lookup(relation)
      if (entry) return this.buildResult(query, entry)
    }

    // Then check if it's a direct headword
    const direct = this.dictionary.lookup(n)
    if (direct) return this.buildResult(query, direct)

    return null
  }

  /**
   * Resolves a Bengali query back to its English headword.
   *
   * Returns the English headword, the Bengali meaning, and the Latin-script
   * romanization of the word the user typed.
   *
   * @param query - The Bengali user query
   * @returns A LookupResult or null if not found
   */
  lookupBengali(query: string): LookupResult | null {
    const hit = this.dictionary.lookupBengali(query);
    if (!hit) return null;

    return {
      word: query,
      query,
      headword: hit.headword,
      source: 'offline',
      requestId: '',
      timestamp: Date.now(),
      bengaliMeaning: hit.entry.bn,
      englishDefinition: hit.entry.def,
      partOfSpeech: hit.entry.pos || undefined,
      synonyms: hit.entry.syn.length > 0 ? hit.entry.syn : undefined,
      antonyms: hit.entry.ant.length > 0 ? hit.entry.ant : undefined,
      exampleEn: hit.entry.ex || undefined,
      exampleBn: hit.entry.exBn || undefined,
      pronunciation: hit.entry.pron || undefined,
      transcription: hit.roman || undefined,
    };
  }

  private buildResult(query: string, entry: IndexEntry): LookupResult {
    return {
      word: query,
      query,
      headword: entry.headword,
      source: 'offline',
      requestId: '',
      timestamp: Date.now(),
      bengaliMeaning: entry.bn,
      englishDefinition: entry.def,
      partOfSpeech: entry.pos || undefined,
      synonyms: entry.syn.length > 0 ? entry.syn : undefined,
      antonyms: entry.ant.length > 0 ? entry.ant : undefined,
      exampleEn: entry.ex || undefined,
      exampleBn: entry.exBn || undefined,
      pronunciation: entry.pron || undefined,
      transcription: entry.trans || undefined,
    };
  }
}
