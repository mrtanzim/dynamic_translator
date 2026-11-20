# Bengali-First Offline Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a language-specific Bengali-first offline dataset and wire it into VocabFlow's `bn→en` lookup so Bengali queries return English synonyms/antonyms, bilingual examples, romanization, and idiomatic English equivalents — fully offline.

**Architecture:** Derive a Bengali-headword columnar dataset from the existing English-first dataset, enrich it with curated Bengali entries and idioms, build a gzip artifact, then load/index it in the MV3 service worker. The coordinator selects the BN path for `bn→en` direction and keeps the existing provisional-result/ranking/stale-guard semantics.

**Tech Stack:** TypeScript strict, Node ESM build scripts (`tsx`), Vitest, zlib gzip, `DecompressionStream`, Chrome MV3 messaging, React/Shadow DOM UI (unchanged).

**Spec:** `docs/superpowers/specs/2026-11-20-bangla-first-offline-dataset-design.md`

## Global Constraints

- Bengali dataset version is exactly `1` (`BN_DATASET_VERSION = 1`). English-first dataset stays v4.
- Multi-valued columns joined with `U+0001` (`BN_SEP`). Every column has the same length.
- Bengali text is NFC-normalized; vowel signs are `\p{M}` combining marks and must never be stripped.
- No new npm dependencies. No ML model. No network at lookup time.
- No `any`; named exports only; no `console.log` in runtime source.
- Curated and idiom overrides always win over derived data.
- Existing 181 passing / 3 skipped extension tests and the custom-dictionary suite must stay green.
- Commit with Conventional Commits; final push to `origin/main`.

## Review Focus

These five inputs/conditions are the most likely to bite users; each has a test pinned to its owning task.

1. **Bengali combining marks / YYA normalization** — precomposed `য়` (U+09DF) and decomposed `য`+nukta must resolve to the same entry. → Task 3 `bn-indexer.test.ts` "resolves NFC-equivalent Bengali spellings".
2. **Idiomatic primary answer** — `ki khobor` must return "How are you?", not a literal "What's the news?". → Task 2 `bn-build.test.ts` "idiom override sets natural English primary answer"; Task 4 `bn-lookup.test.ts` "primary headword is the idiomatic English equivalent".
3. **Banglish ambiguity vs pinned direction** — a Latin-script Banglish query with pinned `bn→en` must use the BN dataset; an ordinary English query must still use the English path. → Task 9 `bn-coordinator.test.ts` "pinned bn→en Banglish query uses the Bengali dataset" and "English query still uses the English path".
4. **Broken/missing BN dataset** — must be best-effort: English lookup and AI providers work unchanged. → Task 8 `service-worker.test.ts` "falls back to English dictionary when the Bengali dataset is unavailable".
5. **Stale responses / one history row** — BN-backed provisional results must obey `requestId` guards. → Task 9 `bn-coordinator.test.ts` "drops a stale Bengali result after the query changes".

---

## Task 1: Bengali dataset types + columnar schema

**Files:**
- Create: `custom-dictionary/src/bn-types.ts`
- Create: `custom-dictionary/scripts/builders/bn-schema.ts`
- Test: `custom-dictionary/tests/bn-dataset.test.ts`

**Interfaces:**
- Produces: `BN_DATASET_VERSION`, `BN_SEP`, `BengaliEntry`, `BengaliDataset`, `serializeBengaliDataset(entries)`, `deserializeBengaliDataset(dataset)`, `assertBengaliDataset(dataset)`, `BN_COLUMNS`.

- [ ] **Step 1: Write the failing test**

```ts
// custom-dictionary/tests/bn-dataset.test.ts
import { describe, expect, it } from 'vitest'
import {
  assertBengaliDataset,
  deserializeBengaliDataset,
  serializeBengaliDataset,
  BN_COLUMNS,
} from '../scripts/builders/bn-schema.ts'
import { BN_DATASET_VERSION } from '../src/bn-types.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function entry(overrides: Partial<BengaliEntry> = {}): BengaliEntry {
  return {
    bengali: 'বই', roman: 'boi', romanAlt: ['boi-alt'],
    en: 'book', enAlt: ['volume'],
    defBn: 'পড়ার বই', defEn: 'A written work', pos: 'noun',
    synEn: ['volume', 'publication'], antEn: ['digital'],
    exBn: 'আমি বই পড়ি।', exEn: 'I read a book.',
    pron: '/bʊk/', usage: 'Everyday word',
    ...overrides,
  }
}

describe('Bengali dataset schema', () => {
  it('serializes to equal-length, sorted columns and round-trips', () => {
    const dataset = serializeBengaliDataset([entry(), entry({ bengali: 'পানি', en: 'water' })])
    expect(dataset.v).toBe(BN_DATASET_VERSION)
    const lengths = BN_COLUMNS.map((c) => dataset[c].length)
    expect(new Set(lengths).size).toBe(1)
    expect(dataset.headwords[0]).toBe('পানি') // sorted
    expect(deserializeBengaliDataset(dataset)[0]?.en).toBe('water')
  })

  it('joins and splits multi-valued columns with U+0001', () => {
    const dataset = serializeBengaliDataset([entry()])
    expect(dataset.synEn[0]).toBe('volume\u0001publication')
    expect(deserializeBengaliDataset(dataset)[0]?.synEn).toEqual(['volume', 'publication'])
  })

  it('rejects a mismatched version', () => {
    const dataset = serializeBengaliDataset([entry()]) as Record<string, unknown>
    dataset['v'] = 999
    expect(() => assertBengaliDataset(dataset)).toThrow(/version/i)
  })

  it('rejects a short column', () => {
    const dataset = serializeBengaliDataset([entry()]) as Record<string, unknown>
    dataset['synEn'] = []
    expect(() => assertBengaliDataset(dataset)).toThrow(/wrong length/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-dataset.test.ts`
Expected: FAIL — module `../scripts/builders/bn-schema.ts` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// custom-dictionary/src/bn-types.ts
// Types for the Bengali-first offline dataset. Bengali is the headword
// language; English is the target language. Random-access indexes are built
// from these columnar arrays at runtime.

/** Field separator for multi-valued columns (cannot appear in natural text). */
export const BN_SEP = '\u0001'

/** Version of the Bengali-first columnar dataset format. */
export const BN_DATASET_VERSION = 1

/** A single Bengali-first dictionary entry. */
export interface BengaliEntry {
  /** Bengali headword, NFC-normalized. */
  bengali: string
  /** Primary Latin spelling ("বই" -> "boi"). */
  roman: string
  /** Alternative Latin spellings. */
  romanAlt: string[]
  /** Natural/idiomatic primary English equivalent. */
  en: string
  /** Alternative English equivalents (literal renderings belong here). */
  enAlt: string[]
  /** Bengali definition or explanation. */
  defBn: string
  /** English gloss. */
  defEn: string
  /** Part of speech. */
  pos: string
  /** English synonyms. */
  synEn: string[]
  /** English antonyms. */
  antEn: string[]
  /** Bengali example sentence. */
  exBn: string
  /** English example sentence. */
  exEn: string
  /** IPA / respelling guide. */
  pron: string
  /** Register / literal-vs-idiomatic / usage note. */
  usage: string
}

/** Columnar dataset; every array shares the same index space. */
export interface BengaliDataset {
  v: number
  headwords: string[]
  roman: string[]
  romanAlt: string[]
  en: string[]
  enAlt: string[]
  defBn: string[]
  defEn: string[]
  pos: string[]
  synEn: string[]
  antEn: string[]
  exBn: string[]
  exEn: string[]
  pron: string[]
  usage: string[]
}
```

```ts
// custom-dictionary/scripts/builders/bn-schema.ts
import { BN_DATASET_VERSION, BN_SEP } from '../../src/bn-types.ts'
import type { BengaliDataset, BengaliEntry } from '../../src/bn-types.ts'

/** All columns in the Bengali dataset, in declaration order. */
export const BN_COLUMNS = [
  'headwords', 'roman', 'romanAlt', 'en', 'enAlt', 'defBn', 'defEn', 'pos',
  'synEn', 'antEn', 'exBn', 'exEn', 'pron', 'usage',
] as const

/** Serializes entries to a sorted columnar dataset. */
export function serializeBengaliDataset(entries: BengaliEntry[]): BengaliDataset {
  const sorted = [...entries].sort((a, b) => a.bengali.localeCompare(b.bengali))
  return {
    v: BN_DATASET_VERSION,
    headwords: sorted.map((e) => e.bengali),
    roman: sorted.map((e) => e.roman),
    romanAlt: sorted.map((e) => e.romanAlt.join(BN_SEP)),
    en: sorted.map((e) => e.en),
    enAlt: sorted.map((e) => e.enAlt.join(BN_SEP)),
    defBn: sorted.map((e) => e.defBn),
    defEn: sorted.map((e) => e.defEn),
    pos: sorted.map((e) => e.pos),
    synEn: sorted.map((e) => e.synEn.join(BN_SEP)),
    antEn: sorted.map((e) => e.antEn.join(BN_SEP)),
    exBn: sorted.map((e) => e.exBn),
    exEn: sorted.map((e) => e.exEn),
    pron: sorted.map((e) => e.pron),
    usage: sorted.map((e) => e.usage),
  }
}

/** Expands a SEP-joined column value. */
function split(value: string): string[] {
  return value ? value.split(BN_SEP) : []
}

