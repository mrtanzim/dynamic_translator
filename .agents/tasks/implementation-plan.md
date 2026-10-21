# VocabFlow Bug-Fix Implementation Plan

> Ground truth: All claims below are verified against actual source files read during
> exploration. Workspace root: `e:\Special NEED\Translator extention`.
> The directory is **not** a git repository — no git commands are used.
> Artifact root for FEATs: `.agents/tasks/task-vocabflow-bugfixes/`.

---

## Baseline state (confirmed by running tools)

- `npm test` → 39 passed / 3 skipped (5 test files, 4 pass / 1 skipped file)
- `npx tsc -b` → exit 0 (no errors without `strict: true`)
- `npm run lint` → exit 0 (oxlint)
- `strict: true` added to a temp copy of `tsconfig.app.json` → **exit 0** (no new errors in `src/`)
- `@testing-library/react`, `jsdom`, `fake-indexeddb` → NOT in `package.json` (need install)
- The live Groq key is present in `dist/` (the critical security issue)
- No `vitest.config.ts` — vitest uses defaults; per-file env via `// @vitest-environment jsdom` docblock

---

## Design decisions

**A — Key gate in `src/config/env.ts` via `import.meta.env.DEV`.**
Vite statically replaces `import.meta.env.DEV` with `false` in `vite build` and `true` in `vite dev`.
Wrapping the key reads inside `if (import.meta.env.DEV === true || import.meta.env.DEV === 'true')`
means the bundler strips the entire branch (and the `VITE_GROQ_API_KEY` literal) from production output.
`seed.ts` needs no logic change — it already returns early on `!HAS_GROQ_SEED`.

**B — Stabilize `persistHistory` via `useRef`.**
`historyId` is currently `useState`, causing `persistHistory`'s identity to change after the first
`addHistory` call (because `historyId` is in its dep array). That re-creates the `LookupCoordinator`
mid-lookup and cancels in-flight AI requests. Moving `historyId` to `useRef` and giving
`persistHistory` a `[]` dep array keeps the coordinator alive for the overlay's lifetime.

**C — New `src/storage/app-settings.ts` module.**
Provider settings already occupy `vocabflow.providers`. App-level settings (autoSpeak, historyLimit,
theme) get their own key `vocabflow.settings` in a separate module, following the same
`loadSettings`/`saveSettings` pattern. The Light theme option is removed — persisting a preference
that has no effect is misleading.

**F — `strict: true` causes ZERO errors in `src/`.**
A dry-run with a temp strict `tsconfig.app.json` produced zero TypeScript errors in `src/`. Adding
`"strict": true` to `tsconfig.app.json` requires no code fixes — but the plan keeps the coordinator
narrowing step (capturing `const best = this.best`) because it is correct defensive code for the
`null | LookupResult` field, regardless of the strict outcome.

**Test deps — pinned exact, devDependencies only.**
`@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/jest-dom@6.10.0`,
`jsdom@30.1.3`, `fake-indexeddb@6.2.6`. The jsdom environment is activated per-file only via
`// @vitest-environment jsdom`; the global default stays `node` so existing tests are unaffected.

---

## Ordered implementation plan

