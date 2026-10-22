# RULES.md — Custom Dictionary Package System

## 1. Purpose

This file is the boundary and coding standards playbook. Any AI or human contributor working on `custom-dictionary/` must follow these rules. If a rule conflicts with a PRD or Architecture decision, this file wins for code style; the PRD wins for product decisions.

## 2. Language & Tooling

- TypeScript strict mode (`tsc -b` must pass with zero errors).
- Node.js ESM (`"type": "module"` in `package.json`).
- Vitest for tests (`npx vitest run`).
- oxlint for linting (`npm run lint` must pass with zero errors).
- No new npm dependencies without updating `PRD.md` and `ARCHITECTURE.md`.
- Build scripts are `.mjs` (Node ESM) for compatibility with the existing extension.

## 3. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files (source) | `kebab-case.ts` | `lookup.ts`, `build-dict.ts` |
| Files (scripts) | `kebab-case.mjs` | `build-dictionary.mjs` |
| Directories | `kebab-case` | `scripts/lib/`, `data/sources/` |
| Classes | `PascalCase` | `OfflineDictionary`, `LookupCoordinator` |
| Functions / methods | `camelCase` | `loadOfflineDictionary()`, `suggestWords()` |
| Constants | `UPPER_SNAKE_CASE` | `DATASET_VERSION`, `SEP`, `OFFLINE_TIMEOUT_MS` |
| Interfaces / types | `PascalCase` | `LookupResult`, `DictionaryDataset` |
| Private members | Prefix with `_` only if needed by framework; otherwise plain `camelCase` with `private` keyword |
| Message types | `UPPER_SNAKE_CASE` string literal | `'VOCABFLOW_DICT_LOOKUP'` |

## 4. Code Style

- No `// TODO`, `// FIXME`, or `// HACK` without a linked issue or PRD section.
- No `any` type. Use `unknown` and narrow.
- No `console.log` in production source (build scripts may log to stderr).
- No `process.exit()` in library code; return errors instead.
- Async functions must handle errors with `try/catch` or `.catch()`; never leave unhandled rejections.
- Prefer `Map`/`Set` over objects for dictionary-style lookups.
- Prefer `Array.from` / spread over `for...of` mutation when building new arrays.
- All public functions must have JSDoc comments describing params and return.
- No `default` exports; use named exports only.

## 5. Error Handling

- Library functions throw `Error` with descriptive messages; callers decide whether to catch.
- Lookup failures return `{ ok: false, error: string }` over the message channel, never throw across the bridge.
- Build script failures print to `process.stderr` and exit non-zero.
- Missing source files are fatal; corrupt JSONL lines are skipped with a warning (not fatal).

## 6. Data Rules

- All source data must be public domain or have a compatible license (CC BY-SA, MIT, public domain).
- Source files live in `data/` and are never imported by the runtime bundle directly; they are only read at build time.
- The built artifact (`public/dictionary.json.gz`) is the only file shipped to the browser.
- Bengali text must be NFC-normalized before storage and lookup.
- Latin→Bengali transliteration must use a defined table, never machine-generated guesses.
- Every headword must be lowercase, single-token (`/^[a-z][a-z-]*$/`), length ≥ 3.
- Synonyms and antonyms must be filtered through `isUsableRelation()` before storage.

## 7. Testing Rules

- Every new feature must have at least one test in `tests/`.
- Build output must be verified: entry count, column lengths match, gzip artifact exists and gunzips to matching JSON.
- Runtime lookup tests must cover: English headword, Bengali query, synonym resolution, antonym resolution, missing word (returns null), case/punctuation insensitivity.
- Type-ahead tests must cover: exact match, prefix, typo/fuzzy, empty query, limit enforcement.
- Test files are named `*.test.ts` and colocated in `tests/`.

## 8. Commit Rules

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `build:`, `perf:`.
- Commit bodies must explain *why*, not just *what*.
- Every meaningful change must update `MEMORY.md` and `PHASES.md`.
- Never commit `dist/`, `public/dictionary.json.gz` (unless releasing), `node_modules/`, or `.env*`.
- Never commit API keys, secrets, or credentials.

## 9. Package Versioning

- `DATASET_VERSION` is a number in `src/build-dict.ts` and checked at runtime load.
- Bump `DATASET_VERSION` when adding/removing columns or changing column semantics.
- Never load a dataset with a mismatched version — throw immediately.

## 10. AI Contribution Rules

- Before writing code, read `MEMORY.md` and `PHASES.md` to understand current state.
- After completing a task, update `MEMORY.md` with decisions made and bugs fixed.
- After completing a phase, update `PHASES.md` to mark it complete.
- If unsure about scope, read `PRD.md` — do not implement features outside scope without updating PRD first.
- Do not modify files outside `custom-dictionary/` unless coordinating with the main extension repo.

---

*Last updated: 2026-10-22*
