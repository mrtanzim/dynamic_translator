# Japanese Offline Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a licensed Japanese–English offline dataset and wire both directions into the overlay with kana/romaji output and direction-aware AI prompts.

**Architecture:** A trimmed JMdict-Simplified "common" English subset is committed as a build-time source and converted to a columnar v1 dataset with kana, romaji, English glosses and the eight enriched fields. The service worker loads/indexes it, new bridge messages expose lookup and suggestions, the coordinator routes Japanese directions to it, and the AI prompt is generalized to take a direction.

**Tech Stack:** TypeScript strict, Node ESM build scripts, Vitest, columnar gzip datasets, Chrome MV3 messaging, React/Shadow DOM UI.

**Spec:** `docs/superpowers/specs/2026-11-20-japanese-dictionary-design.md`

## Global Constraints

- Japanese dataset version exactly **1** (`JA_DATASET_VERSION = 1`). English v5 and Bengali v2 unchanged.
- Source data committed; no runtime network; no ML model; no new runtime dependencies.
- JMdict/EDRDG attribution required in docs and in `scripts/data/ja-source.md`.
- Multi-value columns joined with `U+0001`; all columns equal length.
- `LookupDirection` gains `ja-en` and `en-ja`; existing `en-bn`/`bn-en` behavior must not change.
- Offline remains provisional and ranks last.
- UI follows `DESIGN.md` tokens; CJK font fallback required.
- Tests green; Conventional Commits; push to `origin/main`.

## Review Focus

1. **Japanese script detection** — Hiragana, Katakana and Kanji must route to the JA dataset; Latin romaji must also resolve while ordinary English still uses the English path. → Task 4 tests.
2. **Romaji correctness** — common kana (`こんにちは` → `konnichiwa`, small `ゃ`, sokuon `っ`) must produce usable Latin forms. → Task 2 romaji tests.
3. **Broken JA dataset** — must be best-effort; English/Bengali lookup and AI providers unaffected. → Task 4 fallback test.
4. **Existing directions unchanged** — pinned bn→en Banglish and English queries must still work after adding ja directions. → Task 4 regression tests.
5. **AI prompt direction** — Japanese direction must request kana/romaji; Bengali behavior must stay verbatim. → Task 5 tests.

---

## Task 1: Commit the licensed JMdict subset

**Files:**
- Create: `scripts/data/jmdict-common-subset.json`
- Create: `scripts/data/ja-source.md`
- Test: `scripts/data/ja-source.test.mjs`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

```js
// scripts/data/ja-source.test.mjs
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('./jmdict-common-subset.json', import.meta.url))

describe('JMdict subset', () => {
  const data = JSON.parse(readFileSync(file, 'utf8'))

  it('contains at least 8,000 entries with kana and English glosses', () => {
    expect(data.words.length).toBeGreaterThanOrEqual(8000)
    const valid = data.words.filter((w) =>
      w.kana?.some((k) => k.common) &&
      w.sense?.some((s) => s.gloss?.some((g) => g.lang === 'eng' && g.text)),
    )
    expect(valid.length).toBeGreaterThanOrEqual(8000)
  })

  it('carries attribution metadata', () => {
    expect(data.source).toMatch(/JMdict/i)
    expect(data.license).toMatch(/EDRDG/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run scripts/data/ja-source.test.mjs`
Expected: FAIL — file not found.

- [ ] **Step 3: Create the subset and attribution**

The verified source is `W:\DEV_TEMP\opencode\jmdict-eng-common-3.6.2.json` (22,661 `words`). Generate the committed subset with a one-off Node command:

```bash
cd 'E:\Special NEED\Translator extention'
node -e "
const fs=require('fs');
const src=require('W:/DEV_TEMP/opencode/jmdict-eng-common-3.6.2.json');
const words=src.words.filter(w=>w.kana?.some(k=>k.common) && w.sense?.some(s=>s.gloss?.some(g=>g.lang==='eng'&&g.text))).slice(0,10000);
fs.writeFileSync('scripts/data/jmdict-common-subset.json', JSON.stringify({source:'JMdict (scriptin/jmdict-simplified, common English release 3.6.2+20261116213322)',license:'EDRDG license — derived from JMdict, property of the Electronic Dictionary Research and Development Group; project started 1991 by Jim Breen',commonOnly:true,words}));
"
```

Create `scripts/data/ja-source.md`:
```md
# JMdict source and attribution

`jmdict-common-subset.json` is derived from the JMdict "common" English release
3.6.2+20261116213322 published by `scriptin/jmdict-simplified`.

JMdict is the property of the Electronic Dictionary Research and Development
Group (EDRDG) and is used in conformance with the EDRDG license
(http://www.edrdg.org/edrdg/licence.html). The dictionary project was started in
1991 by Jim Breen. Derived files are distributed under the same license.

The subset keeps 10,000 entries with a common kana reading and at least one
English gloss. No network access is needed at build time or runtime.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run scripts/data/ja-source.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add scripts/data/jmdict-common-subset.json scripts/data/ja-source.md scripts/data/ja-source.test.mjs
git commit -m "feat(japanese): commit licensed JMdict subset"
```

---

## Task 2: Japanese dataset schema, romaji table and builder

