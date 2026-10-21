# VocabFlow — Project Analysis

*Read-only investigation of the browser extension at `e:\Special NEED\Translator extention`.
All claims are grounded in files actually read; build/test/lint were executed to verify state.
Version-control note: this directory is **not a git repository** (`git` reports "not a git repository"), so `.gitignore` is currently inert — see Security.*

---

## Executive Summary

VocabFlow is a Manifest V3 browser extension: a floating, draggable/resizable Shadow-DOM React overlay that does bilingual English↔Bengali vocabulary lookup. It is **offline-first** (a ~6,675-entry gzipped dictionary built from `bn-en-dictionary` + Princeton WordNet + a hand-curated set) and **concurrently** fans out to three AI providers (Groq, OpenRouter, Gemini), all proxied through the MV3 service worker to dodge page CORS/CSP. The architecture is clean, well-documented (PRD/DESIGN/ARCHITECTURE/RULES/MEMORY/TASKS), and the offline path + coordinator are genuinely well-engineered with good tests.

The project is **functional and in a solid state**: `npm test` → 39 passed / 3 skipped; `npx tsc -b` → exit 0; `npm run lint` → exit 0; `dist/` builds cleanly with CRXJS rewriting manifest paths correctly and shipping `dictionary.json.gz`.

However, there are several real issues, in priority order:

