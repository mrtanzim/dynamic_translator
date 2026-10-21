// Loads the offline dictionary dataset inside the service worker.
//
// The dataset lives in `public/dictionary.json.gz` and is fetched at runtime so
// that it never becomes part of the content-script bundle. It is stored
// gzipped because that is roughly a third of the raw size, and the extension
// runtime provides `DecompressionStream` to unpack it.

import { OfflineDictionary, type DictionaryDataset } from './dataset'

/** Path of the dataset inside the extension package. */
export const DATASET_PATH = 'dictionary.json.gz'

let pending: Promise<OfflineDictionary> | null = null

/**
 * Decompresses a gzip buffer using the platform's `DecompressionStream`.
 * @param buffer compressed bytes
 */
async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available in this runtime')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/**
 * Fetches, decompresses and indexes the dataset.
 *
 * The result is memoized: the service worker keeps the index in memory for
 * the lifetime of the worker, and concurrent callers share one fetch.
 */
export async function loadOfflineDictionary(): Promise<OfflineDictionary> {
  if (!pending) {
    pending = (async () => {
      const url = chrome.runtime.getURL(DATASET_PATH)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load dictionary dataset: HTTP ${response.status}`)
      }
      const raw = await response.arrayBuffer()
      const json = await gunzip(raw)
      const dataset = JSON.parse(new TextDecoder().decode(json)) as DictionaryDataset
      return new OfflineDictionary(dataset)
    })().catch((err: unknown) => {
      // Do not cache a failure: a later call should be able to retry.
      pending = null
      throw err
    })
  }
  return pending
}