**Files:**
- Create: `scripts/lib/ja-romaji.mjs`
- Create: `scripts/lib/ja-schema.mjs`
- Create: `scripts/data/ja-overrides.json`
- Create: `scripts/build-japanese-dictionary.mjs`
- Test: `scripts/lib/ja-dataset.test.mjs`

**Interfaces:**
- Produces: `toRomaji(kana)`, `JA_DATASET_VERSION = 1`, `serializeJapaneseDataset(entries)`, `public/dictionary.ja.json.gz`.
- Consumes: `enrichEntry` from `scripts/lib/enrichment.mjs` (Task 1 of the previous plan).

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/ja-dataset.test.mjs
import { describe, expect, it } from 'vitest'
import { toRomaji } from './ja-romaji.mjs'
import { JA_DATASET_VERSION, serializeJapaneseDataset } from './ja-schema.mjs'

const entry = {
  surface: 'こんにちは', kana: 'こんにちは', romaji: 'konnichiwa',
  en: 'hello', enAlt: ['good afternoon'], pos: 'phrase',
  synEn: ['hi'], antEn: ['goodbye'], exampleJa: 'こんにちは。', exampleEn: 'Hello.',
  formalMeaning: 'hello', conversationalMeaning: 'hi',
  exampleFormal: 'こんにちは。', exampleConversational: 'やあ。',
  collocations: [], wordFamily: '', bandLevel: '5.5', commonMistake: '',
}

