# Design Spec: Japanese–English Offline Dictionary

- **Date:** 2026-11-20
- **Status:** Draft — pending user review
- **Scope:** new Japanese dataset + builder + runtime, direction/language-picker integration, generalized AI prompt, UI rendering, tests/docs, push to main
- **Related:** `ARCHITECTURE.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`, `docs/superpowers/specs/2026-11-20-bangla-first-offline-dataset-design.md`

## 1. Intent and success criteria

**Problem.** VocabFlow only supports English⇄Bengali. The user wants a Japanese dictionary built the same way as the Bengali one, in both directions, fully offline, with the same rich fields.

**Desired outcome.**
- A **Japanese dataset** built from a licensed JMdict subset, shipped gzipped and loaded in the MV3 service worker — no runtime network.
- Japanese→English and English→Japanese lookup through the overlay, with kana, romaji, English meanings, synonyms/antonyms, examples and the eight AI-style fields.
- The AI provider path also works for Japanese, returning kana/romaji and natural English equivalents.
- Existing Bengali/English behavior is unchanged.

**Success criteria**
1. `scripts/data/jmdict-common-subset.json` committed with EDRDG/Jim Breen attribution; build is deterministic and offline.
2. `public/dictionary.ja.json.gz` built (schema v1) and loaded by the service worker.
3. A Japanese query (kanji, kana or romaji) resolves to an English result; an English query resolves to a Japanese result via the reverse index.
4. Language picker offers functional `日本語 ⇄ English`; `LookupDirection` includes `ja-en` and `en-ja`.
5. AI prompt is direction-aware and returns kana/romaji for Japanese.
6. All existing tests stay green; new tests cover dataset, builder, runtime, direction routing, prompt and UI.
7. Docs updated; Conventional Commit(s); push to `origin/main`.

## 2. Constraints and assumptions

- **Build-time only.** Source data is committed; nothing fetched at runtime.
- **License.** JMdict/JMnedict are property of EDRDG, used in conformance with the EDRDG license; derived files carry the same license and attribution (Jim Breen, started 1991). Source: `scriptin/jmdict-simplified` common English release 3.6.2+20261116213322 (1.38 MB tgz, 22,661 entries). Trim to ~8,000–10,000 entries.
- **MV3 service worker.** Dataset fetched via `chrome.runtime.getURL`, inflated with `DecompressionStream`, indexed in memory. Never bundled into the content script.
- **Versioning.** Japanese dataset v1; loader fails fast on mismatch. Other dataset versions unchanged (English v5, Bengali v2).
- **Columnar format** unchanged: all arrays equal length, multi-value fields joined with `U+0001`.
- **Bengali/English unchanged.** New direction codes are additive; existing routing must still pass its tests.
- **No new runtime dependencies.** Romaji generated at build time by a static kana table.
- **DESIGN.md is the UI source of truth:** dark glass, accent `#65CFFF`, muted secondary text, reduced motion respected.

## 3. Source data structure (verified)

`jmdict-eng-common-3.6.2.json` is an object with `words[]` (22,661 entries). Each entry:
- `id`, `kanji[]` (`{common, text, tags}`), `kana[]` (`{common, text, tags, appliesToKanji}`),
- `sense[]` with `partOfSpeech[]` (e.g. `n`, `v5r`, `adj-i`), `gloss[]` (`{lang:'eng', text}`),
  `antonym`, `related`, `field`, `misc`, `info`, `dialect`.
Antonyms and related terms are available directly — no WordNet needed for Japanese.

## 4. Architecture

### 4.1 Data folder and artifact
```
scripts/data/jmdict-common-subset.json      # trimmed, attributed source
public/dictionary.ja.json.gz                 # runtime artifact
scripts/build-japanese-dictionary.mjs        # builder
```

### 4.2 Japanese dataset schema (version 1)
| Column | Meaning |
|--------|---------|
| `headwords` | Japanese surface form (preferred common kanji, else kana) |
| `kana` | Reading in katakana or hiragana |
| `romaji` | Latin spelling generated from kana |
| `en` | Primary English gloss |
| `enAlt` | Other English glosses, `U+0001`-joined |
| `pos` | Human-readable part of speech |
| `synEn` | English synonyms from `related`, `U+0001`-joined |
| `antEn` | English antonyms, `U+0001`-joined |
| `exampleJa` / `exampleEn` | Curated/derived bilingual examples |
| plus the eight enriched fields from the AI-fields work | same encoding as v2/v5 |

