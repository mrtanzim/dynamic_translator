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
 * Suggests dictionary words matching a partially typed query.
 *
 * @param dictionary - The OfflineDictionary instance
 * @param query - Partially typed word
 * @param limit - Maximum suggestions to return (default 8)
 * @returns Array of SuggestionPayload objects, ranked by relevance
 */
export function suggestWords(
  dictionary: OfflineDictionary,
  query: string,
  limit = 8,
): SuggestionPayload[] {
  const isBengali = /[\u0980-\u09FF]/.test(query);
  if (isBengali) {
    return dictionary.bengaliSuggestions(query, limit);
  }
  return dictionary.englishSuggestions(query, limit);
}
