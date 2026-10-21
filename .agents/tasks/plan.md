# VocabFlow Bug-Fix Implementation Plan

Source of truth: `.agents/tasks/project-analysis.md` (read first). All file paths below are relative to the workspace root `e:/Special NEED/Translator extention`. The directory is **not** a git repository, and the task forbids git commands, so every item implements + verifies only — no commits.

## Design decisions (no approved design doc; rationale recorded here)

- **A — key gate lives in `src/config/env.ts`, not `seed.ts`.** `seed.ts` already short-circuits on `HAS_GROQ_SEED`, so making that constant empty in production is the single chokepoint. The gate uses an `if (import.meta.env.DEV …)` block so Vite statically replaces `DEV` with `false` in `vite build` and the bundler strips the whole branch — the `gsk_` literal never enters `dist/`. The condition also accepts the string `'true'` so it is testable under vitest (which may expose `DEV` as a string). `seed.ts` needs no logic change; only its doc comment is updated.
- **B — stabilize `persistHistory` for the overlay's lifetime.** Move `historyId` from state into a `useRef`, give `persistHistory` an empty dependency array, and let the coordinator `useEffect` depend on the now-stable `persistHistory`. The coordinator is then created once and `cancel()`d only on unmount, so an in-flight AI result is never dropped and `LOOKUP_COMPLETE` always fires.
- **C — settings persisted under a new `vocabflow.settings` key** in a new `src/storage/app-settings.ts` module (kept separate from provider settings in `src/storage/settings.ts`). `historyLimit` is enforced by a new `pruneHistory(limit)` in `history.ts` called after each `addHistory`. The non-functional **Light theme option is removed** (persisting a preference that does nothing is worse than removing the control); only `glass` remains.
- **E is folded into the `speak` refactor** (`speakWord(word)` sets `u.lang = isBengali(word) ? 'bn-IN' : 'en-US'`, reusing `isBengali` from `../providers/offline`), and `autoSpeak` calls it on `LOOKUP_COMPLETE`.
- **F — strict fixes by narrowing, never suppression.** Known error class: `this.isBetter(result, this.best)` where `this.best: LookupResult | null` is not narrowed across `||` — capture `const best = this.best` first. No `@ts-ignore`, `@ts-nocheck`, or `any`.
- **Testing deps (pinned exact, devDependencies):** `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2` (RTL 16 peer), `@testing-library/jest-dom@6.10.0` (stable with vitest; has `./vitest` subpath), `jsdom@30.1.3`, `fake-indexeddb@6.2.6`. Only `overlay.test.tsx` uses jsdom via a per-file `// @vitest-environment jsdom` docblock; the global default stays `node`, so existing tests are unaffected.

## Ordered plan

- [ ] 1. **FEAT-001 — Security & strict foundation (fixes A, G, F).**
      - **A:** In `src/config/env.ts`, replace the three exported constants with a `readSeed()` that returns `{key,model}` only when `import.meta.env.DEV === true || === 'true'`; in production `DEV` is statically `false` so the branch (and the `VITE_GROQ_API_KEY` literal) is stripped. Update the file's `SECURITY WARNING` comment to state the key is seeded only in `vite dev`, never in `vite build`. Update `.env.example` similarly.
      - **A (seed.ts):** No logic change; refresh the `seedProviderSettings` doc comment to note "seeds only in dev builds (see `env.ts`)".
      - **A (tests):** Rewrite `tests/seed.test.ts` to stop mocking `../src/config/env` and instead control `import.meta.env` via `vi.stubEnv` + `vi.resetModules` + dynamic `import()`. Keep the 4 existing rule tests (DEV defaults true). Add two gating tests: production (`vi.stubEnv('DEV', false)` + `VITE_GROQ_API_KEY='gsk_test_leak'`) → `env.HAS_GROQ_SEED === false`, `env.SEED_GROQ_API_KEY === ''`, and `seedProviderSettings()` leaves `groq.apiKey === ''`; dev (default DEV true + key) → seeds the key.
      - **G:** In `src/storage/settings.ts`, change `'open-ai/gpt-4o-mini'` → `'openai/gpt-4o-mini'` in both `DEFAULT_MODELS.openrouter` and `PROVIDER_MODELS.openrouter`.
      - **F:** In `tsconfig.app.json` set `"strict": true` (inside `compilerOptions`). Run `npx tsc -b` and fix every error by adding types / narrowing (e.g. `coordinator.ts`: `const best = this.best; if (best === null || this.isBetter(result, best))`), never with `@ts-ignore`/`@ts-nocheck`/`any`.
      Files: `src/config/env.ts`, `src/storage/seed.ts`, `.env.example`, `tests/seed.test.ts`, `src/storage/settings.ts`, `tsconfig.app.json`, plus any `src/**` files `tsc -b` flags (expect `src/lookup/coordinator.ts`).
      Verify: `npx tsc -b` exit 0; `npm test` (seed suite green); `npm run lint` exit 0; `npm run build` exit 0; then `Get-ChildItem -Recurse -Path dist -Filter *.js | Select-String -SimpleMatch 'gsk_'` returns **no** matches (key not leaked).

