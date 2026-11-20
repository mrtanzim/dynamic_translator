# AI-Style Fields Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every field the AI providers emit (band level, collocations, word family, common mistake, formal/conversational meanings and examples) available from both offline datasets in both lookup directions.

**Architecture:** A shared build-time enricher generates the eight fields from WordNet senses/examples, a committed band list and curated overrides. Both English-first builders emit v5 and the Bengali-first builder emits v2; both runtimes map the fields into `LookupResult`, and three small UI cards render the fields the overlay does not already show.

**Tech Stack:** TypeScript strict, Node ESM build scripts, Vitest, columnar gzip datasets, Chrome MV3 messaging, React/Shadow DOM UI.

**Spec:** `docs/superpowers/specs/2026-11-20-ai-fields-offline-design.md`

## Global Constraints

- English-first dataset version is exactly **5** (`FORMAT_VERSION = 5`, `DATASET_VERSION = 5`); Bengali-first version is exactly **2** (`BN_DATASET_VERSION = 2`). Loaders fail fast on mismatch.
- Multi-value columns joined with `U+0001`; all columns equal length.
- `wordFamily` encoding: `role:value` pairs joined with `U+0001`, roles in `noun,verb,adj,adv` order.
- Curated values always win over generated values.
- No runtime network calls, no ML model, no new runtime dependencies.
- Bengali text NFC-normalized; vowel signs are `\p{M}` combining marks.
- Offline stays provisional and ranks last: `groq > openrouter > gemini > offline`.
- UI follows `DESIGN.md`: dark glass, accent `#65CFFF`, muted secondary text, reduced motion respected.
- Existing test suites must stay green; Conventional Commits; final push to `origin/main`.

## Review Focus

1. **Version mismatch** — a v4 English dataset or v1 BN dataset must fail fast, never silently render wrong columns. → Task 2 and Task 3 schema tests.
2. **Curated override precedence** — a hand-written band/collocation/mistake must beat generated data in both builders. → Task 1 enricher test and Task 3 builder test.
3. **Off-result mapping in both directions** — an offline-only result must carry all eight fields for an English query and for a Bengali query. → Task 4 coordinator tests.
4. **Empty-but-valid fields** — a word with no collocation evidence must produce `''`/`[]`, not a fabricated sentence or a crash. → Task 1 enricher test.
5. **UI rendering of the three new cards** — must show when fields are present and add nothing when absent, without breaking existing cards. → Task 5 overlay test.

---

## Task 1: Shared enricher, band list and overrides

**Files:**
- Create: `scripts/lib/enrichment.mjs`
- Create: `scripts/data/cefr-bands.json`
- Create: `scripts/data/enrichment-overrides.json`
- Test: `tests/enrichment.test.mjs`

**Interfaces:**
- Produces: `loadBandList(path)`, `encodeWordFamily(family)`, `decodeWordFamily(value)`, `deriveWordFamily(word, pos, senses)`, `deriveCollocations(word, examples)`, `estimateBand(word, bandList, senses)`, `deriveCommonMistake(word, collocations)`, `enrichEntry(entry, options)`.
- Consumes: nothing. `senses` is `Map<string, Array<{pos: string, offset: string}>>` (the shape `scripts/lib/wordnet.mjs` already produces).

- [ ] **Step 1: Write the failing test**

