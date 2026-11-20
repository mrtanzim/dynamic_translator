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
npm run build:bn-dictionary
```

`build:dictionary` outputs the English-first `public/dictionary.json(.gz)`.
`build:bn-dictionary` outputs the Bengali-first `public/dictionary.bn.json(.gz)`
and also copies the gzip artifact into the extension's `public/` folder.

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

## Bengali-first dataset

`data/bn/` holds the Bengali-first sources. A Bengali query is **not** answered by
reverse-resolving an English entry any more — the `bn→en` direction uses a
dedicated v1 columnar dataset where Bengali is the headword:

| Field | Meaning |
|-------|---------|
| `headwords` / `roman` / `romanAlt` | Bengali spelling and its Latin forms |
| `en` / `enAlt` | Natural English equivalent; literal renderings in `enAlt` |
| `defBn` / `defEn` | Bengali definition and English gloss |
| `synEn` / `antEn` | English synonyms and antonyms |
| `exBn` / `exEn` | Bengali and English example sentences |
| `pron` / `usage` | IPA and register/idiom note |

The build inverts the English-first dataset for coverage, then applies
`curated.json` and `idioms.json` (hand-written values always win). Greetings and
idioms get the **natural idiomatic English** primary answer — `কি খবর` →
"How are you?", with "What is the news?" kept only as an alternative. See
[`data/bn/README.md`](data/bn/README.md) for the contribution rules.

Dataset stats: ~8,776 entries, ~5,089 with English synonyms, ~1,979 with English
antonyms, ~515 with bilingual examples.

## Architecture

```
scripts/
  build-bn-dictionary.mjs  (Bengali-first artifact builder)
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

The Bengali-first runtime files (`src/bn-types.ts`, `src/bn-indexer.ts`,
`src/bn-lookup.ts`) live alongside the English-first ones; the extension mirrors
the indexer under `src/providers/offline/bn-dataset.ts`.

## Japanese dataset

A separate Japanese–English dataset (`public/dictionary.ja.json.gz`, schema v1)
is built from the committed JMdict subset in `scripts/data/`. **Attribution:**
JMdict is property of EDRDG, used under the EDRDG license; project started 1991
by Jim Breen. See `scripts/data/ja-source.md`. Run `npm run build:japanese-dictionary`
from the repository root.

## AI-style fields offline

Both datasets now carry the eight fields the AI providers emit: band level,
collocations, word family, common mistake, formal/conversational meanings and
formal/conversational examples. They are generated at build time by
`../../scripts/lib/enrichment.mjs` from WordNet data and the hand-authored
IELTS band list `../../scripts/data/cefr-bands.json` (attribution: "not an
official Cambridge score"). Curated overrides in `src/dictionary/curated.json`
and `data/bn/*.json` always win. No runtime network call, no ML model. Some
fields may be empty for rare words — they are best-effort, not fabricated.

Artifact versions: English-first `v5`, Bengali-first `v2`.

## Adding a new language

1. Add a source loader in `scripts/lib/` (similar to `bengali.mjs`)
2. Add a language column to the dataset schema in `scripts/builders/columnar.ts`
3. Bump `DATASET_VERSION` and update the version check in `src/indexer.ts`
4. Add the new column to the build pipeline in `scripts/build-dict.ts`
5. Add tests in `tests/dataset.test.ts`
