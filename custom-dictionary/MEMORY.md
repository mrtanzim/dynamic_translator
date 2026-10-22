# MEMORY.md — Custom Dictionary Package System

## 1. Purpose

Persistent scratchpad for the Custom Dictionary Package System. Any AI starting a fresh chat session should read this file first to catch up on decisions, bugs, and progress. This file is updated after every completed task.

## 2. Current Status

**Phase:** Phase 0 — Project Setup (files created, no code implemented yet)  
**Last updated:** 2026-10-22  
**Active branch:** `master`  
**Folder:** `E:\Special NEED\Translator extention\custom-dictionary/`

## 3. Decisions Made

| Decision | Rationale |
|----------|-----------|
| Columnar JSON dataset (array per field) | Compact, fast indexing, matches existing `Translator extention` offline dictionary schema |
| `DATASET_VERSION = 4` | Prevents silent loading of stale/incompatible artifacts |
| Gzip level 9 for `public/dictionary.json.gz` | ~3x size reduction, `DecompressionStream` is native in Chrome MV3 |
| TypeScript strict mode, ESM | Consistency with existing extension repo |
| Vitest + oxlint | Same toolchain as existing extension, zero-config |
| Bengali NFC normalization | Precomposed YYA (`য়`) and decomposed `য`+`ন fusión` must compare equal |
| Synonyms from ALL synsets of correct POS; antonym inheritance only from matched synset | Maximizes coverage without cross-sense noise |
| No `default` exports; named exports only | ESM best practice, easier tree-shaking |
| No `any` type; `unknown` + narrowing | Type safety |

## 4. Files Created

| File | Status | Purpose |
|------|--------|---------|
| `PRD.md` | Complete | Product requirements, goals, non-goals, success metrics |
| `ARCHITECTURE.md` | Complete | Folder layout, tech stack, data model, runtime architecture, message contract |
| `RULES.md` | Complete | Coding standards, naming, error handling, testing, commits, AI contribution rules |
| `PHASES.md` | Complete | 7-phase roadmap with micro-tasks and execution rules |
| `DESIGN.md` | Complete | CLI style, color palette, typography, component specs, accessibility |
| `MEMORY.md` | Complete | This file |

## 5. Files NOT Yet Created

| File | Why blocked |
|------|-----------|
| `package.json` | Waiting for Phase 0 micro-task completion |
| `tsconfig.json` | Waiting for Phase 0 |
| `vitest.config.ts` | Waiting for Phase 0 |
| `oxlint.config.json` | Waiting for Phase 0 |
| `src/types.ts` | Waiting for Phase 1 |
| `scripts/build-dict.ts` | Waiting for Phase 1 |
| `scripts/build-dictionary.mjs` | Waiting for Phase 1 |
| `tests/*.test.ts` | Waiting for Phase 5 |

## 6. Known Constraints

- All data must be public domain or properly licensed (CC BY-SA, MIT, public domain).
- No network access at lookup time; fully offline.
- Dictionary package must load in Chrome MV3 service worker.
- Output format must coexist with existing `Translator extention` offline dictionary.
- No `dist/`, `public/dictionary.json.gz` (released only), `node_modules/`, `.env*` committed to git.

## 7. Known Bugs / Issues

(None yet — project not started)

## 8. Next Immediate Action

Initialize `package.json`, `tsconfig.json`, `vitest.config.ts`, `oxlint.config.json`, then verify `npm run lint`, `npx tsc -b`, `npx vitest run` all pass on an empty project.

## 9. AI Contribution Instructions

1. Read `MEMORY.md` first.
2. Pick exactly ONE unchecked micro-task from `PHASES.md` current phase.
3. Implement it following `RULES.md`.
4. Run `npm run lint`, `npx tsc -b`, `npx vitest run`.
5. Update `MEMORY.md` with decisions made and bugs fixed.
6. Mark the micro-task complete in `PHASES.md`.
7. Report completion.

---

*Last updated: 2026-10-22*