```js
// tests/enrichment.test.mjs
import { describe, expect, it } from 'vitest'
import {
  decodeWordFamily, encodeWordFamily, deriveWordFamily, deriveCollocations,
  estimateBand, deriveCommonMistake, enrichEntry,
} from '../scripts/lib/enrichment.mjs'

const senses = new Map([
  ['reluctant', [{ pos: 'adj', offset: '1' }]],
  ['reluctance', [{ pos: 'noun', offset: '2' }]],
  ['reluctantly', [{ pos: 'adv', offset: '3' }]],
])

describe('enrichment', () => {
  it('derives word-family forms only when WordNet knows them', () => {
    expect(deriveWordFamily('reluctant', 'adj', senses)).toEqual({
      noun: 'reluctance', adv: 'reluctantly',
    })
    expect(deriveWordFamily('unknown', 'adj', senses)).toEqual({})
  })

  it('round-trips the word-family encoding', () => {
    const encoded = encodeWordFamily({ noun: 'reluctance', adv: 'reluctantly' })
    expect(encoded).toBe('noun:reluctance\u0001adv:reluctantly')
    expect(decodeWordFamily(encoded)).toEqual({ noun: 'reluctance', adv: 'reluctantly' })
  })

  it('extracts a collocation containing the headword from an example', () => {
    const phrases = deriveCollocations('reluctant', ['She was reluctant to admit the mistake.'])
    expect(phrases).toContain('reluctant to admit')
  })

  it('returns empty collocations when no example mentions the word', () => {
    expect(deriveCollocations('reluctant', ['The weather was cold.'])).toEqual([])
  })

  it('uses the licensed band list before the heuristic', () => {
    expect(estimateBand('reluctant', new Map([['reluctant', '7.5']]), senses)).toBe('7.5')
    expect(estimateBand('unlisted', new Map(), senses)).toBe('5.5')
  })

  it('emits a mistake note only when the word is directly followed by a preposition', () => {
    expect(deriveCommonMistake('reluctant', ['reluctant to admit'])).toMatch(/reluctant to/)
    expect(deriveCommonMistake('reluctant', ['a reluctant student'])).toBe('')
  })

  it('lets curated overrides win and fills derived fields', () => {
    const result = enrichEntry(
      { def: 'unwilling', ex: 'She was reluctant.' },
      {
        word: 'reluctant', pos: 'adj', senses,
        examples: ['She was reluctant to admit the mistake.'],
        bandList: new Map(),
        overrides: { bandLevel: '8.0', collocations: ['reluctant to go'], commonMistake: 'Use "to", not "of".' },
      },
    )
    expect(result.bandLevel).toBe('8.0')
    expect(result.collocations).toEqual(['reluctant to go'])
    expect(result.commonMistake).toBe('Use "to", not "of".')
    expect(result.formalMeaning).toBe('unwilling')
    expect(result.conversationalMeaning).toBe('unwilling')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/enrichment.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the band list and overrides**

```json
// scripts/data/cefr-bands.json
{
  "achieve": "6.5", "adapt": "6.5", "adequate": "6.5", "advantage": "6.0",
  "affect": "6.0", "analyse": "6.5", "approach": "6.0", "appropriate": "6.5",
  "argue": "6.0", "assess": "6.5", "assume": "6.5", "attitude": "6.0",
  "available": "6.0", "avoid": "5.5", "benefit": "6.0", "brief": "6.0",
  "campaign": "6.5", "capable": "6.5", "challenge": "6.0", "claim": "6.0",
  "climate": "6.0", "compare": "5.5", "compete": "6.0", "complex": "6.5",
  "conclude": "6.5", "consequence": "7.0", "consider": "5.5", "consistent": "7.0",
  "constant": "6.5", "contribute": "6.5", "convince": "7.0", "crucial": "7.0",
  "culture": "5.5", "current": "5.5", "decline": "6.0", "define": "5.5",
  "demand": "6.0", "demonstrate": "7.0", "depend": "5.5", "deprive": "7.5",
  "derive": "7.0", "despite": "6.5", "determine": "6.5", "develop": "5.5",
  "differ": "6.0", "distinct": "6.5", "distribute": "6.5", "diverse": "7.0",
  "domestic": "6.5", "dramatic": "6.5", "efficient": "6.5", "eliminate": "7.0",
  "emerge": "7.0", "emphasise": "7.0", "employ": "6.0", "enable": "6.5",
  "encounter": "6.5", "enhance": "7.0", "enormous": "6.5", "ensure": "6.0",
  "environment": "5.5", "essential": "6.0", "establish": "6.0", "estimate": "6.5",
  "evaluate": "7.0", "evident": "7.0", "exceed": "6.5", "exhibit": "7.0",
  "expand": "6.0", "expect": "5.5", "experience": "5.5", "explain": "5.5",
  "explore": "6.0", "expose": "6.5", "extend": "6.0", "familiar": "6.0",
  "feature": "6.0", "figure": "5.5", "focus": "5.5", "fundamental": "7.0",
  "generate": "6.5", "guarantee": "6.5", "identify": "6.0", "ignore": "5.5",
  "illustrate": "6.5", "impact": "6.0", "implement": "7.0", "imply": "7.0",
  "importance": "5.5", "impose": "7.0", "improve": "5.5", "include": "5.5",
  "increase": "5.5", "indicate": "6.0", "individual": "6.0", "industry": "5.5",
  "inevitable": "7.5", "influence": "6.0", "inform": "5.5", "infrastructure": "7.5",
  "inhibit": "7.5", "initial": "6.5", "initiative": "7.0", "innovation": "7.5",
  "insight": "7.0", "insist": "6.5", "inspire": "6.5", "install": "6.0",
  "interpret": "7.0", "justify": "6.5", "maintain": "6.0", "major": "5.5",
  "method": "5.5", "minimise": "7.0", "modern": "5.5", "modify": "6.5",
  "monitor": "6.5", "motivate": "6.5", "negotiate": "7.0", "notion": "7.0",
  "obtain": "6.5", "obvious": "6.0", "occupy": "6.5", "occur": "6.0",
  "offer": "5.5", "operate": "6.0", "opportunity": "6.0", "oppose": "6.5",
  "optimistic": "7.0", "option": "5.5", "outcome": "6.5", "overcome": "7.0",
  "participate": "6.5", "perceive": "7.0", "percent": "5.5", "perform": "6.0",
  "permanent": "6.5", "persuade": "6.5", "phenomenon": "7.5", "policy": "6.0",
  "positive": "5.5", "potential": "6.5", "precise": "7.0", "predict": "6.5",
  "prefer": "5.5", "prejudice": "7.0", "preserve": "6.5", "previous": "6.0",
  "priority": "6.5", "procedure": "6.5", "process": "5.5", "promote": "6.0",
  "proper": "5.5", "propose": "6.0", "prospect": "7.0", "prove": "5.5",
  "provide": "5.5", "public": "5.5", "pursue": "7.0", "react": "6.0",
  "reason": "5.5", "reduce": "5.5", "reflect": "6.0", "reform": "6.5",
  "regard": "6.0", "region": "5.5", "register": "6.0", "regulate": "7.0",
  "reject": "6.0", "relate": "5.5", "relevant": "6.5", "reliable": "6.5",
  "reluctant": "7.0", "remain": "5.5", "remarkable": "7.5", "replace": "6.0",
  "report": "5.5", "represent": "6.0", "require": "5.5", "research": "6.0",
  "resemble": "7.0", "reserve": "6.0", "resist": "6.5", "resource": "6.0",
  "respond": "6.0", "responsible": "6.0", "restrict": "6.5", "retain": "7.0",
  "reveal": "6.5", "reverse": "6.5", "review": "6.0", "revise": "6.0",
  "reward": "6.0", "risk": "5.5", "role": "5.5", "rural": "6.0",
  "satisfy": "6.0", "scarce": "7.5", "scheme": "6.0", "secure": "6.0",
  "seek": "6.0", "seem": "5.5", "sense": "5.5", "sensitive": "6.5",
  "separate": "6.0", "significant": "6.5", "similar": "5.5", "situation": "5.5",
  "skill": "5.5", "solution": "5.5", "source": "5.5", "specific": "6.0",
  "spectrum": "7.5", "stable": "6.5", "strategy": "6.5", "strengthen": "6.5",
  "structure": "6.0", "struggle": "6.0", "submit": "6.0", "substantial": "7.0",
  "succeed": "5.5", "sufficient": "6.5", "suitable": "6.0", "sustainable": "7.5",
  "switch": "6.0", "symbol": "6.0", "sympathy": "7.0", "tackle": "7.0",
  "technique": "6.0", "technology": "6.0", "temporary": "6.5", "tendency": "7.0",
  "tension": "6.5", "theory": "6.0", "threat": "6.0", "thrive": "7.5",
  "tolerance": "7.0", "tradition": "5.5", "transfer": "6.0", "transform": "6.5",
  "transition": "7.0", "transparent": "7.5", "trigger": "7.0", "typical": "6.0",
  "ultimate": "7.0", "undermine": "7.5", "understand": "5.5", "undertake": "7.0",
  "unique": "6.0", "universal": "6.5", "urban": "6.0", "urgent": "6.5",
  "utilise": "7.0", "valid": "6.0", "value": "5.5", "vary": "6.0",
  "vast": "6.5", "vehicle": "6.0", "visible": "6.0", "vital": "6.5",
  "vulnerable": "7.5", "widespread": "7.0", "willing": "5.5", "witness": "6.5"
}
```

The band assignments are hand-authored from common IELTS vocabulary; word-to-level mappings are factual and carry no copyrightable expression. Attribution: "Hand-authored from standard IELTS vocabulary; not an official Cambridge score."

```json
// scripts/data/enrichment-overrides.json
{
  "reluctant": {
    "collocations": ["reluctant to admit", "deeply reluctant", "grow reluctant"],
    "wordFamily": "noun:reluctance\u0001adv:reluctantly",
    "bandLevel": "7.0",
    "commonMistake": "Followed by 'to + infinitive' (reluctant to go), not 'of'."
  }
}
```

- [ ] **Step 4: Write the enricher**

```js
// scripts/lib/enrichment.mjs
// Build-time generation of the rich fields the AI providers return.
// No browser APIs; no network; no runtime dependencies.
import fs from 'node:fs'

