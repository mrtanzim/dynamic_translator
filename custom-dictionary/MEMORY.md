# MEMORY.md — Custom Dictionary Package System (current status)

**Last updated:** 2026-11-20 · **Branch:** main

## Bengali-first package (Phase 8)
- Decision: build a **language-specific Bengali-first dataset** (`data/bn/`, artifact
  `public/dictionary.bn.json.gz`, schema **v1**) because the English-first dataset's
  reverse lookup returns English definitions/relations and almost no Bengali
  examples or idiomatic English equivalents.
- Decision: **hybrid build** — invert the existing generated English-first dataset
  for broad coverage (8,776 Bengali headwords), then apply hand-curated words and
  idioms (`curated.json`, `idioms.json`) that always win. No new dependencies, no
  network, no ML model — a "dictionary AI" driven by rich data.
- Decision: English synonyms/antonyms + bilingual (Bengali + English) examples for
  `bn→en`; an idiom's natural English equivalent is the primary `en` answer and
  the literal rendering lives in `enAlt` / `usage` (e.g. `ki khobor` → "How are you?").
- Decision: the extension mirrors the indexer in `src/providers/offline/bn-dataset.ts`
  (+ `bn-loader.ts`) instead of importing from this package, so Vite/tsc never reach
  outside the extension's build root. Both share the v1 columnar contract.
- Decision: `VOCABFLOW_OFFLINE_LOOKUP` carries an optional `direction`; the service
  worker uses the BN index for `bn-en` and falls back to the English-first reverse
  path. A broken BN dataset is best-effort.
- Bug fixed: Banglish keys must strip whitespace so `ki khobor` == `kikhobor`.
- Bug fixed: provider errors are no longer cleared by a late provisional result —
  errors are cleared only at the start of a new search (see extension `Overlay.tsx`).
- Bug fixed: tests resolve `data/bn` from `import.meta.url`, not `process.cwd()`, so
  they pass when vitest runs from the extension root.
- Files added: `src/{bn-types,bn-indexer,bn-lookup}.ts`,
  `scripts/builders/{bn-schema,bn-invert,bn-curated}.ts`,
  `scripts/build-bn-dictionary.mjs`, `data/bn/*`, four `tests/bn-*.test.ts`.
- Next: wider licensed Bengali corpus with Bengali examples; more idioms.

---

# MEMORY.md — Custom Dictionary Package System (current status)

## AI-style fields offline (2026-11-20)
- English-first is now **v5**, Bengali-first **v2**; both add eight columns:
  formal/conversational meanings and examples, collocations, word family,
  band level, common mistake.
- Decision: a shared build-time `scripts/lib/enrichment.mjs` generates them
  from WordNet (collocations from examples, word family from derivation rules
  verified against senses), a hand-authored IELTS band list with attribution,
  and curated overrides that win. No runtime network, no ML model.
- Decision: `wordFamily` is `role:value` pairs joined with U+0001; collocations
  are U+0001-joined. Schema readers tolerate absent columns in hand-built test
  fixtures but reject wrong-length ones.
- Bug fixed: curated-only headwords (e.g. "reluctant") needed enrichment in the
  curated branch too; otherwise their rich fields stayed empty.
- Bug fixed: the collocations column was written as a nested array; it must be
  SEP-joined text for the runtime `splitColumn`.
- Next: licensed corpus for collocations; official-source band verification.

---

// # MEMORY.md — Custom Dictionary Package System
//
// Persistent scratchpad for the Custom Dictionary Package System. Any AI
// starting a fresh chat session should read this file first to catch up on
// decisions, bugs, and progress. This file is updated after every completed
// task.
//
// ## 2. Current Status
//
// **Phase:** Phase 2 complete, Phase 3 complete, Phase 4 in progress
// **Last updated:** 2026-10-23
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
// | `src/index.ts` | Complete | Public API exports — LookupCoordinator, LookupResult, DictionaryDataset, SuggestionPayload |
// | `src/types.ts` | Complete | LookupResult, DictionaryDataset, SuggestionPayload types |
// | `src/loader.ts` | Complete | fetch gzipped dataset, DecompressionStream, memoized load |
// | `src/indexer.ts` | Complete | OfflineDictionary class — build byHeadword, byNormalized, byBengali, byRelation, englishWords, bengaliWords |
// | `src/lookup.ts` | Complete | lookup(), lookupBengali(), headword resolution |
// | `src/suggest.ts` | Complete | Type-ahead suggestion engine — prefix + fuzzy matching, stale-request dropping via SuggestEngine |
// | `src/service-worker.ts` | Complete | VOCABFLOW_DICT_LOOKUP, VOCABFLOW_DICT_SUGGEST message handlers |
// | `tests/suggest.test.ts` | Complete | suggest() tests — exact, prefix, typo, empty, limit, Bengali |
// | `tests/dataset.test.ts` | Complete | dataset tests — 6675 entries, 5242 with pronunciation (78.5%), 3638 synonyms, 720 antonyms |
// | `scripts/lib/bengali.mjs` | Complete | read Wiktionary JSONL, group by headword |
// | `scripts/lib/wordnet.mjs` | Complete | read WordNet data/index, extract synonyms, antonyms, examples |
// | `scripts/lib/pronunciation.mjs` | Complete | CMUdict ARPAbet → IPA conversion |
// | `scripts/lib/romanize.mjs` | Complete | Bengali ↔ Latin transliteration |
// | `scripts/builders/normalize.ts` | Complete | NFC normalization, punctuation stripping, lowercase |
// | `scripts/builders/columnar.ts` | Complete | columnar JSON serialization with SEP joining |
// | `scripts/builders/relations.ts` | Complete | synonym/antonym inheritance within same POS |
// | `scripts/build-dict.ts` | Complete | main orchestration — read sources, normalize, match WordNet synsets, serialize columnar JSON, gzip output |
// | `scripts/build-dictionary.mjs` | Complete | ESM entry point — imports and runs build-dict.ts |
//
// ## 5. Files NOT Yet Created
//
// | File | Why blocked |
// |------|-----------|
// | `tests/lookup.test.ts` | Phase 5 — lookup tests not yet written |
// | `tests/build.test.ts` | Phase 5 — build script tests not yet written |
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
// Write `tests/lookup.test.ts` — test coordinator lookup, history, synonyms, antonyms, pronunciation.
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
// *Last updated:* 2026-10-22
