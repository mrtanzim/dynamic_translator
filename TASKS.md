# VocabFlow — Tasks

## Phase 1 Foundation
- [x] Scaffold Vite+React+TS MV3
- [x] manifest.json
- [x] service worker toggle
- [x] build succeeds

## Phase 2 Overlay
- [x] content script + shadow DOM
- [x] drag/resize/clamp/persist
- [x] reference UI (glassmorphism)
- [x] three-dot menu shell (Providers / History / Saved / Settings / About)

## Phase 3 Offline dictionary
- [x] generated columnar dataset (`scripts/build-dictionary.mjs`) shipped as
      `public/dictionary.json.gz` (~356 KB gzipped, ~6675 entries)
- [x] dataset loaded inside the service worker (`DecompressionStream`), kept out
      of the content-script bundle
- [x] headword + synonym/antonym relation index + Bengali reverse index
- [x] Bengali -> English reverse lookup
- [x] normalized lookup + `isBengali` direction detection
- [x] NFC + punctuation/whitespace normalization shared by storage and query sides
- [ ] Import a larger, properly licensed dataset (Wiktionary/WOFTED/BSD) with attribution
- [ ] Bengali example sentences for every entry

## Phase 4 Coordinator
- [x] shared lookup types + typed events (LOCAL_RESULT / AI_RESULT / LOOKUP_COMPLETE / LOOKUP_ERROR)
- [x] unique request IDs + stale-response rejection + cancellation
- [x] deterministic ranking (completeness score, then provider priority)
- [x] provisional offline result replaced by first/best AI result
- [x] in-memory result cache
- [x] 400 ms debounce + Enter immediate lookup wired into the overlay

## Phase 5 Providers
- [x] Provider interface + shared prompt/JSON parsing
- [x] Groq, OpenRouter, Gemini implementations
- [x] service-worker proxy so page CSP/CORS never blocks API calls
- [x] provider settings UI (key, enable, model, test, remove) stored in chrome.storage.local
- [ ] Live API verification (requires real API keys)

## Phase 6 Vocab features
- [x] search history (IndexedDB) + saved words
- [x] pronunciation (Web Speech API)
- [ ] export history/saved as CSV/JSON
- [ ] full bilingual sentence translation view

## Phase 7 Auth/sync
- [ ] Supabase optional auth + cloud sync of saved words

## Phase 8 QA
- [x] vitest suite for coordinator + offline dictionary (30 tests)
- [x] type-check + production build green
- [x] built-artifact check: `dist/dictionary.json.gz` present, content bundle free
      of dictionary data, service-worker load path simulated
- [ ] manual Chrome verification: toggle, drag, resize, persistence, offline lookup
- [x] docs sync (PRD / ARCHITECTURE / DESIGN / RULES)