const SEP = '\u0001'
const ROLES = ['noun', 'verb', 'adj', 'adv']

const STOP = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this',
  'these', 'those', 'it', 'its', 'any', 'some', 'or', 'and', 'but', 'not',
  'one', 'who', 'which', 'whose', 'when', 'where', 'how', 'than', 'them',
  'they', 'their', 'there', 'here', 'into', 'onto', 'upon', 'about', 'she',
  'he', 'was', 'has', 'had', 'have', 'did', 'does',
])

/** Reads a { word: band } JSON file; returns an empty map when absent. */
export function loadBandList(filePath) {
  if (!fs.existsSync(filePath)) return new Map()
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return new Map(Object.entries(parsed))
}

/** Encodes a word-family object as role:value pairs joined with U+0001. */
export function encodeWordFamily(family) {
  return ROLES.filter((role) => family?.[role])
    .map((role) => `${role}:${family[role]}`)
    .join(SEP)
}

/** Decodes the word-family column back into an object. */
export function decodeWordFamily(value) {
  const out = {}
  for (const part of (value || '').split(SEP).filter(Boolean)) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const role = part.slice(0, i)
    if (ROLES.includes(role)) out[role] = part.slice(i + 1)
  }
  return out
}

const RULES = [
  ['adj', 'noun', /ant$/, 'ance'],
  ['adj', 'noun', /ent$/, 'ence'],
  ['adj', 'adv', /ant$/, 'antly'],
  ['adj', 'adv', /ent$/, 'ently'],
  ['adj', 'adv', /le$/, 'ly'],
  ['adj', 'adv', /y$/, 'ily'],
  ['adj', 'adv', /$/, 'ly'],
  ['noun', 'verb', /tion$/, 'te'],
  ['noun', 'verb', /ment$/, ''],
  ['verb', 'noun', /ize$/, 'ization'],
  ['verb', 'noun', /ate$/, 'ation'],
]

