# custom-dictionary

Offline bilingual English↔Bengali dictionary package for VocabFlow.

Builds a compact columnar dataset from three public-domain sources, applies
hand-curated overrides, and ships a gzipped artifact that the extension's
service worker loads at runtime — never bundled into the content script.

## Sources

| Source | License | What it provides |
|--------|---------|-----------------|
| `bn-en-dictionary` (Wiktionary dump) | CC BY-SA 3.0 | Bengali meanings, definitions, romanizations, POS |
| `wordnet-db` (Princeton WordNet 3.0) | MIT-like permissive | Synonyms, antonyms, example sentences |
| `cmu-pronouncing-dictionary` | public domain | ARPAbet → IPA pronunciations |
| `src/dictionary/curated.json` | project | Hand-written overrides (Bangladeshi Bengali, anime/IELTS vocab) |

## Output

| File | Size | Purpose |
|------|------|---------|
| `public/dictionary.json.gz` | ~392 KB | Runtime artifact loaded by the service worker |
| `public/dictionary.json` | ~1.3 MB | Uncompressed JSON (used by tests) |

**Dataset stats (v4):**
- ~6,692 entries
- 3,657 with synonyms
- 1,184 with example sentences
- 5,259 with IPA pronunciation (78.5%)

## Dataset format

Columnar JSON — one array per field, all arrays share the same index:

```json
{
  "v": 4,
  "headwords": ["book", "water", ...],
  "bn":        ["বই",   "পানি", ...],
  "bnAlt":     ["",     "",     ...],
  "trans":     ["boi",  "pani", ...],
  "transAlt":  ["",     "",     ...],
  "def":       ["A written work...", "The clear liquid...", ...],
  "pos":       ["noun", "noun", ...],
  "syn":       ["volume\u0001text", "", ...],
  "ant":       ["", "", ...],
  "ex":        ["I read a book.", "Please drink water.", ...],
  "pron":      ["/bʊk/", "/ˈwɔːtər/", ...]
}
```

Multi-valued fields (`bnAlt`, `transAlt`, `syn`, `ant`) are joined with
`U+0001` (ASCII SOH) — a control character that cannot appear in natural text.

## Build

```bash
npm run build:dictionary
```

Outputs `public/dictionary.json.gz` and `public/dictionary.json`.

## Test

```bash
npm test
```

42 tests across 5 suites: dataset shape, lookup, suggestions, build output.

## Adding entries to the curated dictionary

Edit `../src/dictionary/curated.json` (the extension's curated file — single
source of truth for both the extension and this package):

```json
"word": {
  "bn": "বাংলা অনুবাদ",
  "def": "English definition.",
  "syn": ["synonym1", "synonym2"],
  "ant": ["antonym1"],
  "ex": "Example sentence."
}
```

Rules:
- `bn` must be everyday Bangladeshi Bengali (`পানি` not `জল`, `মা` not `মাতা`)
- Verbs in base/verbal-noun form (`শেখা` not `শিখতে`)
- No Sadhu/archaic Bengali
- `syn`/`ant` arrays override generated WordNet data entirely when non-empty

Then rebuild: `npm run build:dictionary`

## Architecture

```
scripts/
  build-dictionary.mjs   ← Entry point (ESM, runs build-dict.ts)
  build-dict.ts          ← Main orchestration pipeline
  lib/
    bengali.mjs          ← Wiktionary JSONL reader
    wordnet.mjs          ← WordNet data file parser
    pronunciation.mjs    ← CMUdict ARPAbet → IPA converter
    romanize.mjs         ← Bengali ↔ Latin transliteration
  builders/
    columnar.ts          ← Columnar JSON serialization
    relations.ts         ← Synonym/antonym inheritance logic

src/
  types.ts               ← LookupResult, DictionaryDataset, SuggestionPayload
  loader.ts              ← Fetch + gunzip + parse (browser + Node)
  indexer.ts             ← OfflineDictionary class (O(1) lookup, O(log n) prefix)
  lookup.ts              ← LookupCoordinator (English + Bengali lookup)
  suggest.ts             ← Type-ahead engine (exact > prefix > fuzzy > subsequence)
  service-worker.ts      ← Chrome message handlers for extension SW
  index.ts               ← Public API exports

tests/
  build.test.ts          ← Artifact shape, curated overrides, gzip round-trip
  dataset.test.ts        ← Live dataset coverage (pronunciation, synonyms, antonyms)
  lookup.test.ts         ← LookupCoordinator (English, Bengali, synonym, antonym)
  suggest.test.ts        ← Type-ahead (exact, prefix, typo, Bengali, latency)
  placeholder.test.ts    ← Placeholder (always passes)
```

## Adding a new language

1. Add a source loader in `scripts/lib/` (similar to `bengali.mjs`)
2. Add a language column to the dataset schema in `scripts/builders/columnar.ts`
3. Bump `DATASET_VERSION` and update the version check in `src/indexer.ts`
4. Add the new column to the build pipeline in `scripts/build-dict.ts`
5. Add tests in `tests/dataset.test.ts`
