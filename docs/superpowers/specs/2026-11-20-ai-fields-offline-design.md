# Design Spec: AI-Style Fields From the Offline Dictionary

- **Date:** 2026-11-20
- **Status:** Draft — pending user review
- **Scope:** both offline datasets (English-first and Bengali-first), their builders and runtimes, the lookup coordinator, and three small result-card additions
- **Related:** `docs/superpowers/specs/2026-11-20-bangla-first-offline-dataset-design.md`, `ARCHITECTURE.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`, `custom-dictionary/*.md`

## 1. Intent and success criteria

**Problem.** The AI providers return a rich `LookupResult` (IELTS band level, collocations, word family, common mistake, formal/conversational meanings and examples). The offline datasets only carry headword, meaning, definition, POS, synonyms, antonyms, one example, IPA and romanization. The user's explicit goal: **everything the AI returns must also be available offline** — that is why the custom dictionary was built.

**Desired outcome.**
- Every field the AI can emit is populated by both offline datasets for both lookup directions, using build-time data generation with curated overrides winning.
- Offline results carry the fields through the service worker, bridge and coordinator into the existing result card.
- No runtime network calls, no ML model, no new runtime dependencies.

**Success criteria**
1. English-first dataset is version **5**, Bengali-first dataset is version **2**, each with eight new columns.
2. A shared build-time enricher generates all eight fields; curated values always win.
3. A small licensed CEFR/IELTS band list is committed with attribution; band level does not rely on a runtime network call.
4. Both runtime paths map every new field into `LookupResult`; the 171+ existing tests stay green and new tests cover schema, enricher, builders, runtimes and coordinator.
5. `formalMeaning`, `conversationalMeaning` and `usageNote` are rendered in the result card; the other fields already have cards.
6. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass in the extension; custom-dictionary equivalents pass; commit and push to `main`.

## 2. Constraints and assumptions

- **Build-time only.** New data sources are read when building datasets; nothing is fetched at lookup time.
- **Version bumps are mandatory.** Adding columns requires v4→v5 (English-first) and v1→v2 (Bengali-first). Loaders fail fast on mismatch.
- **Curated wins.** Hand-written entries override generated values, consistent with existing rules.
- **Best-effort, not fabricated.** Where no evidence exists, a field may be empty (`commonMistake` especially). Never invent a Bengali example by machine translation. Never claim a band level from an unattributed source.
- **Columnar format unchanged.** All arrays share one index; multi-valued fields use `U+0001`.
- **Bengali normalization unchanged.** NFC; vowel signs are `\p{M}` combining marks.
- **Ranking unchanged.** Offline remains provisional and lowest priority (`groq > openrouter > gemini > offline`); AI still wins when present.
- **DESIGN.md is the UI source of truth:** dark glass, accent `#65CFFF`, muted secondary text, reduced motion respected, no neon/glow.
- **User decisions:** both directions; best-effort values for all entries; a licensed build-time word list is allowed.

## 3. Current state (verified)

- `scripts/build-dictionary.mjs` builds the English-first dataset: `FORMAT_VERSION = 4`, columns `headwords, bn, bnAlt, trans, transAlt, def, pos, syn, ant, ex, exBn, pron`. Outputs `src/dictionary/generated.json` and `public/dictionary.json.gz`. Reads `scripts/lib/{bengali,wordnet,pronunciation}.mjs` and `src/dictionary/curated.json`.
- `custom-dictionary/scripts/build-dict.ts` builds a parallel English-first dataset (v4) into `custom-dictionary/public/dictionary.json(.gz)`; `scripts/build-bn-dictionary.mjs` inverts it into the Bengali-first v1 dataset.
- Runtime `src/providers/offline/dataset.ts` has `DATASET_VERSION = 4`, validates columns, indexes entries. `src/providers/offline/bn-dataset.ts` has `BN_DATASET_VERSION = 1`.
- `src/shared/types.ts` `LookupResult` **already** declares all target fields: `formalMeaning`, `conversationalMeaning`, `usageNote`, `collocations`, `bandLevel`, `wordFamily`, `commonMistake`, `exampleFormal`, `exampleConversational` — the AI path populates them via `parseAiJson`/`toResult` (`src/providers/common.ts`).
- `src/ui/Overlay.tsx` already renders `bandLevel` (line ~775), `collocations` (~846), `exampleEn/Bn/Conversational/Formal` (~866), `wordFamily` (~892), `commonMistake` (~933). It does **not** render `formalMeaning`, `conversationalMeaning` or `usageNote`.
- `scripts/lib/wordnet.mjs` parses WordNet synsets, glosses, examples and antonym pointers; `senses` maps lemma → `{pos, offset}[]`, which is enough to verify derived word-family candidates.

## 4. Architecture

### 4.1 New columns (both datasets)

| Column | Type | Encoding | Source |
|--------|------|----------|--------|
| `formalMeaning` | string | plain | curated, else `def` |
| `conversationalMeaning` | string | plain | curated, else `def` |
| `exampleFormal` | string | plain | curated, else `ex` |
| `exampleConversational` | string | plain | curated, else `ex` |
| `collocations` | string | `U+0001`-joined | curated, else extracted from WordNet examples |
| `wordFamily` | string | `noun\|verb\|adj\|adv` encoded as `noun:...\u0001verb:...` | derivation rules verified against WordNet senses |
| `bandLevel` | string | e.g. `"6.5"` | licensed CEFR list lookup, else length/frequency heuristic |
| `commonMistake` | string | plain | curated, else conservative preposition pattern from collocations, else `''` |

