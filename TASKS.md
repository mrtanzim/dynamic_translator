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
- [x] current model IDs (Gemini 3.x, OpenRouter qwen/gemini/claude, Groq qwen/gpt-oss)
- [x] Gemini: `x-goog-api-key` header, `thinkingConfig.thinkingLevel`, no sampling params
- [ ] Live API verification (requires real API keys)

## Phase 6 Vocab features
- [x] search history (IndexedDB) + saved words
- [x] pronunciation (Web Speech API)
- [x] one history row per search (keyed on the original query / requestId)
- [x] type-ahead suggestions from the offline dictionary (prefix + typo tolerant)
- [x] clear button in the search field
- [x] Select Language menu view: popular source/target languages, swap button,
      persisted pair; Bengali ⇄ English works, other pairs are UI previews
- [x] thin, glass-themed scrollbars (styled inside the shadow root)
- [x] "Search" entry in the menu to return to the search screen
- [x] romanized spelling of every Bengali word in the offline dataset
- [x] AI answer carries a transcription (other script) and a pronunciation guide
- [ ] export history/saved as CSV/JSON
- [ ] full bilingual sentence translation view

## Phase 7 Auth/sync
- [ ] Supabase optional auth + cloud sync of saved words

## Phase 8 QA
- [x] vitest suite (171 tests, 3 live-API tests skipped) covering the
      coordinator, the offline dictionary, the type-ahead, the providers, the
      history store, the overlay, the service worker, the content script and
      keyboard isolation from host-page hotkeys, language pair selection
- [x] type-check + production build green
- [x] built-artifact check: `dist/dictionary.json.gz` present, content bundle free
      of dictionary data, service-worker load path simulated
- [ ] manual Chrome verification: toggle, drag, resize, persistence, offline lookup
- [x] docs sync (PRD / ARCHITECTURE / DESIGN / RULES)

## Phase 9 Fixes
- [x] retired provider model IDs replaced with the current ones
- [x] history and saved words keyed on the original query, not the display word
- [x] toggle injects the content script on demand — the page is never reloaded
- [x] shadow host element removed when the overlay unmounts
- [x] offline result ranked below every provider result
- [x] overlay position write debounced, history pruning batched
- [x] overlay keyboard events no longer trigger host-page hotkeys: the shadow
      host stops keydown/keyup/keypress before they bubble to the page
- [x] language picker uses a custom dark-glass listbox; no native select popup
      or white focus ring, with keyboard navigation and reduced-motion support

## Phase 10 Bidirectional lookup
- [x] Banglish (romanized Bengali) offline lookup and direction detection
- [x] selected language pair drives the result direction; Bengali script is
      always treated as Bengali-to-English
- [x] rich result fields (synonyms, antonyms, collocations, word family, band,
      examples) are produced for both directions
- [x] Bengali greetings and idioms answer with the natural idiomatic English
      equivalent as the primary answer; literal renderings stay in synonyms
- [ ] remaining language pairs stay UI previews until a dataset exists