- [ ] 2. **FEAT-002 — Overlay lookup correctness + integration test (fixes B, E, C-overlay).**
      - Add devDependencies (exact): `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/jest-dom@6.10.0`, `jsdom@30.1.3`. Run `npm install`.
      - **B:** In `src/ui/Overlay.tsx`, replace `const [historyId, setHistoryId] = useState<number | null>(null)` with `const historyIdRef = useRef<number | null>(null)`; update `persistHistory` to read/write `historyIdRef.current` and give it dependency array `[]` (stable); `toggleSave` reads `historyIdRef.current`. The coordinator `useEffect` keeps `[persistHistory]` (now stable) so it is created once and `cancel()`d only on unmount.
      - **E:** Replace `speak()` with `speakWord(word: string)` that does `u.lang = isBengali(word) ? 'bn-IN' : 'en-US'` (import `isBengali` from `../providers/offline`). The Pronounce button calls `speakWord(result.word)`.
      - **C-overlay:** Create `src/storage/app-settings.ts` (`AppSettings { autoSpeak: boolean; historyLimit: number; theme: 'glass' }`, `DEFAULT_APP_SETTINGS`, `loadAppSettings()`, `saveAppSettings()`, key `vocabflow.settings`). Add `pruneHistory(limit)` to `src/storage/history.ts` (lists desc, deletes entries beyond `limit`). In `Overlay.tsx`: load app settings on mount into `autoSpeakRef`/`historyLimitRef`; keep a `resultRef` mirrored from `onEvent`; on `LOOKUP_COMPLETE`, if `autoSpeakRef.current && resultRef.current` call `speakWord(resultRef.current.word)`; after `addHistory` in `persistHistory`, call `await pruneHistory(historyLimitRef.current)` when `> 0`.
      - **Test:** New `tests/overlay.test.tsx` with `// @vitest-environment jsdom` at top, importing `@testing-library/jest-dom/vitest`. Mock `../src/storage/history` (`addHistory→1`, `listSaved→[]`, `updateHistory→undefined`). Mock `chrome` with `runtime.sendMessage` returning `SEED_MESSAGE→{ok:true}`, `OFFLINE_LOOKUP_MESSAGE→{ok:true,result:offlineEntry}` immediately, and `LOOKUP_MESSAGE→{ok:true,result:aiResult}` after a short delay; `storage.local.get` returns enabled Groq settings for `vocabflow.providers` and `{}` otherwise; `set` no-op. Render `<Overlay onClose={...}/>`, type "hello", press Enter (`doSearch`), and assert: "Source: Offline dictionary" appears, then `await waitFor` "Source: groq" appears, and `queryByText('Searching…')` is null (loading cleared). This fails on the buggy lifecycle (AI dropped, loading stuck) and passes after the fix.
      Files: `src/ui/Overlay.tsx`, `src/storage/app-settings.ts` (new), `src/storage/history.ts`, `tests/overlay.test.tsx` (new), `package.json`/`package-lock.json`.
      Verify: `npm test` (new overlay test passes, existing tests pass); `npx tsc -b` exit 0; `npm run lint` exit 0.

- [ ] 3. **FEAT-003 — Settings & History views (fixes C-ui, D).**
      - **C-ui:** In `src/ui/views/SettingsView.tsx`, load settings via `loadAppSettings()` on mount into local state and persist every change with `saveAppSettings()`; remove the `<option value="light">Light</option>` (only `glass` remains). Use `inputStyle`/`btn` from `../styles` to match the existing look.
      - **D:** In `src/ui/views/HistoryView.tsx`, import `updateHistory`; render the "Clear all" button only when `!savedOnly`; make the per-item button "Unsave" (`updateHistory(h.id, { saved: false })`) when `savedOnly`, and "Delete" (`deleteHistory`) otherwise. History view keeps its clear-all + delete behavior.
      Files: `src/ui/views/SettingsView.tsx`, `src/ui/views/HistoryView.tsx`.
      Verify: `npx tsc -b` exit 0; `npm run lint` exit 0; `npm run build` exit 0; `npm test` (still green).

