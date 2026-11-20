// Loads the Bengali-first dataset in the service worker, memoized.
import { BanglaDictionary, type BengaliDataset } from './bn-dataset'

/** Path of the Bengali dataset inside the extension package. */
export const BN_DATASET_PATH = 'dictionary.bn.json.gz'

let pending: Promise<BanglaDictionary> | null = null

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available in this runtime')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/** Fetches, decompresses and indexes the Bengali dataset; retries after failure. */
export async function loadBanglaDictionary(): Promise<BanglaDictionary> {
  if (!pending) {
    pending = (async () => {
      const url = chrome.runtime.getURL(BN_DATASET_PATH)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load Bengali dictionary: HTTP ${response.status}`)
      }
      const raw = await response.arrayBuffer()
      const json = await gunzip(raw)
      const dataset = JSON.parse(new TextDecoder().decode(json)) as BengaliDataset
      return new BanglaDictionary(dataset)
    })().catch((err: unknown) => {
      pending = null
      throw err
    })
  }
  return pending
}

/** Best-effort variant: returns null instead of throwing. */
export async function tryLoadBanglaDictionary(): Promise<BanglaDictionary | null> {
  try {
    return await loadBanglaDictionary()
  } catch {
    return null
  }
}
