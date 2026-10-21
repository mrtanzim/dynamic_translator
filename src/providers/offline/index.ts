// Content-side client for the offline dictionary.
//
// The dataset itself lives in the service worker (see `loader.ts`), so this
// module never imports dictionary data and stays tiny in the content-script
// bundle. Lookups are proxied through `chrome.runtime.sendMessage`.

import {
  OFFLINE_LOOKUP_MESSAGE,
  type OfflineEntryPayload,
  type OfflineLookupResponse,
} from '../bridge'

export {
  isBengali,
  normalize,
  normalizeBengali,
  type DictionaryEntry,
} from './dataset'
export type { OfflineEntryPayload }

/**
 * Asks the service worker for a dictionary entry.
 *
 * @param query    the raw user input
 * @param bengali  whether the input is written in Bengali
 *
 * The returned payload always carries the resolved English `headword`, which
 * for a Bengali query is the reverse lookup result.
 */
export async function offlineLookup(
  query: string,
  bengali = false,
): Promise<OfflineEntryPayload | null> {
  const response = (await chrome.runtime.sendMessage({
    type: OFFLINE_LOOKUP_MESSAGE,
    query,
    isBengali: bengali,
  })) as OfflineLookupResponse | undefined
  if (!response) return null
  if (!response.ok) throw new Error(response.error)
  return response.result
}

/** Resolves a Bengali meaning back to its English headword. */
export async function offlineBengaliLookup(
  query: string,
): Promise<{ headword: string; entry: OfflineEntryPayload } | null> {
  const entry = await offlineLookup(query, true)
  return entry ? { headword: entry.headword, entry } : null
}