`wordFamily` encoding: each present slot is `role:value`, joined with `U+0001` (e.g. `noun:reluctance\u0001adv:reluctantly`). The decoder splits on `U+0001` then on the first `:`.

### 4.2 Shared enricher — `scripts/lib/enrichment.mjs`

Pure build-time module, no browser APIs, named exports only:

- `loadBandList(path)` — reads a committed JSON map `{ word: band }`, returns `Map<string,string>`.
- `deriveWordFamily(word, pos, senses)` — applies suffix rules (`-ant→-ance/-ently`, `-ent→-ence/-ently`, `-ive→-ivity/-ively`, `-al→-ality/-ally`, `-tion→-ate`, `-ize→-ization`, `+ly`), keeps only candidates present in `senses` with the target POS; returns `{noun?, verb?, adj?, adv?}`.
- `deriveCollocations(word, examples)` — extracts 2–4 word phrases containing the headword from WordNet examples, filters stop words, dedupes, caps at 5.
- `estimateBand(word, list, senses)` — exact lookup in the licensed list; else band by Number.of senses / word length heuristic (`"5.5"`…`"8.0"`).
- `deriveCommonMistake(collocations)` — only when a collocation shows a `to`/`of`/`for` pattern, emits a short "Followed by '...', not '...'" note; otherwise `''`.
- `enrichEntry(entry, { word, pos, examples, senses, bandList, overrides })` — returns the eight fields, with overrides applied last (curated wins).

`overrides` come from a new `scripts/data/enrichment-overrides.json` (English headword keyed) and the existing `src/dictionary/curated.json` (extended with the new optional fields). Bengali idioms in `custom-dictionary/data/bn/idioms.json` may set the same fields directly.

### 4.3 Licensed band list

Commit `scripts/data/cefr-bands.json`: a compact map of common IELTS/CEFR words to band strings, sourced from a public-domain/CC list and attributed in `README.md` and `TASKS.md`. No runtime dependency. If the source cannot be verified as licensed, ship only the hand-authored subset and state that in docs (YAGNI over a dubious download).

### 4.4 Builders

- `scripts/build-dictionary.mjs` → `FORMAT_VERSION = 5`; calls `enrichEntry` per headword; adds eight columns.
- `custom-dictionary/scripts/build-dict.ts` → v5, same eight columns, using its own WordNet reader; output feeds the BN builder.
- `custom-dictionary/scripts/build-bn-dictionary.mjs` → v2; when inverting an English entry, copies all eight enriched fields onto each Bengali headword; then applies `curated.json`/`idioms.json` overrides (Bengali values win).
- Column counts and `BN_DATASET_VERSION`/`FORMAT_VERSION` checks updated in all builders.

### 4.5 Runtime and mapping

- `src/providers/offline/dataset.ts`: `DATASET_VERSION = 5`; `DictionaryEntry`/`DictionaryDataset` gain the eight fields; index validation updated; `OfflineEntryPayload` (bridge) gains the eight fields as optional.
- `src/providers/offline/bn-dataset.ts`: `BN_DATASET_VERSION = 2`; same eight fields; `toOfflineEntryPayload()` maps them all.
- `src/providers/bridge.ts`: extend `OfflineEntryPayload` with the eight optional fields.
- `src/lookup/coordinator.ts`: the English-first provisional result and the BN provisional result both copy all eight fields into `LookupResult`.
- `custom-dictionary/src/{types,bn-types}.ts`, `indexer.ts`, `bn-indexer.ts`, `lookup.ts`, `bn-lookup.ts`: mirror the new fields so the package stays the source of truth for both dataset formats.

### 4.6 UI

In `src/ui/Overlay.tsx`, add three compact blocks in the result body, using existing classes where possible (`card`, `card-label`) and DESIGN.md tokens:
- Formal meaning → conversational meaning (two labelled lines), shown when present and different from `englishDefinition`.
- Usage note (muted small text).
Follow the existing `settings.show*` toggle pattern; add defaults `true` to `src/storage/app-settings.ts`.

## 5. Testing strategy

- Schema tests for both datasets: column lengths, version checks, `wordFamily` encode/decode round-trip.
- Enricher tests: derivation of noun/verb/adj/adv forms, collocation extraction from a sample sentence, band lookup vs heuristic, mistake pattern, curated override precedence.
- Builder tests: v5/v2 output shape; generated fields present; curated fields win; gzip round-trip.
- Runtime tests: English-first and BN entries carry all eight fields after indexing; `toOfflineEntryPayload` maps them.
- Coordinator tests: an offline-only lookup emits a `LOCAL_RESULT` whose `collocations`, `bandLevel`, `wordFamily`, `commonMistake`, `formalMeaning`, `conversationalMeaning`, `exampleFormal`, `exampleConversational` are populated.
- UI test: renders the three new blocks when fields are present, nothing when absent.
- Full existing suites stay green.

## 6. Documentation and delivery

- Update `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md`, both packages' README/PRD/ARCHITECTURE/MEMORY/PHASES; document the band-list source and its license.
- Verify: extension `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; custom-dictionary equivalents and both dataset builds.
- Single Conventional Commit (or a small series), then push to `origin/main`. No credentials embedded.

## 7. Out of scope

- Real-time sentence translation, speech/audio assets, GUI dictionary editor.
- Training or shipping an ML model.
- Changing provider ranking or provider request shapes.
- Guaranteeing AI-quality prose for every one of the ~8,700 words — fields are best-effort from licensed/curated data.
