# PRD.md — Custom Dictionary Package System

## 1. Overview

**Product:** Custom Dictionary Package System  
**Owner:** Translator Extension Project  
**Status:** Draft / Phase 1 Planning  
**Folder:** `custom-dictionary/`  
**Purpose:** A standalone, offline-first, multilingual dictionary builder and lookup engine that ships as a gzipped columnar dataset for the VocabFlow translator extension, with the ability to independently serve dictionary lookups, synonyms, antonyms, pronunciations (IPA), and romanizations for Bengali–English and other language pairs.

## 2. Problem Statement

The existing offline dictionary in `Translator extention/` is limited to:
- 6,675 English headwords from Wiktionary + WordNet
- One primary Bengali meaning per headword (alternatives stored but secondary)
- No IPA pronunciation for most entries
- No Bengali example sentences
- No Latin→Bengali script transliteration
- Fixed build script that is hard to extend per-language

A custom dictionary package system lets us:
- Build and maintain our own dictionary packages independent of Wiktionary/WordNet licensing
- Support multiple languages (Bengali, Hindi, etc.) in separate packages
- Include rich metadata: IPA, multiple meanings, examples in both languages, synonyms, antonyms
- Version packages independently from the extension code
- Allow offline-first lookups with zero network dependency

## 3. Goals (MVP)

1. **Dictionary builder CLI:** A Node script that takes source data (JSONL/JSON/CSV) and outputs a columnar `.json` + `.json.gz` package.
2. **Offline lookup service:** A service-worker-compatible module that loads the gzipped package, indexes it, and returns results for headword, Bengali meaning, synonym, antonym, and romanization queries.
3. **Type-ahead suggestion index:** Prefix + fuzzy matching over headwords and Bengali meanings.
4. **Romanization support:** Bengali → Latin (boi) and Latin → Bengali script (বই) per entry.
5. **Pronunciation guide:** IPA per headword (from CMUdict or custom).
6. **Package versioning:** Format version bumping so stale packages never load silently.
7. **Cross-package lookup:** The extension can load multiple dictionary packages (e.g. Bengali-English, Hindi-English) and query them in parallel.

## 4. Non-Goals (Explicitly Out of Scope)

- Online dictionary API server (this is offline-first; no backend)
- User accounts, cloud sync, or authentication
- Real-time machine translation of full sentences (single word/phrase lookup only)
- Speech synthesis (Web Speech API integration is out of scope; IPA text only)
- Image/audio assets for dictionary entries
- Spell-check or grammar-check functionality
- GUI dictionary editor (data is edited in JSON/JSONL source files)

## 5. Success Metrics

| Metric | Target |
|--------|--------|
| Build time for 50k entries | < 30 seconds |
| Offline lookup latency (p50) | < 5 ms |
| Offline lookup latency (p95) | < 20 ms |
| Type-ahead suggestions latency | < 10 ms |
| Package size (gzipped, 10k entries) | < 500 KB |
| Test coverage | > 80% |
| Languages supported at launch | Bengali–English |

## 6. User Stories

1. As a developer, I can run `npm run build:dict` to regenerate the dictionary package from source files.
2. As a user, I type "cucumber" and see Bengali meaning, IPA pronunciation, synonyms, antonyms, and example — all offline.
3. As a user, I type "বই" and see English headword "book", Latin romanization "boi", and synonyms — all offline.
4. As a contributor, I can add a new word to `data/words.jsonl` and rebuild without touching extension code.
5. As another AI, I can read `MEMORY.md` and `PHASES.md` to understand where the project stands and what to implement next.

## 7. Constraints

- All data must be public domain or properly licensed (CC BY-SA, MIT, public domain).
- No network access at lookup time.
- Dictionary package must be loadable in a Chrome MV3 service worker.
- Output format must match the existing `Translator extention` offline dictionary schema so both can coexist.

---

*Last updated: 2026-10-22*