describe('Japanese dataset', () => {
  it('romanizes common kana including small kana and sokuon', () => {
    expect(toRomaji('こんにちは')).toBe('konnichiwa')
    expect(toRomaji('きゃ')).toBe('kya')
    expect(toRomaji('がっこう')).toBe('gakkou')
  })

  it('serializes a version-1 columnar dataset with equal column lengths', () => {
    const d = serializeJapaneseDataset([entry])
    expect(d.v).toBe(JA_DATASET_VERSION)
    const lengths = Object.values(d).filter(Array.isArray).map((a) => a.length)
    expect(new Set(lengths).size).toBe(1)
    expect(d.headwords[0]).toBe('こんにちは')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run scripts/lib/ja-dataset.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the romaji table**

```js
// scripts/lib/ja-romaji.mjs
// Build-time kana -> romaji conversion. Covers common kana, small kana and
// sokuon; it is a fixed table, not a general romanization engine.
const BASE = {
  あ:'a', い:'i', う:'u', え:'e', お:'o',
  か:'ka', き:'ki', く:'ku', け:'ke', こ:'ko',
  さ:'sa', し:'shi', す:'su', せ:'se', そ:'so',
  た:'ta', ち:'chi', つ:'tsu', て:'te', と:'to',
  な:'na', に:'ni', ぬ:'nu', ね:'ne', の:'no',
  は:'ha', ひ:'hi', ふ:'fu', へ:'he', ほ:'ho',
  ま:'ma', み:'mi', む:'mu', め:'me', も:'mo',
  や:'ya', ゆ:'yu', よ:'yo',
  ら:'ra', り:'ri', る:'ru', れ:'re', ろ:'ro',
  わ:'wa', を:'wo', ん:'n',
  が:'ga', ぎ:'gi', ぐ:'gu', げ:'ge', ご:'go',
  ざ:'za', じ:'ji', ず:'zu', ぜ:'ze', ぞ:'zo',
  だ:'da', ぢ:'ji', づ:'zu', で:'de', ど:'do',
  ば:'ba', び:'bi', ぶ:'bu', べ:'be', ぼ:'bo',
  ぱ:'pa', ぴ:'pi', ぷ:'pu', ぺ:'pe', ぽ:'po',
}
const SMALL = { ゃ:'ya', ゅ:'yu', ょ:'yo', っ:'', ぁ:'a', ぃ:'i', ぅ:'u', ぇ:'e', ぉ:'o' }
const KATAKANA_OFFSET = 0x60

function normalize(ch) {
  const code = ch.codePointAt(0)
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - KATAKANA_OFFSET)
  return ch
}

/** Converts kana to a lowercase romaji string. */
export function toRomaji(kana) {
  if (!kana) return ''
  const chars = [...kana].map(normalize)
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === 'っ') {
      const next = BASE[chars[i + 1]] ?? SMALL[chars[i + 1]] ?? ''
      out += next ? next[0] : ''
      continue
    }
    if (SMALL[ch]) {
      const prev = BASE[chars[i - 1]] ?? ''
      out += prev ? prev.slice(0, -1) + SMALL[ch] : SMALL[ch]
      continue
    }
    out += BASE[ch] ?? ch
  }
  return out.toLowerCase()
}
```

- [ ] **Step 4: Write the schema module**

```js
// scripts/lib/ja-schema.mjs
export const JA_DATASET_VERSION = 1
export const JA_SEP = '\u0001'

export const JA_COLUMNS = [
  'headwords', 'kana', 'romaji', 'en', 'enAlt', 'pos', 'synEn', 'antEn',
  'exampleJa', 'exampleEn', 'formalMeaning', 'conversationalMeaning',
  'exampleFormal', 'exampleConversational', 'collocations', 'wordFamily',
  'bandLevel', 'commonMistake',
]

/** Serializes entries to a sorted columnar dataset. */
export function serializeJapaneseDataset(entries) {
  const sorted = [...entries].sort((a, b) => a.surface.localeCompare(b.surface))
  const column = (get) => sorted.map(get)
  const dataset = { v: JA_DATASET_VERSION }
  for (const key of JA_COLUMNS) dataset[key] = []
  dataset.headwords = column((e) => e.surface)
  dataset.kana = column((e) => e.kana)
  dataset.romaji = column((e) => e.romaji)
  dataset.en = column((e) => e.en)
  dataset.enAlt = column((e) => (e.enAlt ?? []).join(JA_SEP))
  dataset.pos = column((e) => e.pos ?? '')
  dataset.synEn = column((e) => (e.synEn ?? []).join(JA_SEP))
  dataset.antEn = column((e) => (e.antEn ?? []).join(JA_SEP))
  dataset.exampleJa = column((e) => e.exampleJa ?? '')
  dataset.exampleEn = column((e) => e.exampleEn ?? '')
  dataset.formalMeaning = column((e) => e.formalMeaning ?? '')
  dataset.conversationalMeaning = column((e) => e.conversationalMeaning ?? '')
  dataset.exampleFormal = column((e) => e.exampleFormal ?? '')
  dataset.exampleConversational = column((e) => e.exampleConversational ?? '')
  dataset.collocations = column((e) => (e.collocations ?? []).join(JA_SEP))
  dataset.wordFamily = column((e) => e.wordFamily ?? '')
  dataset.bandLevel = column((e) => e.bandLevel ?? '')
  dataset.commonMistake = column((e) => e.commonMistake ?? '')
  return dataset
}
```

- [ ] **Step 5: Write the overrides file**

```json
// scripts/data/ja-overrides.json
{
  "こんにちは": {
    "en": "Hello",
    "enAlt": ["Good afternoon", "Hi"],
    "pos": "greeting",
    "synEn": ["Hi", "Good afternoon"],
    "exampleJa": "こんにちは、お元気ですか？",
    "exampleEn": "Hello, how are you?",
    "formalMeaning": "Hello (a standard daytime greeting)",
    "conversationalMeaning": "Hi",
    "usage": "Use こんにちは in the daytime; おはよう for morning and こんばんは for evening."
  },
  "ありがとう": {
    "en": "Thank you",
    "enAlt": ["Thanks"],
    "pos": "phrase",
    "synEn": ["Thanks", "Many thanks"],
    "exampleJa": "助けてくれてありがとう。",
    "exampleEn": "Thank you for helping me.",
    "formalMeaning": "Thank you",
    "conversationalMeaning": "Thanks"
  }
}
```

- [ ] **Step 6: Write the builder**

```js
// scripts/build-japanese-dictionary.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
async function load(rel) { return import(pathToFileURL(path.join(__dirname, rel)).href) }

const { toRomaji } = await load('lib/ja-romaji.mjs')
const { serializeJapaneseDataset } = await load('lib/ja-schema.mjs')
const { enrichEntry, loadBandList } = await load('lib/enrichment.mjs')

const source = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'jmdict-common-subset.json'), 'utf8'))
const overrides = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'ja-overrides.json'), 'utf8'))
const bandList = loadBandList(path.join(root, 'scripts', 'data', 'cefr-bands.json'))

const POS_LABELS = { n: 'noun', v5r: 'verb', vs: 'verb', 'adj-i': 'adjective', adv: 'adverb', int: 'interjection' }
const entries = []

for (const word of source.words) {
  const kanaEntry = word.kana?.find((k) => k.common) ?? word.kana?.[0]
  if (!kanaEntry) continue
  const sense = word.sense?.find((s) => s.gloss?.some((g) => g.lang === 'eng')) ?? word.sense?.[0]
  if (!sense) continue
  const glosses = sense.gloss?.filter((g) => g.lang === 'eng').map((g) => g.text).filter(Boolean) ?? []
  if (!glosses.length) continue
  const surface = word.kanji?.find((k) => k.common)?.text ?? kanaEntry.text
  const pos = POS_LABELS[sense.partOfSpeech?.[0]] ?? 'word'
  const enriched = enrichEntry(
    { def: glosses[0], ex: '' },
    { word: surface, pos: sense.partOfSpeech?.[0] ?? '', senses: new Map(), examples: [], bandList, overrides: overrides[surface] ?? {} },
  )
  entries.push({
    surface,
    kana: kanaEntry.text,
    romaji: toRomaji(kanaEntry.text),
    en: (overrides[surface]?.en ?? glosses[0]),
    enAlt: overrides[surface]?.enAlt ?? glosses.slice(1),
    pos,
    synEn: overrides[surface]?.synEn ?? [],
    antEn: overrides[surface]?.antEn ?? [],
    exampleJa: overrides[surface]?.exampleJa ?? '',
    exampleEn: overrides[surface]?.exampleEn ?? '',
    ...enriched,
    ...overrides[surface],
  })
}

const dataset = serializeJapaneseDataset(entries)
const json = JSON.stringify(dataset)
const jsonPath = path.join(root, 'public', 'dictionary.ja.json')
const gzPath = path.join(root, 'public', 'dictionary.ja.json.gz')
fs.mkdirSync(path.dirname(gzPath), { recursive: true })
fs.writeFileSync(jsonPath, json, 'utf8')
fs.writeFileSync(gzPath, zlib.gzipSync(json, { level: 9 }))
console.log(`Japanese dataset: ${entries.length} entries`)
```

Add the npm scripts in the root `package.json`:
```json
"build:japanese-dictionary": "node scripts/build-japanese-dictionary.mjs"
```

- [ ] **Step 7: Run tests and build**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run scripts/lib/ja-dataset.test.mjs; npm run build:japanese-dictionary`
Expected: tests PASS (2), build prints ~10,000 entries, `public/dictionary.ja.json(.gz)` created.

- [ ] **Step 8: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add scripts/lib/ja-romaji.mjs scripts/lib/ja-schema.mjs scripts/lib/ja-dataset.test.mjs scripts/data/ja-overrides.json scripts/build-japanese-dictionary.mjs package.json public/dictionary.ja.json public/dictionary.ja.json.gz
git commit -m "feat(japanese): build Japanese offline dataset v1"
```

---

## Task 3: Extension runtime and bridge messages

**Files:**
- Create: `src/providers/offline/ja-dataset.ts`
- Create: `src/providers/offline/ja-loader.ts`
- Modify: `src/providers/bridge.ts`
- Test: `tests/ja-dataset.test.ts`

**Interfaces:**
- Produces: `JaDataset`, `JapaneseDictionary` (`lookupJapanese`, `lookupEnglish`, `suggestions`), `loadJapaneseDictionary()`, `tryLoadJapaneseDictionary()`, `JA_LOOKUP_MESSAGE`, `JA_SUGGEST_MESSAGE`.
- Consumes: v1 dataset from Task 2.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ja-dataset.test.ts
import { describe, expect, it } from 'vitest'
import { JapaneseDictionary } from '../src/providers/offline/ja-dataset'
import type { JaDataset } from '../src/providers/offline/ja-dataset'

const dataset: JaDataset = {
  v: 1,
  headwords: ['こんにちは'], kana: ['こんにちは'], romaji: ['konnichiwa'],
  en: ['Hello'], enAlt: ['Hi'], pos: ['greeting'], synEn: ['Hi'], antEn: [''],
  exampleJa: ['こんにちは。'], exampleEn: ['Hello.'],
  formalMeaning: ['Hello'], conversationalMeaning: ['Hi'],
  exampleFormal: [''], exampleConversational: [''],
  collocations: [''], wordFamily: [''], bandLevel: ['5.5'], commonMistake: [''],
}

describe('JapaneseDictionary', () => {
  const d = new JapaneseDictionary(dataset)
  it('looks up Japanese script, kana and romaji', () => {
    expect(d.lookup('こんにちは')?.en).toBe('Hello')
    expect(d.lookup('コンニチハ')?.en).toBe('Hello')
    expect(d.lookup('konnichiwa')?.en).toBe('Hello')
  })
  it('looks up English back to Japanese', () => {
    expect(d.lookupEnglish('hello')?.surface).toBe('こんにちは')
  })
  it('rejects a wrong version', () => {
    expect(() => new JapaneseDictionary({ ...dataset, v: 4 })).toThrow(/version/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/ja-dataset.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the runtime**

```ts
// src/providers/offline/ja-dataset.ts
/** Japanese dataset version. */
export const JA_DATASET_VERSION = 1

/** Columnar Japanese dataset. */
export interface JaDataset {
  v: number
  headwords: string[]; kana: string[]; romaji: string[]; en: string[]; enAlt: string[]
  pos: string[]; synEn: string[]; antEn: string[]; exampleJa: string[]; exampleEn: string[]
  formalMeaning: string[]; conversationalMeaning: string[]
  exampleFormal: string[]; exampleConversational: string[]
  collocations: string[]; wordFamily: string[]; bandLevel: string[]; commonMistake: string[]
}

/** A single Japanese entry. */
export interface JaEntry {
  surface: string; kana: string; romaji: string; en: string; enAlt: string[]
  pos: string; synEn: string[]; antEn: string[]; exampleJa: string; exampleEn: string
  formalMeaning: string; conversationalMeaning: string
  exampleFormal: string; exampleConversational: string
  collocations: string[]; wordFamily: string; bandLevel: string; commonMistake: string
}

/** True for Hiragana, Katakana, Kanji and iteration marks. */
export function isJapanese(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3005]/.test(text)
}

function lower(s: string): string { return s.toLowerCase().trim() }

/** Indexed read-only view over the Japanese dataset. */
export class JapaneseDictionary {
  private readonly byKey = new Map<string, JaEntry>()
  private readonly byEnglish = new Map<string, JaEntry>()

  constructor(dataset: JaDataset) {
    if (dataset.v !== JA_DATASET_VERSION) {
      throw new Error(`Japanese dataset version ${String(dataset.v)} !== ${JA_DATASET_VERSION}`)
    }
    const n = dataset.headwords.length
    const add = (key: string, entry: JaEntry) => {
      const k = lower(key)
      if (k && !this.byKey.has(k)) this.byKey.set(k, entry)
    }
    for (let i = 0; i < n; i++) {
      const entry: JaEntry = {
        surface: dataset.headwords[i] ?? '', kana: dataset.kana[i] ?? '',
        romaji: dataset.romaji[i] ?? '', en: dataset.en[i] ?? '',
        enAlt: (dataset.enAlt[i] ?? '').split('\u0001').filter(Boolean),
        pos: dataset.pos[i] ?? '',
        synEn: (dataset.synEn[i] ?? '').split('\u0001').filter(Boolean),
        antEn: (dataset.antEn[i] ?? '').split('\u0001').filter(Boolean),
        exampleJa: dataset.exampleJa[i] ?? '', exampleEn: dataset.exampleEn[i] ?? '',
        formalMeaning: dataset.formalMeaning[i] ?? '',
        conversationalMeaning: dataset.conversationalMeaning[i] ?? '',
        exampleFormal: dataset.exampleFormal[i] ?? '',
        exampleConversational: dataset.exampleConversational[i] ?? '',
        collocations: (dataset.collocations[i] ?? '').split('\u0001').filter(Boolean),
        wordFamily: dataset.wordFamily[i] ?? '',
        bandLevel: dataset.bandLevel[i] ?? '', commonMistake: dataset.commonMistake[i] ?? '',
      }
      add(entry.surface, entry); add(entry.kana, entry); add(entry.romaji, entry)
      for (const en of [entry.en, ...entry.enAlt]) {
        const key = lower(en)
        if (key && !this.byEnglish.has(key)) this.byEnglish.set(key, entry)
      }
    }
  }

  /** Japanese script, kana or romaji lookup. */
  lookup(query: string): JaEntry | null {
    return this.byKey.get(lower(query)) ?? null
  }

  /** English → Japanese reverse lookup. */
  lookupEnglish(query: string): JaEntry | null {
    return this.byEnglish.get(lower(query)) ?? null
  }

  /** Prefix suggestions over Japanese surfaces and romaji. */
  suggestions(query: string, limit = 8): Array<{ word: string; headword: string; japanese: boolean; hint: string }> {
    const q = lower(query)
    if (!q) return []
    const out: Array<{ word: string; headword: string; japanese: boolean; hint: string }> = []
    for (const [key, entry] of this.byKey) {
      if (key.startsWith(q) && out.length < limit && !out.some((s) => s.word === entry.surface)) {
        out.push({ word: entry.surface, headword: entry.en, japanese: true, hint: entry.en })
      }
    }
    return out
  }
}
```

```ts
// src/providers/offline/ja-loader.ts
import { JapaneseDictionary, type JaDataset } from './ja-dataset'

export const JA_DATASET_PATH = 'dictionary.ja.json.gz'
let pending: Promise<JapaneseDictionary> | null = null

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available in this runtime')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/** Memoized loader; a failure is not cached so a later call can retry. */
export async function loadJapaneseDictionary(): Promise<JapaneseDictionary> {
  if (!pending) {
    pending = (async () => {
      const url = chrome.runtime.getURL(JA_DATASET_PATH)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to load Japanese dictionary: HTTP ${response.status}`)
      const raw = await response.arrayBuffer()
      const dataset = JSON.parse(new TextDecoder().decode(await gunzip(raw))) as JaDataset
      return new JapaneseDictionary(dataset)
    })().catch((err: unknown) => { pending = null; throw err })
  }
  return pending
}

/** Best-effort variant used by the service worker. */
export async function tryLoadJapaneseDictionary(): Promise<JapaneseDictionary | null> {
  try { return await loadJapaneseDictionary() } catch { return null }
}
```

In `src/providers/bridge.ts`, add:
```ts
export const JA_LOOKUP_MESSAGE = 'VOCABFLOW_JA_LOOKUP'
export const JA_SUGGEST_MESSAGE = 'VOCABFLOW_JA_SUGGEST'

export interface JaLookupRequest {
  type: typeof JA_LOOKUP_MESSAGE
  query: string
  direction: 'ja-en' | 'en-ja'
}
export interface JaSuggestRequest {
  type: typeof JA_SUGGEST_MESSAGE
  query: string
  limit?: number
}
export interface JaEntryPayload {
  surface: string; kana: string; romaji: string; en: string; enAlt: string[]
  pos: string; synEn: string[]; antEn: string[]; exampleJa: string; exampleEn: string
  formalMeaning: string; conversationalMeaning: string
  exampleFormal: string; exampleConversational: string
  collocations: string[]; wordFamily: string; bandLevel: string; commonMistake: string
}
export type JaLookupResponse = { ok: true; result: JaEntryPayload | null } | { ok: false; error: string }
export type JaSuggestResponse = { ok: true; suggestions: Array<{ word: string; headword: string; japanese: boolean; hint: string }> } | { ok: false; error: string }
```

- [ ] **Step 4: Run test and typecheck**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/ja-dataset.test.ts; npm run typecheck`
Expected: test PASS (3), typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/providers/offline/ja-dataset.ts src/providers/offline/ja-loader.ts src/providers/bridge.ts tests/ja-dataset.test.ts
git commit -m "feat(japanese): add offline runtime and bridge messages"
```

---

## Task 4: Direction routing and language picker

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/storage/languages.ts`
- Modify: `src/providers/offline/index.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/lookup/coordinator.ts`
- Modify: `src/ui/views/LanguagesView.tsx`
- Test: `tests/ja-routing.test.ts`

**Interfaces:**
- Consumes: JA runtime and bridge (Task 3).
- Produces: Japanese queries routed to the JA dataset; existing English/Bengali routing unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ja-routing.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isSupportedPair } from '../src/storage/languages'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { JA_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent } from '../src/shared/types'

const sendMessage = vi.fn()

const JA_ENTRY = {
  surface: 'こんにちは', kana: 'こんにちは', romaji: 'konnichiwa',
  en: 'Hello', enAlt: ['Hi'], pos: 'greeting', synEn: ['Hi'], antEn: [],
  exampleJa: 'こんにちは。', exampleEn: 'Hello.',
  formalMeaning: 'Hello', conversationalMeaning: 'Hi',
  exampleFormal: '', exampleConversational: '', collocations: [], wordFamily: '',
  bandLevel: '5.5', commonMistake: '',
}

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    storage: { local: { get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({ 'vocabflow.languages': { source: 'ja', target: 'en' } }), set: (_i: unknown, cb?: () => void) => cb?.() } },
  }
})

