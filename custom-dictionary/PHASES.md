# PHASES.md — Custom Dictionary Package System Implementation Plan

## Current Status

**Phase 0:** Project setup (folder structure, config files, this document) — IN PROGRESS  
**Phase 1:** Core build script + dataset format — NOT STARTED  
**Phase 2:** Runtime lookup engine + service worker bridge — NOT STARTED  
**Phase 3:** Type-ahead suggestion engine — NOT STARTED  
**Phase 4:** Pronunciation (IPA) + romanization — NOT STARTED  
**Phase 5:** Tests + CI — NOT STARTED  
**Phase 6:** Integration with Translator extension — NOT STARTED  
**Phase 7:** Polish, docs, release — NOT STARTED

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
- [ ] Implement `scripts/builders/columnar.ts`: columnar JSON serialization with SEP joining
- [ ] Implement `scripts/builders/relations.ts`: synonym/antonym inheritance within same POS
- [ ] Implement `scripts/build-dict.ts`: main orchestration — read sources, normalize, match WordNet synsets, serialize columnar JSON, gzip output
- [ ] Implement `scripts/build-dictionary.mjs`: ESM entry point that imports and runs `build-dict.ts`
- [ ] Add `npm run build:dictionary` script to `package.json`
- [ ] Verify build produces `src/dictionary/generated.json` and `public/dictionary.json.gz`
- [ ] Verify `DATASET_VERSION` = 4 and runtime loader checks it
- [ ] Test build with 50k entries completes < 30s

---

## Phase 2 — Runtime Lookup Engine + Service Worker Bridge

- [ ] Implement `src/types.ts`: `LookupResult`, `DictionaryDataset`, `SuggestionPayload`, message contracts
- [ ] Implement `src/loader.ts`: fetch gzipped dataset, `DecompressionStream`, memoized load, version check
- [ ] Implement `src/indexer.ts`: `OfflineDictionary` class — build `byHeadword`, `byNormalized`, `byBengali`, `byRelation`, `englishWords`, `bengaliWords`
- [ ] Implement `src/lookup.ts`: `lookup()`, `lookupBengali()`, headword resolution, synonym/antonym resolution via relation index
- [ ] Implement `src/index.ts`: public API exports
- [ ] Implement service worker message handlers: `VOCABFLOW_DICT_LOOKUP`, `VOCABFLOW_DICT_SUGGEST`
- [ ] Verify lookup latency p50 < 5ms, p95 < 20ms
- [ ] Verify version mismatch throws immediately

---

## Phase 3 — Type-Ahead Suggestion Engine

- [ ] Implement `src/suggest.ts`: prefix match (binary search on sorted arrays), fuzzy match (bounded edit distance + subsequence)
- [ ] Ranking: exact > relation > prefix > fuzzy > subsequence
- [ ] Cap results at `limit` (default 8)
- [ ] Drop stale requests when user keeps typing (sequence counter)
- [ ] Verify suggest latency < 10ms
- [ ] Test: "cucu" → "cucumber", "cucnber" → "cucumber", "বই" → Bengali suggestions

---

## Phase 4 — Pronunciation (IPA) + Romanization

- [ ] Verify CMUdict ARPAbet → IPA covers ≥ 75% of headwords
- [ ] Add `pron` column to dataset and `pronunciation` field to `LookupResult`
- [ ] Verify Bengali romanization (`trans`, `transAlt`) is loaded and returned
- [ ] Implement Latin→Bengali transliteration for English headwords (optional stretch)
- [ ] Verify offline result carries `pronunciation` and `transcription` for Bengali queries

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