- [ ] 1. **FEAT-001 — Security & strict foundation (fixes A, G, F)**

      Addresses: stop leaking the Groq key in production, fix the OpenRouter model slug, enable strict TS.
      Do this first — it establishes the strict baseline and key-gate that all later work builds on.

      **A — `src/config/env.ts`:**
      Replace the three top-level constant declarations with a `readSeed()` helper:
      ```ts
      function readSeed(): { key: string; model: string } {
        if (import.meta.env.DEV === true || import.meta.env.DEV === 'true') {
          return {
            key: import.meta.env.VITE_GROQ_API_KEY ?? '',
            model: import.meta.env.VITE_GROQ_MODEL ?? '',
          }
        }
        return { key: '', model: '' }
      }
      const seed = readSeed()
      export const SEED_GROQ_API_KEY: string = seed.key
      export const SEED_GROQ_MODEL: string = seed.model
      export const HAS_GROQ_SEED: boolean = SEED_GROQ_API_KEY.trim().length > 0
      ```
      Update the SECURITY WARNING comment to state: "the key is embedded ONLY in `vite dev`
      (local development); `npm run build` never embeds it."

      **A — `.env.example`:**
      Update the WARNING block to reflect dev-only seeding. Replace the existing WARNING paragraph
      with: "The key is seeded into chrome.storage.local ONLY when running `vite dev`. Running
      `npm run build` (production) never embeds the key in the bundle."

      **A — `src/storage/seed.ts`:**
      No logic change. Update the JSDoc comment on `seedProviderSettings` to read:
      "Seeds only in development builds (see `src/config/env.ts`). Production builds never embed
      a key, so this function returns immediately on `!HAS_GROQ_SEED`."

      **A — `tests/seed.test.ts`:**
      Remove the top-level `vi.mock('../src/config/env', ...)`. Use `vi.resetModules()` +
      `vi.stubEnv()` + dynamic `import()` pattern instead. Structure:
      - `beforeEach`: call `vi.resetModules(); vi.unstubAllEnvs(); store.clear(); installChrome()`
      - Helper `loadModules(overrides)`: stubs env vars then dynamically imports
        `../src/config/env` and `../src/storage/seed`, returns them.
      - Keep the 4 existing rule tests, making them call `loadModules({ DEV: 'true',
        VITE_GROQ_API_KEY: 'seed-key', VITE_GROQ_MODEL: 'qwen/qwen3.8-27b' })`.
      - Add: production gate test — `loadModules({ DEV: 'false' })` → `env.HAS_GROQ_SEED === false`,
        `env.SEED_GROQ_API_KEY === ''`; after `seed.seedProviderSettings()` →
        `stored().groq.apiKey === ''`.
      - Add: dev gate test — `loadModules({ DEV: 'true', VITE_GROQ_API_KEY: 'sk_dev' })` →
        `env.HAS_GROQ_SEED === true`, `stored().groq.apiKey === 'sk_dev'` after seeding.

      **G — `src/storage/settings.ts`:**
      Change `'open-ai/gpt-4o-mini'` → `'openai/gpt-4o-mini'` in two places:
      - `DEFAULT_MODELS.openrouter` (line: `openrouter: 'open-ai/gpt-4o-mini'`)
      - `PROVIDER_MODELS.openrouter` array (first element: `'open-ai/gpt-4o-mini'`)

      **F — `tsconfig.app.json`:**
      Add `"strict": true` inside `compilerOptions`. (Dry-run confirms zero errors in `src/`.)
      If `npx tsc -b` reports any errors after this addition, fix them by narrowing (never
      `@ts-ignore`/`@ts-nocheck`/`any`). The most likely location is `src/lookup/coordinator.ts`
      `this.best` usage — capture as `const best = this.best; if (best === null || ...)`.

      Files: `src/config/env.ts`, `src/storage/seed.ts`, `.env.example`, `tests/seed.test.ts`,
      `src/storage/settings.ts`, `tsconfig.app.json`

      Verify:
      - `npx tsc -b` → exit 0
      - `npm test` → seed suite green (6 tests total: 4 existing + 2 new), only 3 live-API tests skip
      - `npm run lint` → exit 0
      - `npm run build` → exit 0
      - `Get-ChildItem -Recurse -Path dist -Filter *.js | Select-String -SimpleMatch 'gsk_'` → **no output**

---

