// Loads the Japanese dataset in the service worker, memoized.
import { JapaneseDictionary, type JaDataset } from './ja-dataset'

/** Path of the Japanese dataset inside the extension package. */
export const JA_DATASET_PATH = 'dictionary.ja.json.gz'

let pending: Promise<JapaneseDictionary> | null = null

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available in this runtime')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/** Memoized loader; a failure is not cached so a later call can retry. */
export async function loadJapaneseDictionary(): Promise<JapaneseDictionary> {
  if (!pending) {
    pending = (async () => {
      const url = chrome.runtime.getURL(JA_DATASET_PATH)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load Japanese dictionary: HTTP ${response.status}`)
      }
      const raw = await response.arrayBuffer()
      const dataset = JSON.parse(new TextDecoder().decode(await gunzip(raw))) as JaDataset
      return new JapaneseDictionary(dataset)
    })().catch((err: unknown) => {
      pending = null
      throw err
    })
  }
  return pending
}

/** Best-effort variant used by the service worker. */
export async function tryLoadJapaneseDictionary(): Promise<JapaneseDictionary | null> {
  try {
    return await loadJapaneseDictionary()
  } catch {
    return null
  }
}