`JA_DATASET_VERSION = 1`.

### 4.3 Build pipeline
`scripts/build-japanese-dictionary.mjs`:
1. Read the committed subset; keep entries with at least one common kana or kanji and an English gloss; cap at 10,000 entries.
2. For each entry: choose `headwords` (common kanji, else common kana, else first kana), `kana` (common kana), `romaji` via a static kana→romaji table, `en`/`enAlt` from glosses, `pos` from the first sense, `synEn`/`antEn` from `related`/`antonym` (mapped to English glosses where possible, else dropped).
3. Apply the same `enrichEntry` generator from `scripts/lib/enrichment.mjs` for the eight rich fields, with curated overrides from `scripts/data/ja-overrides.json`.
4. Build the reverse English index at runtime, not in the artifact.
5. Write `public/dictionary.ja.json.gz` (level 9) + a JSON copy for tests.

### 4.4 Runtime
`src/providers/offline/ja-dataset.ts` and `ja-loader.ts`:
- Indexes: `byJapanese` (surface + kana + romaji → entry), `byEnglish` (English gloss → entries), sorted keys for prefix/fuzzy suggestions.
- Script detection: Hiragana `3040–309F`, Katakana `30A0–30FF`, Kanji `4E00–9FFF` (plus iteration marks); romaji is Latin script but resolves via the romaji index.
- Two new bridge message types, `VOCABFLOW_JA_LOOKUP` and `VOCABFLOW_JA_SUGGEST`, added in `src/providers/bridge.ts` alongside the existing ones.
- Best-effort loading: a missing/broken JA dataset never breaks English or Bengali lookup.

### 4.5 Direction and language picker
- `LookupDirection` gains `'ja-en' | 'en-ja'`.
- `isSupportedPair()` accepts `ja→en` and `en→ja`; `POPULAR_LANGUAGES` already contains `ja` ("Japanese") — update the label to `日本語 / Japanese` if useful.
- `LanguagesView` shows Japanese as functional instead of "Preview only".
- Coordinator: detect Japanese script or a pinned `ja→en` pair → use the JA path; English query with pinned `en→ja` → use the JA reverse index.

### 4.6 AI prompt generalization
- Replace `buildUserPrompt(query, isBengaliInput)` with `buildUserPrompt(query, direction)`.
- Add explicit `kana` and `romaji` fields to `LookupResult` and to the AI JSON schema; `parseAiJson` reads them. For `ja-en`, `englishHeadword` carries the natural English equivalent and `exampleJa` carries the Japanese example. Keep existing Bengali behavior verbatim.

### 4.7 UI
- Render kana and romaji in the existing transcription slot with labels appropriate to the direction.
- Ensure a CJK font fallback (`"Noto Sans JP", "Noto Sans Bengali", system-ui`) in `styles.ts`.
- Reuse existing synonym/antonym/example/rich-field cards. No layout rewrite.

## 5. Testing strategy

- Dataset test: version 1, equal column lengths, ≥8,000 entries, romaji/kana present, gzip round-trip.
- Builder test: deterministic output, curated override wins, English reverse fields present.
- Runtime test: Japanese script lookup, kana lookup, romaji lookup, English→Japanese reverse lookup, missing word, wrong version.
- Direction tests: `isSupportedPair` for both Japanese pairs; coordinator routes Japanese queries to the JA dataset; English/Bengali routing unchanged.
- Prompt tests: Japanese direction includes kana/romaji instructions; parseAiJson reads them.
- UI test: a Japanese result renders kana/romaji and the existing rich cards.
- Full existing suites green.

## 6. Documentation and delivery

- Update `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md` and the package docs; document the JMdict license/attribution prominently.
- Verify: extension `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; custom-dictionary equivalents.
- Commit with Conventional Commits and push to `origin/main`. No credentials embedded.

## 7. Out of scope

- Full Japanese sentence translation, inflection parsing beyond the dictionary's surface forms, kanji-only reading disambiguation from context, audio, other language pairs.
