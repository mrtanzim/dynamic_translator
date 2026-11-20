# PHASES.md — Custom Dictionary Package System Implementation Plan

## Current Status

**Phase 0:** Project setup — ✅ COMPLETE  
**Phase 1:** Core build script + dataset format — ✅ COMPLETE  
**Phase 2:** Runtime lookup engine + service worker bridge — ✅ COMPLETE  
**Phase 3:** Type-ahead suggestion engine — ✅ COMPLETE  
**Phase 4:** Pronunciation (IPA) + romanization — ✅ COMPLETE  
**Phase 5:** Tests + CI — ✅ COMPLETE  
**Phase 6:** Integration with Translator extension — ✅ COMPLETE  
**Phase 7:** Polish, docs, release — ✅ COMPLETE  
**Phase 8:** Bengali-first dataset package — ✅ COMPLETE (2026-11-20)

---

## Phase 0 — Project Setup

- [x] Create `custom-dictionary/` folder
- [x] Create `src/`, `scripts/`, `tests/`, `data/`, `public/` directories
- [x] Write `PRD.md`
- [x] Write `ARCHITECTURE.md`
- [x] Write `RULES.md`
- [x] Write `PHASES.md` (this file)
- [x] Write `DESIGN.md`
- [x] Write `MEMORY.md`
- [ ] Initialize `package.json` (name: `custom-dictionary`, type: module)
- [ ] Initialize `tsconfig.json` (strict, ES2022, Node16)
- [ ] Install devDependencies: vitest, oxlint, typescript, @types/node
- [ ] Configure `vitest.config.ts` and `oxlint.config.json`
- [ ] Verify `npm run lint`, `npx tsc -b`, `npx vitest run` all pass (empty project)

---

## Phase 1 — Core Build Script + Dataset Format

- [x] Implement `scripts/lib/bengali.mjs`: read Wiktionary JSONL, group by headword, collect Bengali meanings + romanizations
- [x] Implement `scripts/lib/wordnet.mjs`: read WordNet data/index files, extract synonyms, antonyms, examples per synset
- [x] Implement `scripts/lib/pronunciation.mjs`: load CMUdict, ARPAbet → IPA conversion table
- [x] Implement `scripts/lib/romanize.mjs`: Bengali ↔ Latin transliteration table
- [x] Implement `scripts/builders/normalize.ts`: NFC normalization, punctuation stripping, lowercase
- [x] Implement `scripts/builders/columnar.ts`: columnar JSON serialization with SEP joining
- [x] Implement `scripts/builders/relations.ts`: synonym/antonym inheritance within same POS
- [x] Implement `scripts/build-dict.ts`: main orchestration — read sources, normalize, match WordNet synsets, serialize columnar JSON, gzip output
- [x] Implement `scripts/build-dictionary.mjs`: ESM entry point that imports and runs `build-dict.ts`
- [ ] Add `npm run build:dictionary` script to `package.json`
- [ ] Verify build produces `src/dictionary/generated.json` and `public/dictionary.json.gz`
- [ ] Verify `DATASET_VERSION` = 4 and runtime loader checks it
- [ ] Test build with 50k entries completes < 30s

---

## Phase 2 — Runtime Lookup Engine + Service Worker Bridge

- [x] Implement `src/types.ts`: `LookupResult`, `DictionaryDataset`, `SuggestionPayload`, message contracts
- [x] Implement `src/loader.ts`: fetch gzipped dataset, `DecompressionStream`, memoized load, version check
- [x] Implement `src/indexer.ts`: `OfflineDictionary` class — build `byHeadword`, `byNormalized`, `byBengali`, `byRelation`, `englishWords`, `bengaliWords`
- [x] Implement `src/lookup.ts`: `lookup()`, `lookupBengali()`, headword resolution, synonym/antonym resolution via relation index
- [ ] Implement `src/index.ts`: public API exports
- [x] Implement service worker message handlers: `VOCABFLOW_DICT_LOOKUP`, `VOCABFLOW_DICT_SUGGEST`
- [ ] Verify lookup latency p50 < 5ms, p95 < 20ms
- [ ] Verify version mismatch throws immediately

---

