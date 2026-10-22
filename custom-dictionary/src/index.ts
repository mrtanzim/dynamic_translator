// Public API entry point for the custom dictionary lookup system.
//
// Exports the types and functions consumers need:
//   * LookupResult, DictionaryEntry, DictionaryDataset — data models
//   * LookupCoordinator — central lookup orchestration
//   * loadOfflineDictionary — load the dictionary dataset from the service worker
//   * suggestWords — type-ahead suggestions (placeholder, implemented in Phase 3)
//
// Usage:
//   import { LookupCoordinator, loadOfflineDictionary } from './index';
//   const dictionary = await loadOfflineDictionary();
//   const coordinator = new LookupCoordinator(dictionary);
//   const result = coordinator.lookup('hello');

import { OfflineDictionary } from './indexer';
import { loadOfflineDictionary } from './loader';
import { LookupCoordinator } from './lookup';
import type { DictionaryDataset, DictionaryEntry, LookupResult, SuggestionPayload } from './types';

export {
  DictionaryDataset,
  DictionaryEntry,
  LookupResult,
  SuggestionPayload,
};
export { LookupCoordinator } from './lookup';
export { loadOfflineDictionary };
export { SuggestEngine } from './suggest';
export type { SuggestResponse } from './suggest';
export const VERSION = '0.1.0';

/**
 * Create a LookupCoordinator from a loaded dictionary dataset.
 *
 * This is a convenience wrapper that loads the dictionary dataset and
 * constructs a LookupCoordinator in one call.
 *
 * @param dictionaryPath - Path to the gzipped dataset file
 * @returns A LookupCoordinator instance
 */
export async function loadLookupCoordinator(
  dictionaryPath: string,
): Promise<LookupCoordinator> {
  const dataset = await loadOfflineDictionary(dictionaryPath);
  const dictionary = new OfflineDictionary(dataset);
  return new LookupCoordinator(dictionary);
}
