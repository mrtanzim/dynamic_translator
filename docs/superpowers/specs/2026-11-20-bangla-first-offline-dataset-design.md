# Design Spec: Bengali-First Offline Dataset for VocabFlow

- **Date:** 2026-11-20
- **Status:** Draft — pending user review
- **Scope:** `custom-dictionary/` package + VocabFlow extension service worker / lookup coordinator
- **Related:** `custom-dictionary/{PRD,ARCHITECTURE,MEMORY,PHASES,RULES}.md`, `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md`, `CLAUDE.md`

## 1. Intent and success criteria

**Problem.** English→Bangla offline lookup is good; Bangla→English offline lookup is
weaker. The root cause is structural: the existing columnar dataset is
**English-headword-first**. A Bengali query is reverse-resolved to an English
headword and then returns that English entry's definition, **English** WordNet
synonyms/antonyms, and an almost-always-empty Bengali example field (`exBn`).
There is no Bengali-first entry with its own natural English equivalent,
Bengali definition, bilingual examples, or idiomatic rendering.

**Desired outcome.** Bengali→English offline answers become as rich and reliable
as English→Bangla ones, without any network or AI provider:

- A **language-specific Bengali dataset** lives in its own folder, parallel to
  the English-first dataset, with Bengali as the source/headword language.
- A Bengali query (Bengali script, romanized "Banglish", or a pinned `bn→en`
  language pair) returns: natural/idiomatic English equivalent, English
  synonyms and antonyms, a Bengali definition, **bilingual** examples
  (Bengali + English), romanization, pronunciation, part of speech, and a
  usage note where relevant.
- The dataset is **data-driven** (a "dictionary AI" in the sense of rich,
  structured data + smart lookup). **No ML model is trained or shipped.** It
  stays fully offline and Chrome-MV3-compatible.
- New language-specific folders can be added later using the same pattern.

**Success criteria**

1. `custom-dictionary/data/bn/` exists with curated Bengali entries and idioms.
2. `custom-dictionary/public/dictionary.bn.json.gz` builds deterministically and
   validates against a version-checked columnar schema.
3. `BanglaDictionary` resolves Bengali script, Bengali romanization, and
   tolerant Banglish spelling (e.g. `ki khobor` → "How are you?").
4. The extension's `LookupCoordinator` consumes the BN dataset for `bn-en`
   direction and emits populated `synonyms`, `antonyms`, `exampleBn`,
   `exampleEn`, `transcription`, and `englishDefinition`.
5. All existing tests stay green; new tests cover indexer, builder, and
   coordinator integration. `npm test`, `npm run typecheck`, `npm run lint`,
   `npm run build` pass in the extension; the custom-dictionary equivalents pass.
6. Docs updated; one Conventional Commit; pushed to `origin/main`.

## 2. Constraints and assumptions

- **Offline only.** No provider calls are added; no network at lookup time.
- **MV3 service worker.** Datasets are fetched from extension URLs, inflated with
  `DecompressionStream`, and indexed in memory. Nothing is bundled into the
  content script.
- **License-clean.** Source data must be public domain or compatible (CC BY-SA,
  MIT, public domain). The derived dataset inherits the existing sources'
  licenses; curated entries are project-authored.
- **Coexistence.** The existing English-first dataset and its tests remain
  untouched and functional. The BN package is additive.
- **Curated wins.** Hand-written Bengali entries override any auto-derived
  value, matching the existing curated-override rule.
- **Bengali NFC + Unicode marks.** All Bengali text is NFC-normalized; vowel
  signs are combining marks (`\p{M}`) and must never be stripped by a
  `[^a-z0-9]`-style filter.
- **Banglish is lossy.** Romanized-Bengali spellings are ambiguous, so they are
  a best-effort index only and must never override an explicit user language
  choice (existing coordinator rule).
- **Assumption confirmed with user:** "dictionary AI" means data-driven, not a
  trained model. Hybrid build (derive broad coverage + curate richness).
  English synonyms/antonyms + bilingual examples for `bn→en`. Full integration
  including commit and push to `main`.

## 3. Current-state analysis (verified against code)

- `custom-dictionary/scripts/build-dict.ts` builds an English-headword table
  from `bn-en-dictionary` (Wiktionary), `wordnet-db`, `cmu-pronouncing-dictionary`,
  and `src/dictionary/curated.json`, then serializes `DictionaryDataset` v4 to
  `public/dictionary.json` / `.json.gz`.
- Columns: `headwords`(en), `bn`, `bnAlt`, `trans`, `transAlt`, `def`, `pos`,
  `syn`, `ant`, `ex`, `exBn`, `pron`. Multi-value fields are joined with `U+0001`.
  Build currently sets `ex: ''` and `exBn: ''` for generated entries; only
  curated entries supply them. IPA coverage ~78%, syn ~3.6k, ant ~1.2k.