/** Deserializes a validated columnar dataset back into entries. */
export function deserializeBengaliDataset(dataset: BengaliDataset): BengaliEntry[] {
  assertBengaliDataset(dataset)
  return dataset.headwords.map((bengali, i) => ({
    bengali,
    roman: dataset.roman[i] ?? '',
    romanAlt: split(dataset.romanAlt[i] ?? ''),
    en: dataset.en[i] ?? '',
    enAlt: split(dataset.enAlt[i] ?? ''),
    defBn: dataset.defBn[i] ?? '',
    defEn: dataset.defEn[i] ?? '',
    pos: dataset.pos[i] ?? '',
    synEn: split(dataset.synEn[i] ?? ''),
    antEn: split(dataset.antEn[i] ?? ''),
    exBn: dataset.exBn[i] ?? '',
    exEn: dataset.exEn[i] ?? '',
    pron: dataset.pron[i] ?? '',
    usage: dataset.usage[i] ?? '',
  }))
}

/** Throws a descriptive error on a version mismatch or malformed column. */
export function assertBengaliDataset(dataset: unknown): asserts dataset is BengaliDataset {
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Bengali dataset is not an object')
  }
  const d = dataset as Record<string, unknown>
  if (d['v'] !== BN_DATASET_VERSION) {
    throw new Error(`Bengali dataset version ${String(d['v'])} !== ${BN_DATASET_VERSION}`)
  }
  const headwords = d['headwords']
  if (!Array.isArray(headwords)) throw new Error('Bengali dataset has no headwords column')
  for (const column of BN_COLUMNS) {
    const arr = d[column]
    if (!Array.isArray(arr) || arr.length !== headwords.length) {
      throw new Error(`Bengali dataset column "${column}" has the wrong length`)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-dataset.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add custom-dictionary/src/bn-types.ts custom-dictionary/scripts/builders/bn-schema.ts custom-dictionary/tests/bn-dataset.test.ts
git commit -m "feat(dictionary): add Bengali-first dataset schema"
```

---

## Task 2: Curated Bengali data + inversion builder + idioms

**Files:**
- Create: `custom-dictionary/data/bn/curated.json`
- Create: `custom-dictionary/data/bn/idioms.json`
- Create: `custom-dictionary/data/bn/README.md`
- Create: `custom-dictionary/scripts/builders/bn-invert.ts`
- Create: `custom-dictionary/scripts/builders/bn-curated.ts`
- Create: `custom-dictionary/scripts/build-bn-dictionary.mjs`
- Modify: `custom-dictionary/package.json`
- Test: `custom-dictionary/tests/bn-build.test.ts`

**Interfaces:**
- Consumes: `BengaliEntry`, `BengaliDataset`, `serializeBengaliDataset`, `assertBengaliDataset` (Task 1); `DictionaryDataset` from `src/types.ts`.
- Produces: `invertEnglishDataset(dataset)`, `loadBengaliOverrides(dir)`, `applyBengaliOverrides(derived, overrides)`, `BengaliOverride`. Build script `scripts/build-bn-dictionary.mjs`, npm script `build:bn-dictionary`, artifacts `public/dictionary.bn.json(.gz)` in both packages.

- [ ] **Step 1: Write the failing test**

```ts
// custom-dictionary/tests/bn-build.test.ts
import { describe, expect, it } from 'vitest'
import { applyBengaliOverrides, loadBengaliOverrides } from '../scripts/builders/bn-curated.ts'
import { invertEnglishDataset } from '../scripts/builders/bn-invert.ts'
import { assertBengaliDataset, serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import type { DictionaryDataset } from '../src/types.ts'

const dataset: DictionaryDataset = {
  v: 4,
  headwords: ['book', 'volume'],
  bn: ['বই', 'বই'], bnAlt: ['', ''],
  trans: ['boi', 'bholium'], transAlt: ['', ''],
  def: ['a written work', 'a quantity'], pos: ['noun', 'noun'],
  syn: ['volume\u0001text', ''], ant: ['', ''],
  ex: ['I read a book.', ''], exBn: [''], pron: ['/bʊk/', ''],
}

describe('Bengali dataset build', () => {
  it('inverts a Bengali spelling into a Bengali-headword entry with English fields', () => {
    const entries = invertEnglishDataset(dataset)
    const book = entries.find((e) => e.bengali === 'বই')
    expect(book).toBeDefined()
    expect(book?.en).toBe('book')
    expect(book?.roman).toBe('boi')
    expect(book?.defEn).toBe('a written work')
    expect(book?.synEn).toContain('volume')
    expect(book?.exEn).toBe('I read a book.')
  })

  it('aggregates multiple English equivalents for the same Bengali spelling', () => {
    const book = invertEnglishDataset(dataset).find((e) => e.bengali === 'বই')
    expect(book?.enAlt).toContain('volume')
  })

  it('curated overrides win over derived values', () => {
    const overrides = new Map([['বই', { en: 'book (curated)', synEn: ['override'] }]])
    const entries = applyBengaliOverrides(invertEnglishDataset(dataset), overrides)
    const book = entries.find((e) => e.bengali === 'বই')
    expect(book?.en).toBe('book (curated)')
    expect(book?.synEn).toEqual(['override'])
  })

  it('idiom override sets the natural English primary answer and literal in enAlt', () => {
    const overrides = loadBengaliOverrides('data/bn')
    const idiom = overrides.get('কি খবর')
    expect(idiom?.en).toBe('How are you?')
    expect(idiom?.enAlt).toContain('What is the news?')
  })

  it('serializes to a valid dataset', () => {
    const built = serializeBengaliDataset(applyBengaliOverrides(invertEnglishDataset(dataset), new Map()))
    expect(() => assertBengaliDataset(built)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-build.test.ts`
Expected: FAIL — missing `bn-curated.ts` / `bn-invert.ts` / data files.

- [ ] **Step 3: Write the curated data and idioms**

```json
// custom-dictionary/data/bn/curated.json
{
  "বই": {
    "roman": "boi",
    "en": "book",
    "enAlt": ["volume", "publication"],
    "defBn": "পড়ার জন্য লেখা বাঁধা পাতার সমাহার",
    "defEn": "A written or printed work consisting of pages.",
    "pos": "noun",
    "synEn": ["volume", "publication", "text"],
    "antEn": [],
    "exBn": "আমি প্রতিদিন একটি বই পড়ি।",
    "exEn": "I read a book every day.",
    "pron": "/bʊk/",
    "usage": ""
  },
  "পানি": {
    "roman": "pani",
    "en": "water",
    "enAlt": ["drinking water"],
    "defBn": "পানীয় তরল পদার্থ",
    "defEn": "The clear liquid that people drink.",
    "pos": "noun",
    "synEn": ["liquid", "drink"],
    "antEn": [],
    "exBn": "দয়া করে এক গ্লাস পানি দিন।",
    "exEn": "Please give me a glass of water.",
    "pron": "/ˈwɔːtər/",
    "usage": "Everyday Bangladeshi Bengali; prefer 'পানি' over 'জল'."
  },
  "মা": {
    "roman": "ma",
    "en": "mother",
    "enAlt": ["mom", "mum"],
    "defBn": "যে সন্তানকে জন্ম দেয় ও লালন করে",
    "defEn": "A female parent.",
    "pos": "noun",
    "synEn": ["mom", "mum", "parent"],
    "antEn": ["father"],
    "exBn": "আমার মা খুব ভালো রান্না করেন।",
    "exEn": "My mother cooks very well.",
    "pron": "/ˈmʌðər/",
    "usage": ""
  },
  "শেখা": {
    "roman": "shekha",
    "en": "learn",
    "enAlt": ["study"],
    "defBn": "জ্ঞান বা দক্ষতা অর্জন করা",
    "defEn": "To gain knowledge or a skill.",
    "pos": "verb",
    "synEn": ["study", "acquire", "master"],
    "antEn": ["teach", "forget"],
    "exBn": "আমি ইংরেজি শেখছি।",
    "exEn": "I am learning English.",
    "pron": "/lɜːrn/",
    "usage": "Base/verbal-noun form; conjugate in context."
  },
  "ভালোবাসা": {
    "roman": "bhalobasha",
    "en": "love",
    "enAlt": ["affection"],
    "defBn": "গভীর স্নেহ ও আকর্ষণ",
    "defEn": "A strong feeling of affection.",
    "pos": "noun",
    "synEn": ["affection", "adoration"],
    "antEn": ["hatred"],
    "exBn": "মায়ের প্রতি তার ভালোবাসা অসীম।",
    "exEn": "Her love for her mother is boundless.",
    "pron": "/lʌv/",
    "usage": ""
  },
  "সময়": {
    "roman": "shomoy",
    "en": "time",
    "enAlt": ["moment", "hour"],
    "defBn": "ঘটনার ধারা যা অতীত, বর্তমান ও ভবিষ্যৎ নিয়ে গঠিত",
    "defEn": "What is measured in minutes and hours.",
    "pos": "noun",
    "synEn": ["moment", "period", "occasion"],
    "antEn": [],
    "exBn": "আমার সময় কম।",
    "exEn": "I do not have much time.",
    "pron": "/taɪm/",
    "usage": ""
  },
  "বাড়ি": {
    "roman": "bari",
    "en": "home",
    "enAlt": ["house"],
    "defBn": "বসবাসের স্থান",
    "defEn": "The place where someone lives.",
    "pos": "noun",
    "synEn": ["house", "residence", "dwelling"],
    "antEn": [],
    "exBn": "আমি বাড়ি যাচ্ছি।",
    "exEn": "I am going home.",
    "pron": "/hoʊm/",
    "usage": ""
  },
  "খাবার": {
    "roman": "khabar",
    "en": "food",
    "enAlt": ["meal", "dish"],
    "defBn": "খাওয়ার জন্য প্রস্তুত পদার্থ",
    "defEn": "Substances eaten to sustain life.",
    "pos": "noun",
    "synEn": ["meal", "cuisine", "dish"],
    "antEn": [],
    "exBn": "খাবারটা অনেক সুস্বাদু।",
    "exEn": "The food is very tasty.",
    "pron": "/fuːd/",
    "usage": ""
  },
  "শিক্ষক": {
    "roman": "shikkhok",
    "en": "teacher",
    "enAlt": ["instructor"],
    "defBn": "যে শিক্ষা দেয়",
    "defEn": "A person who teaches.",
    "pos": "noun",
    "synEn": ["instructor", "tutor", "educator"],
    "antEn": ["student"],
    "exBn": "তিনি একজন ভালো শিক্ষক।",
    "exEn": "He is a good teacher.",
    "pron": "/ˈtiːtʃər/",
    "usage": ""
  },
  "কাজ": {
    "roman": "kaj",
    "en": "work",
    "enAlt": ["job", "task"],
    "defBn": "করণীয় কাry বা পরিশ্রম",
    "defEn": "An activity involving effort to achieve a result.",
    "pos": "noun",
    "synEn": ["job", "task", "labour"],
    "antEn": ["rest", "leisure"],
    "exBn": "আমার অনেক কাজ আছে।",
    "exEn": "I have a lot of work.",
    "pron": "/wɜːrk/",
    "usage": ""
  }
}
```

```json
// custom-dictionary/data/bn/idioms.json
{
  "কি খবর": {
    "roman": "ki khobor",
    "en": "How are you?",
    "enAlt": ["What is the news?", "How are you doing?"],
    "defBn": "কুশলাদি জিজ্ঞাসা",
    "defEn": "A casual greeting asking about someone's well-being.",
    "pos": "phrase",
    "synEn": ["How are you doing?", "What's up?"],
    "antEn": [],
    "exBn": "কি খবর? সব ঠিক তো?",
    "exEn": "How are you? Everything alright?",
    "pron": "",
    "usage": "The natural English equivalent is 'How are you?'. The literal 'What is the news?' is kept as an alternative, not the primary answer."
  },
  "কেমন আছেন": {
    "roman": "kemon achen",
    "en": "How are you?",
    "enAlt": ["How are you doing?"],
    "defBn": "সম্মানসূচক কুশলাদি জিজ্ঞাসা",
    "defEn": "A polite greeting asking about someone's well-being.",
    "pos": "phrase",
    "synEn": ["How are you doing?"],
    "antEn": [],
    "exBn": "কেমন আছেন? আপনার খবর কেমন?",
    "exEn": "How are you? How have you been?",
    "pron": "",
    "usage": "Formal/polite register; use with elders or strangers."
  },
  "নমস্কার": {
    "roman": "nomoshkar",
    "en": "Hello",
    "enAlt": ["Hi", "Greetings"],
    "defBn": "অভিবাদন",
    "defEn": "A greeting used when meeting someone.",
    "pos": "phrase",
    "synEn": ["Hi", "Greetings"],
    "antEn": [],
    "exBn": "নমস্কার, কেমন আছেন?",
    "exEn": "Hello, how are you?",
    "pron": "",
    "usage": "Neutral greeting; 'Hi' is more casual in English."
  },
  "ধন্যবাদ": {
    "roman": "dhonnobad",
    "en": "Thank you",
    "enAlt": ["Thanks"],
    "defBn": "কৃতজ্ঞতা প্রকাশ",
    "defEn": "An expression of gratitude.",
    "pos": "phrase",
    "synEn": ["Thanks", "Many thanks"],
    "antEn": [],
    "exBn": "সাহায্যের জন্য ধন্যবাদ।",
    "exEn": "Thank you for your help.",
    "pron": "",
    "usage": ""
  },
  "দোয়া করবেন": {
    "roman": "doa korben",
    "en": "Please pray for me",
    "enAlt": ["Say a prayer for me", "Bless me"],
    "defBn": "আশীর্বাদ প্রার্থনা",
    "defEn": "A request for someone's prayers or good wishes.",
    "pos": "phrase",
    "synEn": ["Please pray for me", "Wish me well"],
    "antEn": [],
    "exBn": "পরীক্ষার জন্য দোয়া করবেন।",
    "exEn": "Please pray for me for the exam.",
    "pron": "",
    "usage": "Literal 'pray for me' is correct but culturally broader in Bengali; 'Wish me luck' is often the natural English equivalent in casual contexts."
  },
  "খুব ভালো": {
    "roman": "khu bhalo",
    "en": "Very good",
    "enAlt": ["Great", "Excellent", "I'm doing well"],
    "defBn": "অত্যন্ত ভালো অবস্থা",
    "defEn": "An expression of a very positive state.",
    "pos": "phrase",
    "synEn": ["Great", "Excellent", "Wonderful"],
    "antEn": ["Very bad"],
    "exBn": "আমার অবস্থা খুব ভালো।",
    "exEn": "I am doing very well.",
    "pron": "",
    "usage": "As an answer to 'How are you?', natural English is 'I'm doing well', not 'Very good'."
  }
}
```

```md
<!-- custom-dictionary/data/bn/README.md -->
# Bengali dataset sources

This folder is the **Bengali-first** dataset. Bengali is the headword language;
English is the target language.

- `curated.json` — hand-authored high-value words. Keys are Bengali headwords,
  NFC-normalized. Fields match `BengaliEntry` minus `bengali`.
- `idioms.json` — greetings and idioms. The `en` field must be the **natural
  idiomatic English** equivalent; literal renderings go into `enAlt`/`usage`.

Rules:
- Use everyday Bangladeshi Bengali (`পানি` not `জল`), no Sadhu/archaic forms.
- Verbs use the base/verbal-noun form (`শেখা` not `শিখতে`).
- Every curated entry should carry `defBn`, `defEn`, `exBn`, `exEn`, and `synEn`
  where meaningful. Never fabricate a Bengali example with machine translation.
- Curated/idiom values override derived values entirely.

Rebuild with `npm run build:bn-dictionary` from `custom-dictionary/`.
```

- [ ] **Step 4: Write the builder modules**

```ts
// custom-dictionary/scripts/builders/bn-invert.ts
import { BN_SEP } from '../../src/bn-types.ts'
import type { BengaliEntry } from '../../src/bn-types.ts'
import type { DictionaryDataset } from '../../src/types.ts'

function split(value: string): string[] {
  return value ? value.split(BN_SEP) : []
}

/** Derives Bengali-first entries from the English-first dataset. */
export function invertEnglishDataset(dataset: DictionaryDataset): BengaliEntry[] {
  const byBengali = new Map<string, BengaliEntry>()

  for (let i = 0; i < dataset.headwords.length; i++) {
    const headword = dataset.headwords[i] ?? ''
    if (!headword) continue
    const spellings = [dataset.bn[i] ?? '', ...split(dataset.bnAlt[i] ?? '')]
    const romans = [dataset.trans[i] ?? '', ...split(dataset.transAlt[i] ?? '')]

    spellings.forEach((spelling, j) => {
      const bengali = spelling.normalize('NFC').trim()
      if (!bengali) return
      let entry = byBengali.get(bengali)
      if (!entry) {
        entry = {
          bengali,
          roman: romans[j] ?? '',
          romanAlt: [],
          en: headword,
          enAlt: [],
          defBn: '',
          defEn: dataset.def[i] ?? '',
          pos: dataset.pos[i] ?? '',
          synEn: split(dataset.syn[i] ?? ''),
          antEn: split(dataset.ant[i] ?? ''),
          exBn: dataset.exBn?.[i] ?? '',
          exEn: dataset.ex[i] ?? '',
          pron: dataset.pron[i] ?? '',
          usage: '',
        }
        byBengali.set(bengali, entry)
        return
      }
      if (entry.en !== headword && !entry.enAlt.includes(headword)) {
        entry.enAlt.push(headword)
      }
      if (!entry.defEn && dataset.def[i]) entry.defEn = dataset.def[i]!
      if (!entry.exEn && dataset.ex[i]) entry.exEn = dataset.ex[i]!
      if (!entry.exBn && dataset.exBn?.[i]) entry.exBn = dataset.exBn[i]!
      if (!entry.pron && dataset.pron[i]) entry.pron = dataset.pron[i]!
      const roman = romans[j] ?? ''
      if (roman && roman !== entry.roman && !entry.romanAlt.includes(roman)) {
        entry.romanAlt.push(roman)
      }
      for (const syn of split(dataset.syn[i] ?? '')) {
        if (!entry.synEn.includes(syn)) entry.synEn.push(syn)
      }
      for (const ant of split(dataset.ant[i] ?? '')) {
        if (!entry.antEn.includes(ant)) entry.antEn.push(ant)
      }
    })
  }

  return [...byBengali.values()]
}
```

```ts
// custom-dictionary/scripts/builders/bn-curated.ts
import fs from 'node:fs'
import path from 'node:path'
import type { BengaliEntry } from '../../src/bn-types.ts'

/** A hand-written override; the Bengali key is the map key. */
export type BengaliOverride = Partial<Omit<BengaliEntry, 'bengali'>>

/** Reads curated.json and idioms.json, keyed by NFC-normalized Bengali. */
export function loadBengaliOverrides(dir: string): Map<string, BengaliOverride> {
  const map = new Map<string, BengaliOverride>()
  for (const file of ['curated.json', 'idioms.json']) {
    const filePath = path.join(dir, file)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing Bengali override file: ${filePath}`)
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, BengaliOverride>
    for (const [key, value] of Object.entries(raw)) {
      const normalized = key.normalize('NFC')
      map.set(normalized, { ...map.get(normalized), ...value })
    }
  }
  return map
}

/** Applies overrides; curated/idiom values win over derived values. */
export function applyBengaliOverrides(
  derived: BengaliEntry[],
  overrides: Map<string, BengaliOverride>,
): BengaliEntry[] {
  const byBengali = new Map(derived.map((e) => [e.bengali, { ...e }]))
  for (const [bengali, override] of overrides) {
    const base = byBengali.get(bengali) ?? {
      bengali,
      roman: '', romanAlt: [], en: '', enAlt: [], defBn: '', defEn: '', pos: '',
      synEn: [], antEn: [], exBn: '', exEn: '', pron: '', usage: '',
    }
    byBengali.set(bengali, { ...base, ...override, bengali })
  }
  return [...byBengali.values()]
}
```

- [ ] **Step 5: Write the build entry point and npm script**

```mjs
// custom-dictionary/scripts/build-bn-dictionary.mjs
// Builds the Bengali-first dataset and writes it to both packages' public/.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

async function loadModule(relative) {
  return import(pathToFileURL(path.join(__dirname, relative)).href)
}

const { invertEnglishDataset } = await loadModule('builders/bn-invert.ts')
const { loadBengaliOverrides, applyBengaliOverrides } = await loadModule('builders/bn-curated.ts')
const { serializeBengaliDataset } = await loadModule('builders/bn-schema.ts')

const englishPath = path.join(root, 'public', 'dictionary.json')
const english = JSON.parse(fs.readFileSync(englishPath, 'utf8'))
const derived = invertEnglishDataset(english)
const overrides = loadBengaliOverrides(path.join(root, 'data', 'bn'))
const entries = applyBengaliOverrides(derived, overrides)
const dataset = serializeBengaliDataset(entries)
const json = JSON.stringify(dataset)

const outputs = [
  path.join(root, 'public', 'dictionary.bn.json'),
  path.join(root, 'public', 'dictionary.bn.json.gz'),
  path.join(root, '..', 'public', 'dictionary.bn.json.gz'),
]
fs.mkdirSync(path.dirname(outputs[2]!), { recursive: true })
fs.writeFileSync(outputs[0]!, json, 'utf8')
fs.writeFileSync(outputs[1]!, zlib.gzipSync(json, { level: 9 }))
fs.writeFileSync(outputs[2]!, zlib.gzipSync(json, { level: 9 }))

console.log('Bengali-first dictionary build complete')
console.log(`  entries:              ${entries.length}`)
console.log(`  with English synonyms:${entries.filter((e) => e.synEn.length).length}`)
console.log(`  with English antonyms:${entries.filter((e) => e.antEn.length).length}`)
console.log(`  with bilingual ex:    ${entries.filter((e) => e.exBn && e.exEn).length}`)
console.log(`  curated overrides:    ${overrides.size}`)
```

In `custom-dictionary/package.json`, add the script next to `build:dictionary`:

```json
"build:bn-dictionary": "node --import tsx/esm scripts/build-bn-dictionary.mjs"
```

- [ ] **Step 6: Run tests and the real build**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-build.test.ts`
Expected: PASS (5 tests).

Run: `npm run build:bn-dictionary`
Expected: build completes, prints stats, and creates `custom-dictionary/public/dictionary.bn.json`, `custom-dictionary/public/dictionary.bn.json.gz`, and `../public/dictionary.bn.json.gz`.

- [ ] **Step 7: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add custom-dictionary/data/bn custom-dictionary/scripts/builders/bn-invert.ts custom-dictionary/scripts/builders/bn-curated.ts custom-dictionary/scripts/build-bn-dictionary.mjs custom-dictionary/package.json custom-dictionary/tests/bn-build.test.ts custom-dictionary/public/dictionary.bn.json custom-dictionary/public/dictionary.bn.json.gz public/dictionary.bn.json.gz
git commit -m "feat(dictionary): build Bengali-first dataset with curated entries and idioms"
```

---

## Task 3: `BanglaDictionary` runtime index (custom-dictionary package)

**Files:**
- Create: `custom-dictionary/src/bn-indexer.ts`
- Test: `custom-dictionary/tests/bn-indexer.test.ts`

**Interfaces:**
- Consumes: `BN_DATASET_VERSION`, `BengaliDataset`, `BengaliEntry` (Task 1); `SuggestionPayload` from `src/types.ts`.
- Produces: `normalizeBengaliKey(text)`, `normalizeBanglishKey(text)`, `BanglaDictionary` with `size`, `lookupBengali(q)`, `lookupRoman(q)`, `lookup(q)`, `suggestions(q, limit)`.

- [ ] **Step 1: Write the failing test**

```ts
// custom-dictionary/tests/bn-indexer.test.ts
import { describe, expect, it } from 'vitest'
import { BanglaDictionary } from '../src/bn-indexer.ts'
import { serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function dict(entries: BengaliEntry[]): BanglaDictionary {
  return new BanglaDictionary(serializeBengaliDataset(entries))
}

function entry(overrides: Partial<BengaliEntry> = {}): BengaliEntry {
  return {
    bengali: 'বই', roman: 'boi', romanAlt: ['boi-alt'], en: 'book', enAlt: ['volume'],
    defBn: '', defEn: 'A written work', pos: 'noun', synEn: ['volume'],
    antEn: [], exBn: '', exEn: '', pron: '', usage: '', ...overrides,
  }
}

describe('BanglaDictionary', () => {
  it('looks up a Bengali spelling and returns its English equivalent', () => {
    const d = dict([entry()])
    expect(d.lookupBengali('বই')?.en).toBe('book')
    expect(d.lookup('বই')?.synEn).toContain('volume')
  })

  it('resolves NFC-equivalent Bengali spellings', () => {
    const d = dict([entry({ bengali: 'য়' })])
    const decomposed = 'য়'.normalize('NFD')
    expect(d.lookupBengali(decomposed)?.bengali).toBe('য়')
  })

  it('resolves a romanized spelling and returns null for an unknown one', () => {
    const d = dict([entry({ bengali: 'খবর', roman: 'khobor', en: 'news' })])
    expect(d.lookupRoman('khobor')?.entry.en).toBe('news')
    expect(d.lookup('khobor')?.en).toBe('news')
    expect(d.lookup('অজানা')).toBeNull()
  })

  it('matches Banglish phonetic variants ("ki khobor" -> "kikhobor")', () => {
    const d = dict([entry({ bengali: 'কি খবর', roman: 'ki khobor', en: 'How are you?' })])
    expect(d.lookup('kikhobor')?.en).toBe('How are you?')
    expect(d.lookup('ki khobor')?.en).toBe('How are you?')
  })

  it('returns null for a missing word', () => {
    expect(dict([entry()]).lookup('অজানা')).toBeNull()
  })

  it('suggests Bengali words with the English equivalent as hint', () => {
    const d = dict([entry(), entry({ bengali: 'পানি', roman: 'pani', en: 'water' })])
    const s = d.suggestions('বই', 5)
    expect(s[0]?.word).toBe('বই')
    expect(s[0]?.headword).toBe('book')
    expect(s[0]?.hint).toBe('book')
    expect(s[0]?.bengali).toBe(true)
  })

  it('rejects a mismatched dataset version', () => {
    const dataset = serializeBengaliDataset([entry()]) as { v: number }
    dataset.v = 999
    expect(() => new BanglaDictionary(dataset)).toThrow(/version/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-indexer.test.ts`
Expected: FAIL — module `../src/bn-indexer.ts` not found.

- [ ] **Step 3: Write the implementation**

```ts
// custom-dictionary/src/bn-indexer.ts
// In-memory indexes over the Bengali-first columnar dataset.
import { BN_DATASET_VERSION, BN_SEP } from './bn-types.ts'
import type { BengaliDataset, BengaliEntry } from './bn-types.ts'
import type { SuggestionPayload } from './types.ts'

/** NFC-normalized lookup key; Bengali vowel signs (\p{M}) are preserved. */
export function normalizeBengaliKey(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tolerant Latin-script (Banglish) spelling key. */
export function normalizeBanglishKey(query: string): string {
  if (!query) return ''
  return normalizeBengaliKey(query)
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/ee/g, 'i')
    .replace(/ea/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/v/g, 'bh')
    .replace(/w/g, 'b')
    .replace(/y$/g, 'i')
    .replace(/y([bcdfghjklmnpqrstvwxz])/g, 'i$1')
    .replace(/(.)\1+/g, '$1')
}

/** Bounded Damerau-Levenshtein distance; transpositions count as one edit. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1)
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2]! + 1)
      }
      cur[j] = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]! <= max ? prev[b.length]! : max + 1
}

/** Read-only indexed view over the Bengali dataset. */
export class BanglaDictionary {
  private readonly byBengali = new Map<string, BengaliEntry>()
  private readonly byRoman = new Map<string, BengaliEntry>()
  private readonly byEnglish = new Map<string, BengaliEntry[]>()
  private readonly bengaliKeys: string[] = []

  constructor(dataset: BengaliDataset) {
    if (dataset.v !== BN_DATASET_VERSION) {
      throw new Error(`Bengali dataset version ${String(dataset.v)} !== ${BN_DATASET_VERSION}`)
    }
    const n = dataset.headwords.length
    for (const column of ['roman', 'romanAlt', 'en', 'enAlt', 'defBn', 'defEn', 'pos', 'synEn', 'antEn', 'exBn', 'exEn', 'pron', 'usage'] as const) {
      const arr = dataset[column]
      if (!Array.isArray(arr) || arr.length !== n) {
        throw new Error(`Bengali dataset column "${column}" has the wrong length`)
      }
    }
    for (let i = 0; i < n; i++) {
      const entry: BengaliEntry = {
        bengali: dataset.headwords[i] ?? '',
        roman: dataset.roman[i] ?? '',
        romanAlt: (dataset.romanAlt[i] ?? '').split(BN_SEP).filter(Boolean),
        en: dataset.en[i] ?? '',
        enAlt: (dataset.enAlt[i] ?? '').split(BN_SEP).filter(Boolean),
        defBn: dataset.defBn[i] ?? '',
        defEn: dataset.defEn[i] ?? '',
        pos: dataset.pos[i] ?? '',
        synEn: (dataset.synEn[i] ?? '').split(BN_SEP).filter(Boolean),
        antEn: (dataset.antEn[i] ?? '').split(BN_SEP).filter(Boolean),
        exBn: dataset.exBn[i] ?? '',
        exEn: dataset.exEn[i] ?? '',
        pron: dataset.pron[i] ?? '',
        usage: dataset.usage[i] ?? '',
      }
      const bnKey = normalizeBengaliKey(entry.bengali)
      if (bnKey) {
        this.byBengali.set(bnKey, entry)
        this.bengaliKeys.push(bnKey)
      }
      for (const roman of [entry.roman, ...entry.romanAlt]) {
        const rk = normalizeBengaliKey(roman)
        if (rk) this.byRoman.set(rk, entry)
        const pk = normalizeBanglishKey(roman)
        if (pk && pk !== rk) this.byRoman.set(pk, entry)
      }
      for (const english of [entry.en, ...entry.enAlt]) {
        const ek = normalizeBengaliKey(english)
        if (!ek) continue
        const bucket = this.byEnglish.get(ek) ?? []
        if (!bucket.includes(entry)) bucket.push(entry)
        this.byEnglish.set(ek, bucket)
      }
    }
    this.bengaliKeys.sort()
  }

  /** Number of Bengali headwords. */
  get size(): number {
    return this.byBengali.size
  }

  /** Exact Bengali-script lookup. */
  lookupBengali(query: string): BengaliEntry | null {
    return this.byBengali.get(normalizeBengaliKey(query)) ?? null
  }

  /** Romanized / Banglish lookup. */
  lookupRoman(query: string): { entry: BengaliEntry; roman: string } | null {
    const entry = this.byRoman.get(normalizeBengaliKey(query))
      ?? this.byRoman.get(normalizeBanglishKey(query))
    return entry ? { entry, roman: query } : null
  }

  /** Bengali script first, then romanized/Banglish. */
  lookup(query: string): BengaliEntry | null {
    return this.lookupBengali(query) ?? this.lookupRoman(query)?.entry ?? null
  }

  /** Type-ahead over Bengali headwords; English equivalent is the hint. */
  suggestions(query: string, limit = 8): SuggestionPayload[] {
    const n = normalizeBengaliKey(query)
    if (!n) return []
    const scored: Array<{ suggestion: SuggestionPayload; score: number }> = []
    const seen = new Set<string>()
    const push = (entry: BengaliEntry, score: number) => {
      if (seen.has(entry.bengali)) return
      seen.add(entry.bengali)
      scored.push({
        suggestion: { word: entry.bengali, headword: entry.en, bengali: true, hint: entry.en },
        score,
      })
    }
    const exact = this.byBengali.get(n)
    if (exact) push(exact, 0)
    const roman = this.byRoman.get(n)
    if (roman) push(roman, 100)
    for (const key of this.bengaliKeys) {
      if (key.startsWith(n)) {
        const entry = this.byBengali.get(key)
        if (entry) push(entry, 1000 + key.length)
      }
    }
    const maxDist = n.length >= 3 ? 2 : 0
    if (maxDist && scored.length < limit) {
      for (const key of this.bengaliKeys) {
        const distance = editDistance(n, key, maxDist)
        if (distance > 0 && distance <= maxDist) {
          const entry = this.byBengali.get(key)
          if (entry) push(entry, 2000 + distance * 100 + key.length)
        }
      }
    }
    return scored
      .sort((a, b) => a.score - b.score || a.suggestion.word.localeCompare(b.suggestion.word))
      .slice(0, limit)
      .map((s) => s.suggestion)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-indexer.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add custom-dictionary/src/bn-indexer.ts custom-dictionary/tests/bn-indexer.test.ts
git commit -m "feat(dictionary): add BanglaDictionary runtime index"
```

---

## Task 4: `BanglaLookupCoordinator` + package exports

**Files:**
- Modify: `custom-dictionary/src/types.ts` (add `usageNote?`)
- Create: `custom-dictionary/src/bn-lookup.ts`
- Modify: `custom-dictionary/src/index.ts`
- Test: `custom-dictionary/tests/bn-lookup.test.ts`

**Interfaces:**
- Consumes: `BanglaDictionary` (Task 3), `LookupResult` from `src/types.ts`.
- Produces: `BanglaLookupCoordinator.lookup(query): LookupResult | null`, exported from `src/index.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// custom-dictionary/tests/bn-lookup.test.ts
import { describe, expect, it } from 'vitest'
import { serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import { BanglaDictionary } from '../src/bn-indexer.ts'
import { BanglaLookupCoordinator } from '../src/bn-lookup.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function coordinator(overrides: Partial<BengaliEntry> = {}): BanglaLookupCoordinator {
  const entry: BengaliEntry = {
    bengali: 'বই', roman: 'boi', romanAlt: [], en: 'book', enAlt: ['volume'],
    defBn: 'পড়ার বই', defEn: 'A written work', pos: 'noun',
    synEn: ['volume', 'text'], antEn: ['digital'],
    exBn: 'আমি বই পড়ি।', exEn: 'I read a book.', pron: '/bʊk/',
    usage: 'Everyday word', ...overrides,
  }
  return new BanglaLookupCoordinator(new BanglaDictionary(serializeBengaliDataset([entry])))
}

describe('BanglaLookupCoordinator', () => {
  it('maps every Bengali-first field to the shared result shape', () => {
    const result = coordinator().lookup('বই')
    expect(result).toMatchObject({
      word: 'বই', query: 'বই', headword: 'book',
      englishDefinition: 'A written work', bengaliMeaning: 'পড়ার বই',
      synonyms: ['volume', 'text'], antonyms: ['digital'],
      exampleEn: 'I read a book.', exampleBn: 'আমি বই পড়ি।',
      transcription: 'boi', pronunciation: '/bʊk/',
      partOfSpeech: 'noun', usageNote: 'Everyday word', source: 'offline',
    })
  })

  it('primary headword is the idiomatic English equivalent', () => {
    const result = coordinator({
      bengali: 'কি খবর', roman: 'ki khobor', en: 'How are you?',
      enAlt: ['What is the news?'], defBn: '', defEn: 'A casual greeting',
      synEn: [], antEn: [], exBn: '', exEn: '', pron: '', usage: '',
    }).lookup('ki khobor')
    expect(result?.headword).toBe('How are you?')
    expect(result?.bengaliMeaning).toBe('কি খবর')
  })

  it('returns null for a missing word', () => {
    expect(coordinator().lookup('অজানা')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-lookup.test.ts`
Expected: FAIL — `bn-lookup.ts` not found / `usageNote` not on `LookupResult`.

- [ ] **Step 3: Write the implementation**

In `custom-dictionary/src/types.ts`, add the field to `LookupResult` after `partOfSpeech`:

```ts
  /** Register / literal-vs-idiomatic / usage note (Bengali-first results). */
  usageNote?: string
```

```ts
// custom-dictionary/src/bn-lookup.ts
// Pure lookup coordinator for Bengali-first results.
import { BanglaDictionary } from './bn-indexer.ts'
import type { LookupResult } from './types.ts'

export class BanglaLookupCoordinator {
  constructor(private readonly dictionary: BanglaDictionary) {}

  /** Looks up a Bengali or Banglish query and returns a shared LookupResult. */
  lookup(query: string): LookupResult | null {
    const hit = this.dictionary.lookup(query)
    if (!hit) return null
    return {
      word: query,
      query,
      headword: hit.en,
      bengaliMeaning: hit.defBn || hit.bengali,
      englishDefinition: hit.defEn || undefined,
      transcription: hit.roman || undefined,
      pronunciation: hit.pron || undefined,
      synonyms: hit.synEn.length > 0 ? hit.synEn : undefined,
      antonyms: hit.antEn.length > 0 ? hit.antEn : undefined,
      exampleEn: hit.exEn || undefined,
      exampleBn: hit.exBn || undefined,
      partOfSpeech: hit.pos || undefined,
      usageNote: hit.usage || undefined,
      source: 'offline',
      requestId: '',
      timestamp: Date.now(),
    }
  }
}
```

In `custom-dictionary/src/index.ts`, append:

```ts
export { BanglaDictionary, normalizeBengaliKey, normalizeBanglishKey } from './bn-indexer';
export { BanglaLookupCoordinator } from './bn-lookup';
export { BN_DATASET_VERSION, BN_SEP } from './bn-types';
export type { BengaliDataset, BengaliEntry } from './bn-types';
```

- [ ] **Step 4: Run test and the whole package suite**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-lookup.test.ts`
Expected: PASS (3 tests).

Run: `npm test`
Expected: all custom-dictionary tests pass.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add custom-dictionary/src/types.ts custom-dictionary/src/bn-lookup.ts custom-dictionary/src/index.ts custom-dictionary/tests/bn-lookup.test.ts
git commit -m "feat(dictionary): add Bengali lookup coordinator and exports"
```

---

## Task 5: Bridge contract + content client pass direction

**Files:**
- Modify: `src/providers/bridge.ts`
- Modify: `src/providers/offline/index.ts`
- Test: `tests/bn-bridge.test.ts`

**Interfaces:**
- Consumes: `LookupDirection` from `src/shared/types.ts`.
- Produces: `OfflineLookupRequest.direction?`, `OfflineEntryPayload.usageNote?`, `offlineLookupWithMatch(query, bengali, direction?)`, `offlineBengaliLookup(query, direction?)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bn-bridge.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { OFFLINE_LOOKUP_MESSAGE } from '../src/providers/bridge'
import { offlineBengaliLookup, offlineLookupWithMatch } from '../src/providers/offline'

const sendMessage = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage } }
})

describe('offline bridge direction', () => {
  it('passes the resolved direction to the service worker', async () => {
    sendMessage.mockResolvedValue({ ok: true, result: null, via: 'bengali' })
    await offlineLookupWithMatch('ki khobor', true, 'bn-en')
    expect(sendMessage).toHaveBeenCalledWith({
      type: OFFLINE_LOOKUP_MESSAGE,
      query: 'ki khobor',
      isBengali: true,
      direction: 'bn-en',
    })
  })

  it('offlineBengaliLookup forwards direction for Latin-script Banglish', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      result: { headword: 'How are you?', bn: 'কি খবর', bnAlts: [], trans: 'ki khobor', transAlts: [], def: '', pos: 'phrase', syn: [], ant: [] },
      via: 'bengali',
    })
    const hit = await offlineBengaliLookup('ki khobor', 'bn-en')
    expect(hit?.headword).toBe('How are you?')
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ isBengali: true, direction: 'bn-en' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/bn-bridge.test.ts`
Expected: FAIL — `direction` not in the message / signature mismatch (TS may also fail).

- [ ] **Step 3: Update the bridge and content client**

In `src/providers/bridge.ts`, add the import at the top:

```ts
import type { LookupDirection } from '../shared/types'
```

Add `usageNote` to `OfflineEntryPayload` (after `pron`):

```ts
  /** Register / idiom note, present on Bengali-first results. */
  usageNote?: string
```

Add `direction` to `OfflineLookupRequest`:

```ts
export interface OfflineLookupRequest {
  type: typeof OFFLINE_LOOKUP_MESSAGE
  query: string
  isBengali: boolean
  /** Resolved direction; needed for Banglish queries where isBengali is false. */
  direction?: LookupDirection
}
```

In `src/providers/offline/index.ts`, add to the imports:

```ts
import type { LookupDirection } from '../../shared/types'
```

Change the two functions:

```ts
export async function offlineLookupWithMatch(
  query: string,
  bengali = false,
  direction?: LookupDirection,
): Promise<{ entry: OfflineEntryPayload | null; via: OfflineLookupMatch | undefined }> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { entry: null, via: undefined }
    }
    const response = (await chrome.runtime.sendMessage({
      type: OFFLINE_LOOKUP_MESSAGE,
      query,
      isBengali: bengali,
      direction,
    })) as OfflineLookupResponse | undefined
    if (!response) return { entry: null, via: undefined }
    if (!response.ok) throw new Error(response.error)
    return { entry: response.result, via: response.via }
  } catch (err) {
    if (isContextInvalid(err)) return { entry: null, via: undefined }
    throw err
  }
}

export async function offlineBengaliLookup(
  query: string,
  direction?: LookupDirection,
): Promise<{ headword: string; entry: OfflineEntryPayload; roman: string } | null> {
  const entry = await offlineLookup(query, true, direction)
  return entry ? { headword: entry.headword, entry, roman: entry.trans } : null
}
```

Also update `offlineLookup` to forward direction:

```ts
export async function offlineLookup(
  query: string,
  bengali = false,
  direction?: LookupDirection,
): Promise<OfflineEntryPayload | null> {
  return (await offlineLookupWithMatch(query, bengali, direction)).entry
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/bn-bridge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/providers/bridge.ts src/providers/offline/index.ts tests/bn-bridge.test.ts
git commit -m "feat(offline): carry lookup direction through the bridge"
```

---

## Task 6: Extension-side Bengali runtime + loader

**Files:**
- Create: `src/providers/offline/bn-dataset.ts`
- Create: `src/providers/offline/bn-loader.ts`
- Test: `tests/bn-dataset.test.ts`

**Interfaces:**
- Consumes: `OfflineEntryPayload` from `../bridge`.
- Produces: `BengaliEntry`, `BengaliDataset`, `BanglaDictionary` (same API as Task 3), `toOfflineEntryPayload(entry, query)`, `BN_DATASET_PATH`, `loadBanglaDictionary()`, `tryLoadBanglaDictionary()`.

> This is a focused port of the package indexer into the extension's own `src/` tree so Vite/tsc never reach outside the build root. It must stay in sync with `custom-dictionary/src/bn-indexer.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bn-dataset.test.ts
import { describe, expect, it } from 'vitest'
import { BanglaDictionary, toOfflineEntryPayload } from '../src/providers/offline/bn-dataset'
import type { BengaliDataset } from '../src/providers/offline/bn-dataset'

const dataset: BengaliDataset = {
  v: 1,
  headwords: ['বই'], roman: ['boi'], romanAlt: [], en: ['book'], enAlt: ['volume'],
  defBn: ['পড়ার বই'], defEn: ['A written work'], pos: ['noun'],
  synEn: ['volume\u0001text'], antEn: [], exBn: ['আমি বই পড়ি।'],
  exEn: ['I read a book.'], pron: ['/bʊk/'], usage: ['Everyday word'],
}

describe('extension Bengali dataset', () => {
  it('looks up Bengali and maps to the offline payload', () => {
    const dict = new BanglaDictionary(dataset)
    const entry = dict.lookup('বই')
    expect(entry).not.toBeNull()
    const payload = toOfflineEntryPayload(entry!)
    expect(payload).toMatchObject({
      headword: 'book', bn: 'পড়ার বই', def: 'A written work',
      syn: ['volume', 'text'], exBn: 'আমি বই পড়ি।', ex: 'I read a book.',
      trans: 'boi', usageNote: 'Everyday word',
    })
  })

  it('matches a Banglish spelling', () => {
    expect(new BanglaDictionary(dataset).lookup('boi')?.en).toBe('book')
  })

  it('rejects a wrong version', () => {
    expect(() => new BanglaDictionary({ ...dataset, v: 4 })).toThrow(/version/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/bn-dataset.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/offline/bn-dataset.ts
// Extension-side runtime for the Bengali-first dataset. Mirrors
// custom-dictionary/src/bn-indexer.ts so the dataset stays in one format.
import type { OfflineEntryPayload } from '../bridge'

/** Version of the Bengali-first dataset. */
export const BN_DATASET_VERSION = 1

/** Bengali-first columnar dataset. */
export interface BengaliDataset {
  v: number
  headwords: string[]
  roman: string[]
  romanAlt: string[]
  en: string[]
  enAlt: string[]
  defBn: string[]
  defEn: string[]
  pos: string[]
  synEn: string[]
  antEn: string[]
  exBn: string[]
  exEn: string[]
  pron: string[]
  usage: string[]
}

/** A single Bengali-first entry. */
export interface BengaliEntry {
  bengali: string
  roman: string
  romanAlt: string[]
  en: string
  enAlt: string[]
  defBn: string
  defEn: string
  pos: string
  synEn: string[]
  antEn: string[]
  exBn: string
  exEn: string
  pron: string
  usage: string
}

function normalize(text: string): string {
  if (!text) return ''
  return text.normalize('NFC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ').trim()
}

function banglish(query: string): string {
  if (!query) return ''
  return normalize(query)
    .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/ee/g, 'i').replace(/ea/g, 'i')
    .replace(/oo/g, 'u').replace(/ou/g, 'u').replace(/v/g, 'bh').replace(/w/g, 'b')
    .replace(/y$/g, 'i').replace(/y([bcdfghjklmnpqrstvwxz])/g, 'i$1').replace(/(.)\1+/g, '$1')
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1)
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2]! + 1)
      }
      cur[j] = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]! <= max ? prev[b.length]! : max + 1
}

/** Indexed read-only view over the Bengali dataset. */
export class BanglaDictionary {
  private readonly byBengali = new Map<string, BengaliEntry>()
  private readonly byRoman = new Map<string, BengaliEntry>()
  private readonly bengaliKeys: string[] = []

  constructor(dataset: BengaliDataset) {
    if (dataset.v !== BN_DATASET_VERSION) {
      throw new Error(`Bengali dataset version ${String(dataset.v)} !== ${BN_DATASET_VERSION}`)
    }
    const n = dataset.headwords.length
    for (const key of ['roman', 'romanAlt', 'en', 'enAlt', 'defBn', 'defEn', 'pos', 'synEn', 'antEn', 'exBn', 'exEn', 'pron', 'usage'] as const) {
      const arr = dataset[key]
      if (!Array.isArray(arr) || arr.length !== n) {
        throw new Error(`Bengali dataset column "${key}" has the wrong length`)
      }
    }
    for (let i = 0; i < n; i++) {
      const entry: BengaliEntry = {
        bengali: dataset.headwords[i] ?? '',
        roman: dataset.roman[i] ?? '',
        romanAlt: (dataset.romanAlt[i] ?? '').split('\u0001').filter(Boolean),
        en: dataset.en[i] ?? '',
        enAlt: (dataset.enAlt[i] ?? '').split('\u0001').filter(Boolean),
        defBn: dataset.defBn[i] ?? '',
        defEn: dataset.defEn[i] ?? '',
        pos: dataset.pos[i] ?? '',
        synEn: (dataset.synEn[i] ?? '').split('\u0001').filter(Boolean),
        antEn: (dataset.antEn[i] ?? '').split('\u0001').filter(Boolean),
        exBn: dataset.exBn[i] ?? '',
        exEn: dataset.exEn[i] ?? '',
        pron: dataset.pron[i] ?? '',
        usage: dataset.usage[i] ?? '',
      }
      const bn = normalize(entry.bengali)
      if (bn) {
        this.byBengali.set(bn, entry)
        this.bengaliKeys.push(bn)
      }
      for (const roman of [entry.roman, ...entry.romanAlt]) {
        const rk = normalize(roman)
        const pk = banglish(roman)
        if (rk) this.byRoman.set(rk, entry)
        if (pk && pk !== rk) this.byRoman.set(pk, entry)
      }
    }
    this.bengaliKeys.sort()
  }

  /** Bengali script first, then romanized/Banglish. */
  lookup(query: string): BengaliEntry | null {
    const bn = this.byBengali.get(normalize(query))
    if (bn) return bn
    return this.byRoman.get(normalize(query)) ?? this.byRoman.get(banglish(query)) ?? null
  }

  /** Type-ahead over Bengali headwords. */
  suggestions(query: string, limit = 8): Array<{ word: string; headword: string; bengali: boolean; hint: string }> {
    const n = normalize(query)
    if (!n) return []
    const out: Array<{ word: string; headword: string; bengali: boolean; hint: string }> = []
    for (const key of this.bengaliKeys) {
      if (key.startsWith(n) && out.length < limit) {
        const entry = this.byBengali.get(key)
        if (entry) out.push({ word: entry.bengali, headword: entry.en, bengali: true, hint: entry.en })
      }
    }
    const maxDist = n.length >= 3 ? 2 : 0
    if (maxDist && out.length < limit) {
      for (const key of this.bengaliKeys) {
        if (out.length >= limit) break
        const distance = editDistance(n, key, maxDist)
        if (distance > 0 && distance <= maxDist) {
          const entry = this.byBengali.get(key)
          if (entry) out.push({ word: entry.bengali, headword: entry.en, bengali: true, hint: entry.en })
        }
      }
    }
    return out
  }
}

/** Maps a Bengali-first entry onto the existing offline message payload. */
export function toOfflineEntryPayload(entry: BengaliEntry): OfflineEntryPayload {
  return {
    headword: entry.en,
    bn: entry.defBn || entry.bengali,
    bnAlts: [],
    trans: entry.roman,
    transAlts: entry.romanAlt,
    def: entry.defEn,
    pos: entry.pos,
    syn: entry.synEn,
    ant: entry.antEn,
    ex: entry.exEn,
    exBn: entry.exBn,
    pron: entry.pron,
    usageNote: entry.usage || undefined,
  }
}
```

```ts
// src/providers/offline/bn-loader.ts
// Loads the Bengali-first dataset in the service worker, memoized.
import { BanglaDictionary, type BengaliDataset } from './bn-dataset'

/** Path of the Bengali dataset inside the extension package. */
export const BN_DATASET_PATH = 'dictionary.bn.json.gz'

let pending: Promise<BanglaDictionary> | null = null

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available in this runtime')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/** Fetches, decompresses and indexes the Bengali dataset; retries after failure. */
export async function loadBanglaDictionary(): Promise<BanglaDictionary> {
  if (!pending) {
    pending = (async () => {
      const url = chrome.runtime.getURL(BN_DATASET_PATH)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load Bengali dictionary: HTTP ${response.status}`)
      }
      const raw = await response.arrayBuffer()
      const json = await gunzip(raw)
      const dataset = JSON.parse(new TextDecoder().decode(json)) as BengaliDataset
      return new BanglaDictionary(dataset)
    })().catch((err: unknown) => {
      pending = null
      throw err
    })
  }
  return pending
}

/** Best-effort variant: returns null instead of throwing. */
export async function tryLoadBanglaDictionary(): Promise<BanglaDictionary | null> {
  try {
    return await loadBanglaDictionary()
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/bn-dataset.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/providers/offline/bn-dataset.ts src/providers/offline/bn-loader.ts tests/bn-dataset.test.ts
git commit -m "feat(offline): add Bengali dataset runtime and loader"
```

---

## Task 7: Service worker integration

**Files:**
- Modify: `src/background/service-worker.ts`
- Modify: `tests/service-worker.test.ts`

**Interfaces:**
- Consumes: `OfflineLookupRequest.direction` (Task 5), `tryLoadBanglaDictionary`, `toOfflineEntryPayload` (Task 6), `isBengali` from `src/providers/offline/dataset`.
- Produces: BN-backed `handleOfflineLookup` for `bn-en`, BN-backed suggestions, English fallback.

- [ ] **Step 1: Add the failing tests**

In `tests/service-worker.test.ts`, extend the message type and mocks:

```ts
type MessageListener = (
  msg: { type?: string; query?: string; limit?: number; direction?: 'bn-en' | 'en-bn' },
  sender: unknown,
  respond: (r: unknown) => void,
) => boolean
```

Add a mock for the BN loader above `loadServiceWorker()`:

```ts
vi.mock('../src/providers/offline/bn-loader', () => {
  const bnEntry = {
    bengali: 'কি খবর', roman: 'ki khobor', romanAlt: [], en: 'How are you?', enAlt: [],
    defBn: '', defEn: 'A casual greeting', pos: 'phrase', synEn: ['How are you doing?'],
    antEn: [], exBn: 'কি খবর?', exEn: 'How are you?', pron: '', usage: 'Casual greeting',
  }
  return {
    BN_DATASET_PATH: 'dictionary.bn.json.gz',
    tryLoadBanglaDictionary: vi.fn(async () => ({
      lookup: (query: string) =>
        query === 'কি খবর' || query === 'ki khobor' ? bnEntry : null,
      suggestions: (query: string) =>
        query.startsWith('ক') ? [{ word: 'কি খবর', headword: 'How are you?', bengali: true, hint: 'How are you?' }] : [],
    })),
  }
})
```

Add these test cases:

```ts
describe('Bengali-first offline lookup', () => {
  it('answers a pinned bn→en query from the Bengali dataset', async () => {
    const chromeMock = installChrome({})
    await loadServiceWorker()
    const response = await chromeMock.ask({
      type: OFFLINE_LOOKUP_MESSAGE,
      query: 'কি খবর',
      isBengali: true,
      direction: 'bn-en',
    })
    expect(response.ok).toBe(true)
    expect(response.result.headword).toBe('How are you?')
    expect(response.result.syn).toEqual(['How are you doing?'])
    expect(response.result.exBn).toBe('কি খবর?')
  })

  it('answers a Banglish query when direction is pinned to bn→en', async () => {
    const chromeMock = installChrome({})
    await loadServiceWorker()
    const response = await chromeMock.ask({
      type: OFFLINE_LOOKUP_MESSAGE,
      query: 'ki khobor',
      isBengali: false,
      direction: 'bn-en',
    })
    expect(response.result.headword).toBe('How are you?')
  })

  it('falls back to the English dictionary when the Bengali dataset is unavailable', async () => {
    const { tryLoadBanglaDictionary } = await import('../src/providers/offline/bn-loader')
    vi.mocked(tryLoadBanglaDictionary).mockResolvedValueOnce(null)
    const chromeMock = installChrome({})
    await loadServiceWorker()
    const response = await chromeMock.ask({
      type: OFFLINE_LOOKUP_MESSAGE,
      query: 'বই',
      isBengali: true,
      direction: 'bn-en',
    })
    expect(response.result.headword).toBe('book')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/service-worker.test.ts`
Expected: FAIL — new cases fail because the worker ignores `direction`.

- [ ] **Step 3: Modify the service worker**

Add imports:

```ts
import { isBengali } from '../providers/offline/dataset'
import { tryLoadBanglaDictionary } from '../providers/offline/bn-loader'
import { toOfflineEntryPayload } from '../providers/offline/bn-dataset'
```

Replace `handleOfflineLookup`:

```ts
/** Resolves a query against the Bengali-first or English-first dictionary. */
async function handleOfflineLookup(
  msg: OfflineLookupRequest,
): Promise<OfflineLookupResponse> {
  // A pinned bn→en pair can produce Latin-script Banglish, so direction is the
  // primary signal. isBengali is kept for callers that do not send direction.
  if (msg.direction === 'bn-en' || msg.isBengali) {
    const bn = await tryLoadBanglaDictionary()
    if (bn) {
      const hit = bn.lookup(msg.query)
      if (hit) {
        return { ok: true, result: toOfflineEntryPayload(hit), via: 'bengali' }
      }
    }
    // Fall through: a word missing from the BN dataset still gets the old
    // reverse lookup, so the new package never makes a query fail.
  }

  const dictionary = await loadOfflineDictionary()
  if (msg.isBengali) {
    const hit = dictionary.lookupBengali(msg.query)
    if (!hit) return { ok: true, result: null, via: 'bengali' }
    return { ok: true, result: { ...hit.entry, bn: hit.bengali, trans: hit.roman }, via: 'bengali' }
  }
  const english = dictionary.lookupEnglish(msg.query)
  if (english) return { ok: true, result: { ...english }, via: 'english' }
  const roman = dictionary.lookupRoman(msg.query)
  if (roman) return { ok: true, result: { ...roman.entry }, via: 'roman' }
  return { ok: true, result: null, via: 'english' }
}
```

Replace `handleSuggest`:

```ts
/** Suggests dictionary words; Bengali/Banglish input uses the BN dataset. */
async function handleSuggest(msg: SuggestRequest): Promise<SuggestResponse> {
  if (isBengali(msg.query)) {
    const bn = await tryLoadBanglaDictionary()
    if (bn) {
      return { ok: true, suggestions: bn.suggestions(msg.query, msg.limit ?? 8) }
    }
  }
  const dictionary = await loadOfflineDictionary()
  return { ok: true, suggestions: dictionary.suggest(msg.query, msg.limit ?? 8) }
}
```

- [ ] **Step 4: Run the whole extension test suite**

Run: `cd 'E:\Special NEED\Translator extention'; npm test`
Expected: all tests pass, including the three new cases.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/background/service-worker.ts tests/service-worker.test.ts
git commit -m "feat(offline): serve bn→en lookups from the Bengali dataset"
```

---

## Task 8: Coordinator integration

**Files:**
- Modify: `src/lookup/coordinator.ts`
- Test: `tests/bn-coordinator.test.ts`

**Interfaces:**
- Consumes: `offlineBengaliLookup(query, direction)` (Task 5), `OfflineEntryPayload.usageNote` (Task 5).
- Produces: BN-backed provisional `LOCAL_RESULT` with full rich fields; unchanged `requestId`/ranking semantics.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bn-coordinator.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { OFFLINE_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent } from '../src/shared/types'

const sendMessage = vi.fn()
const BN_PAYLOAD = {
  headword: 'How are you?', bn: '', bnAlts: [], trans: 'ki khobor', transAlts: [],
  def: 'A casual greeting', pos: 'phrase', syn: ['How are you doing?'],
  ant: [], ex: 'How are you?', exBn: 'কি খবর?', pron: '', usageNote: 'Casual greeting',
}

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    storage: {
      local: {
        get: (_key: string, cb: (r: Record<string, unknown>) => void) =>
          cb({ 'vocabflow.languages': { source: 'bn', target: 'en' } }),
        set: (_items: Record<string, unknown>, cb?: () => void) => cb?.(),
      },
    },
  }
})

function mockBridge() {
  sendMessage.mockImplementation(async (req: { type?: string }) => {
    if (req.type === SEED_MESSAGE) return { ok: true }
    if (req.type === OFFLINE_LOOKUP_MESSAGE) {
      return { ok: true, result: BN_PAYLOAD, via: 'bengali' }
    }
    return new Promise(() => {})
  })
}

const settings = {
  groq: { apiKey: '', enabled: false, model: '' },
  openrouter: { apiKey: '', enabled: false, model: '' },
  gemini: { apiKey: '', enabled: false, model: '' },
}

describe('Bengali-first coordinator integration', () => {
  it('pinned bn→en Banglish query uses the Bengali dataset and its rich fields', async () => {
    mockBridge()
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('ki khobor', settings)
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result.headword).toBe('How are you?')
    expect(local.result.synonyms).toEqual(['How are you doing?'])
    expect(local.result.exampleEn).toBe('How are you?')
    expect(local.result.exampleBn).toBe('কি খবর?')
    expect(local.result.transcription).toBe('ki khobor')
    expect(local.result.usageNote).toBe('Casual greeting')
    const offlineMessage = sendMessage.mock.calls.find((c) => c[0]?.type === OFFLINE_LOOKUP_MESSAGE)
    expect(offlineMessage?.[0]).toMatchObject({ isBengali: true, direction: 'bn-en' })
  })

  it('English query still uses the English path', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) {
        return { ok: true, result: { headword: 'book', bn: 'বই', bnAlts: [], trans: 'boi', transAlts: [], def: 'a written work', pos: 'noun', syn: [], ant: [], ex: '' }, via: 'english' }
      }
      return new Promise(() => {})
    })
    const c = new LookupCoordinator({ onEvent: () => {} })
    await c.lookup('book', settings)
    const offlineMessage = sendMessage.mock.calls.find((c) => c[0]?.type === OFFLINE_LOOKUP_MESSAGE)
    expect(offlineMessage?.[0]).toMatchObject({ isBengali: false })
  })

  it('drops a stale Bengali result after the query changes', async () => {
    mockBridge()
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    const first = c.lookup('ki khobor', settings)
    c.cancel()
    await first
    const complete = events.find((e) => e.type === 'LOOKUP_COMPLETE')
    expect(complete).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/bn-coordinator.test.ts`
Expected: FAIL — coordinator does not pass `direction`, and does not map `usageNote`.

- [ ] **Step 3: Modify the coordinator**

(a) Move direction resolution above the offline promise. Replace lines 228–248 region so the order is:

```ts
    const bengaliInput = isBengali(query)

    // The seed handshake is dispatched first (without awaiting it) so that the
    // service worker applies the first-run seed while the offline lookup is
    // already in flight.
    const settingsPromise = settings ? Promise.resolve(settings) : this.loadSeededSettings()
    const pairPromise = loadLanguagePair()

    // Resolve the direction before the offline round trip so the service worker
    // can pick the Bengali-first dataset for a pinned bn→en Banglish query.
    const [cfg, pair] = await Promise.all([settingsPromise, pairPromise])
    const pinnedToBengali = isSupportedPair(pair) && pair.source === 'bn' && pair.target === 'en'
    let direction: LookupDirection = bengaliInput || pinnedToBengali ? 'bn-en' : 'en-bn'

    const offlinePromise = this.fetchOffline(query, bengaliInput, direction)
```

Remove the later duplicate `const [cfg, pair]`, `pinnedToBengali`, `direction`, and `const offlinePromise = this.fetchOffline(...)` lines (now lines ~239–248 in the original file) so the declarations above are the only ones.

(b) Change `fetchOffline` signature and Bengali branch:

```ts
  private async fetchOffline(
    query: string,
    bengaliInput: boolean,
    direction: LookupDirection,
  ): Promise<OfflineHit | null> {
    const useBengaliDataset = direction === 'bn-en' || bengaliInput
    const lookup = (async () => {
      let payload: OfflineEntryPayload | null = null
      let roman = ''
      let via: OfflineLookupMatch | undefined
      if (useBengaliDataset) {
        const hit = await offlineBengaliLookup(query, direction)
        payload = hit?.entry ?? null
        roman = hit?.roman ?? ''
        via = 'bengali'
      } else {
        const hit = await offlineLookupWithMatch(query)
        payload = hit.entry
        via = hit.via
        if (payload?.trans) roman = payload.trans
      }
      if (!payload) return null
      const headword = payload.headword
      const interesting =
        !!headword && headword.toLowerCase() !== query.toLowerCase() ? headword : undefined
      return { entry: payload, headword: interesting, roman, via }
    })()
```

(c) Add `usageNote` to the provisional offline result in the `offlineJob` block, next to `partOfSpeech`:

```ts
        partOfSpeech: source.pos || undefined,
        usageNote: source.usageNote || undefined,
```

- [ ] **Step 4: Run all checks**

Run: `cd 'E:\Special NEED\Translator extention'; npm test`
Expected: all tests pass, including the three new BN coordinator cases.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/lookup/coordinator.ts tests/bn-coordinator.test.ts
git commit -m "feat(offline): use Bengali-first dataset for bn→en lookups"
```

---

## Task 9: Documentation, full verification, push

**Files:**
- Modify: `custom-dictionary/PRD.md`, `ARCHITECTURE.md`, `MEMORY.md`, `PHASES.md`, `README.md`
- Modify: `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md`

**Interfaces:** none.

- [ ] **Step 1: Update custom-dictionary docs**

In `custom-dictionary/PRD.md`, add a section describing the Bengali-first package (folder `data/bn/`, artifact `dictionary.bn.json.gz`, goals, success metrics) and update the "Languages supported at launch" row to note Bengali-first + English-first.

In `custom-dictionary/ARCHITECTURE.md`, add a section for the BN dataset schema (`v: 1`), build pipeline (`build-bn-dictionary.mjs`), `BanglaDictionary` indexes, and the message flow. Note that the extension carries a mirrored runtime in `src/providers/offline/bn-dataset.ts`.

In `custom-dictionary/README.md`, add:
- `npm run build:bn-dictionary` to the build section.
- A "Bengali-first dataset" section pointing to `data/bn/README.md` and explaining that `en` is the natural English equivalent while literal renderings live in `enAlt`/`usage`.
- The new files under the Architecture tree.

In `custom-dictionary/PHASES.md`, add a new **Phase 8 — Bengali-first dataset** with checked items matching Tasks 1–4, and resync the "Current Status" header from the stale Phase 4 note.

In `custom-dictionary/MEMORY.md`, convert the commented-out stale content into a current status block: record the decisions (v1 BN schema, inversion from English-first dataset, curated/idioms win, mirrored runtime in the extension, data-driven not ML), files added, and the new next step.

- [ ] **Step 2: Update extension docs**

In `ARCHITECTURE.md`, add to the Storage and Search flow sections:
- `public/dictionary.bn.json.gz` — Bengali-first dataset, fetched by `src/providers/offline/bn-loader.ts`.
- `VOCABFLOW_OFFLINE_LOOKUP` now carries optional `direction`; the worker uses the BN dataset for `bn-en`.
- Update the directory structure block with `bn-dataset.ts` and `bn-loader.ts`.

In `TASKS.md`, add a **Phase 11 — Bengali-first offline dictionary** section with checked items for the dataset, builder, runtime, integration, and tests; leave unchecked items for "wider licensed Bengali corpus" and "more idiom coverage".

In `MEMORY.md`, add decisions under "Decisions" and completed items under "Completed", and update "Next step" to manual Chrome verification of a Bengali query.

- [ ] **Step 3: Full verification (do not claim success until all pass)**

Run each and record the output:

```bash
cd 'E:\Special NEED\Translator extention\custom-dictionary'
npm run lint
npm run typecheck
npm test
npm run build:dictionary
npm run build:bn-dictionary

cd 'E:\Special NEED\Translator extention'
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0. `dist/dictionary.json.gz` and `dist/dictionary.bn.json.gz` both exist after build.

- [ ] **Step 4: Commit docs**

```bash
cd 'E:\Special NEED\Translator extention'
git add custom-dictionary/PRD.md custom-dictionary/ARCHITECTURE.md custom-dictionary/MEMORY.md custom-dictionary/PHASES.md custom-dictionary/README.md ARCHITECTURE.md TASKS.md MEMORY.md
git commit -m "docs: document Bengali-first offline dataset"
```

- [ ] **Step 5: Push to main (explicitly requested)**

```bash
cd 'E:\Special NEED\Translator extention'
git status --short
git log --oneline -12
git push origin main
```

Expected: push succeeds. If authentication is required, report the exact error and stop — never embed a credential.

- [ ] **Step 6: Final report**

Summarize: files changed, test/typecheck/lint/build results, commit SHAs, push result, and what still needs manual Chrome verification.