- [ ] 2. **FEAT-002 — Overlay lookup correctness + integration test (fixes B, E, C-overlay)**

      Addresses: coordinator lifecycle bug, speak() language, autoSpeak, historyLimit, integration test.
      Depends on FEAT-001 (needs the strict baseline to stay green).

      **Install testing deps (exact pinned):**
      Add to `devDependencies` in `package.json`:
      - `"@testing-library/react": "16.3.3"`
      - `"@testing-library/dom": "10.4.2"`
      - `"@testing-library/jest-dom": "6.10.0"`
      - `"jsdom": "30.1.3"`
      Run `npm install`.

      **B — `src/ui/Overlay.tsx` — coordinator lifecycle fix:**
      Replace:
      ```ts
      const [historyId, setHistoryId] = useState<number | null>(null)
      ```
      With:
      ```ts
      const historyIdRef = useRef<number | null>(null)
      ```
      In `persistHistory`: change reads of `historyId` to `historyIdRef.current`; change
      `setHistoryId(id)` to `historyIdRef.current = id`; change the dep array from `[historyId]`
      to `[]`. In `toggleSave`: change `if (historyId === null)` to
      `if (historyIdRef.current === null)` and `await updateHistory(historyId, ...)` to
      `await updateHistory(historyIdRef.current, ...)`. The `useEffect` for the coordinator
      keeps `[persistHistory]` as-is (now stable since `persistHistory` has `[]` deps).
      Remove `useState` import if `historyId` was the only `useState` call — check first;
      `pos`, `query`, `result`, `loading`, `error`, `view`, `menuOpen`, `saved` all use it,
      so `useState` import stays.

      **E — `src/ui/Overlay.tsx` — speak language fix:**
      Add import: `import { isBengali } from '../providers/offline'`
      (The `isBengali` export exists in `src/providers/offline/dataset.ts` and is re-exported
      from `src/providers/offline/index.ts` — confirm by reading that file before writing.)
      Rename `speak()` to `speakWord(word: string)` and replace the body:
      ```ts
      function speakWord(word: string) {
        try {
          const u = new SpeechSynthesisUtterance(word)
          u.lang = isBengali(word) ? 'bn-IN' : 'en-US'
          speechSynthesis.cancel()
          speechSynthesis.speak(u)
        } catch {
          // Speech is optional.
        }
      }
      ```
      Update the Pronounce button: `onClick={() => speakWord(result.word)}`.

      **C-overlay — `src/storage/app-settings.ts` (new file):**
      ```ts
      export interface AppSettings {
        autoSpeak: boolean
        historyLimit: number
        theme: 'glass'
      }
      export const DEFAULT_APP_SETTINGS: AppSettings = {
        autoSpeak: false,
        historyLimit: 200,
        theme: 'glass',
      }
      const APP_SETTINGS_KEY = 'vocabflow.settings'
      export function loadAppSettings(): Promise<AppSettings> {
        return new Promise((resolve) => {
          chrome.storage.local.get(APP_SETTINGS_KEY, (r) => {
            const stored = r?.[APP_SETTINGS_KEY] as Partial<AppSettings> | undefined
            resolve({ ...DEFAULT_APP_SETTINGS, ...stored })
          })
        })
      }
      export async function saveAppSettings(s: AppSettings): Promise<void> {
        await chrome.storage.local.set({ [APP_SETTINGS_KEY]: s })
      }
      ```

      **C-overlay — `src/storage/history.ts` — add `pruneHistory`:**
      ```ts
      export async function pruneHistory(limit: number): Promise<void> {
        if (!Number.isFinite(limit) || limit <= 0) return
        const all = await listHistory() // already sorted desc by timestamp
        const toDelete = all.slice(limit)
        for (const entry of toDelete) {
          if (entry.id !== undefined) await deleteHistory(entry.id)
        }
      }
      ```
      Export it.

      **C-overlay — `src/ui/Overlay.tsx` — wire app settings and autoSpeak:**
      Add imports:
      ```ts
      import { loadAppSettings } from '../storage/app-settings'
      import { pruneHistory } from '../storage/history'
      ```
      Add refs after existing refs:
      ```ts
      const autoSpeakRef = useRef(false)
      const historyLimitRef = useRef(200)
      const resultRef = useRef<LookupResult | null>(null)
      ```
      Add a mount `useEffect`:
      ```ts
      useEffect(() => {
        void loadAppSettings().then((s) => {
          autoSpeakRef.current = s.autoSpeak
          historyLimitRef.current = s.historyLimit
        })
      }, [])
      ```
      In the coordinator `onEvent` handler, in the `LOCAL_RESULT`/`AI_RESULT` branch, also set
      `resultRef.current = e.result`. In the `LOOKUP_COMPLETE` branch, after `setLoading(false)`:
      ```ts
      if (autoSpeakRef.current && resultRef.current) speakWord(resultRef.current.word)
      ```
      In `persistHistory`, after `const id = await addHistory(...)`:
      ```ts
      if (historyLimitRef.current > 0) await pruneHistory(historyLimitRef.current)
      ```

      **Test — `tests/overlay.test.tsx` (new file):**
      First line: `// @vitest-environment jsdom`
      ```tsx
      // @vitest-environment jsdom
      import '@testing-library/jest-dom/vitest'
      import { render, screen, fireEvent, waitFor } from '@testing-library/react'
      import { vi, describe, it, expect, beforeEach } from 'vitest'
      import { Overlay } from '../src/ui/Overlay'
      ```
      Mock `../src/storage/history` and `../src/storage/app-settings` (vi.mock).
      Build a `chrome` mock where:
      - `SEED_MESSAGE` → `{ ok: true }` immediately
      - `OFFLINE_LOOKUP_MESSAGE` → `{ ok: true, result: offlineEntry }` immediately
      - `LOOKUP_MESSAGE` → resolves after `setTimeout(40ms)` with `{ ok: true, result: aiResult }`
        (aiResult has source 'groq' and more fields than offline)
      - `storage.local.get(key, cb)`: if `key === 'vocabflow.providers'`, cb with enabled Groq;
        if `key === 'vocabflow.settings'`, cb with `{}`; else cb with `{}`
      - `storage.local.set` → no-op
      
      Test: render `<Overlay onClose={vi.fn()} />`, fire Enter on "hello" input (calls `doSearch`
      directly, bypasses 400ms debounce):
      ```tsx
      const input = screen.getByPlaceholderText('Search any word')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      ```
      Assert:
      1. `await waitFor(() => expect(screen.getByText(/Offline dictionary/)).toBeInTheDocument())`
         (offline result displayed)
      2. `await waitFor(() => expect(screen.getByText(/groq/)).toBeInTheDocument())`
         (AI result replaced offline result)
      3. `expect(screen.queryByText('Searching…')).toBeNull()`
         (LOOKUP_COMPLETE fired, loading cleared)

      Files: `src/ui/Overlay.tsx`, `src/storage/app-settings.ts` (new),
      `src/storage/history.ts`, `tests/overlay.test.tsx` (new), `package.json`

      Verify:
      - `npm test` → `tests/overlay.test.tsx` passes; all existing tests pass; only 3 live skip
      - `npx tsc -b` → exit 0
      - `npm run lint` → exit 0