- [ ] 4. **FEAT-004 — Unit-test coverage (fix H).**
      - Add devDependency (exact): `fake-indexeddb@6.2.6`. Run `npm install`.
      - `tests/parse-ai-json.test.ts` (node env): fenced ```json…``` and unfenced JSON, array coercion of `synonyms`/`antonyms`, malformed input → `null`, and a value containing nested braces (`{"exampleEn":"a {b} c"}`) parses correctly (mirrors `src/providers/common.ts` `parseAiJson`).
      - `tests/history.test.ts` (node env): `globalThis.indexedDB = fakeIndexedDB` (from `fake-indexeddb`) in `beforeEach`, plus `fakeIndexedDB.deleteDatabase('vocabflow')` to reset autoincrement ids; cover `addHistory`/`listHistory`/`updateHistory`/`deleteHistory`/`clearHistory`/`listSaved` and the new `pruneHistory(limit)`.
      - `tests/providers.test.ts` (node env): mock global `fetch` (mirror `tests/groq-models.test.ts` style) and assert, for `openRouterLookup`, the URL `https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, and `JSON.parse(body).model`/`response_format`; for `geminiLookup`, the URL contains `${encodeURIComponent(model)}:generateContent?key=…` and the body has `contents`/`generationConfig`. Return a valid `{…}` JSON content so the calls resolve.
      Files: `tests/parse-ai-json.test.ts` (new), `tests/history.test.ts` (new), `tests/providers.test.ts` (new), `package.json`/`package-lock.json`.
      Verify: `npm test` (all new tests pass, only the 3 pre-existing live-API tests skip).

- [ ] 5. **FEAT-005 — Cleanup, only if the build is green (fix I).** First run `npm test && npx tsc -b && npm run lint && npm run build`; if any fails, stop and report — do not attempt I. If all green:
      - **I1:** Add `export const TOGGLE_MESSAGE = 'VOCABFLOW_TOGGLE'` to `src/providers/bridge.ts`; import it in `src/background/service-worker.ts` (the `chrome.tabs.sendMessage` payload) and `src/content/content-entry.ts` (the `onMessage` check), replacing the literal `'VOCABFLOW_TOGGLE'`.
      - **I2:** Delete `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/index.css`, and `src/assets/`. Run `npm run build`; if it fails, restore them and note it in findings. (Verified safe: no extension code imports them; CRXJS builds from the manifest and emits no `index.html`.)
      - **I3:** In `scripts/lib/wordnet.mjs`, the pointer loop steps `i * 2` but each WordNet pointer is 4 fields (`symbol offset pos source/target`) — change to `i * 4` (`symbol = tokens[cursor+1+i*4]`, `target = tokens[cursor+2+i*4]`). Run `npm run build:dictionary` to regenerate `src/dictionary/generated.json` and `public/dictionary.json.gz`. Ensure `tests/offline.test.ts` still passes (entry count is asserted with `>= 50` thresholds and gz/source equality — update any hardcoded count if needed).
      Files: `src/providers/bridge.ts`, `src/background/service-worker.ts`, `src/content/content-entry.ts`, `scripts/lib/wordnet.mjs`, `src/dictionary/generated.json`, `public/dictionary.json.gz` (regenerated), and the deleted scaffolding.
      Verify: `npm test` (offline tests pass), `npx tsc -b` exit 0, `npm run build` exit 0.

- [ ] 6. **Final verification gate (run before declaring done).**
      1. `npm test` — all pass (only the 3 pre-existing live-API tests may skip).
      2. `npx tsc -b` — exit 0.
      3. `npm run lint` — exit 0.
      4. `npm run build` — exit 0, AND `Get-ChildItem -Recurse -Path dist -Filter *.js | Select-String -SimpleMatch 'gsk_'` returns no matches.
      5. The `tests/overlay.test.tsx` integration test passes and demonstrates offline→AI replacement.

## Constraints recap
No git commands. Never print the `gsk_…` key value (reference by variable name). Match existing code style. No new runtime dependencies; only the testing deps above, pinned exact. Minimal/focused changes; no unrelated refactors. Comments only where non-obvious. No `@ts-ignore`/`@ts-nocheck`/`any` to suppress type errors.
