// Service worker message handlers for the dictionary extension.
//
// Handles:
//   * VOCABFLOW_DICT_LOOKUP — resolves a word lookup against the offline dictionary
//   * VOCABFLOW_DICT_SUGGEST — returns type-ahead suggestions for a partial query
//
// Both handlers load the offline dictionary lazily (cached for the lifetime of
// the service worker) and respond via the sendResponse callback.

import { loadOfflineDictionary } from './loader';
import { OfflineDictionary } from './indexer';
import { LookupCoordinator } from './lookup';
import type {
  DictLookupRequest,
  DictLookupResponse,
  DictSuggestRequest,
  DictSuggestResponse,
  SuggestionPayload,
} from './types';

/**
 * A single dictionary lookup request handled by the service worker.
 */
export interface LookupHandler {
  /** Resolve an offline dictionary lookup for the given query. */
  lookup(query: string, isBengali: boolean): DictionaryResult | null;
  /** Suggest dictionary words matching a partially typed query. */
  suggest(_query: string, _limit?: number): SuggestionPayload[];
}

/**
 * Concrete dictionary lookup implementation backed by the offline dictionary
 * service worker database.
 */
export class DictionaryLookup implements LookupHandler {
  constructor(private coordinator: LookupCoordinator) {}

  lookup(query: string, isBengali: boolean): DictionaryResult | null {
    if (isBengali) {
      return this.coordinator.lookupBengali(query);
    }
    return this.coordinator.lookup(query);
  }

  suggest(_query: string, _limit?: number): SuggestionPayload[] {
    // TODO: Implement suggestions once suggest.ts is available (Phase 3)
    return [];
  }
}

/**
 * The result of a dictionary lookup, used internally before conversion to
 * the wire format.
 */
export interface DictionaryResult {
  word: string;
  query: string;
  headword?: string;
  bengaliMeaning?: string;
  englishDefinition?: string;
  transcription?: string;
  pronunciation?: string;
  synonyms?: string[];
  antonyms?: string[];
  exampleEn?: string;
  exampleBn?: string;
  partOfSpeech?: string;
}

/**
 * Creates a DictionaryLookup instance by loading the offline dictionary.
 *
 * @param datasetPath - Path to the gzipped dictionary dataset
 * @returns A DictionaryLookup instance
 */
export async function createLookup(
  dictionaryPath: string,
): Promise<DictionaryLookup> {
  const dataset = await loadOfflineDictionary(dictionaryPath);
  const dictionary = new OfflineDictionary(dataset);
  const coordinator = new LookupCoordinator(dictionary);
  return new DictionaryLookup(coordinator);
}

/**
 * Message handler for VOCABFLOW_DICT_LOOKUP messages.
 *
 * @param msg - The lookup request message
 * @param lookup - The dictionary lookup instance
 * @returns The lookup response
 */
export function handleLookup(
  msg: DictLookupRequest,
  lookup: DictionaryLookup,
): DictLookupResponse {
  const result = lookup.lookup(msg.query, msg.isBengali);
  if (!result) {
    return { ok: false, error: 'Word not found in offline dictionary' };
  }

  return {
    ok: true,
    result: {
      ...result,
      source: 'offline',
      requestId: Date.now().toString(),
      timestamp: Date.now(),
    },
  };
}

/**
 * Message handler for VOCABFLOW_DICT_SUGGEST messages.
 *
 * @param msg - The suggest request message
 * @param lookup - The dictionary lookup instance
 * @returns The suggestion response
 */
export function handleSuggest(
  msg: DictSuggestRequest,
  lookup: DictionaryLookup,
): DictSuggestResponse {
  const suggestions = lookup.suggest(msg.query, msg.limit ?? 8);
  return { ok: true, suggestions };
}
