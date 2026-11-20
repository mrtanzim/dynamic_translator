// Content-side client for the offline dictionary.
//
// The dataset itself lives in the service worker (see `loader.ts`), so this
// module never imports dictionary data and stays tiny in the content-script
// bundle. Lookups are proxied through `chrome.runtime.sendMessage`.

import {
  OFFLINE_LOOKUP_MESSAGE,
  SUGGEST_MESSAGE,
  type OfflineEntryPayload,
  type OfflineLookupMatch,
  type OfflineLookupResponse,
  type SuggestionPayload,
  type SuggestResponse,
} from '../bridge'
import type { LookupDirection } from '../../shared/types'

export {
  isBengali,
  normalize,
  normalizeBengali,
  type DictionaryEntry,
  type Suggestion,
} from './dataset'
export type { OfflineEntryPayload, SuggestionPayload }

function isContextInvalid(err: unknown): boolean {
  const str = String(err)
  return str.includes('Extension context invalidated') || str.includes('context invalid')
}

/**
 * Asks the service worker for a dictionary entry.
 *
 * @param query    the raw user input
 * @param bengali  whether the input is written in Bengali
 *
 * The returned payload always carries the resolved English `headword`, which
 * for a Bengali query is the reverse lookup result.
 */
export async function offlineLookupWithMatch(
  query: string,
  bengali = false,
  direction?: LookupDirection,
): Promise<{ entry: OfflineEntryPayload | null; via: OfflineLookupMatch | undefined }> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { entry: null, via: undefined }
    }
    const response = (await chrome.runtime.sendMessage({
      type: OFFLINE_LOOKUP_MESSAGE,
      query,
      isBengali: bengali,
      direction,
    })) as OfflineLookupResponse | undefined
    if (!response) return { entry: null, via: undefined }
    if (!response.ok) throw new Error(response.error)
    return { entry: response.result, via: response.via }
  } catch (err) {
    if (isContextInvalid(err)) return { entry: null, via: undefined }
    throw err
  }
}

export async function offlineLookup(
  query: string,
  bengali = false,
  direction?: LookupDirection,
): Promise<OfflineEntryPayload | null> {
  return (await offlineLookupWithMatch(query, bengali, direction)).entry
}

/**
 * Resolves a Bengali meaning back to its English headword.
 *
 * The romanization of the queried spelling comes with it, so the caller can
 * show how the word is written in Latin script.
 */
export async function offlineBengaliLookup(
  query: string,
  direction?: LookupDirection,
): Promise<{ headword: string; entry: OfflineEntryPayload; roman: string } | null> {
  const entry = await offlineLookup(query, true, direction)
  return entry ? { headword: entry.headword, entry, roman: entry.trans } : null
}

/**
 * Asks the service worker for the words that match a partially typed query.
 *
 * The suggestions come from the offline dictionary, so they are available
 * without an AI provider and without a network round trip.
 *
 * @param query  the partially typed word
 * @param limit  the maximum number of suggestions
 */
export async function suggestWords(
  query: string,
  limit = 8,
): Promise<SuggestionPayload[]> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return []
    const response = (await chrome.runtime.sendMessage({
      type: SUGGEST_MESSAGE,
      query,
      limit,
    })) as SuggestResponse | undefined
    if (!response) return []
    if (!response.ok) throw new Error(response.error)
    return response.suggestions
  } catch (err) {
    if (isContextInvalid(err)) return []
    throw err
  }
}
