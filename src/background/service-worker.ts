import {
  LIST_MODELS_MESSAGE,
  LOOKUP_MESSAGE,
  OFFLINE_LOOKUP_MESSAGE,
  SEED_MESSAGE,
  SUGGEST_MESSAGE,
  TOGGLE_MESSAGE,
  runListModels,
  runProviderLookup,
  type AiLookupRequest,
  type ListModelsRequest,
  type ListModelsResponse,
  type OfflineLookupRequest,
  type OfflineLookupResponse,
  type SuggestRequest,
  type SuggestResponse,
} from '../providers/bridge'
import { loadOfflineDictionary } from '../providers/offline/loader'
import { tryLoadBanglaDictionary } from '../providers/offline/bn-loader'
import { toOfflineEntryPayload } from '../providers/offline/bn-dataset'
import { isBengali } from '../providers/offline/dataset'
import { seedProviderSettings } from '../storage/seed'
import { isSupportedPair, loadLanguagePair } from '../storage/languages'
import { contentScriptFiles } from './content-script'

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
  const tabId = tab.id
  try {
    await chrome.tabs.sendMessage(tabId, { type: TOGGLE_MESSAGE })
    return
  } catch {
    // The content script is not running in this tab yet — it is declared for
    // every page, but a tab that was already open when the extension was
    // installed or reloaded never received it. Inject it on demand and try
    // again. Reloading the tab would work too, but it would destroy the
    // user's page state, so it is not an acceptable fallback.
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: contentScriptFiles(),
    })
    await chrome.tabs.sendMessage(tabId, { type: TOGGLE_MESSAGE })
  } catch {
    // The page refuses extension scripts (chrome://, the Web Store, a PDF
    // viewer, or a page with a strict CSP). There is nothing to do here.
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

// The type-ahead suggestions come from the same dictionary, so they are
// resolved here as well: the content script never sees the dataset.
chrome.runtime.onMessage.addListener(
  (msg: SuggestRequest, _sender, sendResponse: (r: SuggestResponse) => void) => {
    if (msg?.type !== SUGGEST_MESSAGE) return false
    handleSuggest(msg).then(sendResponse, (err: unknown) =>
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

/** Resolves a query against the Bengali-first or English-first dictionary. */
async function handleOfflineLookup(
  msg: OfflineLookupRequest,
): Promise<OfflineLookupResponse> {
  // A pinned bn→en pair can produce Latin-script Banglish, so direction is the
  // primary signal. isBengali is kept for callers that do not send direction.
  if (msg.direction === 'bn-en' || msg.isBengali) {
    const bn = await tryLoadBanglaDictionary()
    if (bn) {
      const hit = bn.lookup(msg.query)
      if (hit) {
        return { ok: true, result: toOfflineEntryPayload(hit), via: 'bengali' }
      }
    }
    // Fall through: a word missing from the BN dataset still gets the old
    // reverse lookup, so the new package never makes a query fail.
  }

  const dictionary = await loadOfflineDictionary()
  if (msg.isBengali) {
    const hit = dictionary.lookupBengali(msg.query)
    if (!hit) return { ok: true, result: null, via: 'bengali' }
    // The word the user typed is the Bengali word. The entry's primary
    // meaning may be a different spelling of the same word, so the matched
    // spelling and its romanization are returned instead.
    return { ok: true, result: { ...hit.entry, bn: hit.bengali, trans: hit.roman }, via: 'bengali' }
  }
  const english = dictionary.lookupEnglish(msg.query)
  if (english) {
    return { ok: true, result: { ...english }, via: 'english' }
  }
  const roman = dictionary.lookupRoman(msg.query)
  if (roman) {
    return { ok: true, result: { ...roman.entry }, via: 'roman' }
  }
  return { ok: true, result: null, via: 'english' }
}

/** Suggests dictionary words; Bengali/Banglish input uses the BN dataset. */
async function handleSuggest(msg: SuggestRequest): Promise<SuggestResponse> {
  // A pinned bn→en pair makes Latin-script input Bengali too, so it must reach
  // the BN index even when the query itself has no Bengali script.
  const pair = await loadLanguagePair()
  const pinnedBengali = isSupportedPair(pair) && pair.source === 'bn' && pair.target === 'en'
  if (pinnedBengali || isBengali(msg.query)) {
    const bn = await tryLoadBanglaDictionary()
    if (bn) {
      const suggestions = bn.suggestions(msg.query, msg.limit ?? 8)
      if (suggestions.length > 0) return { ok: true, suggestions }
    }
  }
  const dictionary = await loadOfflineDictionary()
  return { ok: true, suggestions: dictionary.suggest(msg.query, msg.limit ?? 8) }
}

