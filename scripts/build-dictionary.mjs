// Builds the offline dictionary dataset.
//
//   node scripts/build-dictionary.mjs
//
// Sources (both installed as devDependencies, never shipped to the browser):
//   bn-en-dictionary  - Bengali <-> English pairs from a Wiktionary dump
//                       (CC BY-SA 3.0)
//   wordnet-db        - Princeton WordNet 3.0 (permissive license)
//   src/dictionary/curated.json - hand-written entries, always win
//
// Output:
//   src/dictionary/generated.json  - compact columnar dataset (source of truth
//                                    for tests and Node-side tooling)
//   public/dictionary.json.gz       - gzipped copy loaded by the service
//                                    worker at runtime (never bundled into the
//                                    content script)
//
// The columnar layout is a plain JSON object with one array per field, all
// arrays in the same (sorted) headword order. Multi-valued fields are joined
// with U+0001, a control character that cannot occur in any of the text.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { canonicalBengali, loadBengaliDictionary, selectVocabulary } from './lib/bengali.mjs'
import { loadWordNet } from './lib/wordnet.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Field separator for multi-valued columns. */
const SEP = '\u0001'

/** Dataset format version, bumped when the layout changes. */
const FORMAT_VERSION = 2

const LIMITS = {
  synonyms: 8,
  antonyms: 6,
  meanings: 4,
  definition: 220,
  example: 150,
}

