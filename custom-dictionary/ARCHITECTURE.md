# ARCHITECTURE.md — Custom Dictionary Package System

## 1. Folder Layout

```
custom-dictionary/
├── PRD.md
├── ARCHITECTURE.md
├── RULES.md
├── PHASES.md
├── DESIGN.md
├── MEMORY.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── oxlint.config.json
├── src/
│   ├── index.ts                 # Public API entry point
│   ├── loader.ts                # Gzip fetch + DecompressionStream + JSON parse
│   ├── indexer.ts               # Builds in-memory indexes from columnar dataset
│   ├── lookup.ts                # Headword, Bengali, synonym, antonym resolution
│   ├── suggest.ts               # Prefix + fuzzy type-ahead
│   ├── romanize.ts              # Bengali<->Latin script conversion
│   ├── ipa.ts                   # ARPAbet -> IPA conversion
│   ├── types.ts                 # Shared TypeScript interfaces
│   └── builders/
│       ├── build-dict.ts        # Main build script
│       ├── normalize.ts         # Unicode NFC normalization, script stripping
│       ├── columnar.ts          # Columnar JSON serialization
│       └── relations.ts         # Synonym/antonym inheritance from WordNet
├── scripts/
│   ├── build-dictionary.mjs     # Entry point invoked by npm script
│   └── lib/
│       ├── bengali.mjs          # Bengali dictionary reader (Wiktionary JSONL)
│       ├── wordnet.mjs          # WordNet reader (synonyms, antonyms, examples)
│       ├── pronunciation.mjs    # CMUdict ARPAbet -> IPA
│       └── romanize.mjs         # Bengali transliteration table
├── data/
│   ├── words.jsonl              # Source word entries (one JSON per line)
│   ├── bn-meanings.jsonl        # Bengali meaning source
│   ├── curated.json             # Hand-curated overrides (wins over generated)
│   └── sources/                 # Raw source downloads (gitignored)
├── tests/
│   ├── lookup.test.ts
│   ├── suggest.test.ts
│   ├── build.test.ts
│   └── dataset.test.ts
├── public/
│   └── dictionary.json.gz       # Built runtime artifact (gitignored or versioned)
└── dist/                        # Built output (gitignored)
```

## 2. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Language | TypeScript (strict) | Type safety, shared with existing extension |
| Build | Node.js ESM + esbuild/tsc | Fast, no browser bundler needed for CLI |
| Test | Vitest + jsdom | Matches existing extension setup |
| Lint | oxlint | Zero-config, fast |
| Compression | Node zlib gzip (level 9) | Small package size |
| Decompression | `DecompressionStream` (service worker compatible) | Native in Chrome MV3 |
| Data format | Columnar JSON (array per field) | Compact, fast indexing |
| Package delivery | `.json.gz` | ~3x smaller than raw JSON |

## 3. Data Model (Columnar)

```ts
interface DictionaryDataset {
  v: number;              // Format version (currently 4)
  headwords: string[];    // Sorted English headwords
  bn: string[];           // Primary Bengali meaning per headword
  bnAlt: string[];        // All other Bengali meanings, U+0001-joined
  trans: string[];        // Romanization of primary meaning
  transAlt: string[];     // Romanization of each alternative, U+0001-joined
  def: string[];          // English definition
  pos: string[];          // Part of speech (human readable)
  syn: string[];          // Synonyms, U+0001-joined
  ant: string[];          // Antonyms, U+0001-joined
  ex: string[];           // Example sentence (English)
  exBn: string[];         // Example sentence (Bengali) — optional, may be empty
  pron: string[];         // IPA pronunciation guide
}
```

Every array has the same length and shares the same index space. `headwords` is sorted alphabetically for binary-search prefix lookups.

## 4. Runtime Architecture (Service Worker Compatible)

```
Content Script (overlay)
    │ chrome.runtime.sendMessage (VOCABFLOW_DICT_LOOKUP)
    ▼
Service Worker
    │ loadOfflineDictionary() — fetches public/dictionary.json.gz once,
    │   decompresses via DecompressionStream, builds indexes, memoizes
    ▼
OfflineDictionary (in-memory index)
    ├─ byHeadword: Map<string, DictionaryEntry>
    ├─ byNormalized: Map<string, DictionaryEntry>  (lowercased keys)
    ├─ byBengali: Map<string, Array<{headword, roman, bengali}>>
    ├─ byRelation: Map<string, string>             (synonym/antonym → headword)
    ├─ englishWords: string[]                      (sorted, for prefix)
    └─ bengaliWords: string[]                      (sorted, for prefix)
    ▼
LookupResult { word, query, headword?, bengaliMeaning, englishDefinition,
               transcription?, pronunciation?, synonyms[], antonyms[],
               exampleEn?, exampleBn?, partOfSpeech?, source, requestId, timestamp }
```

## 5. Build Pipeline

```
Source files (data/words.jsonl, data/bn-meanings.jsonl, data/curated.json)
    │
    ▼
scripts/build-dictionary.mjs
    ├─ Read & normalize each source (NFC, strip punctuation, lowercase)
    ├─ Load WordNet synsets/antonyms/examples per part-of-speech
    ├─ Match each headword to its best WordNet synset (definition overlap)
    ├─ Load CMUdict ARPAbet → convert to IPA
    ├─ Apply Bengali transliteration table (Latin ↔ Bengali script)
    ├─ Apply curated.json overrides (hand-written entries win)
    ├─ Serialize to columnar JSON
    ├─ Gzip to public/dictionary.json.gz
    └─ Emit build stats (entry count, coverage %)
```

