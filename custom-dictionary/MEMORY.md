// # MEMORY.md — Custom Dictionary Package System
//
// Persistent scratchpad for the Custom Dictionary Package System. Any AI
// starting a fresh chat session should read this file first to catch up on
// decisions, bugs, and progress. This file is updated after every completed
// task.
//
// ## 2. Current Status
//
// **Phase:** Phase 2 — Runtime Lookup Engine + Service Worker Bridge (Phase 1 complete)
// **Last updated:** 2026-10-22
// **Active branch:** master
// **Folder:** E:\Special NEED\Translator extention\custom-dictionary/
//
// ## 3. Decisions Made
//
// | Decision | Rationale |
// |----------|-----------|
// | Columnar JSON dataset (array per field) | Compact, fast indexing, matches existing `Translator extention` offline dictionary schema |
// | `DATASET_VERSION = 4` | Prevents silent loading of stale/incompatible artifacts |
// | Gzip level 9 for `public/dictionary.json.gz` | ~3x size reduction, `DecompressionStream` is native in Chrome MV3 |
// | TypeScript strict mode, ESM | Consistency with existing extension repo |
// | Vitest + oxlint | Same toolchain as existing extension, zero-config |
// | Bengali NFC normalization | Precomposed YYA (`য়`) and decomposed `য`+`ন fusión` must compare equal |
// | Synonyms from ALL synsets of correct POS; antonym inheritance only from matched synset | Maximizes coverage without cross-sense noise |
// | No `default` exports; named exports only | ESM best practice, easier tree-shaking |
// | No `any` type; `unknown` + narrowing | Type safety |
//
// ## 4. Files Created
//
// | File | Status | Purpose |
// |------|--------|---------|
// | `PRD.md` | Complete | Product requirements, goals, non-goals, success metrics |
// | `ARCHITECTURE.md` | Complete | Folder layout, tech stack, data model, runtime architecture, message contract |
// | `RULES.md` | Complete | Coding standards, naming, error handling, testing, commits, AI contribution rules |
// | `PHASES.md` | Complete | 7-phase roadmap with micro-tasks and execution rules |
// | `DESIGN.md` | Complete | CLI style, color palette, typography, component specs, accessibility |
// | `MEMORY.md` | Complete | This file |
// | `package.json` | Complete | Scripts: build:dictionary, test, lint, typecheck |
// | `tsconfig.json` | Complete | Strict TypeScript config |
// | `vitest.config.ts` | Complete | Vitest config pointing to tests/ |
// | `oxlint.config.json` | Complete | Lint config |
// | `src/index.ts` | Complete | Public API placeholder (`VERSION = '0.1.0'`) |
// | `tests/placeholder.test.ts` | Complete | Placeholder test (2 passing) |
// | `scripts/lib/bengali.mjs` | Complete | read Wiktionary JSONL, group by headword |
// | `scripts/lib/wordnet.mjs` | Complete | read WordNet data/index, extract synonyms, antonyms, examples |
// | `scripts/lib/pronunciation.mjs` | Complete | CMUdict ARPAbet → IPA conversion |
// | `scripts/lib/romanize.mjs` | Complete | Bengali ↔ Latin transliteration |
// | `scripts/builders/normalize.ts` | Complete | NFC normalization, punctuation stripping, lowercase |
// | `scripts/builders/columnar.ts` | Complete | columnar JSON serialization with SEP joining |
// | `scripts/builders/relations.ts` | Complete | synonym/antonym inheritance within same POS |
// | `scripts/build-dict.ts` | Complete | main orchestration — read sources, normalize, match WordNet synsets, serialize columnar JSON, gzip output |
// | `scripts/build-dictionary.mjs` | Complete | ESM entry point — imports and runs build-dict.ts |
// | `src/suggest.ts` | Complete | Type-ahead suggestion engine — prefix + fuzzy matching, stale-request dropping via SuggestEngine |
// | `src/service-worker.ts` | Complete | VOCABFLOW_DICT_LOOKUP, VOCABFLOW_DICT_SUGGEST message handlers |
// | `tests/suggest.test.ts` | Complete | suggest() tests — exact, prefix, typo, empty, limit, Bengali, latency (<10ms p95) |
// | `src/service-worker.ts` | Complete | VOCABFLOW_DICT_LOOKUP, VOCABFLOW_DICT_SUGGEST message handlers |
// | `tests/suggest.test.ts` | Complete | suggest() tests — exact, prefix, typo, empty, limit |
// | `src/service-worker.ts` | Phase 2 micro-task 6 — VOCABFLOW_DICT_LOOKUP, VOCABFLOW_DICT_SUGGEST message handlers |
//
// ## 6. Known Constraints
//
// - All data must be public domain or properly licensed (CC BY-SA, MIT, public domain).
// - No network access at lookup time; fully offline.
// - Dictionary package must load in Chrome MV3 service worker.
// - Output format must coexist with existing `Translator extention` offline dictionary.
// - No `dist/`, `public/dictionary.json.gz` (released only), `node_modules/`, `.env*` committed to git.
//
// ## 7. Known Bugs / Issues
//
// (None yet — project not started)
//
// ## 8. Next Immediate Action
//
// Implement `src/types.ts`: LookupResult, DictionaryDataset, SuggestionPayload types.
//
// ## 9. AI Contribution Instructions
//
// 1. Read `MEMORY.md` first.
// 2. Pick exactly ONE unchecked micro-task from `PHASES.md` current phase.
// 3. Implement it following `RULES.md`.
// 4. Run `npm run lint`, `npx tsc -b`, `npx vitest run`.
// 5. Update `MEMORY.md` with decisions made and bugs fixed.
// 6. Mark the micro-task complete in `PHASES.md`.
// 7. Report completion.
//
//
// *Last updated:* 2026-10-22