/** Curated entries are the source of truth for the words they cover. */
function loadCurated() {
  const file = path.join(root, 'src', 'dictionary', 'curated.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * Chooses the synonyms and antonyms that are worth showing.
 *
 * WordNet lists every lemma sharing a synset, which includes rare
 * morphological variants ("well-chosen" for "happy"). Only single-word
 * synonyms are kept, and they are ordered so that the most common ones come
 * first.
 */
function pickRelations(word, candidates, limit) {
  const seen = new Set([word])
  const picked = []
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    if (!/^[a-z][a-z-]*$/.test(candidate)) continue
    if (candidate.length < 3) continue
    seen.add(candidate)
    picked.push(candidate)
    if (picked.length >= limit) break
  }
  return picked
}

/**
 * The Bengali spellings of an entry, each paired with its romanization.
 *
 * The romanization is the Latin-script spelling of one Bengali spelling
 * ("বই" -> "boi"). It is what a learner needs to read a Bengali word, so it
 * is part of the dataset: the offline answer can carry it without an AI
 * provider.
 *
 * NFC can map two distinct spellings onto the same sequence (the YYA
 * variants), so the spellings are de-duplicated here. The first one is the
 * primary meaning, the rest are its alternatives.
 *
 * @param {import('./lib/bengali.mjs').BengaliHeadword} entry
 * @returns {Array<{ meaning: string, roman: string }>}
 */
function bengaliSpellings(entry) {
  const seen = new Set()
  const out = []
  for (let i = 0; i < entry.meanings.length && out.length < LIMITS.meanings; i++) {
    const meaning = canonicalBengali(entry.meanings[i])
    if (!meaning || seen.has(meaning)) continue
    seen.add(meaning)
    out.push({ meaning, roman: entry.roman[i] ?? '' })
  }
  return out
}

/**
 * The romanization of one Bengali spelling, if the entry knows it.
 *
 * @param {import('./lib/bengali.mjs').BengaliHeadword} entry
 * @param {string} meaning
 * @returns {string}
 */
function romanOf(entry, meaning) {
  const canonical = canonicalBengali(meaning)
  const index = entry.meanings.findIndex((m) => canonicalBengali(m) === canonical)
  if (index === -1) return ''
  return entry.roman[index] ?? ''
}

function main() {
  const wordNet = loadWordNet(path.join(root, 'node_modules', 'wordnet-db'))
  const bengali = selectVocabulary(
    loadBengaliDictionary(path.join(root, 'node_modules', 'bn-en-dictionary')),
  )
  const curated = loadCurated()

  console.log(`wordnet lemmas: ${wordNet.senses.size}`)
  console.log(`bengali headwords (single token): ${bengali.size}`)

  /** @type {Record<string, object>} */
  const table = {}

  for (const [head, entry] of bengali) {
    const synonyms = pickRelations(
      head,
      wordNet.synonyms.get(head) ?? [],
      LIMITS.synonyms,
    )
    const antonyms = pickRelations(
      head,
      wordNet.antonyms.get(head) ?? [],
      LIMITS.antonyms,
    )
    const example = (wordNet.examples.get(head) ?? '').trim().slice(0, LIMITS.example)

    const spellings = bengaliSpellings(entry)
    table[head] = {
      bn: spellings[0]?.meaning ?? '',
      bnAlts: spellings.slice(1).map((s) => s.meaning),
      trans: spellings[0]?.roman ?? '',
      transAlts: spellings.slice(1).map((s) => s.roman),
      def: entry.def.slice(0, LIMITS.definition),
      pos: entry.pos.slice(0, 3).join('/'),
      syn: synonyms,
      ant: antonyms,
      ex: example,
    }
  }

  // Curated entries override the generated ones and backfill missing fields.
  for (const [head, value] of Object.entries(curated)) {
    const base = table[head] ?? {}
    const primary = canonicalBengali(value.bn ?? base.bn ?? '')
    const alts = value.bnAlts ?? base.bnAlts ?? []
    const source = bengali.get(head)
    // The romanization belongs to a specific spelling, so it is only kept
    // when the spelling it belongs to is still the one that is stored.
    const trans = primary === base.bn ? (base.trans ?? '') : (source ? romanOf(source, primary) : '')
    const transAlts = alts.map((alt) => {
      if (!source) return ''
      const generated = base.bnAlts ?? []
      const index = generated.findIndex((a) => canonicalBengali(a) === canonicalBengali(alt))
      if (index !== -1 && canonicalBengali(generated[index]) === canonicalBengali(alt)) {
        return base.transAlts?.[index] ?? ''
      }
      return romanOf(source, alt)
    })
    table[head] = {
      bn: primary,
      bnAlts: alts,
      trans,
      transAlts,
      def: value.def ?? base.def ?? '',
      pos: value.pos ?? base.pos ?? '',
      syn: value.syn?.length ? value.syn : (base.syn ?? []),
      ant: value.ant?.length ? value.ant : (base.ant ?? []),
      ex: value.ex ?? base.ex ?? '',
    }
  }

  const heads = Object.keys(table).sort()
  /** @type {Record<string, string[]>} */
  const columns = {
    headwords: heads,
    bn: [],
    bnAlt: [],
    trans: [],
    transAlt: [],
    def: [],
    pos: [],
    syn: [],
    ant: [],
    ex: [],
  }
  for (const head of heads) {
    const entry = table[head]
    columns.bn.push(entry.bn)
    columns.bnAlt.push(entry.bnAlts.join(SEP))
    columns.trans.push(entry.trans)
    columns.transAlt.push(entry.transAlts.join(SEP))
    columns.def.push(entry.def)
    columns.pos.push(entry.pos)
    columns.syn.push(entry.syn.join(SEP))
    columns.ant.push(entry.ant.join(SEP))
    columns.ex.push(entry.ex)
  }

  const dataset = { v: FORMAT_VERSION, ...columns }
  const json = `${JSON.stringify(dataset)}\n`

  const jsonFile = path.join(root, 'src', 'dictionary', 'generated.json')
  fs.mkdirSync(path.dirname(jsonFile), { recursive: true })
  fs.writeFileSync(jsonFile, json, 'utf8')

  const gzFile = path.join(root, 'public', 'dictionary.json.gz')
  fs.mkdirSync(path.dirname(gzFile), { recursive: true })
  fs.writeFileSync(gzFile, zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }), 'utf8')

  const count = heads.length
  const withSyn = Object.values(table).filter((e) => e.syn.length).length
  const withAnt = Object.values(table).filter((e) => e.ant.length).length
  const withEx = Object.values(table).filter((e) => e.ex).length
  console.log(`entries: ${count}`)
  console.log(`  with synonyms: ${withSyn}`)
  console.log(`  with antonyms: ${withAnt}`)
  console.log(`  with examples: ${withEx}`)
  console.log(`  generated.json: ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`)
  console.log(`  dictionary.json.gz: ${(fs.statSync(gzFile).size / 1024).toFixed(0)} KB`)
}

main()