/** Derives related forms, keeping only those WordNet knows. */
export function deriveWordFamily(word, pos, senses) {
  const known = (candidate, target) =>
    !!candidate && (senses.get(candidate.toLowerCase()) ?? []).some((s) => s.pos === target)
  const family = {}
  for (const role of ROLES) {
    if (role === pos && known(word, role)) family[role] = word
  }
  for (const [from, to, pattern, replacement] of RULES) {
    if (from !== pos || !pattern.test(word) || family[to]) continue
    const candidate = word.replace(pattern, replacement)
    if (known(candidate, to)) family[to] = candidate
  }
  return family
}

/** Extracts short phrases containing the headword from example sentences. */
export function deriveCollocations(word, examples) {
  const lower = word.toLowerCase()
  const out = []
  for (const sentence of examples.filter(Boolean)) {
    const words = sentence.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    const i = words.indexOf(lower)
    if (i === -1) continue
    for (let length = 2; length <= 4; length++) {
      const start = Math.max(0, Math.min(i, words.length - length))
      const phrase = words.slice(start, start + length)
      if (!phrase.includes(lower)) continue
      while (phrase.length && STOP.has(phrase[0])) phrase.shift()
      while (phrase.length && STOP.has(phrase[phrase.length - 1])) phrase.pop()
      if (!phrase.includes(lower) || phrase.length < 2) continue
      const text = phrase.join(' ')
      if (!out.includes(text)) out.push(text)
      if (out.length >= 5) return out
    }
  }
  return out
}

/** Uses the committed list first; falls back to a sense-count heuristic. */
export function estimateBand(word, bandList, senses) {
  const listed = bandList.get(word.toLowerCase())
  if (listed) return listed
  const count = (senses.get(word.toLowerCase()) ?? []).length
  if (count >= 6) return '8.0'
  if (count >= 4) return '7.5'
  if (count >= 2) return '7.0'
  return word.length >= 10 ? '6.5' : '5.5'
}

/** Emits a note only when the headword is directly followed by a preposition. */
export function deriveCommonMistake(word, collocations) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const phrase of collocations) {
    const match = phrase.match(new RegExp(`\\b${escaped}\\s+(to|of|for|with|in)\\b`, 'i'))
    if (match) {
      return `Use '${word} ${match[1].toLowerCase()}' (as in '${phrase}'); check the preposition in context.`
    }
  }
  return ''
}

/** Produces all eight rich fields; curated overrides are applied last. */
export function enrichEntry(entry, options) {
  const { word, pos, senses = new Map(), examples = [], bandList = new Map(), overrides = {} } = options
  const collocations = deriveCollocations(word, examples)
  const generated = {
    formalMeaning: entry.def ?? '',
    conversationalMeaning: entry.def ?? '',
    exampleFormal: entry.ex ?? '',
    exampleConversational: entry.ex ?? '',
    collocations,
    wordFamily: encodeWordFamily(deriveWordFamily(word, pos, senses)),
    bandLevel: estimateBand(word, bandList, senses),
    commonMistake: deriveCommonMistake(word, collocations),
  }
  const result = { ...generated }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null && value !== '') result[key] = value
  }
  return result
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/enrichment.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add scripts/lib/enrichment.mjs scripts/data/cefr-bands.json scripts/data/enrichment-overrides.json tests/enrichment.test.mjs
git commit -m "feat(dictionary): add offline enrichment generator and band list"
```

---

## Task 2: English-first dataset v5

**Files:**
- Modify: `scripts/build-dictionary.mjs:55-60`, `:288-450`
- Modify: `custom-dictionary/scripts/build-dict.ts:21-27`, `:71-135`
- Modify: `src/providers/offline/dataset.ts:29`, `:40-80`, `:260-290`
- Modify: `src/providers/bridge.ts` (`OfflineEntryPayload`)
- Test: `tests/enriched-dataset.test.ts`

**Interfaces:**
- Consumes: `enrichEntry`, `loadBandList` (Task 1).
- Produces: v5 datasets with columns `formalMeaning, conversationalMeaning, exampleFormal, exampleConversational, collocations, wordFamily, bandLevel, commonMistake`; `OfflineEntryPayload` with those eight optional fields.

- [ ] **Step 1: Write the failing test**

```ts
// tests/enriched-dataset.test.ts
import { describe, expect, it } from 'vitest'
import dataset from '../src/dictionary/generated.json'
import { DATASET_VERSION } from '../src/providers/offline/dataset'

const NEW_COLUMNS = [
  'formalMeaning', 'conversationalMeaning', 'exampleFormal', 'exampleConversational',
  'collocations', 'wordFamily', 'bandLevel', 'commonMistake',
] as const

describe('English-first enriched dataset', () => {
  it('is version 5 with equal-length new columns', () => {
    expect(dataset.v).toBe(DATASET_VERSION)
    expect(DATASET_VERSION).toBe(5)
    for (const column of NEW_COLUMNS) {
      expect((dataset as Record<string, unknown[]>)[column]?.length).toBe(dataset.headwords.length)
    }
  })

  it('populates band level and word family for a curated word', () => {
    const i = dataset.headwords.indexOf('reluctant')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(dataset.bandLevel[i]).toBeTruthy()
    expect(dataset.wordFamily[i]).toContain('noun:')
  })
})
```

Use `import dataset from '../src/dictionary/generated.json'` — if TS complains about JSON typing, cast once: `as unknown as Record<string, any>`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/enriched-dataset.test.ts`
Expected: FAIL — version 4 / missing columns.

