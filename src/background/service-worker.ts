import {
  LIST_MODELS_MESSAGE,
  LOOKUP_MESSAGE,
  OFFLINE_LOOKUP_MESSAGE,
  SEED_MESSAGE,
  runListModels,
  runProviderLookup,
  type AiLookupRequest,
  type ListModelsRequest,
  type ListModelsResponse,
  type OfflineLookupRequest,
  type OfflineLookupResponse,
} from '../providers/bridge'
import { loadOfflineDictionary } from '../providers/offline/loader'
import { seedProviderSettings } from '../storage/seed'

// A single shared promise so that the seed runs exactly once per worker start
// and every request can await the same completion.
let seedPromise: Promise<void> | null = null
function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = seedProviderSettings()
  return seedPromise
}

// Seed the build-time provider credentials into chrome.storage.local so that
// AI translation works immediately after installing the extension.
chrome.runtime.onInstalled.addListener(() => {
  void ensureSeeded()
})

// Also seed on every service-worker start (MV3 workers are ephemeral, so a
// first-run seed must not depend on the install event having fired).
void ensureSeeded()

// The content script asks for the seed to be applied before it reads the
// settings, so that a first-run lookup never races the seeding.
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse: (r: unknown) => void) => {
  if (msg?.type !== SEED_MESSAGE) return false
  ensureSeeded()
    .then(() => sendResponse({ ok: true }))
    .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }))
  return true // async response
})

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'VOCABFLOW_TOGGLE' })
  } catch {
    // Content script may not be ready yet; the page will reload and
    // content_scripts (declared in manifest) will inject it automatically.
    await chrome.tabs.reload(tab.id)
  }
})

// Provider calls are proxied through the service worker so that the page's
// Content Security Policy and CORS rules never block the API requests.
chrome.runtime.onMessage.addListener((msg: AiLookupRequest, _sender, sendResponse) => {
  if (msg?.type !== LOOKUP_MESSAGE) return false
  runProviderLookup(msg.provider, msg.query, msg.isBengali, msg.apiKey, msg.model, msg.requestId)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }))
  return true // async response
})

// The offline dictionary lives here so that it never has to be shipped inside
// the content-script bundle. The dataset is fetched (and indexed) on demand.
chrome.runtime.onMessage.addListener(
  (msg: OfflineLookupRequest, _sender, sendResponse: (r: OfflineLookupResponse) => void) => {
    if (msg?.type !== OFFLINE_LOOKUP_MESSAGE) return false
    handleOfflineLookup(msg).then(sendResponse, (err: unknown) =>
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    )
    return true // async response
  },
)

// Listing the available models is also proxied through the service worker,
// for the same CORS/CSP reason as the lookup itself.
chrome.runtime.onMessage.addListener(
  (msg: ListModelsRequest, _sender, sendResponse: (r: ListModelsResponse) => void) => {
    if (msg?.type !== LIST_MODELS_MESSAGE) return false
    runListModels(msg.provider, msg.apiKey)
      .then((models) => sendResponse({ ok: true, models }))
      .catch((err: unknown) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      )
    return true // async response
  },
)

/** Resolves a query against the offline dictionary. */
async function handleOfflineLookup(
  msg: OfflineLookupRequest,
): Promise<OfflineLookupResponse> {
  const dictionary = await loadOfflineDictionary()
  if (msg.isBengali) {
    const hit = dictionary.lookupBengali(msg.query)
    return { ok: true, result: hit ? { ...hit.entry } : null }
  }
  const entry = dictionary.lookup(msg.query)
  return { ok: true, result: entry ? { ...entry } : null }
}