1. **CRITICAL — a live Groq API key is embedded verbatim in the built service-worker bundle** (`dist/assets/service-worker.ts-*.js`). This is the documented risk in `src/config/env.ts` / `.env.example`, now realized on disk. The key should be treated as compromised and rotated.
2. **Significant — the React overlay recreates the `LookupCoordinator` mid-lookup**, which can drop in-flight AI results and suppress `LOOKUP_COMPLETE`. Root cause: the coordinator `useEffect` depends on `persistHistory`, which is a `useCallback` depending on `historyId`. The first persisted result flips `historyId` from `null`→`number`, tearing down the coordinator while AI requests are still in flight. This likely makes "AI replaces the offline provisional result" silently fail in practice, and matches why it was never caught (no live API testing).
3. **Functional gaps**: `SettingsView` controls (auto-speak, history limit, theme) are non-persisted stubs with no effect; "Clear all" in the *Saved Words* view wipes the entire history; `speak()` always uses `en-US` even for Bengali words; leftover Vite template scaffolding (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/`) is dead code.
4. **Config vs. rules mismatch**: `RULES.md` mandates "Strict TypeScript" but `tsconfig.app.json` does **not** set `strict: true` (no `strictNullChecks`, etc.).
5. **Likely provider-config bug**: OpenRouter default/curated model slug is `open-ai/gpt-4o-mini`; OpenRouter's actual org slug is `openai` (no hyphen). Unverifiable without live API, but high-confidence.

---

## 1. What the extension does (PRD intent vs. implementation)

**PRD intent** (`PRD.md`): a floating vocabulary companion for Bengali-native English learners watching English-subtitled video, with offline-first bilingual lookup, concurrent AI lookups (Groq/OpenRouter/Gemini), history, saved words, pronunciation, provider settings, and optional Supabase auth. Core principle: *"the overlay stays useful even when subtitle detection, auth, internet, and all AI providers are unavailable."*

**Actual implementation** (verified by reading `src/`):
- Toolbar-icon toggle → Shadow-DOM React overlay (`src/content/content-entry.ts` + `src/ui/`), draggable/resizable, position/size persisted (`src/ui/Overlay.tsx`).
- Single search field, 400 ms debounce live lookup, Enter forces immediate lookup (`Overlay.tsx` debounce `useEffect` and `doSearch`).
- Result body shows word, part of speech, Bengali meaning, English definition, synonyms, antonyms, example (en + bn), source label, Pronounce + Save actions — matches `DESIGN.md`.
- Three-dot menu: AI Providers / Search History / Saved Words / Translation Settings / Help & About (`MENU_ITEMS` in `src/shared/types.ts`).
- Offline-first with provisional result + AI replacement, per-provider error isolation (`src/lookup/coordinator.ts`).
- Provider settings UI with enable/key/model/test/remove (`src/ui/views/ProvidersView.tsx`), keys in `chrome.storage.local`.
- Pronunciation via Web Speech API (`Overlay.tsx` `speak()`).

**Gaps vs. PRD (confirmed by `TASKS.md`/`MEMORY.md`)**:
- Subtitle auto-extraction is explicitly out of scope (manual context only) — and indeed nothing reads subtitles; the overlay is purely a manual search box. The "watching anime" framing is aspirational context, not implemented behavior.
- Supabase auth + cloud sync: **not started**.
- Export history/saved as CSV/JSON: **not started**.
- Full bilingual sentence translation: **not started**.
- Larger licensed dataset + Bengali example sentences per entry: **not started** (offline examples are English-only; the dataset has no `exampleBn` column — see `src/providers/offline/dataset.ts` layout).

So the implementation realizes the **core offline-first lookup + overlay + providers + history/saved + pronunciation**, and defers auth, sync, export, and subtitle integration.

---

## 2. Architecture overview

Three MV3 surfaces, wired by `chrome.runtime` messages (per `ARCHITECTURE.md`, verified in source):

- **Service worker** (`src/background/service-worker.ts`): registers `onInstalled` + start-up seeding (`ensureSeeded()` → `seedProviderSettings()`), the toolbar-click toggle (`chrome.action.onClicked` → sends `VOCABFLOW_TOGGLE` to the tab, reloading the tab on failure), and three `onMessage` handlers: `VOCABFLOW_AI_LOOKUP` (`runProviderLookup`), `VOCABFLOW_OFFLINE_LOOKUP` (`handleOfflineLookup` against the in-memory dictionary), and `VOCABFLOW_LIST_MODELS` (`runListModels`, Groq only). The offline dictionary is loaded lazily here via `loadOfflineDictionary()` (`src/providers/offline/loader.ts`) and kept in memory.
- **Content script** (`src/content/content-entry.ts`): listens for `VOCABFLOW_TOGGLE`; on first toggle creates a host `<div id="vocabflow-host">`, attaches an open Shadow DOM, and mounts the React overlay via `mountOverlay` (`src/ui/mount.tsx`). Toggling again unmounts.
- **React overlay** (`src/ui/Overlay.tsx` + `src/ui/views/*`): owns search state, debounced lookup, drag/resize/clamp/persist, history persistence, and menu navigation. Talks to the worker only through `chrome.runtime.sendMessage` (via the coordinator and the bridge constants).

**Message contract** (`src/providers/bridge.ts`): `LOOKUP_MESSAGE='VOCABFLOW_AI_LOOKUP'`, `OFFLINE_LOOKUP_MESSAGE='VOCABFLOW_OFFLINE_LOOKUP'`, `LIST_MODELS_MESSAGE='VOCABFLOW_LIST_MODELS'`, `SEED_MESSAGE='VOCABFLOW_SEED'`, plus `VOCABFLOW_TOGGLE` (string literal in worker + content script, not centralized). Responses are discriminated `{ ok: true, ... } | { ok: false, error }`.

**Lookup flow** (`src/lookup/coordinator.ts` `LookupCoordinator.lookup`): normalize (Unicode-aware `\p{L}\p{N}\p{M}`) → cache check → assign monotonic `requestId` as `currentId` → fire offline lookup (proxied, async) and, after settings load, fan out concurrently to every enabled+keyed provider → drop stale results (`this.currentId !== requestId`) → accept a result only if strictly better than `best` (`isBetter`: completeness score, then priority `groq>openrouter>gemini`, then recency) → emit `LOOKUP_COMPLETE` when all settle. Events (`src/shared/types.ts`): `LOCAL_RESULT | AI_RESULT | LOOKUP_COMPLETE | LOOKUP_ERROR`.

Note: `ARCHITECTURE.md`'s "Data models" line says `LookupEvent = LOCAL_RESULT | AI_RESULT | LOOKUP_COMPLETE | LOOKUP_ERROR` — consistent with `types.ts`. The earlier prose in `ARCHITECTURE.md` that writes "emit `LOCAL_RESULT`" is consistent; no drift there.

---

## 3. Provider system

**Abstraction** (`src/providers/common.ts`): shared `SYSTEM_PROMPT` (requests a fixed JSON shape), `buildUserPrompt(query, isBengaliInput)`, `parseAiJson` (strips ``` fences, extracts the outermost `{…}`, coerces strings/arrays), `fetchWithTimeout` (20 s `AbortController`), `toResult`, and `isValidResult` (requires `englishDefinition || bengaliMeaning || exampleEn`).

**Bridge** (`src/providers/bridge.ts`): `runProviderLookup` switches on `ProviderId` to `groqLookup`/`openRouterLookup`/`geminiLookup`; `runListModels` only supports Groq (others throw "Listing models is not supported").

**Implementations** (all three follow the same shape):
- `src/providers/groq/index.ts` — OpenAI-compatible `/openai/v1/chat/completions`, `response_format:{type:'json_object'}`, `Bearer` key, validates with `isValidResult`.
- `src/providers/openrouter/index.ts` — identical shape to Groq, against `https://openrouter.ai/api/v1/chat/completions`.
- `src/providers/gemini/index.ts` — `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`, `responseMimeType:'application/json'`, joins `candidates[0].content.parts[*].text`.
- `src/providers/groq/models.ts` — live `/v1/models` list, filters out `whisper-`, `meta-llama/llama-prompt-guard`, `openai/gpt-oss-safeguard`.

**Coordinator selection/fallback**: there is no sequential fallback — it is a **concurrent fan-out** with a deterministic "best wins" merge. The offline result is emitted first (provisional); each AI result replaces `best` only if strictly better. Per-provider failures emit `LOOKUP_ERROR` and never abort the others. This matches the PRD "concurrent AI lookups that improve provisional offline results."

**Is the offline dictionary provider fully functional?** Yes, end-to-end:
- Content client `src/providers/offline/index.ts` proxies via `OFFLINE_LOOKUP_MESSAGE`.
- Worker `handleOfflineLookup` calls `OfflineDictionary.lookup` / `lookupBengali`.
- The dataset (`src/providers/offline/dataset.ts`) builds O(1) indexes: `byHeadword`, `byRelation` (synonym/antonym → headword), `byBengali` (reverse). Bengali normalization is NFC + Unicode-aware stripping, with a regression test for the YYA precomposed/decomposed equivalence.
- The gzipped artifact is shipped (`dist/dictionary.json.gz`, 355.5 KB) and fetched via `chrome.runtime.getURL('dictionary.json.gz')` + `DecompressionStream`.
- Tests confirm English headword lookup, synonym/antonym resolution, Bengali reverse lookup, punctuation/case insensitivity, and "unknown word → null."

Limitations (acknowledged in `TASKS.md`): no Bengali example sentences; not a large formally-licensed corpus; ~6,675 entries only.

---

## 4. Build & config

**Toolchain** (`package.json`): `build` = `tsc -b && vite build`; `prebuild` = `npm run build:dictionary` (regenerates `src/dictionary/generated.json` + `public/dictionary.json.gz` before every build); `test` = `vitest run`; `lint` = `oxlint`. Installed versions (verified in `node_modules`): TypeScript **6.0.3**, Vite **8.3.5**, `@crxjs/vite-plugin` **3.0.0**, Vitest 5.0.5 — bleeding-edge but real and working here. React 19.3.1.

**Extension bundling** (`vite.config.ts`): `@vitejs/plugin-react` + `crx({ manifest })` from `@crxjs/vite-plugin`, feeding the source `manifest.json` directly. The source manifest references `.ts` files (`src/background/service-worker.ts`, `src/content/content-entry.ts`); CRXJS rewrites these in the built `dist/manifest.json`:
- `background.service_worker` → `service-worker-loader.js` (which statically imports `assets/service-worker.ts-*.js`).
- `content_scripts[0].js` → `assets/content-entry.ts-loader-*.js`.
- Added `web_accessible_resources` for the dynamically-imported chunks (`assets/settings-*.js`, `assets/src-content-content-entry.ts-*.js`).
- `dist/dictionary.json.gz` is copied through (Vite copies `public/`).

So there is **no path mismatch** between the Vite output and the manifest — CRXJS handles the `.ts`→`.js` rewrite and the module-SW loader correctly. The `dist/` tree was already built on disk and is internally consistent.

**Bundle sizes** (`dist/`): content script `src-content-content-entry.ts-*.js` ≈ 234 KB (React + UI + coordinator + offline client — **not** dictionary data; the dictionary is 1.1 MB raw / 356 KB gz), shared `settings-*.js` ≈ 6.9 KB (providers + settings + `OfflineDictionary` class), SW ≈ 2.2 KB + loader. The "content bundle free of dictionary data" claim holds.

**Dependencies**: pinned with `^`/`~` ranges (not exact). `bn-en-dictionary ^1.0.2` and `wordnet-db ^3.1.14` are **devDependencies** (build-time only, never shipped) — correct. No obviously suspicious packages.

**Config gaps**:
- `tsconfig.app.json` does **not** set `strict: true` (confirmed: no `"strict"` key). `RULES.md` says "Strict TypeScript." Without it, `strictNullChecks`/`noImplicitAny` are off — a type-safety gap versus the stated rule. (Type-check still passes because the code is written defensively.)
- `tsconfig.app.json` `lib` is `["ES2023","DOM"]`. The service worker uses `DecompressionStream` (Streams API); `DOM` lib covers it. Service-worker-specific types (`self`, `fetch` in SW) aren't separately modeled, but it compiles.

---

## 5. Data & storage

- **`chrome.storage.local`**:
  - `vocabflow.overlay` — `{x,y,w,h}` overlay geometry (`Overlay.tsx`, persisted on every `pos` change).
  - `vocabflow.providers` — `ProviderSettings` (`src/storage/settings.ts`), each `{apiKey, enabled, model}`. `loadSettings` merges stored over `DEFAULT_SETTINGS`. Keys are local-only and never synced (no `storage.sync` usage).
- **IndexedDB** (`src/storage/history.ts`): DB `vocabflow`, version 1, store `history` (autoIncrement `id`, indexes on `timestamp` and `query`). `HistoryEntry { id?, query, direction:'en->bn'|'bn->en', result:unknown, source, timestamp, saved }`. API: `addHistory`, `updateHistory`, `listHistory` (sorted desc by timestamp), `deleteHistory`, `clearHistory`, `listSaved` (filters `saved`).
- **Seed mechanism** (`src/storage/seed.ts` + `src/config/env.ts`): on install and on every worker start, `seedProviderSettings()` writes a **build-time Groq key** (from `VITE_GROQ_API_KEY` via `import.meta.env`) into `vocabflow.providers`, enabling Groq so AI works out-of-the-box. Rules: an existing user key always wins; only empty fields are filled; other providers untouched; idempotent. Covered by `tests/seed.test.ts`. The coordinator and `ProvidersView` also send a `VOCABFLOW_SEED` handshake before reading settings to avoid a first-run race.

`result` is stored as `unknown` in `HistoryEntry` (the whole `LookupResult` is persisted opaquely) — works, but no schema versioning if `LookupResult` evolves.

---

## 6. Dictionary pipeline

**Build** (`scripts/build-dictionary.mjs`, run via `prebuild`):
1. `loadWordNet(node_modules/wordnet-db)` (`scripts/lib/wordnet.mjs`) — parses WordNet 3.0 `dict/data.{noun,verb,adj,adv}` and `index.{pos}` into `synonyms`, `antonyms` (symmetric `!` pointers), and `examples`.
2. `loadBengaliDictionary` + `selectVocabulary` (`scripts/lib/bengali.mjs`) — reads `bn-en-dictionary`'s `data/dictionary.jsonl`, groups by lowercased English headword, keeps single-token words with a definition, NFC-canonicalizes Bengali.
3. Merges; `src/dictionary/curated.json` (hand-written, ~14 KB) overrides/backfills.
4. Emits **columnar** `src/dictionary/generated.json` (`{v:1, headwords, bn, bnAlt, def, pos, syn, ant, ex}`, multi-valued columns joined with `U+0001`) and gzips to `public/dictionary.json.gz` (level 9).
5. `scripts/probe-wordnet.mjs` is a scratch probe (not wired into any npm script).

**Runtime load** (`src/providers/offline/loader.ts`): `loadOfflineDictionary()` fetches `chrome.runtime.getURL('dictionary.json.gz')`, gunzips via `DecompressionStream('gzip')` + `new Response(stream).arrayBuffer()`, `JSON.parse`s, and constructs `OfflineDictionary` (builds indexes once, memoized for the worker's lifetime; failures clear the memo so a later call can retry).

**Wired correctly?** Yes: `dist/dictionary.json.gz` is present; the SW fetches it by relative URL resolved against the extension origin; the version check (`dataset.v === 1`) matches `DATASET_VERSION`. `generated.json` (1.1 MB, 6,675 entries) is the test source of truth and **is imported by `tests/offline.test.ts`**, so tests exercise the real built dataset.

**Minor build-script observations**:
- `generated.json` is **not** in `.gitignore`; if a repo is initialized, this 1.1 MB artifact would be committed (likely intentional since tests import it).
- The WordNet pointer parser in `scripts/lib/wordnet.mjs` (`parseDataFiles`) steps through pointers with `i * 2`, but each WordNet pointer is 4 fields (`symbol`, `offset`, `pos`, `source/target`). This means it correctly reads the 1st, 3rd, 5th… pointer and misreads the others, so synsets with multiple pointers may lose some antonym relations. Impact is limited to offline-dictionary completeness (already built), not runtime. (Inferred from the on-disk WordNet format; not executed.)
- `build-dictionary.mjs` writes outputs via `prebuild`, so `npm test` alone does **not** regenerate them — it relies on the committed `generated.json`. Fine as long as the artifact is kept in sync.

---

## 7. Test coverage

**Suite** (`tests/`, vitest): `coordinator.test.ts` (13 tests), `offline.test.ts` (offline dictionary, ~18), `seed.test.ts` (4), `groq-models.test.ts` (3), `groq-live.test.ts` (3, **skipped** without `GROQ_API_KEY`). Result: **39 passed, 3 skipped** (docs say "30 tests" — modest drift).

**What's tested**:
- Coordinator: seed-handshake-first, seed-failure resilience, offline-emitted-immediately, AI replaces offline, superior-result-kept, stale-result rejection, per-provider error isolation, Bengali offline lookup, Bengali normalization, offline-unavailable resilience, offline part-of-speech propagation.
- Offline dictionary: normalization, Bengali preservation, `isBengali`, headword/synonym/antonym/Bengali-reverse lookups, punctuation/YYA-spelling insensitivity, unknown→null, dataset shape consistency, common-word coverage.
- Seed: fresh-profile seed, user-key precedence, other-providers untouched, idempotency.
- Groq models: chat-model filtering, bearer auth, error surfacing.

**Important untested areas**:
- **The overlay itself** (`src/ui/*`): zero component/integration tests. The coordinator is tested in isolation but never through `Overlay.tsx` — which is exactly where the coordinator-recreation bug lives (see §8). No React Testing Library, no DOM tests.
- **OpenRouter and Gemini providers**: no unit tests (only Groq has model-listing tests; `groq-live` is the only provider live test, skipped).
- **Service worker**: message routing not tested directly (covered indirectly via coordinator mocks).
- **`bridge.ts` `runProviderLookup`/`runListModels` dispatch**: not tested.
- **History storage** (`src/storage/history.ts`): not tested (IndexedDB).
- **`common.ts` `parseAiJson`**: not tested (worth covering — it handles fenced JSON, array coercion, malformed input).
- **Manifest/path/CRXJS output**: not asserted by tests (TASKS.md mentions a manual "built-artifact check" instead).
- **Live API verification**: explicitly blocked (no credentials) — `TASKS.md`/`MEMORY.md`.

---

## 8. Code quality observations

### Bugs (verified by reading)

1. **CRITICAL — live Groq key embedded in the built bundle.** `dist/assets/service-worker.ts-BluGtLCY.js` contains `var u=\`gsk_...\`` (a real Groq key, prefix `gsk_`). `src/config/env.ts` inlines `import.meta.env.VITE_GROQ_API_KEY` at build time; `seed.ts` then writes it into `chrome.storage.local`. The risk is **documented** in `env.ts` and `.env.example` ("Anyone who obtains the built extension can extract it… only suitable for controlled testing"), but it is now **realized**: the key is on disk inside `dist/`. Since this directory isn't a git repo, `dist/` isn't gitignored-in-effect, and distributing the `.crx`/unpacked folder leaks the key. **Recommend rotating the key immediately and never shipping a build that contains it.** (The key in `.env.local` is gitignored-by-policy and was not printed here.)

2. **Coordinator recreated mid-lookup (`src/ui/Overlay.tsx`).** `persistHistory` is `useCallback(..., [historyId])`. The coordinator `useEffect` depends on `[persistHistory]`, creating a new `LookupCoordinator` and calling `c.cancel()` on the old one whenever `persistHistory`'s identity changes. `persistHistory` calls `setHistoryId(id)` after the **first** `addHistory`, flipping `historyId` `null → number`. Trace for a fresh word:
   - `lookup()` starts on coordinator **A** (`currentId='r1'`); offline job + AI jobs in flight.
   - Offline resolves → `LOCAL_RESULT` → `persistHistory` → `addHistory` → `setHistoryId(id)` → re-render.
   - `persistHistory` identity changes → effect cleanup runs `A.cancel()` (`A.currentId=null`) and creates coordinator **B**.
   - The in-flight AI promises are bound to **A**; when they settle, `A.currentId !== 'r1'` → **dropped as stale**. So AI results that arrive after the offline result is persisted are silently discarded.
   - Worse, `A`'s final `if (this.currentId === requestId)` is now false, so **`LOOKUP_COMPLETE` is suppressed** → `setLoading(false)` never fires → the "Searching…" indicator can stay on indefinitely.
   
   This means the headline "offline-first with AI replacement" likely **does not work in practice** for any fresh lookup, and it was never caught because no live API was tested. Fix: make `persistHistory` stable (e.g., move `historyId` into a ref, or drop `historyId` from the `useCallback` deps and use a ref inside), so the coordinator lives for the overlay's lifetime. The coordinator tests pass because they construct `LookupCoordinator` directly with explicit `settings`, bypassing `Overlay` entirely.

3. **`SettingsView` is a non-functional stub (`src/ui/views/SettingsView.tsx`).** `autoSpeak`, `historyLimit` (default 200), and `theme` ('glass'|'light') are plain `useState` with **no persistence and no effect**: nothing reads them, the overlay is hardcoded dark glass, and `listHistory` never prunes to the limit. Users see controls that do nothing.

4. **"Clear all" in the Saved Words view wipes all history (`src/ui/views/HistoryView.tsx`).** The "Clear all" button renders for both `savedOnly` and the history view, but always calls `clearHistory()` (which clears the **entire** store). In the Saved Words view it should be hidden or scoped to saved entries. The per-item "Delete" in the saved view also removes the whole entry rather than un-saving.

5. **`speak()` always uses `en-US` (`Overlay.tsx`).** For a Bengali headword (Bengali→English reverse lookup), `SpeechSynthesisUtterance(word)` with `u.lang='en-US'` will mispronounce Bengali text. Should pick `bn-IN` when the word is Bengali.

6. **`coordinator.test.ts` has two `beforeEach` blocks** (one near the top, one after the `settings`/`aiResult` helpers). Both run before each test and both reassign `globalThis.chrome`; redundant but not incorrect — minor smell.

### Dead / leftover code
- `index.html` (title `vf_tmp`), `src/main.tsx`, `src/App.tsx` (Vite counter template), `src/App.css`, `src/index.css`, `src/assets/` are **not** part of the extension — CRXJS builds from the manifest, and `dist/` contains no `index.html`. They only serve `npm run dev`'s template page. Safe to delete from an extension perspective.
- `src/providers/common.ts` exports `isValidResult` (used by all three providers) — good. The coordinator itself does **not** re-validate, but providers throw on invalid results, so empty AI results become `LOOKUP_ERROR` rather than displayed. Acceptable.

### Type-safety
- `tsconfig.app.json` missing `strict: true` (see §4) — the main gap vs. `RULES.md`.
- `HistoryEntry.result: unknown` loses the `LookupResult` typing at rest.
- `coordinator.ts` casts `chrome.runtime.sendMessage` results with `as AiLookupResponse | undefined`; `OfflineEntryPayload` branch uses several `as` casts in `lookupOffline` — works but brittle.

### Security
- **API key in built bundle** (see bug #1) — the dominant concern.
- Build-time key is **not** in the content-script bundle (confirmed: the SW chunk holds it; the content bundle imports the shared `settings` chunk which holds `loadSettings`/`DEFAULT_MODELS`, not the key constant — the key lives only in the SW chunk). Good: pages can't read it; only someone with the built extension can.
- User keys are stored in `chrome.storage.local`, never synced/logged/exported (matches `RULES.md`).
- `parseAiJson` parses untrusted LLM output with `JSON.parse` on the extracted `{…}` slice — fine, with try/catch returning `null`.
- No `eval`, no remote code, no dynamic string SQL. Provider URLs are constant. `fetchWithTimeout` caps runaway requests.

### Architectural smells
- `VOCABFLOW_TOGGLE` is a string literal duplicated in `service-worker.ts` and `content-entry.ts` rather than centralized in `bridge.ts` (the other message types are). Minor.
- `runListModels` only supports Groq; `ProvidersView` shows a "Models" button only for Groq — consistent, but the UI has no graceful "not supported" path for the others (it just never shows the button).

---

## 9. Current state vs. TASKS.md

| Phase | TASKS.md status | Verified state |
|---|---|---|
| 1 Foundation (scaffold, manifest, SW toggle, build) | ✅ done | ✅ build green, manifest valid, toggle wired |
| 2 Overlay (shadow DOM, drag/resize/clamp/persist, glass UI, menu) | ✅ done | ✅ implemented in `Overlay.tsx` (but see §8 bug #2 affecting live behavior) |
| 3 Offline dictionary (columnar dataset, SW load, indexes, Bengali reverse, NFC) | ✅ done | ✅ working, tested; `[ ]` larger licensed dataset; `[ ]` Bengali example sentences — confirmed not done |
| 4 Coordinator (events, request IDs/stale/cancel, ranking, provisional→AI, cache, 400 ms debounce) | ✅ done | ✅ coordinator logic solid and tested in isolation; **the Overlay integration is broken** (§8 #2) |
| 5 Providers (interface, Groq/OpenRouter/Gemini, SW proxy, settings UI) | ✅ done; `[ ]` live API verification | ✅ scaffolded; `[ ]` live verification confirmed not done; likely OpenRouter slug bug (§8) |
| 6 Vocab features (history/saved/pronunciation) | ✅ partial; `[ ]` CSV/JSON export; `[ ]` sentence translation | ✅ history/saved/pronounce present; export + sentence translation not started; SettingsView is a stub |
| 7 Auth/sync (Supabase) | `[ ]` not started | not started (no Supabase code) |
| 8 QA (vitest, typecheck/build green, artifact check) | mostly ✅; `[ ]` manual Chrome verification | ✅ tests/typecheck/lint green; `[ ]` manual Chrome verification not reported |

`MEMORY.md` "Completed"/"Blocked" sections are accurate; the "30 tests" figure is now 39 passed + 3 skipped.

---

## 10. Top recommendations (prioritized)

1. **Rotate the exposed Groq key and stop embedding it in builds.** Treat the key in `dist/assets/service-worker.ts-*.js` as compromised. For distribution, ship without a build-time seed and require the user to paste their own key (the Providers UI already supports this). If a seed is needed for internal testing, gate it behind a separate build mode and never publish that artifact.

2. **Fix the coordinator lifecycle in `Overlay.tsx`.** Stabilize `persistHistory` (move `historyId` into a ref so the `useCallback` has no deps, or restructure so the coordinator `useEffect` has an empty dep array and the `onEvent` callback reads refs). Verify AI results now replace the offline provisional result and `LOOKUP_COMPLETE` always fires. Add an RTL test that mounts `Overlay` and asserts an offline→AI replacement sequence with a mocked `chrome.runtime.sendMessage`.

3. **Initialize git and confirm ignore rules.** The directory has no repo; `.gitignore` is inert. `git init`, then verify `dist/`, `.env.local`, and `*.local` are ignored. Decide explicitly whether to commit `src/dictionary/generated.json` (1.1 MB) — it's a build artifact but tests import it.

4. **Enable `strict: true` in `tsconfig.app.json`** to honor `RULES.md`, then fix the resulting nullability errors (expect a handful in `coordinator.ts` casts and `history.ts`).

5. **Make `SettingsView` functional or mark it experimental.** Persist `autoSpeak`/`historyLimit`/`theme` to `chrome.storage.local`, apply the history limit in `listHistory`/`addHistory`, and either implement the Light theme or remove the option.

6. **Fix `HistoryView` "Clear all" in the Saved view** (hide it or scope it to saved entries) and make the saved-view per-item action "Unsave" rather than "Delete."

7. **Fix `speak()` language selection** — set `u.lang = isBengali(word) ? 'bn-IN' : 'en-US'`.

8. **Verify/fix the OpenRouter model slug** (`open-ai/gpt-4o-mini` → `openai/gpt-4o-mini`) in `src/storage/settings.ts` (`DEFAULT_MODELS` and `PROVIDER_MODELS`) against the OpenRouter model catalog; add a live test like `groq-live.test.ts`.

9. **Add missing unit tests**: `parseAiJson` (fenced/unfenced, arrays, malformed), `runProviderLookup`/`runListModels` dispatch, OpenRouter & Gemini request shape (mocked `fetch`), and `history.ts` (with a fake IndexedDB).

10. **Remove leftover Vite template scaffolding** (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/`) to reduce confusion, unless `npm run dev`'s template page is intentionally kept.

11. *(Lower priority)* Review the WordNet pointer stepping in `scripts/lib/wordnet.mjs` (4 fields per pointer, not 2) to improve antonym completeness; centralize `VOCABFLOW_TOGGLE` in `bridge.ts`; address the "stuck loading" symptom from bug #2 explicitly by ensuring `LOOKUP_COMPLETE` is always emitted.

---

## Sources read

**Docs**: `README.md`, `PRD.md`, `DESIGN.md`, `ARCHITECTURE.md`, `RULES.md`, `TASKS.md`, `MEMORY.md`, `.env.example`, `.gitignore`
**Manifest/config**: `manifest.json`, `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`
**Entry/background/content**: `src/main.tsx`, `src/App.tsx`, `index.html`, `src/background/service-worker.ts`, `src/content/content-entry.ts`
**Core/types/lookup**: `src/shared/types.ts`, `src/lookup/coordinator.ts`, `src/providers/common.ts`, `src/providers/bridge.ts`
**Providers**: `src/providers/gemini/index.ts`, `src/providers/groq/index.ts`, `src/providers/groq/models.ts`, `src/providers/openrouter/index.ts`, `src/providers/offline/index.ts`, `src/providers/offline/dataset.ts`, `src/providers/offline/loader.ts`
**Storage/config**: `src/storage/history.ts`, `src/storage/seed.ts`, `src/storage/settings.ts`, `src/config/env.ts`
**UI**: `src/ui/mount.tsx`, `src/ui/Overlay.tsx`, `src/ui/styles.ts`, `src/ui/views/ProvidersView.tsx`, `src/ui/views/HistoryView.tsx`, `src/ui/views/SettingsView.tsx`, `src/dictionary/curated.json` (partial)
**Scripts**: `scripts/build-dictionary.mjs`, `scripts/lib/bengali.mjs`, `scripts/lib/wordnet.mjs`, `scripts/probe-wordnet.mjs`
**Tests**: `tests/coordinator.test.ts`, `tests/offline.test.ts` (partial), `tests/seed.test.ts`, `tests/groq-models.test.ts`, `tests/groq-live.test.ts`
**Built output**: `dist/manifest.json`, `dist/service-worker-loader.js`, `dist/assets/service-worker.ts-BluGtLCY.js` (the key-bearing bundle)
**Executed**: `npm test` (39 passed/3 skipped), `npx tsc -b` (exit 0), `npm run lint` (exit 0); inspected `dist/` tree, `generated.json` (6,675 entries, v1, lowercase headwords), `public/dictionary.json.gz` (355.5 KB). `git` confirmed not a repository.