## 6. Indexing Strategy (O(1) / O(log n))

| Operation | Structure | Complexity |
|-----------|-----------|------------|
| Headword lookup | `byHeadword` Map | O(1) |
| Normalized headword lookup | `byNormalized` Map | O(1) |
| Bengali → headword | `byBengali` Map of arrays | O(1) |
| Synonym/antonym → headword | `byRelation` Map | O(1) |
| Prefix suggestions | `englishWords` / `bengaliWords` sorted arrays + binary search | O(log n) |
| Fuzzy/typo suggestions | Bounded edit-distance scan over sorted array | O(n·L) worst, capped |

## 7. Message Contract (Chrome MV3)

```ts
export const DICT_LOOKUP_MESSAGE = 'VOCABFLOW_DICT_LOOKUP';
export const DICT_SUGGEST_MESSAGE = 'VOCABFLOW_DICT_SUGGEST';

interface DictLookupRequest {
  type: typeof DICT_LOOKUP_MESSAGE;
  query: string;
  isBengali: boolean;
  packageId?: string;   // which dictionary package to use
}

interface DictLookupResponse {
  ok: true; result: LookupResult } | { ok: false; error: string };

interface DictSuggestRequest {
  type: typeof DICT_SUGGEST_MESSAGE;
  query: string;
  limit?: number;
}

interface DictSuggestResponse {
  ok: true; suggestions: SuggestionPayload[] } | { ok: false; error: string };
```

## 8. Versioning & Compatibility

- `DATASET_VERSION` bumped whenever columnar layout changes.
- Runtime loader throws if `dataset.v !== DATASET_VERSION`.
- Old extensions loading new packages, or new extensions loading old packages, will fail fast instead of silently returning wrong data.

---

## 9. Bengali-first dataset package (added 2026-11-20)

### Folder and artifact
```
data/bn/
  curated.json      # hand-authored Bengali-first entries (rich fields)
  idioms.json       # greetings/idioms -> natural idiomatic English
  README.md         # contributor guide
public/
  dictionary.bn.json      # uncompressed (tests)
  dictionary.bn.json.gz   # runtime artifact (also copied to extension public/)
```

### Schema (version 1)
Bengali is the headword. Multi-valued columns use `U+0001`. Columns:
`headwords`(bn), `roman`, `romanAlt`, `en`, `enAlt`, `defBn`, `defEn`, `pos`,
`synEn`, `antEn`, `exBn`, `exEn`, `pron`, `usage`. `BN_DATASET_VERSION = 1` is
independent of the English-first dataset's v4; the loader fails fast on a
mismatch.

### Build pipeline
`scripts/build-bn-dictionary.mjs` reads `public/dictionary.json`, inverts every
Bengali spelling into a Bengali-headword entry (aggregating English equivalents,
WordNet syn/ant, examples and IPA), then merges `curated.json` and `idioms.json`
overrides (hand-written values win). Outputs JSON + level-9 gzip to both this
package's `public/` and the extension's `public/`.

### Runtime
`src/bn-indexer.ts` builds `byBengali`, `byRoman` (romanized + tolerant Banglish)
and sorted Bengali keys for prefix/fuzzy suggestions. `src/bn-lookup.ts` maps an
entry to the shared `LookupResult` (English synonyms/antonyms, bilingual
examples, romanization, `usageNote`). The extension carries a mirrored runtime
in `src/providers/offline/bn-dataset.ts` plus `bn-loader.ts` so Vite/tsc never
reach outside its build root; both share the v1 columnar contract.

### Message flow
`VOCABFLOW_OFFLINE_LOOKUP` gains an optional `direction`. The worker selects the
BN index for `bn-en` (or Bengali script), otherwise the English-first index.
`VOCABFLOW_SUGGEST` uses the BN index for Bengali input. A missing/broken BN
dataset is best-effort: the English-first path and AI providers are unaffected.

---

*Last updated: 2026-11-20*

## 10. Enriched dataset schemas

- English-first `scripts/builders/columnar.ts`: `DATASET_VERSION = 5`.
- Bengali-first `src/bn-types.ts`: `BN_DATASET_VERSION = 2`.
- Both add eight columns: `formalMeaning`, `conversationalMeaning`,
  `exampleFormal`, `exampleConversational`, `collocations` (U+0001-joined),
  `wordFamily` (`role:value` pairs joined with U+0001), `bandLevel`,
  `commonMistake`.
- `scripts/lib/enrichment.mjs` is imported by the root builder and
  `scripts/build-dict.ts`; it reads `scripts/data/cefr-bands.json` and
  `scripts/data/enrichment-overrides.json`. It normalizes both WordNet sense
  shapes (array of `{pos}` and `Map<pos, …>`).
- `bn-schema.ts`, `bn-invert.ts`, `bn-indexer.ts` and `bn-lookup.ts` carry the
  fields through; the extension mirrors them in
  `src/providers/offline/{dataset,bn-dataset}.ts` and `coordinator.ts`.