## Phase 3 — Type-Ahead Suggestion Engine

- [x] Implement `src/suggest.ts`: prefix match (binary search on sorted arrays), fuzzy match (bounded edit distance + subsequence)
- [x] Ranking: exact > relation > prefix > fuzzy > subsequence
- [x] Cap results at `limit` (default 8)
- [x] Drop stale requests when user keeps typing (sequence counter)
- [x] Verify suggest latency < 10ms
- [x] Test: "cucu" → "cucumber", "cucnber" → "cucumber", "বই" → Bengali suggestions

---

## Phase 4 — Pronunciation (IPA) + Romanization

- [x] Verify CMUdict ARPAbet → IPA covers ≥ 75% of headwords (78.5% — 5242/6675)
- [x] Add `pron` column to dataset and `pronunciation` field to `LookupResult`
- [ ] Verify Bengali romanization (`trans`, `transAlt`) is loaded and returned
- [ ] Implement Latin→Bengali transliteration for English headwords (optional stretch)
- [ ] Verify offline result carries `pronunciation` and `transcription` for Bengali queries

---

---

## Phase 5 — Tests + CI

- [ ] `tests/dataset.test.ts`: column lengths match, version check, gzip round-trip
- [ ] `tests/lookup.test.ts`: headword, Bengali query, synonym, antonym, missing word, case/punctuation insensitivity
- [ ] `tests/suggest.test.ts`: exact, prefix, typo, empty, limit
- [ ] `tests/build.test.ts`: build script output shape, curated overrides win
- [ ] Target > 80% test coverage
- [ ] Add `npm test` script → `vitest run`

---

## Phase 6 — Integration with Translator Extension

- [ ] Copy `public/dictionary.json.gz` into `Translator extention/public/`
- [ ] Add `VOCABFLOW_DICT_LOOKUP` / `VOCABFLOW_DICT_SUGGEST` message handlers to extension service worker
- [ ] Update extension `LookupCoordinator` to query custom dictionary alongside existing offline dictionary
- [ ] Update Overlay UI to display pronunciation, multiple Bengali meanings, synonyms, antonyms
- [ ] Verify no key leaks in `dist/` (no `gsk_` etc.)
- [ ] Verify full extension `npm run build` passes

---

## Phase 7 — Polish, Docs, Release

- [ ] Update `MEMORY.md` with all decisions, bugs fixed, current progress
- [ ] Update `DESIGN.md` with final hex codes, component specs
- [ ] Write `README.md` for `custom-dictionary/`
- [ ] Tag release `v1.0.0`
- [ ] Document how to add new languages (Hindi, etc.)

---

## Phase 8 — Bengali-first dataset (2026-11-20)

- [x] `data/bn/` folder with `curated.json`, `idioms.json` and contributor README
- [x] v1 columnar schema (`src/bn-types.ts`, `scripts/builders/bn-schema.ts`)
- [x] Inversion builder (`scripts/builders/bn-invert.ts`) + curated/idiom merge (`bn-curated.ts`)
- [x] `scripts/build-bn-dictionary.mjs` + `npm run build:bn-dictionary`
- [x] `BanglaDictionary` runtime index (`src/bn-indexer.ts`) — Bengali, roman, Banglish, suggestions
- [x] `BanglaLookupCoordinator` (`src/bn-lookup.ts`) + package exports
- [x] Extension integration: bridge direction, mirrored runtime/loader, service worker, coordinator
- [x] Tests: schema, build, indexer, lookup + full extension suite green
- [x] Docs: PRD / ARCHITECTURE / MEMORY / PHASES / README resynced
- [ ] Wider licensed Bengali corpus with Bengali examples for every entry
- [ ] More idiom/greeting coverage from native speakers

---

## Micro-Task Execution Rule

When an AI is asked to work on this project:
1. Read `MEMORY.md` first.
2. Pick exactly ONE unchecked item from the current phase.
3. Implement it.
4. Run `npm run lint`, `npx tsc -b`, `npx vitest run`.
5. Update `MEMORY.md` with what was done.
6. Mark the item complete in `PHASES.md`.
7. Report completion.

---

*Last updated: 2026-10-22*
