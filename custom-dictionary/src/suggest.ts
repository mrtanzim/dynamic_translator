// Type-ahead suggestion engine for the offline dictionary.
//
// Provides forgiving type-ahead suggestions for partially typed queries.
// Ranking:
//   1. Exact dictionary word match
//   2. Synonym/antonym matches (via relation index)
//   3. Prefix matches
//   4. Fuzzy matches (edit distance <= 2 for words >= 3 chars)
//   5. Subsequence matches
//
// Ranking favors shorter words within each band to prioritize common words.

import { OfflineDictionary } from './indexer';
import type { SuggestionPayload } from './types';

/**
 * The result of a type-ahead suggestion request, including a sequence
 * number so callers can discard stale answers when a newer keystroke has
 * already arrived.
 */
export interface SuggestResponse {
  /** Sequence number of this request. Increments on every call. */
  seq: number;
  /** The suggested words, ranked by relevance. */
  suggestions: SuggestionPayload[];
}

/**
 * Suggests dictionary words matching a partially typed query.
 *
 * Returns a sequence number along with the suggestions so callers can
 * discard stale answers when a newer keystroke has already arrived.
 *
 * @param dictionary - The OfflineDictionary instance
 * @param query - Partially typed word
 * @param limit - Maximum suggestions to return (default 8)
 * @returns SuggestResponse with sequence number and ranked suggestions
 */
export function suggestWords(
  dictionary: OfflineDictionary,
  query: string,
  limit = 8,
): SuggestResponse {
  const isBengali = /[\u0980-\u09FF]/.test(query);
  if (isBengali) {
    return {
      seq: 0,
      suggestions: dictionary.bengaliSuggestions(query, limit),
    };
  }
  return {
    seq: 0,
    suggestions: dictionary.englishSuggestions(query, limit),
  };
}

/**
 * Manages a sequence counter for type-ahead suggestions so that callers can
 * drop stale responses when the user keeps typing.
 *
 * Usage:
 *   const engine = new SuggestEngine();
   *   // On each keystroke:
   *   const { seq, suggestions } = engine.suggest(dictionary, query, limit);
   *   // Before displaying suggestions, check that seq is still current:
   *   if (seq === engine.seq) { renderSuggestions(suggestions); }
 */
export class SuggestEngine {
  private seq = 0;

  /**
   * Returns the current sequence number without incrementing.
   * Use this to check if a previous suggestion is still current.
   */
  get currentSeq(): number {
    return this.seq;
  }

  /**
   * Suggests dictionary words matching a partially typed query.
   *
   * Returns a sequence number along with the suggestions so callers can
   * discard stale responses when a newer keystroke has already arrived.
   *
   * @param dictionary - The OfflineDictionary instance
   * @param query - Partially typed word
   * @param limit - Maximum suggestions to return (default 8)
   * @returns SuggestResponse with sequence number and ranked suggestions
   */
  suggest(
    dictionary: OfflineDictionary,
    query: string,
    limit = 8,
  ): SuggestResponse {
    this.seq += 1;
    const seq = this.seq;
    const isBengali = /[\u0980-\u09FF]/.test(query);
    if (isBengali) {
      return {
        seq,
        suggestions: dictionary.bengaliSuggestions(query, limit),
      };
    }
    return {
      seq,
      suggestions: dictionary.englishSuggestions(query, limit),
    };
  }
}