- `custom-dictionary/src/indexer.ts` maintains `byHeadword`, `byNormalized`,
  `byRelation`, `byBengali`, `byRoman`, and sorted arrays for suggestions.
  `normalizeBanglish()` provides tolerant Latin-script Bengali matching.
- `custom-dictionary/src/lookup.ts` `lookupBengali()` returns the English entry
  fields directly — the source of the quality gap.
- Extension `src/lookup/coordinator.ts` resolves direction from script detection
  or a pinned `bn→en` pair, calls `offlineBengaliLookup()` / `offlineLookupWithMatch()`,
  and emits a provisional `LOCAL_RESULT` before AI providers. Offline result
  ranking is lowest (`groq > openrouter > gemini > offline`).
- Extension `src/providers/offline/{loader,dataset,index}.ts` load and index the
  English-first `.json.gz` inside the service worker.
- Documentation in `custom-dictionary/` has drifted: `PHASES.md` claims all
  phases complete while `MEMORY.md` says Phase 4 in progress. This change will
  resync the status sections.

## 4. Architecture

### 4.1 Folder layout (additive)

```
custom-dictionary/
  data/
    bn/
      curated.json      # hand-authored Bengali-first entries (rich fields)
      idioms.json       # greetings/idioms -> natural idiomatic English
      README.md         # contributor guide for adding/overriding entries
  public/
    dictionary.json.gz      # unchanged English-first artifact
    dictionary.bn.json.gz   # NEW Bengali-first artifact
  scripts/
    build-dictionary.mjs        # unchanged
    build-bn-dictionary.mjs     # NEW entry point
    builders/
      bn-schema.ts              # NEW BN schema constants + columnar (de)serialize
      bn-invert.ts              # NEW derive BN entries from English-first dataset
      bn-curated.ts             # NEW merge curated + idioms overrides
    lib/ (existing readers reused)
  src/
    bn-types.ts               # NEW BengaliDataset, BengaliEntry, message types
    bn-indexer.ts             # NEW BanglaDictionary class + normalization reuse
    bn-lookup.ts              # NEW pure coordinator (Bengali -> LookupResult)
    index.ts                  # export new modules
  tests/
    bn-dataset.test.ts        # NEW schema/shape/gzip round-trip
    bn-indexer.test.ts        # NEW Bengali, roman, Banglish, suggestions
    bn-lookup.test.ts         # NEW result field mapping + idiom tests
```

### 4.2 Bengali-first columnar schema (`v: 1`)

Bengali is the headword. Every array shares one index; multi-value fields use
`U+0001`.

```ts
interface BengaliDataset {
  v: 1
  headwords: string[]  // Bengali spelling, NFC (e.g. "বই")
  roman: string[]      // primary Latin spelling ("boi")
  romanAlt: string[]   // alternative Latin spellings, SEP-joined
  en: string[]         // primary English equivalent, natural/idiomatic
  enAlt: string[]      // alternative English equivalents, SEP-joined
  defBn: string[]      // Bengali definition/explanation
  defEn: string[]      // English gloss
  pos: string[]        // part of speech
  synEn: string[]      // English synonyms, SEP-joined
  antEn: string[]      // English antonyms, SEP-joined
  exBn: string[]       // Bengali example sentence
  exEn: string[]       // English example sentence
  pron: string[]       // IPA / respelling guide
  usage: string[]      // register / literal-vs-idiomatic / common-mistake note
}
```

`v: 1` is independent of the English-first dataset version (v4); the loader
validates `v === 1` and fails fast on mismatch.

### 4.3 Build pipeline (`build-bn-dictionary.mjs`)

1. Read the existing English-first `public/dictionary.json`.
2. **Invert**: for every `(bn | bnAlts[i])` spelling produce a Bengali-headword
   entry carrying `roman[i]`, `en = headword`, `defEn = def`, `pos`, `synEn = syn`,
   `antEn = ant`, `exEn = ex`, `pron`. English equivalents shared by a Bengali
   spelling are aggregated into `enAlt`.
3. Apply `data/bn/curated.json` overrides (Bengali keyed). Curated fields win;
   absent fields fall back to the derived value.
4. Apply `data/bn/idioms.json`: greetings/idioms get a natural idiomatic English
   primary equivalent (e.g. `ki khobor` → "How are you?"), literal renderings
   moved to `enAlt`/`usage`.
5. Fill `defBn` and `exBn` from curated entries where available; leave blank
   otherwise (never fabricate Bengali prose from machine translation).
6. Serialize columnar JSON, write `public/dictionary.bn.json` and gzip to
   `public/dictionary.bn.json.gz` (level 9), print stats (entries, romanized,
   with syn/ant, with bilingual examples, with idioms).

No new npm dependencies. Reuses existing sources and the existing curated file
as the semantic source of truth for high-value words.

### 4.4 Runtime `BanglaDictionary`

Indexes over `BengaliDataset`:

