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
  provider priority `groq > openrouter > gemini > offline`.
- A lookup has **two** identities that must not be mixed up: `requestId`
  identifies the search action (one history row per search), `query` is the
  word the user typed (the history/saved-words key and the source of the
  direction). `word` is display-only and always equals the query; the resolved
  English headword travels separately in `headword`.
- The offline result is **provisional**: it is shown only while no provider has
  answered and it never replaces a provider result. `offline` is listed last
  in the priority list, otherwise `indexOf('offline')` would be -1 and the
  offline result would win every tie-break.
- Text normalization is Unicode-aware: `[^\p{L}\p{N}\p{M}\s]` is stripped, not
  `[^\w\s]`. Bengali vowel signs (ি, া) are combining marks, so a letter-only
  class corrupts Bengali words (and a `\w`-only class erases them entirely).
- Bengali is normalized with NFC on both the storage and the query side, so the
  precomposed YYA (য়, U+09DF) and the decomposed য + nukta resolve identically.
- The toolbar toggle never reloads the tab: the service worker injects the
  content script on demand with `chrome.scripting.executeScript()` and sends
  the toggle message again. The content script path is read from the runtime
  manifest, because the bundler emits a different file name in development
  than in a production build. The content script is idempotent (its state lives
  on the isolated world's global), so a repeated injection reuses the listener.
- The content script is built as an **IIFE**: Chrome 130+ blocks the dynamic
  import that the ESM bundle relied on, and `process.env` is not defined in a
  content script, so `process.env.NODE_ENV` is replaced by a Rollup plugin.
- The overlay position write is debounced by 300 ms and flushed when the
  overlay closes; a drag must not produce hundreds of storage writes.
- The overlay stylesheet is injected into the shadow root (`src/ui/styles.ts`),
  because `::-webkit-scrollbar` rules only reach the shadow tree from there.
  The scrollbar is 6 px wide, has a transparent track and a translucent slate
  thumb; `:host { color-scheme: dark }` keeps the native fallback dark instead
  of the light bar Chrome draws on a light page.
- The three-dot menu starts with a **Search** entry, so the search screen is
  always one click away from any other view. The open view is marked in the
  accent colour. Switching views keeps the typed word and the result.
- The type-ahead is served by the offline dictionary through the
  `VOCABFLOW_SUGGEST` message, so it needs no provider and no network. The
  ranking is forgiving on purpose: exact word, then synonym/antonym, then
  prefix, then a small edit distance (transpositions count as one edit), then
  a subsequence. A word that is only the *beginning* of a longer word is not
  looked up on its own — the suggestion is the better answer while the user
  is still typing, and a half-typed word must not be sent to the providers.
  The whole dictionary is covered in about 4 ms.
- The AI prompt asks for more than a translation: `transcription` (the word in
  the other script — an English word in Bengali script, a Bengali word in
  Latin script) and `pronunciation` (IPA or respelling). The provider answers
  both; the offline dictionary answers the Latin-script spelling of a Bengali
  word on its own, because the Wiktionary source carries a `romanised` field
  ("বই" -> "boi") for 100% of the entries. The romanization belongs to the
  *spelling*, not to the headword: "book" is written "বই", "কিতাব" and "বুক",
  and each spelling has its own Latin form.
- The offline dataset is **not** written by an AI model. It is built by
  `npm run build:dictionary` from `bn-en-dictionary` (a Wiktionary dump,
  CC BY-SA 3.0), `wordnet-db` (Princeton WordNet 3.0) and the hand-written
  `src/dictionary/curated.json`. The AI providers never receive the dataset:
  a provider request carries the query, the direction, the model and the key,
  and nothing else.
- The history store keeps **one** IndexedDB connection for all operations (a
  per-operation connection leaked on failure), prunes in a single
  transaction, and lists the saved words through a `saved` index. IndexedDB
  cannot index a boolean, so the flag is stored as 0/1 and converted at the
  boundary (database version 2).
- The shadow host (`#vocabflow-host`) stops `keydown`/`keyup`/`keypress` from
  bubbling to the host page. A content script shares the DOM with the page, and
  Shadow DOM retargets `event.target`/`document.activeElement` to the host, so
  the page's "is the user typing in a field?" guard saw a DIV and fired global
  hotkeys (Space = play/pause on YouTube) while the user typed in the overlay.
  The listeners are attached to the host in `mount.tsx` and removed on unmount;
  React's own key handlers inside the shadow root still run, and keys pressed
  outside the overlay are unaffected. `preventDefault()` alone is not enough —
  it does not stop other listeners from receiving the event.
- The Select Language view stores `{ source, target }` under
  `vocabflow.languages` in `chrome.storage.local` (`src/storage/languages.ts`).
  It offers a popular-language list and a swap button, but only Bengali ⇄ English
  is functional: other pairs show "Preview only". The stored pair intentionally
  does not alter the lookup direction, which is still auto-detected from the
  query script, so the picker cannot break the offline/AI lookup flow.
- Language pickers are custom `role="listbox"` dropdowns (`LanguageSelect.tsx`),
  not native `<select>`: the OS popup and the browser's white focus ring cannot
  be themed from inside the shadow root. The trigger carries
  `aria-haspopup`/`aria-expanded`, options carry `aria-selected`, arrow keys and
  Enter/Escape work, outside clicks close it, and the CSS honours
  `prefers-reduced-motion`.
- Provider model IDs are current as of 2026-10: Groq `qwen/qwen3.8-27b`,
  `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `minimaxai/minimax-m2.7`;
  OpenRouter `qwen/qwen3.8-flash`, `google/gemini-3.8-flash`,
  `z-ai/glm-5.3-flash`, `anthropic/claude-sonnet-5`; Gemini `gemini-3.8-flash`,
  `gemini-3.6-flash`, `gemini-3.1-flash-lite`. The Gemini 2.x line is shut
  down, so Gemini 3.x is the only usable one — it rejects `temperature` /
  `top_p` / `top_k` with HTTP 400, takes the key in the `x-goog-api-key`
  header and uses `thinkingConfig.thinkingLevel` instead of `thinkingBudget`.

## Completed
- Phase 1, 2, 3 (core), 4, 5 (scaffolded, untested against live APIs), 6 (partial), 8.
- Draggable/resizable/persisted overlay with debounced live search + Enter lookup.
- Offline-first lookup with provisional result and AI replacement.
- Concurrent AI provider fan-out with per-provider error isolation.
- Provider settings UI with test-connection button.
- History, saved words, pronunciation, three-dot menu, settings & about views.
- Vitest suite (171 tests, 3 live-API tests skipped) covering the coordinator,
  the offline dictionary, the type-ahead, the providers, the history store, the
  overlay, the service worker, the content script, keyboard isolation, language
  pair selection and the custom listbox.
- Fixed: Bengali offline lookup was broken because `normalize()` stripped all
  Bengali characters, so the coordinator bailed out before any lookup ran.
  Covered by a regression test (`looks up a Bengali word offline`).
- Offline dictionary now lives in the service worker (`VOCABFLOW_OFFLINE_LOOKUP`
  bridge) and is loaded asynchronously from `public/dictionary.json.gz` via
  `DecompressionStream`. The content bundle contains no dictionary data.
- Fixed: the offline result dropped the part of speech even though the dataset
  has a `pos` column; it is now propagated into `LookupResult.partOfSpeech`.
- Fixed: the shipped provider model IDs were retired and could not succeed
  against the live APIs; the model lists and defaults are now current.
- Fixed: a Bengali lookup produced two history rows and stored the wrong word,
  because `LookupResult.word` was both the display value and the identity.
  `query` / `headword` now carry the two roles separately.
- Fixed: the toolbar toggle reloaded the tab when the content script was not
  running, which threw away the user's page state. The content script is now
  injected on demand and the page is never reloaded.
- Fixed: the shadow host element was never removed, so every toggle left an
  empty host div behind.
- Fixed: the offline result outranked a provider result with the same
  completeness score (`PRIORITY.indexOf('offline')` was -1).
- Fixed: the overlay position was written to storage on every mousemove and
  the history store opened a connection per operation; both are batched now.
- Added: the search field suggests dictionary words while typing and has a
  cross button that removes the previous word and its result.
- Added: the AI answer carries a transcription (the word in the other script)
  and a pronunciation guide, not just a translation.
- Proven: the offline dictionary answers when the AI provider fails — the
  offline answer stays on screen and the provider error is reported next to
  it.
- Added: the offline dataset ships the romanized spelling of every Bengali
  word, so the offline answer carries the Latin script as well.
- Fixed: typing in the overlay also triggered the host page's keyboard shortcuts
  (Space paused the YouTube video). Covered by `tests/keyboard-isolation.test.ts`.
- Added: "Select Language" menu entry and language-pair view with popular
  languages, swap, persistence and a preview-only notice for unsupported pairs.

## Blocked / Not verified
- No live Groq / OpenRouter / Gemini / Supabase credentials are available yet.
- The new provider model IDs are not verified against the live APIs — only the
  request shape (headers, sampling parameters, response parsing) is covered by
  the test suite.
- Manual Chrome verification (toggle, drag, resize, persistence) not yet reported.
- Offline dataset is not yet a large, formally licensed corpus.

## Bidirectional lookup
- The stored language pair (`vocabflow.languages`) is read by the coordinator,
  not just by the picker UI. A supported `bn -> en` selection pins the result
  direction: Banglish is Latin script, so it cannot be detected from the query
  alone.
- The offline roman index is best-effort evidence only. It is incomplete and
  can misclassify a Banglish word as an English headword (e.g. `hasy`), so it
  never overrides an explicit Bengali-to-English choice.
- Pure Bengali script is always `bn-en`, regardless of the selected pair.
- Providers receive the resolved direction, not just a Bengali-script test, so
  a Banglish query is treated as Bengali input on the AI path too.
- The primary Bengali-to-English answer is rendered from `englishHeadword`, so
  the prompt requires the natural idiomatic English equivalent for greetings
  and idioms ("ki khobor" -> "How are you?", not "What's the news?"). Literal
  or alternative renderings belong in `synonyms`.
- The content script must guard `chrome.runtime` before registering the toggle
  listener. After an extension reload an already-open tab can run with the
  runtime API gone. Marking the frame as registered before `addListener` would
  permanently disable that frame, so the flag is set only after success.

## Bengali-first offline dataset (2026-11-20)
- A language-specific Bengali-first dataset now lives in `custom-dictionary/data/bn/`
  with its own v1 columnar schema and `npm run build:bn-dictionary` artifact
  (`dictionary.bn.json.gz`, copied into the extension's `public/`).
- The build is data-driven, not ML: it inverts the English-first dataset for
  coverage (8,776 Bengali headwords) and applies hand-written curated entries and
  idioms that always win. "Dictionary AI" here means rich data + smart lookup.
- Bangla→English now carries a natural/idiomatic English equivalent (`headword`),
  English synonyms and antonyms, a Bengali definition, bilingual examples,
  romanization, IPA and a `usageNote`. Idioms keep the literal rendering in
  `enAlt`/`usage` (e.g. `ki khobor` → "How are you?").
- `VOCABFLOW_OFFLINE_LOOKUP` carries optional `direction`; the worker selects the
  BN index for `bn-en` and falls back to the English-first path. A broken BN
  dataset is best-effort. The extension mirrors the indexer inside its own `src/`
  so Vite/tsc never reach outside the build root.
- Banglish keys strip whitespace so `ki khobor` and `kikhobor` match.
- Provider errors are no longer cleared when a result event arrives; errors are
  cleared at the start of a new search. This keeps a provider failure visible
  even when the provisional offline answer arrives afterwards.

## AI-style fields offline (2026-11-20)
- Every field the AI providers emit is now produced by the offline datasets:
  collocations, word family, band level, common mistake, formal and
  conversational meanings, and formal/conversational examples.
- English-first dataset is v5, Bengali-first is v2; both carry the same eight
  columns. A shared build-time `scripts/lib/enrichment.mjs` generates them from
  WordNet senses/examples plus a hand-authored IELTS band list; curated values
  win. No runtime network and no ML model.
- The band list is hand-authored from standard IELTS vocabulary — attribution:
  "not an official Cambridge score". Some fields are best-effort and may be
  empty for rare words (especially `commonMistake`).
- The result card now renders `formalMeaning`, `conversationalMeaning` and
  `usageNote`; the other five already had cards. Offline remains provisional
  and ranks below every provider result.

## Next step
- Manual Chrome verification of the built extension, including a Bengali script
  query and a Banglish query with the language pair pinned to `bn→en`.
- Live verification of the new provider model IDs once API keys are available.
- Import a licensed dictionary dataset and add part-of-speech + Bengali examples.
- History/saved export (CSV/JSON) and the full bilingual sentence translation view.
- Optional Supabase auth and cloud sync of saved words.