---

- [ ] 3. **FEAT-003 — Settings & History views functional (fixes C-ui, D)**

      Addresses: make SettingsView persist to storage; remove non-functional Light theme option;
      fix HistoryView "Clear all" and per-item action in Saved Words view.
      Depends on FEAT-002 (provides `src/storage/app-settings.ts`).

      **C-ui — `src/ui/views/SettingsView.tsx`:**
      Replace the entire component:
      ```tsx
      import { useEffect, useState } from 'react'
      import { loadAppSettings, saveAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '../../storage/app-settings'

      export function SettingsView() {
        const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

        useEffect(() => {
          void loadAppSettings().then(setSettings)
        }, [])

        function update(patch: Partial<AppSettings>) {
          const next = { ...settings, ...patch }
          setSettings(next)
          void saveAppSettings(next)
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Auto-pronounce results</span>
              <input type="checkbox" checked={settings.autoSpeak}
                onChange={(e) => update({ autoSpeak: e.target.checked })} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>History limit</span>
              <input
                type="number" min={20} max={2000} step={20}
                value={settings.historyLimit}
                onChange={(e) => update({ historyLimit: Number(e.target.value) })}
                style={{ width: 90, padding: 4, borderRadius: 6,
                  border: '1px solid rgba(148,163,184,0.28)',
                  background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Theme</span>
              <select
                value={settings.theme}
                onChange={(e) => update({ theme: e.target.value as 'glass' })}
                style={{ padding: 4, borderRadius: 6,
                  border: '1px solid rgba(148,163,184,0.28)',
                  background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }}
              >
                <option value="glass">Glass (dark)</option>
              </select>
            </label>
            <p style={{ color: '#AAB8C8', fontSize: 12, margin: 0 }}>
              Settings are stored locally in this browser profile.
            </p>
          </div>
        )
      }
      ```
      Note: only `<option value="glass">Glass (dark)</option>` — the Light option is removed.

      **D — `src/ui/views/HistoryView.tsx`:**
      Add `updateHistory` to the import from `../../storage/history`.
      Change the "Clear all" button to render only when `!savedOnly`:
      ```tsx
      {!savedOnly && (
        <button style={btn} onClick={() => {
          if (!confirm('Clear all history?')) return
          void clearHistory().then(refresh)
        }}>Clear all</button>
      )}
      ```
      Change the per-item action button:
      ```tsx
      {h.id !== undefined && (
        <button
          style={{ ...btn, marginLeft: 'auto' }}
          onClick={() => {
            if (savedOnly) {
              void updateHistory(h.id as number, { saved: false }).then(refresh)
            } else {
              void deleteHistory(h.id as number).then(refresh)
            }
          }}
        >
          {savedOnly ? 'Unsave' : 'Delete'}
        </button>
      )}
      ```

      Files: `src/ui/views/SettingsView.tsx`, `src/ui/views/HistoryView.tsx`

      Verify:
      - `npx tsc -b` → exit 0
      - `npm run lint` → exit 0
      - `npm run build` → exit 0
      - `npm test` → all existing + overlay test pass; only 3 live-API tests skip