| Index | Key → value | Purpose |
|-------|-------------|---------|
| `byBengali` | normalized Bengali → `BengaliEntry` | O(1) script lookup |
| `byRoman` | normalized roman + Banglish phonetic → `BengaliEntry` | O(1) romanized lookup |
| `byEnglish` | normalized English equivalent → entries | optional cross-check |
| `bengaliWords` / `romanWords` | sorted arrays | prefix + fuzzy suggestions |

Reuses `normalizeHeadword`, `normalizeBengali`, `normalizeBanglish`, `editDistance`,
and `isSubsequence` semantics from `src/indexer.ts` (exported/shared where needed,
duplicated only if export would widen the English-first API incompatibly).

`bn-lookup.ts` exposes a pure `BanglaLookupCoordinator.lookup(query): LookupResult | null`
mapping:

- `word`/`query` = user query (identity unchanged)
- `headword` = `en` (natural English equivalent)
- `englishDefinition` = `defEn`
- `bengaliMeaning` = `defBn || headwords[i]` (the Bengali word itself)
- `synonyms` = `synEn`, `antonyms` = `antEn`
- `exampleEn` = `exEn`, `exampleBn` = `exBn`
- `transcription` = `roman`, `pronunciation` = `pron`
- `partOfSpeech` = `pos`, `source = 'offline'`
- `usage` surfaced via the existing `usageNote` field on the extension's
  `LookupResult` type (confirmed present in `src/shared/types.ts`).

### 4.5 Extension integration

- `src/providers/offline/loader.ts` gains a memoized loader for
  `dictionary.bn.json.gz` mirroring the existing loader (fetch extension URL →
  `DecompressionStream` → version check → index).
- `src/providers/bridge.ts`: extend `OfflineLookupRequest` with an optional
  `direction?: LookupDirection`. No new message type is needed. The existing
  `VOCABFLOW_OFFLINE_LOOKUP` handler in the service worker resolves from the BN
  index when `direction === 'bn-en'` (or `isBengali` is true), then falls back to
  the existing reverse path. The optional field is required because a pinned
  `bn→en` choice with a Latin-script Banglish query has `isBengali === false`.
- `src/lookup/coordinator.ts`: for `direction === 'bn-en'`, request the BN-backed
  offline result first. It remains **provisional** and keeps the existing
  ranking (`offline` last) and stale-response guard. `requestId`/`query`/`headword`
  identities are preserved.
- Suggestions (`VOCABFLOW_SUGGEST`) for Bengali/Banglish input come from the BN
  index; English suggestions stay unchanged.
- Failure isolation is unchanged: a missing/broken BN dataset is best-effort and
  must never break AI lookups or the English-first path.

### 4.6 Error handling

- Loader throws a descriptive error on version mismatch or corrupt/short column
  arrays; the service worker catches it and returns `{ ok: false, error }`.
- Missing `data/bn/` files are fatal at build time with a clear message; corrupt
  curated JSON lines are skipped with a warning (matches existing RULES.md).
- No `any`; no `console.log` in runtime source; named exports only.

## 5. Testing strategy

- **BN dataset test** — column lengths equal, `v === 1`, curated overrides win,
  gzip round-trip decompresses to the same JSON.
- **BN indexer test** — Bengali script lookup, romanized lookup, Banglish fuzzy
  (`ki khobor`/`kikhobor`), missing word → null, NFC equivalent of YYA resolves,
  prefix/fuzzy suggestions, English synonym/antonym fields populated.
- **BN lookup test** — idiom returns idiomatic English primary answer; literal
  rendering in `enAlt`/`usage`; full field mapping from §4.4.
- **Coordinator integration test** — a Bengali query emits `LOCAL_RESULT` whose
  `synonyms`, `antonyms`, `exampleBn`, `exampleEn`, `transcription` come from the
  BN dataset; English-first lookup unaffected; one history row per search.
- **Regression** — full existing extension suite (181 passing / 3 skipped) and
  custom-dictionary suite must remain green.

## 6. Documentation and delivery

- Update `custom-dictionary/PRD.md`, `ARCHITECTURE.md`, `MEMORY.md`, `PHASES.md`,
  `README.md` (and `RULES.md` only if a new rule is introduced). Resync stale
  phase status.
- Update extension `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md`.
- Verify before claiming success: extension `npm test`, `npm run typecheck`,
  `npm run lint`, `npm run build`; custom-dictionary `npm test`, `npm run lint`,
  `npm run typecheck`, build of both datasets.
- Single Conventional Commit (scope `feat(offline)` or `feat(dictionary)`) with a
  body explaining why and a test plan.
- Push to `origin/main` (explicitly requested). If authentication is required,
  report it rather than embedding any credential.

## 7. Out of scope

- Real-time sentence translation, speech/audio assets, GUI dictionary editor.
- Other language pairs (Hindi, etc.) — the folder pattern is established but no
  dataset is built now.
- Changing provider ranking, provider APIs, API keys, or the overlay UI layout.
- Any ML training or network-dependent lookup.