- [ ] **Step 3: Modify the root builder**

In `scripts/build-dictionary.mjs`:
- Add imports:
```js
import { enrichEntry, loadBandList } from './lib/enrichment.mjs'
```
- Change `const FORMAT_VERSION = 4` to `const FORMAT_VERSION = 5`.
- After `const curated = loadCurated()` add:
```js
const bandList = loadBandList(path.join(root, 'scripts', 'data', 'cefr-bands.json'))
const enrichmentOverrides = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'data', 'enrichment-overrides.json'), 'utf8'),
)
```
- Add to the `table[head]` object literal (after `pron:`):
```js
      ...enrichEntry(
        { def: entry.def, ex: exampleTrimmed },
        {
          word: head,
          pos,
          senses: wordNet.senses,
          examples: [...(wordNet.examples.get(synset ?? '') ? [wordNet.examples.get(synset)] : [])],
          bandList,
          overrides: {
            ...(enrichmentOverrides[head] ?? {}),
            ...(curated[head] ?? {}),
          },
        },
      ),
```
- Add the eight new columns to the `columns` object and push them in the write loop:
```js
    formalMeaning: [], conversationalMeaning: [], exampleFormal: [],
    exampleConversational: [], collocations: [], wordFamily: [],
    bandLevel: [], commonMistake: [],
```
```js
    for (const column of NEW_COLUMNS) columns[column].push(entry[column] ?? '')
```
Define `const NEW_COLUMNS = [...]` beside `LIMITS`.

- [ ] **Step 4: Modify the custom-dictionary English builder the same way**

In `custom-dictionary/scripts/build-dict.ts`:
- Import `enrichEntry`, `loadBandList` from `../../../scripts/lib/enrichment.mjs` (relative from `custom-dictionary/scripts/`).
- Change the dataset version constant from 4 to 5 where it is serialized (the `DictionaryDataset` `v` field).
- Load the band list and overrides with paths rooted at `root/../scripts/data/`.
- Add `...enrichEntry(...)` to the `DictionaryEntry` object built in the loop, and add the eight columns to `serializeDataset`'s output (extend `custom-dictionary/scripts/builders/columnar.ts` and its `DictionaryEntry` interface in `custom-dictionary/src/types.ts`).
- Curated values from `src/dictionary/curated.json` win via the overrides argument.

- [ ] **Step 5: Update the extension runtime types**

In `src/providers/offline/dataset.ts`:
- `export const DATASET_VERSION = 5`
- Add to `DictionaryEntry` and `DictionaryDataset` the eight fields (strings; optional in `DictionaryEntry`, plain string arrays in `DictionaryDataset`).
- Add the eight keys to the column validation array at line ~264.
- Populate them when building each entry at line ~287.

In `src/providers/bridge.ts`, add the eight fields as optional strings/arrays to `OfflineEntryPayload`:
```ts
  formalMeaning?: string
  conversationalMeaning?: string
  exampleFormal?: string
  exampleConversational?: string
  collocations?: string[]
  wordFamily?: { noun?: string; verb?: string; adj?: string; adv?: string }
  bandLevel?: string
  commonMistake?: string
```

In `custom-dictionary/src/types.ts`, make the same additions to `DictionaryEntry`, `DictionaryDataset` and `LookupResult` (the last already has them).

- [ ] **Step 6: Rebuild and run the test**

Run: `cd 'E:\Special NEED\Translator extention'; npm run build:dictionary; npm run build:bn-dictionary; npx vitest run tests/enriched-dataset.test.ts`
Expected: build prints v5 stats; test passes (2 tests).