---

- [ ] 4. **FEAT-004 — Unit-test coverage (fix H)**

      Addresses: `parseAiJson` tests, `history.ts` IndexedDB tests, OpenRouter/Gemini request tests.
      Independent of FEATs 002/003 (can be implemented after FEAT-001 or in parallel conceptually,
      but should run after FEAT-002 to cover `pruneHistory`).

      **Install `fake-indexeddb` (exact pinned):**
      Add `"fake-indexeddb": "6.2.6"` to `devDependencies` in `package.json`. Run `npm install`.

      **`tests/parse-ai-json.test.ts` (new, node env):**
      Import `{ parseAiJson }` from `'../src/providers/common'`.
      Test cases (all verified against the actual `parseAiJson` implementation in `common.ts`):
      1. Fenced with ```json...```: `'```json\n{"bengaliMeaning":"x"}\n```'` → parses, `bengaliMeaning === 'x'`
      2. Fenced with just ` ``` `: `'```{"englishDefinition":"y"}```'` → parses
      3. Unfenced plain JSON: `'{"bengaliMeaning":"z","englishDefinition":"d"}'` → parses
      4. `synonyms` as array of strings → returned as array; non-strings filtered: `["a",1,"b"]` → `["a","b"]`
      5. Malformed (no braces): `'not json at all'` → `null`
      6. Broken JSON inside braces: `'{ broken:'` → `null`
      7. Nested braces in a string value: `'{"exampleEn":"a {b} c","bengaliMeaning":"x"}'` →
         `exampleEn === 'a {b} c'` (parseAiJson uses `lastIndexOf('}')` so the outer `}` is found)
      8. Empty string fields are omitted (str() returns undefined for empty string)

      **`tests/history.test.ts` (new, node env):**
      ```ts
      import { IDBFactory } from 'fake-indexeddb'
      // In beforeEach:
      globalThis.indexedDB = new IDBFactory()
      ```
      (Each `new IDBFactory()` is a fresh in-memory store, so no `deleteDatabase` needed.)
      Test cases:
      1. `addHistory(entry)` → returns a numeric id (typeof id === 'number')
      2. `listHistory()` → returns entries sorted descending by timestamp (add two entries with different timestamps, assert order)
      3. `updateHistory(id, patch)` → patches the entry (read back with listHistory and confirm)
      4. `deleteHistory(id)` → removes entry from listHistory
      5. `clearHistory()` → empties the store
      6. `listSaved()` → returns only entries where `saved === true`
      7. `pruneHistory(2)` → add 3 entries with timestamps 1, 2, 3; after prune(2) only timestamps 3 and 2 remain (oldest=1 deleted)

      **`tests/providers.test.ts` (new, node env):**
      Mirror `tests/groq-models.test.ts` style with `vi.fn()` for `globalThis.fetch`.

      For `openRouterLookup` (import from `'../src/providers/openrouter'`):
      - Mock `fetch` to return `{ ok: true, json: async () => ({ choices: [{ message: { content: '{"bengaliMeaning":"x","englishDefinition":"y"}' } }] }) }`
      - Assert: fetch called with URL `'https://openrouter.ai/api/v1/chat/completions'`
      - Assert: `Authorization` header === `'Bearer test-key'`
      - Assert: `JSON.parse(body).model === 'openai/gpt-4o-mini'`
      - Assert: `JSON.parse(body).response_format.type === 'json_object'`
      - Assert: method === `'POST'`

      For `geminiLookup` (import from `'../src/providers/gemini'`):
      Read `src/providers/gemini/index.ts` first to confirm the actual URL pattern and body shape.
      - Mock `fetch` to return candidates in the Gemini response shape
      - Assert: URL contains `:generateContent?key=test-gemini-key`
      - Assert: URL contains the model name
      - Assert: `JSON.parse(body).generationConfig.responseMimeType === 'application/json'`
      - Assert: `JSON.parse(body).contents` exists with `role === 'user'`

      Files: `tests/parse-ai-json.test.ts` (new), `tests/history.test.ts` (new),
      `tests/providers.test.ts` (new), `package.json` (fake-indexeddb added)

      Verify:
      - `npm test` → all 3 new test files pass; existing tests pass; only 3 live-API tests skip

---

- [ ] 5. **FEAT-005 — Cleanup (fix I) — conditional on green baseline**

      Only execute if FEATS 001–004 are complete and `npm test && npx tsc -b && npm run lint && npm run build` all pass.

      **I1 — Centralize `VOCABFLOW_TOGGLE` in `src/providers/bridge.ts`:**
      Add: `export const TOGGLE_MESSAGE = 'VOCABFLOW_TOGGLE'`
      In `src/background/service-worker.ts`: import `TOGGLE_MESSAGE` from `'../providers/bridge'`;
      replace `{ type: 'VOCABFLOW_TOGGLE' }` with `{ type: TOGGLE_MESSAGE }`.
      In `src/content/content-entry.ts`: import `TOGGLE_MESSAGE` from `'../providers/bridge'`;
      replace `msg?.type !== 'VOCABFLOW_TOGGLE'` with `msg?.type !== TOGGLE_MESSAGE`.

      **I2 — Remove dead Vite scaffolding:**
      Files to delete: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/index.css`,
      `src/assets/` (directory). Verification: `npm run build` must still exit 0 (CRXJS builds from
      the manifest, not `index.html`). If the build fails, restore these files and document in FEAT findings.

      **I3 — Fix WordNet pointer parser in `scripts/lib/wordnet.mjs`:**
      In `parseDataFiles`, the pointer loop is:
      ```js
      const symbol = tokens[cursor + 1 + i * 2]
      const target = tokens[cursor + 2 + i * 2]
      ```
      Each WordNet pointer entry is 4 fields: `symbol offset pos source/target`.
      Change to:
      ```js
      const symbol = tokens[cursor + 1 + i * 4]
      const target = tokens[cursor + 2 + i * 4]
      ```
      After the fix, run `npm run build:dictionary` to regenerate `src/dictionary/generated.json`
      and `public/dictionary.json.gz`. Run `npm test` — `tests/offline.test.ts` should still pass
      (its size assertion uses `>= 50` thresholds and it imports `generated.json` directly, so if
      the antonym count or entry count changes significantly, update those assertions accordingly).

      Files: `src/providers/bridge.ts`, `src/background/service-worker.ts`,
      `src/content/content-entry.ts`, `scripts/lib/wordnet.mjs`,
      `src/dictionary/generated.json` (regenerated), `public/dictionary.json.gz` (regenerated),
      plus deleted scaffolding files

      Verify:
      - `npx tsc -b` → exit 0
      - `npm test` → all pass (only 3 live-API tests skip)
      - `npm run build` → exit 0

