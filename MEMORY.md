# VocabFlow — Memory

## Decisions
- Chrome MV3, Vite, React, TS strict.
- CRXJS for extension build.
- Overlay React in Shadow DOM; position/size persisted under `vocabflow.overlay`.
- Offline dictionary: generated columnar dataset shipped as `public/dictionary.json.gz`
  (~356 KB gzipped, ~6675 entries) and built by `scripts/build-dictionary.mjs`.
  It is fetched and indexed **inside the service worker**, never imported by the
  content script, so the content bundle stays small.
- All provider HTTP calls are proxied through the service worker
  (`src/providers/bridge.ts`, message type `VOCABFLOW_AI_LOOKUP`) because
  content-script `fetch` is subject to the host page's CORS/CSP.
- Provider API keys live only in `chrome.storage.local` under `vocabflow.providers`.
- Search history and saved words live in IndexedDB (`vocabflow` / `history` store).
- Lookup orchestration is centralised in `src/lookup/coordinator.ts`:
  request IDs, stale-response rejection, completeness-based ranking,
  provider priority `groq > openrouter > gemini`.
- Text normalization is Unicode-aware: `[^\p{L}\p{N}\p{M}\s]` is stripped, not
  `[^\w\s]`. Bengali vowel signs (ি, া) are combining marks, so a letter-only
  class corrupts Bengali words (and a `\w`-only class erases them entirely).
- Bengali is normalized with NFC on both the storage and the query side, so the
  precomposed YYA (য়, U+09DF) and the decomposed য + nukta resolve identically.

## Completed
- Phase 1, 2, 3 (core), 4, 5 (scaffolded, untested against live APIs), 6 (partial).
- Draggable/resizable/persisted overlay with debounced live search + Enter lookup.
- Offline-first lookup with provisional result and AI replacement.
- Concurrent AI provider fan-out with per-provider error isolation.
- Provider settings UI with test-connection button.
- History, saved words, pronunciation, three-dot menu, settings & about views.
- Vitest suite (30 tests) covering the coordinator and the offline dictionary.
- Fixed: Bengali offline lookup was broken because `normalize()` stripped all
  Bengali characters, so the coordinator bailed out before any lookup ran.
  Covered by a regression test (`looks up a Bengali word offline`).
- Offline dictionary now lives in the service worker (`VOCABFLOW_OFFLINE_LOOKUP`
  bridge) and is loaded asynchronously from `public/dictionary.json.gz` via
  `DecompressionStream`. The content bundle contains no dictionary data.
- Fixed: the offline result dropped the part of speech even though the dataset
  has a `pos` column; it is now propagated into `LookupResult.partOfSpeech`.

## Blocked / Not verified
- No live Groq / OpenRouter / Gemini / Supabase credentials are available yet.
- Manual Chrome verification (toggle, drag, resize, persistence) not yet reported.
- Offline dataset is not yet a large, formally licensed corpus.

## Next step
- Manual Chrome verification of the built extension.
- Import a licensed dictionary dataset and add part-of-speech + Bengali examples.
- History/saved export (CSV/JSON) and the full bilingual sentence translation view.
- Optional Supabase auth and cloud sync of saved words.