- [ ] **Step 7: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add scripts/build-dictionary.mjs custom-dictionary/scripts/build-dict.ts custom-dictionary/scripts/builders/columnar.ts src/providers/offline/dataset.ts src/providers/bridge.ts custom-dictionary/src/types.ts src/dictionary/generated.json public/dictionary.json.gz custom-dictionary/public/dictionary.json custom-dictionary/public/dictionary.json.gz tests/enriched-dataset.test.ts
git commit -m "feat(offline): emit English-first dataset v5 with AI-style fields"
```

---

## Task 3: Bengali-first dataset v2

**Files:**
- Modify: `custom-dictionary/src/bn-types.ts`, `custom-dictionary/scripts/builders/bn-schema.ts`, `custom-dictionary/scripts/build-bn-dictionary.mjs`
- Modify: `src/providers/offline/bn-dataset.ts`, `src/providers/offline/bn-loader.ts`
- Test: `custom-dictionary/tests/bn-enriched.test.ts`

**Interfaces:**
- Consumes: v5 English-first dataset from Task 2; `decodeWordFamily` (Task 1).
- Produces: v2 Bengali-first dataset with the same eight columns; `toOfflineEntryPayload()` maps all eight.

- [ ] **Step 1: Write the failing test**

```ts
// custom-dictionary/tests/bn-enriched.test.ts
import { describe, expect, it } from 'vitest'
import { BN_DATASET_VERSION } from '../src/bn-types.ts'
import { decodeWordFamily } from '../../scripts/lib/enrichment.mjs'
import { assertBengaliDataset, serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function base(): BengaliEntry {
  return {
    bengali: 'বই', roman: 'boi', romanAlt: [], en: 'book', enAlt: [],
    defBn: '', defEn: 'a written work', pos: 'noun', synEn: [], antEn: [],
    exBn: '', exEn: '', pron: '', usage: '',
    formalMeaning: 'a written work', conversationalMeaning: 'a book',
    exampleFormal: 'I read a book.', exampleConversational: 'I read books.',
    collocations: ['read a book'], wordFamily: 'noun:book',
    bandLevel: '5.5', commonMistake: '',
  }
}

describe('Bengali-first enriched dataset', () => {
  it('is version 2 and carries the new columns', () => {
    const dataset = serializeBengaliDataset([base()])
    expect(dataset.v).toBe(BN_DATASET_VERSION)
    expect(BN_DATASET_VERSION).toBe(2)
    expect(dataset.bandLevel[0]).toBe('5.5')
    expect(decodeWordFamily(dataset.wordFamily[0] ?? '')).toEqual({ noun: 'book' })
  })

  it('rejects a v1 dataset', () => {
    const dataset = serializeBengaliDataset([base()]) as Record<string, unknown>
    dataset.v = 1
    expect(() => assertBengaliDataset(dataset)).toThrow(/version/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention\custom-dictionary'; npm test -- tests/bn-enriched.test.ts`
Expected: FAIL — extra properties on `BengaliEntry` / version still 1.

- [ ] **Step 3: Extend the BN schema**

In `custom-dictionary/src/bn-types.ts`:
- `export const BN_DATASET_VERSION = 2`
- Add to `BengaliEntry` (strings/arrays) and `BengaliDataset` (string arrays): `formalMeaning`, `conversationalMeaning`, `exampleFormal`, `exampleConversational`, `collocations: string[]`, `wordFamily: string`, `bandLevel`, `commonMistake`.

In `custom-dictionary/scripts/builders/bn-schema.ts`:
- Add the eight keys to `BN_COLUMNS`.
- In `serializeBengaliDataset`, map `e.collocations.join(BN_SEP)` and the other seven fields.
- In `deserializeBengaliDataset`, split `collocations` with `BN_SEP`.

- [ ] **Step 4: Extend the BN builder**

In `custom-dictionary/scripts/build-bn-dictionary.mjs`, inside the inversion loop (where the English entry is mapped to a Bengali entry), copy:
```js
  formalMeaning: englishEntry.formalMeaning ?? '',
  conversationalMeaning: englishEntry.conversationalMeaning ?? '',
  exampleFormal: englishEntry.exampleFormal ?? '',
  exampleConversational: englishEntry.exampleConversational ?? '',
  collocations: split(englishEntry.collocations ?? ''),
  wordFamily: englishEntry.wordFamily ?? '',
  bandLevel: englishEntry.bandLevel ?? '',
  commonMistake: englishEntry.commonMistake ?? '',
```
The inversion function lives in `custom-dictionary/scripts/builders/bn-invert.ts`; extend `BengaliEntry` there too. Curated/idiom overrides (Task 2 file) already win because `applyBengaliOverrides` spreads overrides last.

- [ ] **Step 5: Extend the extension BN runtime**

In `src/providers/offline/bn-dataset.ts`:
- `BN_DATASET_VERSION = 2`
- Add the eight fields to `BengaliDataset`, `BengaliEntry`, the constructor entry builder and column validation.
- In `toOfflineEntryPayload(entry)`, add:
```ts
    formalMeaning: entry.formalMeaning || undefined,
    conversationalMeaning: entry.conversationalMeaning || undefined,
    exampleFormal: entry.exampleFormal || undefined,
    exampleConversational: entry.exampleConversational || undefined,
    collocations: entry.collocations,
    wordFamily: decodeWordFamily(entry.wordFamily),
    bandLevel: entry.bandLevel || undefined,
    commonMistake: entry.commonMistake || undefined,
```
Add a local `decodeWordFamily` helper (same logic as Task 1) so the runtime has no dependency on build scripts.

In `custom-dictionary/src/{bn-indexer,bn-lookup}.ts`, carry the eight fields through `IndexEntry` and the `LookupResult` mapping.

- [ ] **Step 6: Rebuild and verify**

Run: `cd 'E:\Special NEED\Translator extention'; npm run build:dictionary; npm run build:bn-dictionary; cd custom-dictionary; npm test -- tests/bn-enriched.test.ts; npm test`
Expected: BN build prints v2 stats; tests pass.

- [ ] **Step 7: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add custom-dictionary/src/bn-types.ts custom-dictionary/scripts/builders/bn-schema.ts custom-dictionary/scripts/builders/bn-invert.ts custom-dictionary/scripts/build-bn-dictionary.mjs custom-dictionary/src/bn-indexer.ts custom-dictionary/src/bn-lookup.ts src/providers/offline/bn-dataset.ts custom-dictionary/tests/bn-enriched.test.ts custom-dictionary/public/dictionary.bn.json custom-dictionary/public/dictionary.bn.json.gz public/dictionary.bn.json.gz
git commit -m "feat(offline): emit Bengali-first dataset v2 with AI-style fields"
```

---

## Task 4: Coordinator mapping for both directions

**Files:**
- Modify: `src/lookup/coordinator.ts`
- Test: `tests/enriched-coordinator.test.ts`

**Interfaces:**
- Consumes: eight fields on `OfflineEntryPayload` (Tasks 2–3).
- Produces: a provisional `LOCAL_RESULT` carrying all eight fields for both English and Bengali queries.

- [ ] **Step 1: Write the failing test**

```ts
// tests/enriched-coordinator.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LookupCoordinator } from '../src/lookup/coordinator'
import { OFFLINE_LOOKUP_MESSAGE, SEED_MESSAGE } from '../src/providers/bridge'
import type { LookupEvent } from '../src/shared/types'

const sendMessage = vi.fn()
const ENTRY = {
  headword: 'reluctant', bn: 'অনিচ্ছুক', bnAlts: [], trans: 'onichchuk', transAlts: [],
  def: 'unwilling', pos: 'adjective', syn: [], ant: [], ex: 'She was reluctant.', exBn: '', pron: '',
  formalMeaning: 'unwilling', conversationalMeaning: 'not keen',
  exampleFormal: 'He was reluctant to commit.', exampleConversational: 'I am not keen.',
  collocations: ['reluctant to go'], wordFamily: { noun: 'reluctance', adv: 'reluctantly' },
  bandLevel: '7.0', commonMistake: 'Use "to", not "of".', usageNote: 'IELTS writing',
}

const settings = {
  groq: { apiKey: '', enabled: false, model: '' },
  openrouter: { apiKey: '', enabled: false, model: '' },
  gemini: { apiKey: '', enabled: false, model: '' },
}

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    storage: { local: { get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}), set: (_i: unknown, cb?: () => void) => cb?.() } },
  }
})

describe('offline results carry AI-style fields', () => {
  it('maps every enriched field for an English query', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) return { ok: true, result: ENTRY, via: 'english' }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('reluctant', settings)
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result).toMatchObject({
      formalMeaning: 'unwilling', conversationalMeaning: 'not keen',
      exampleFormal: 'He was reluctant to commit.', exampleConversational: 'I am not keen.',
      collocations: ['reluctant to go'], wordFamily: { noun: 'reluctance' },
      bandLevel: '7.0', commonMistake: 'Use "to", not "of".', usageNote: 'IELTS writing',
    })
  })

  it('maps every enriched field for a Bengali query', async () => {
    sendMessage.mockImplementation(async (req: { type?: string }) => {
      if (req.type === SEED_MESSAGE) return { ok: true }
      if (req.type === OFFLINE_LOOKUP_MESSAGE) return { ok: true, result: ENTRY, via: 'bengali' }
      return new Promise(() => {})
    })
    const events: LookupEvent[] = []
    const c = new LookupCoordinator({ onEvent: (e) => events.push(e) })
    await c.lookup('অনিচ্ছুক', settings)
    const local = events.find((e) => e.type === 'LOCAL_RESULT')
    expect(local?.type).toBe('LOCAL_RESULT')
    if (local?.type !== 'LOCAL_RESULT') return
    expect(local.result.bandLevel).toBe('7.0')
    expect(local.result.collocations).toEqual(['reluctant to go'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/enriched-coordinator.test.ts`
Expected: FAIL — fields undefined on `LOCAL_RESULT`.

- [ ] **Step 3: Add the mapping in `fetchOffline`'s result construction**

In `src/lookup/coordinator.ts`, in the `offlineResult: LookupResult = { ... }` literal (around line 261), add after `usageNote`:
```ts
        formalMeaning: source.formalMeaning,
        conversationalMeaning: source.conversationalMeaning,
        exampleFormal: source.exampleFormal,
        exampleConversational: source.exampleConversational,
        collocations: source.collocations,
        wordFamily: source.wordFamily,
        bandLevel: source.bandLevel,
        commonMistake: source.commonMistake,
```
The same object serves both English and Bengali directions because both paths produce `OfflineEntryPayload`.

- [ ] **Step 4: Run test and full suite**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/enriched-coordinator.test.ts; npm test`
Expected: new test passes (2 tests); full suite green.

- [ ] **Step 5: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/lookup/coordinator.ts tests/enriched-coordinator.test.ts
git commit -m "feat(offline): map enriched fields into offline lookup results"
```

---

## Task 5: Result-card rendering for the three missing fields

**Files:**
- Modify: `src/storage/app-settings.ts`
- Modify: `src/ui/Overlay.tsx`
- Modify: `src/ui/styles.ts`
- Test: `tests/overlay-enriched.test.tsx`

**Interfaces:**
- Consumes: `formalMeaning`, `conversationalMeaning`, `usageNote` on `LookupResult`.
- Produces: three small cards in the result body, toggleable via `settings.showFormalMeaning`, `showConversationalMeaning`, `showUsageNote`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/overlay-enriched.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Overlay } from '../src/ui/Overlay'

const RESULT = {
  word: 'reluctant', query: 'reluctant', source: 'offline' as const,
  requestId: 'r1', timestamp: 1,
  englishDefinition: 'unwilling', bengaliMeaning: 'অনিচ্ছুক',
  formalMeaning: 'Unwilling to do something.',
  conversationalMeaning: 'Not keen on it.',
  usageNote: 'Prefer "reluctant to" in IELTS writing.',
}

const sendMessage = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: (req: { type?: string }) => {
      if (req.type === 'VOCABFLOW_SEED') return Promise.resolve({ ok: true })
      if (req.type === 'VOCABFLOW_OFFLINE_LOOKUP') return Promise.resolve({ ok: true, result: RESULT })
      if (req.type === 'VOCABFLOW_SUGGEST') return Promise.resolve({ ok: true, suggestions: [] })
      return new Promise(() => {})
    } },
    storage: { local: { get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}), set: (_i: unknown, cb?: () => void) => cb?.() } },
  }
})

describe('enriched result cards', () => {
  it('renders formal meaning, conversational meaning and usage note', async () => {
    render(<Overlay onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'reluctant' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText(/Unwilling to do something/)
    expect(screen.getByText(/Not keen on it/)).toBeTruthy()
    expect(screen.getByText(/Prefer "reluctant to"/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/overlay-enriched.test.tsx`
Expected: FAIL — texts not found.

- [ ] **Step 3: Add settings defaults**

In `src/storage/app-settings.ts`, extend the settings interface and defaults:
```ts
  showFormalMeaning?: boolean
  showConversationalMeaning?: boolean
  showUsageNote?: boolean
```
```ts
  showFormalMeaning: true,
  showConversationalMeaning: true,
  showUsageNote: true,
```

- [ ] **Step 4: Add the three cards in `src/ui/Overlay.tsx`**

Insert after the `englishDefinition` block (around line 790), before the synonyms grid:

```tsx
                      {result.formalMeaning && (settings.showFormalMeaning ?? true) && (
                        <div className="register-card">
                          <div className="card-label">Formal</div>
                          <div className="register-text">{result.formalMeaning}</div>
                        </div>
                      )}
                      {result.conversationalMeaning && (settings.showConversationalMeaning ?? true) && (
                        <div className="register-card">
                          <div className="card-label">Conversational</div>
                          <div className="register-text">{result.conversationalMeaning}</div>
                        </div>
                      )}
                      {result.usageNote && (settings.showUsageNote ?? true) && (
                        <div className="usage-note">{result.usageNote}</div>
                      )}
```

- [ ] **Step 5: Add minimal styles in `src/ui/styles.ts`**

Append inside the stylesheet string, using DESIGN.md tokens:
```css
  .register-card { margin: 6px 0; padding: 8px 10px; border: 1px solid rgba(148,163,184,.28); border-radius: 10px; background: rgba(30,41,54,.82); }
  .register-text { color: #F3F6FA; font-size: 13px; line-height: 1.4; }
  .usage-note { margin: 6px 0; color: #AAB8C8; font-size: 12px; line-height: 1.4; }
  @media (prefers-reduced-motion: reduce) { .register-card { transition: none; } }
```

- [ ] **Step 6: Run test and full suite**

Run: `cd 'E:\Special NEED\Translator extention'; npx vitest run tests/overlay-enriched.test.tsx; npm test; npm run typecheck`
Expected: new test passes; full suite green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
cd 'E:\Special NEED\Translator extention'
git add src/storage/app-settings.ts src/ui/Overlay.tsx src/ui/styles.ts tests/overlay-enriched.test.tsx
git commit -m "feat(ui): render formal, conversational and usage-note cards"
```

---

## Task 6: Documentation, full verification and push

**Files:**
- Modify: `ARCHITECTURE.md`, `TASKS.md`, `MEMORY.md`
- Modify: `custom-dictionary/PRD.md`, `ARCHITECTURE.md`, `MEMORY.md`, `PHASES.md`, `README.md`

**Interfaces:** none.

- [ ] **Step 1: Update docs**

- `ARCHITECTURE.md`: English-first dataset v5 and Bengali-first v2, eight new columns, shared enricher, band-list attribution, mapping into `LookupResult`.
- `TASKS.md`: add "Phase 12 — AI-style fields offline" with checked items for the enricher, both schemas, both builders, mapping, UI, tests; leave unchecked "improve generated collocation quality" and "verify band levels with an official source".
- `MEMORY.md`: record the decisions (v5/v2, shared build-time enricher, licensed/hand-authored band list, curated wins, best-effort fields, offline stays provisional).
- `custom-dictionary/` docs: same additions plus the v2 schema and the new enricher source path.
- Every doc mentioning the band list must include the attribution line: "Hand-authored from standard IELTS vocabulary; not an official Cambridge score."

- [ ] **Step 2: Full verification (record every command and result)**

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

Expected: all exit 0; `dist/dictionary.json.gz` and `dist/dictionary.bn.json.gz` present; no secrets in `dist/`.

- [ ] **Step 3: Commit docs and push**

```bash
cd 'E:\Special NEED\Translator extention'
git add ARCHITECTURE.md TASKS.md MEMORY.md custom-dictionary/PRD.md custom-dictionary/ARCHITECTURE.md custom-dictionary/MEMORY.md custom-dictionary/PHASES.md custom-dictionary/README.md
git commit -m "docs: document offline AI-style fields"
git status --short
git log --oneline -10
git push origin main
```

If push authentication fails, report the exact error — never embed a credential.