---

- [ ] 6. **Final verification gate**

      Run in order. All must pass before declaring done.

      1. `npm test` — all pass; only the 3 pre-existing live-API tests (in `tests/groq-live.test.ts`) skip.
      2. `npx tsc -b` — exit 0.
      3. `npm run lint` — exit 0 (oxlint).
      4. `npm run build` — exit 0.
      5. `Get-ChildItem -Recurse -Path dist -Filter *.js | Select-String -SimpleMatch 'gsk_'` → **no output**.
      6. `tests/overlay.test.tsx` specifically passed (offline→AI replacement + loading cleared).

---

## Key files quick reference

| File | Change |
|---|---|
| `src/config/env.ts` | Gate key behind `import.meta.env.DEV` |
| `src/storage/seed.ts` | Doc comment only |
| `.env.example` | Update WARNING comment |
| `tests/seed.test.ts` | vi.stubEnv + dynamic import, add 2 gating tests |
| `src/storage/settings.ts` | `'open-ai/gpt-4o-mini'` → `'openai/gpt-4o-mini'` (2 places) |
| `tsconfig.app.json` | Add `"strict": true` |
| `src/ui/Overlay.tsx` | historyId→useRef, speakWord+isBengali, autoSpeak/historyLimit wiring |
| `src/storage/app-settings.ts` | **New** — AppSettings CRUD |
| `src/storage/history.ts` | Add `pruneHistory(limit)` |
| `tests/overlay.test.tsx` | **New** — jsdom integration test |
| `src/ui/views/SettingsView.tsx` | Persist settings, remove Light theme |
| `src/ui/views/HistoryView.tsx` | Hide Clear-all in saved view; Unsave vs Delete |
| `tests/parse-ai-json.test.ts` | **New** — 8 cases |
| `tests/history.test.ts` | **New** — IndexedDB CRUD + pruneHistory |
| `tests/providers.test.ts` | **New** — OpenRouter + Gemini request shape |
| `src/providers/bridge.ts` | Add `TOGGLE_MESSAGE` export |
| `src/background/service-worker.ts` | Use `TOGGLE_MESSAGE` constant |
| `src/content/content-entry.ts` | Use `TOGGLE_MESSAGE` constant |
| `scripts/lib/wordnet.mjs` | Fix `i * 2` → `i * 4` in pointer loop |

## Constraints
- No git commands
- Never print or log the `gsk_...` key value; reference by variable name only
- No new runtime dependencies; testing deps only, pinned exact versions
- No `@ts-ignore`, `@ts-nocheck`, or `any` to suppress type errors; fix by narrowing
- Match existing code style (see `tests/coordinator.test.ts`, `tests/seed.test.ts` as patterns)
- `src/lookup/coordinator.ts` may need `const best = this.best` narrowing if strict catches it
  (the dry-run shows no error, but apply it defensively anyway — it is correct code)
