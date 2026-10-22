// Loader for the offline dictionary dataset.
//
// The dataset lives in `public/dictionary.json.gz` and is fetched at runtime
// so that it never becomes part of the content-script bundle. It is stored
// gzipped because that is roughly a third of the raw size, and the extension
// runtime provides `DecompressionStream` to unpack it.
//
// The result is memoized: the caller keeps the index in memory for the
// lifetime of the worker, and concurrent callers share one fetch.
//
// This module is used by both the service worker (extension runtime) and,
// in unit tests, directly with a mocked loader.

import fs from 'node:fs'
import zlib from 'node:zlib'

import { DictionaryDataset } from './types'

/** Path of the dataset inside the extension package. */
export const DATASET_PATH = 'dictionary.json.gz'

let pending: Promise<DictionaryDataset> | null = null

/**
 * Decompresses a gzip buffer using the platform's `DecompressionStream`.
 *
 * Falls back to Node's `zlib.gunzipSync` when running outside a browser
 * service worker (e.g. in unit tests or Node scripts).
 *
 * @param buffer - Compressed gzip bytes
 * @returns Decompressed ArrayBuffer
 */
async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const blob = new Blob([buffer])
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  const arrayBuffer = await new Response(stream).arrayBuffer()
  return arrayBuffer as unknown as ArrayBuffer
}

/**
 * Fetch, decompress and index the dataset.
 *
 * The result is memoized: concurrent callers share one fetch, and a failure
 * is not cached so a later call can retry.
 *
 * @param datasetPath - Path to the gzipped dataset (defaults to
 *   `dictionary.json.gz`)
 * @returns Parsed and indexed DictionaryDataset
 */
export async function loadOfflineDictionary(
  datasetPath = DATASET_PATH,
): Promise<DictionaryDataset> {
  if (!pending) {
    pending = (async () => {
      const response = await fetch(datasetPath)
      if (!response.ok) {
        throw new Error(
          `Failed to load dictionary dataset: HTTP ${response.status}`,
        )
      }
      const raw = await response.arrayBuffer()
      const decompressed = await gunzip(raw)
      const dataset = JSON.parse(
        new TextDecoder().decode(decompressed),
      ) as DictionaryDataset
      return dataset
    })().catch((err: unknown) => {
      // Do not cache a failure: a later call should be able to retry.
      pending = null
      throw err
    })
  }
  return pending
}

/**
 * Clear the cached dataset so the next loadOfflineDictionary call refetches.
 * Primarily used in tests.
 */
export function clearOfflineDictionaryCache(): void {
  pending = null
}

/**
 * Load the dictionary dataset from a local file path (Node.js only).
 *
 * Useful in unit tests and build scripts where chrome.runtime is not
 * available.
 *
 * @param filePath - Path to the gzipped dataset file
 * @returns Parsed DictionaryDataset
 */
export function loadOfflineDictionarySync(
  filePath: string,
): DictionaryDataset {
  const raw = fs.readFileSync(filePath)
  const decompressed = zlib.gunzipSync(raw)
  return JSON.parse(new TextDecoder().decode(decompressed)) as DictionaryDataset
}