describe('Japanese routing', () => {
  it('accepts both Japanese language pairs', () => {
    expect(isSupportedPair({ source: 'ja', target: 'en' })).toBe(true)
    expect(isSupportedPair({ source: 'en', target: 'ja' })).toBe(true)
  })

  it('sends a Japanese query to the JA bridge message', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === JA_LOOKUP_MESSAGE) return { ok: true, result: JA_ENTRY }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('こんにちは')
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result.headword).toBe('Hello')
    expect(local.result.kana).toBe('こんにちは')
    expect(local.result.romaji).toBe('konnichiwa')
    expect(local.result.exampleJa).toBe('こんにちは。')
  })

  it('falls back without breaking when the JA dataset is unavailable', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === JA_LOOKUP_MESSAGE) return { ok: false, error: 'no dataset' }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('こんにちは')
    expect(events.some((e) => e.type === 'LOOKUP_ERROR')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/ja-routing.test.ts`
Expected: FAIL — `isSupportedPair` false, no JA message sent, fields undefined.

- [ ] **Step 3: Extend direction and pair support**

In `src/shared/types.ts`:
```ts
export type LookupDirection = 'en-bn' | 'bn-en' | 'en-ja' | 'ja-en'
```
Add to `LookupResult`:
```ts
  /** Japanese reading in kana. */
  kana?: string
  /** Japanese reading in Latin script. */
  romaji?: string
  /** Japanese example sentence. */
  exampleJa?: string
```

In `src/storage/languages.ts`, change `isSupportedPair`:
```ts
  return (
    (pair.source === 'en' && (pair.target === 'bn' || pair.target === 'ja')) ||
    ((pair.source === 'bn' || pair.source === 'ja') && pair.target === 'en')
  )
```
Update the Japanese label to `{ code: 'ja', label: '日本語 / Japanese' }`.

In `src/ui/views/LanguagesView.tsx`, no structural change is needed — it already uses `isSupportedPair` for the support note.

- [ ] **Step 4: Add the content-side client in `src/providers/offline/index.ts`**

```ts
import {
  JA_LOOKUP_MESSAGE,
  type JaEntryPayload,
  type JaLookupRequest,
  type JaLookupResponse,
} from '../bridge'
import type { LookupDirection } from '../../shared/types'

/** Asks the service worker for a Japanese-first lookup. */
export async function offlineJapaneseLookup(
  query: string,
  direction: LookupDirection,
): Promise<JaEntryPayload | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const request: JaLookupRequest = { type: JA_LOOKUP_MESSAGE, query, direction: direction as 'ja-en' | 'en-ja' }
    const response = (await chrome.runtime.sendMessage(request)) as JaLookupResponse | undefined
    return response?.ok ? response.result : null
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Handle the JA messages in the service worker**

Add imports and listeners in `src/background/service-worker.ts`:
```ts
import { JA_LOOKUP_MESSAGE, JA_SUGGEST_MESSAGE, type JaLookupRequest, type JaLookupResponse, type JaSuggestRequest, type JaSuggestResponse } from '../providers/bridge'
import { tryLoadJapaneseDictionary, loadJapaneseDictionary } from '../providers/offline/ja-loader'
```
```ts
chrome.runtime.onMessage.addListener(
  (msg: JaLookupRequest, _sender, sendResponse: (r: JaLookupResponse) => void) => {
    if (msg?.type !== JA_LOOKUP_MESSAGE) return false
    void (async () => {
      const dict = await tryLoadJapaneseDictionary()
      if (!dict) { sendResponse({ ok: false, error: 'Japanese dictionary unavailable' }); return }
      const entry = msg.direction === 'en-ja' ? dict.lookupEnglish(msg.query) : dict.lookup(msg.query)
      sendResponse({ ok: true, result: entry ? { ...entry } : null })
    })()
    return true
  },
)
chrome.runtime.onMessage.addListener(
  (msg: JaSuggestRequest, _sender, sendResponse: (r: JaSuggestResponse) => void) => {
    if (msg?.type !== JA_SUGGEST_MESSAGE) return false
    void loadJapaneseDictionary()
      .then((dict) => sendResponse({ ok: true, suggestions: dict.suggestions(msg.query, msg.limit ?? 8) }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    return true
  },
)
```

- [ ] **Step 6: Route the coordinator**

In `src/lookup/coordinator.ts`, import `offlineJapaneseLookup`. After direction is resolved, add a JA branch in `fetchOffline`:
```ts
    if (direction === 'ja-en' || direction === 'en-ja') {
      const ja = await offlineJapaneseLookup(query, direction)
      if (ja) {
        return {
          entry: {
            headword: ja.en, bn: ja.surface, bnAlts: ja.enAlt,
            trans: ja.romaji, transAlts: [], def: ja.en, pos: ja.pos,
            syn: ja.synEn, ant: ja.antEn, ex: ja.exampleEn, exBn: ja.exampleJa, pron: '',
            kana: ja.kana, romaji: ja.romaji, exampleJa: ja.exampleJa,
            formalMeaning: ja.formalMeaning, conversationalMeaning: ja.conversationalMeaning,
            exampleFormal: ja.exampleFormal, exampleConversational: ja.exampleConversational,
            collocations: ja.collocations, wordFamily: ja.wordFamily,
            bandLevel: ja.bandLevel, commonMistake: ja.commonMistake,
          },
          headword: ja.en,
          roman: ja.romaji,
          via: 'japanese',
        }
      }
    }
```
In `src/providers/bridge.ts`, add `'japanese'` to `OfflineLookupMatch` and add these fields to
`OfflineEntryPayload`: `kana?: string`, `romaji?: string`, `exampleJa?: string`. In the
`offlineResult` literal in `coordinator.ts`, add:
```ts
        kana: source.kana,
        romaji: source.romaji,
        exampleJa: source.exBn,
```

- [ ] **Step 7: Run tests and full suite**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/ja-routing.test.ts; npm test; npm run typecheck`
Expected: new tests PASS; full suite green; typecheck clean.

- [ ] **Step 8: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/shared/types.ts src/storage/languages.ts src/providers/offline/index.ts src/providers/bridge.ts src/background/service-worker.ts src/lookup/coordinator.ts src/ui/views/LanguagesView.tsx tests/ja-routing.test.ts
git commit -m "feat(japanese): route Japanese directions to the offline dataset"
```

---

## Task 5: Direction-aware AI prompt

**Files:**
- Modify: `src/providers/common.ts`
- Test: `tests/prompt-japanese.test.ts`

**Interfaces:**
- Consumes: `LookupDirection` from `src/shared/types.ts`.
- Produces: `buildUserPrompt(query, direction)`, `SYSTEM_PROMPT` with Japanese instructions, `parseAiJson` reading `kana`, `romaji`, `exampleJa`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt-japanese.test.ts
import { describe, expect, it } from 'vitest'
import { buildUserPrompt, parseAiJson } from '../src/providers/common'

describe('Japanese AI prompt', () => {
  it('asks for kana and romaji for ja→en', () => {
    const prompt = buildUserPrompt('こんにちは', 'ja-en')
    expect(prompt).toMatch(/kana/i)
    expect(prompt).toMatch(/romaji/i)
  })

  it('keeps the Bengali instruction for bn→en', () => {
    const prompt = buildUserPrompt('কি খবর', 'bn-en')
    expect(prompt).toMatch(/Bengali/i)
  })

  it('parses kana, romaji and exampleJa', () => {
    const parsed = parseAiJson(JSON.stringify({
      englishHeadword: 'Hello', kana: 'こんにちは', romaji: 'konnichiwa',
      exampleJa: 'こんにちは。', bengaliMeaning: '', partOfSpeech: 'greeting',
    }))
    expect(parsed?.kana).toBe('こんにちは')
    expect(parsed?.romaji).toBe('konnichiwa')
    expect(parsed?.exampleJa).toBe('こんにちは。')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/prompt-japanese.test.ts`
Expected: FAIL — signature mismatch / missing fields.

- [ ] **Step 3: Update the prompt and parser**

In `src/providers/common.ts`:
- Change the signature to `buildUserPrompt(query: string, direction: LookupDirection)`.
- Keep the existing Bengali branch when `direction === 'bn-en'` (verbatim text).
- Add a Japanese branch when `direction === 'ja-en' || direction === 'en-ja'`:
```
Japanese input: put the natural English equivalent in englishHeadword, the reading in kana,
the Latin spelling in romaji, and a Japanese example in exampleJa. Never give a literal
word-by-word translation as the primary answer.
```
- Add `kana`, `romaji`, `exampleJa` to the JSON schema text and to `parseAiJson`'s return using the existing `str()` helper.
- Update all provider call sites (`groq/index.ts`, `openrouter/index.ts`, `gemini/index.ts`) to pass `direction` — change their signatures from `isBengaliInput: boolean` to `direction: LookupDirection`, derive `isBengaliInput = direction === 'bn-en'`, and pass `direction` to `buildUserPrompt`.
- Update `runProviderLookup` in `src/providers/bridge.ts` and the AI request type to carry `direction`.

- [ ] **Step 4: Run test and full suite**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/prompt-japanese.test.ts; npm test; npm run typecheck`
Expected: PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/providers/common.ts src/providers/bridge.ts src/providers/groq/index.ts src/providers/openrouter/index.ts src/providers/gemini/index.ts tests/prompt-japanese.test.ts
git commit -m "feat(providers): make AI prompts direction-aware for Japanese"
```

---

## Task 6: UI rendering for kana and romaji

**Files:**
- Modify: `src/ui/Overlay.tsx`
- Modify: `src/ui/styles.ts`
- Test: `tests/ja-ui.test.tsx`

**Interfaces:**
- Consumes: `kana`, `romaji`, `exampleJa` on `LookupResult`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ja-ui.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { Overlay } from '../src/ui/Overlay'

vi.mock('../src/storage/history', () => ({
  addHistory: vi.fn().mockResolvedValue(1), listHistory: vi.fn().mockResolvedValue([]),
  listSaved: vi.fn().mockResolvedValue([]), updateHistory: vi.fn().mockResolvedValue(undefined),
  pruneHistory: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/storage/app-settings', () => ({
  loadAppSettings: vi.fn().mockResolvedValue({ autoSpeak: false, historyLimit: 200, theme: 'glass' }),
  DEFAULT_APP_SETTINGS: { autoSpeak: false, historyLimit: 200, theme: 'glass' },
}))

const RESULT = {
  headword: 'Hello', bn: 'こんにちは', bnAlts: [], trans: 'konnichiwa', transAlts: [],
  def: 'A greeting', pos: 'greeting', syn: ['Hi'], ant: [], ex: 'Hello.',
  kana: 'こんにちは', romaji: 'konnichiwa', exampleJa: 'こんにちは。',
}

beforeEach(() => {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: (req: { type?: string }) => {
      if (req.type === 'VOCABFLOW_SEED') return Promise.resolve({ ok: true })
      if (req.type === 'VOCABFLOW_OFFLINE_LOOKUP') return Promise.resolve({ ok: true, result: RESULT, via: 'japanese' })
      if (req.type === 'VOCABFLOW_SUGGEST') return Promise.resolve({ ok: true, suggestions: [] })
      return new Promise(() => {})
    } },
    storage: { local: { get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}), set: () => {} } },
  }
})

describe('Japanese result UI', () => {
  it('renders kana, romaji and the Japanese example', async () => {
    render(<Overlay onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'こんにちは' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText(/A greeting/)
    expect(screen.getByText(/こんにちは/)).toBeTruthy()
    expect(screen.getByText(/konnichiwa/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/ja-ui.test.tsx`
Expected: FAIL — romaji text not found.

- [ ] **Step 3: Render the fields**

In `src/ui/Overlay.tsx`, near the transcription display, add:
```tsx
                        {result.kana && (
                          <span className="ja-kana">{result.kana}</span>
                        )}
                        {result.romaji && (
                          <span className="ja-romaji">({result.romaji})</span>
                        )}
```
In the example card, add:
```tsx
                            {result.exampleJa && (
                              <div className="example-ja jp">{result.exampleJa}</div>
                            )}
```

In `src/ui/styles.ts`, add a CJK font fallback to the existing font stack and styles:
```css
  .ja-kana { color: #65cfff; font-size: 13px; margin-right: 6px; }
  .ja-romaji { color: #aab8c8; font-size: 12px; }
  .example-ja.jp { font-family: "Noto Sans JP", "Noto Sans Bengali", system-ui, sans-serif; }
```

- [ ] **Step 4: Run test and full verification**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/ja-ui.test.tsx; npm test; npm run typecheck; npm run lint`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/ui/Overlay.tsx src/ui/styles.ts tests/ja-ui.test.tsx
git commit -m "feat(ui): render Japanese kana, romaji and examples"
```

---

## Task 7: Documentation, full verification and push

**Files:**
- Modify: `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md`
- Modify: `custom-dictionary/PRD.md`, `ARCHITECTURE.md`, `README.md` (license/attribution note)

**Interfaces:** none.

- [ ] **Step 1: Update docs**

- `ARCHITECTURE.md`: add `dictionary.ja.json.gz`, JA runtime files, JA bridge messages, direction codes, and the JMdict attribution.
- `TASKS.md`: add "Phase 13 Japanese dictionary" with checked items and unchecked "full inflection handling", "kanji reading disambiguation".
- `MEMORY.md`: record decisions (JMdict common subset, v1 schema, romaji table, direction codes, AI prompt generalization, EDRDG attribution).
- Package docs: note the new dataset and the EDRDG/Jim Breen attribution with a link to `scripts/data/ja-source.md`.

- [ ] **Step 2: Full verification (record output)**

```bash
cd 'E:\Special NEED\Translator extention'
npm run lint
npm run typecheck
npm test
npm run build:japanese-dictionary
npm run build
```
Expected: all exit 0; `dist/dictionary.ja.json.gz` present alongside the other datasets.

- [ ] **Step 3: Commit docs and push**

```bash
cd 'E:\Special NEED\Translator extention'
git add ARCHITECTURE.md TASKS.md MEMORY.md custom-dictionary/PRD.md custom-dictionary/ARCHITECTURE.md custom-dictionary/README.md
git commit -m "docs: document Japanese offline dictionary"
git status --short
git log --oneline -10
git push origin main
```

If push authentication fails, report the exact error — never embed a credential.
