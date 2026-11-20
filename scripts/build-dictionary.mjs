// Builds the offline dictionary dataset.
//
//   npm run build:dictionary
//
// Sources (installed as devDependencies, never shipped to the browser):
//   bn-en-dictionary  - Bengali <-> English pairs from a Wiktionary dump
//                       (CC BY-SA 3.0): the Bengali meanings, definitions,
//                       parts of speech and romanizations
//   wordnet-db        - Princeton WordNet 3.0 (permissive license):
//                       synonyms, antonyms and example sentences
//   cmu-pronouncing-dictionary - North American pronunciations in ARPAbet
//   src/dictionary/curated.json - hand-written entries that win over the
//                                 generated ones
//
// Output:
//   src/dictionary/generated.json  - compact columnar dataset (source of truth
//                                    for tests and Node-side tooling)
//   public/dictionary.json.gz       - gzipped copy loaded by the service
//                                    worker at runtime (never bundled into the
//                                    content-script bundle)
//
// Layout:
//   {
//     v: 4,
//     headwords: string[],   // English headword, sorted
//     bn: string[],          // primary Bengali meaning
//     bnAlt: string[],       // ALL other Bengali meanings, U+0001-joined
//     trans: string[],       // romanization of the primary meaning
//     transAlt: string[],    // romanization of each alternative meaning,
//                            // U+0001-joined, same order as bnAlt
//     def: string[],         // English definition
//     pos: string[],         // part of speech (human-readable label)
//     syn: string[],         // synonyms, U+0001-joined
//     ant: string[],         // antonyms, U+0001-joined
//     ex: string[],          // example sentence
//     pron: string[],        // pronunciation guide (IPA)
//   }
// Every array has the same length and shares the same index space.
// Multi-valued fields are joined with U+0001, a control character that cannot
// occur in any of the text.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { canonicalBengali, loadBengaliDictionary, selectVocabulary } from './lib/bengali.mjs'
import { loadPronunciations } from './lib/pronunciation.mjs'
import { loadWordNet } from './lib/wordnet.mjs'
import { enrichEntry, loadBandList } from './lib/enrichment.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Field separator for multi-valued columns. */
const SEP = '\u0001'

/** Dataset format version, bumped when the layout changes. */
const FORMAT_VERSION = 5

const NEW_COLUMNS = [
  'formalMeaning', 'conversationalMeaning', 'exampleFormal', 'exampleConversational',
  'collocations', 'wordFamily', 'bandLevel', 'commonMistake',
]

const LIMITS = {
  synonyms: 8,
  antonyms: 6,
  meanings: 10,
  definition: 220,
  example: 150,
}

/**
 * The part-of-speech labels of the source, written out.
 *
 * The source uses the abbreviations of a Wiktionary dump ("adj", "name"),
 * which mean nothing to a learner.
 */
const POS_LABELS = {
  noun: 'noun',
  name: 'proper noun',
  adj: 'adjective',
  verb: 'verb',
  num: 'numeral',
  adv: 'adverb',
  intj: 'interjection',
  pron: 'pronoun',
  prep: 'preposition',
  postp: 'postposition',
  conj: 'conjunction',
  det: 'determiner',
  prefix: 'prefix',
  suffix: 'suffix',
  particle: 'particle',
  article: 'article',
  symbol: 'symbol',
  sentence: 'sentence',
}

/** Writes the part of speech out. */
function posLabel(pos) {
  const parts = pos
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...rest] = part.split(',').map((p) => p.trim())
      const label = POS_LABELS[name] ?? name
      return rest.length ? `${label} (${rest.join(', ')})` : label
    })
  return parts.slice(0, 3).join(' / ')
}

/** The parts of speech of the source that WordNet also knows. */
const POS_TO_WORDNET = {
  noun: 'noun',
  name: 'noun',
  verb: 'verb',
  adj: 'adj',
  adv: 'adv',
}

/** Whether a relation is worth showing. */
function isUsableRelation(word) {
  return /^[a-z][a-z-]*$/.test(word) && word.length >= 3
}

/** The meaningful words of a text. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this',
  'these', 'those', 'it', 'its', 'any', 'some', 'or', 'and', 'but', 'not',
  'used', 'one', 'who', 'which', 'whose', 'when', 'where', 'how', 'than',
  'them', 'they', 'their', 'there', 'here', 'into', 'onto', 'upon', 'about',
])

function contentWords(text) {
  const out = new Set()
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word.length < 3) continue
    if (STOP_WORDS.has(word)) continue
    out.add(word)
  }
  return out
}

/** The part of speech the relations of an entry are taken from. */
function wordnetPos(entry) {
  for (const pos of entry.pos) {
    const mapped = POS_TO_WORDNET[pos]
    if (mapped) return mapped
  }
  return null
}

/** Synset key is `pos:offset` because offsets collide across POS files. */
function synsetKey(pos, offset) {
  return `${pos}:${offset}`
}

/** The lemmas of a synset, cleaned up. */
function synsetLemmas(wordnet, key) {
  return (wordnet.synsets.get(key) ?? [])
    .map((lemma) => lemma.split('(')[0].toLowerCase())
    .filter((lemma) => lemma !== '' && lemma.length < 30)
}

/** The antonyms of a synset. */
function synsetAntonyms(wordnet, key) {
  const out = []
  for (const target of wordnet.antonyms.get(key) ?? []) {
    for (const lemma of synsetLemmas(wordnet, target)) out.push(lemma)
  }
  return out
}

/**
 * The antonyms of a synset, with the antonyms of its synonyms added.
 *
 * WordNet marks the opposite on a synset, so a word only gets an antonym
 * when its own synset carries one. But the relation holds for the whole
 * group: if "large" is the opposite of "small", then "big" -- a synonym of
 * "large" -- is the opposite of "small" as well.
 *
 * Only relations within the given part of speech are included, so antonyms
 * from a different reading ("book" as a noun vs. "book" as a verb) never
 * leak in.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} key synset key
 * @param {string} pos part of speech
 * @returns {string[]}
 */
function synsetAntonymsWithInherited(wordnet, key, pos) {
  const out = []
  const seen = new Set()
  const add = (candidate) => {
    if (!isUsableRelation(candidate)) return
    if (seen.has(candidate)) return
    seen.add(candidate)
    out.push(candidate)
  }
  // Direct antonyms of this synset
  for (const a of synsetAntonyms(wordnet, key)) add(a)
  // Antonyms of each synonym lemma in this synset
  for (const lemma of synsetLemmas(wordnet, key)) {
    for (const sense of wordnet.senses.get(lemma) ?? []) {
      if (sense.pos !== pos) continue
      for (const a of synsetAntonyms(wordnet, synsetKey(sense.pos, sense.offset))) add(a)
    }
  }
  return out
}

/** Removes duplicates while preserving order. */
function dedupe(items) {
  return [...new Set(items)]
}

/**
 * The WordNet synset that best describes an entry.
 *
 * A word can be in several synsets -- "volume" is a set of books and also a
 * loudness -- and each of them has its own synonyms, antonyms and example.
 * The synset whose definition shares the most content words with the entry's
 * own definition is the one that describes it.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} head
 * @param {string} pos
 * @param {string} definition
 * @returns {string | null} the synset key
 */
function matchSynset(wordnet, head, pos, definition) {
  const candidates = (wordnet.senses.get(head) ?? []).filter((s) => s.pos === pos)
  if (!candidates.length || !definition) return null
  const wanted = contentWords(definition)
  let best = null
  let bestScore = 0
  for (const sense of candidates) {
    const key = synsetKey(sense.pos, sense.offset)
    const gloss = wordnet.glosses.get(key) ?? ''
    let score = 0
    for (const word of contentWords(gloss)) {
      if (wanted.has(word)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = key
    }
  }
  // Without a single word in common the synset is a guess, and a wrong
  // guess is worse than no relation at all.
  return bestScore > 0 ? best : null
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

function loadCurated() {
  const file = path.join(root, 'src', 'dictionary', 'curated.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * The Bengali spellings of an entry, each paired with its romanization.
 *
 * Every distinct Bengali meaning is kept, not just the first one, so that a
 * lookup shows all the meanings a word can have ("book" -> বই, কিতাব,
 * পুঁথি, ...).
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

async function main() {
  const wordNet = loadWordNet(path.join(root, 'node_modules', 'wordnet-db'))
  const pronunciations = await loadPronunciations(
    path.join(root, 'node_modules', 'cmu-pronouncing-dictionary'),
  )
  const bengali = selectVocabulary(
    loadBengaliDictionary(path.join(root, 'node_modules', 'bn-en-dictionary')),
  )
  const curated = loadCurated()
  const bandList = loadBandList(path.join(root, 'scripts', 'data', 'cefr-bands.json'))
  const enrichmentOverrides = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts', 'data', 'enrichment-overrides.json'), 'utf8'),
  )

  console.log(`wordnet lemmas: ${wordNet.senses.size}`)
  console.log(`bengali headwords (single token): ${bengali.size}`)
  console.log(`pronunciations: ${pronunciations.size}`)

  /** @type {Record<string, object>} */
  const table = {}

  for (const [head, entry] of bengali) {
    // The relations are taken from the part of speech the entry is listed
    // under, so a word that is both a noun and a verb does not get the
    // antonyms of the other reading.
    const pos = wordnetPos(entry)
    const candidates = (wordNet.senses.get(head) ?? []).filter((s) => s.pos === pos)

    // Match the synset that best describes the entry (for the example and
    // primary relations). If no synset matches the definition, fall back to
    // the first synset of the right part of speech.
    const synset = matchSynset(wordNet, head, pos, entry.def)

    // Direct synonyms and antonyms come from ALL synsets of the right part of
    // speech: a word can be in several synsets and each has different
    // relations. Using all of them maximizes coverage without cross-sense
    // noise, because synonyms don't carry a "sense" the way antonyms do.
    const allSynonyms = []
    const allAntonyms = []
    for (const sense of candidates) {
      const key = synsetKey(sense.pos, sense.offset)
      allSynonyms.push(...synsetLemmas(wordNet, key))
      allAntonyms.push(...synsetAntonyms(wordNet, key))
    }

    // Inherited antonyms fill the gaps: the antonyms of each synonym, but only
    // from the matched synset so that antonyms from a different reading don't
    // leak in ("book" as a noun must not get "softness" from "volume" as
    // loudness).
    const inheritedAntonyms = synset
      ? synsetAntonymsWithInherited(wordNet, synset, pos)
      : []

    const allSyn = dedupe(allSynonyms.filter((s) => s !== head && isUsableRelation(s)))
    const allAnt = dedupe(allAntonyms.filter((a) => a !== head && isUsableRelation(a)))
    const inheritedAnt = dedupe(inheritedAntonyms.filter((a) => a !== head && isUsableRelation(a)))

    const example =
      synset ? (wordNet.examples.get(synset) ?? '') : ''
    const exampleTrimmed = example.trim().slice(0, LIMITS.example)

    const spellings = bengaliSpellings(entry)
    table[head] = {
      bn: spellings[0]?.meaning ?? '',
      bnAlts: spellings.slice(1).map((s) => s.meaning),
      trans: spellings[0]?.roman ?? '',
      transAlts: spellings.slice(1).map((s) => s.roman),
      def: entry.def.slice(0, LIMITS.definition),
      pos: posLabel(entry.pos.slice(0, 3).join('/')),
      // Direct synonyms from all synsets, plus inherited antonyms as
      // synonyms ("unhappy" can name "happy"'s synonyms).
      syn: [...allSyn, ...inheritedAnt].slice(0, LIMITS.synonyms),
      ant: allAnt.slice(0, LIMITS.antonyms),
      ex: exampleTrimmed,
      exBn: '',
      pron: pronunciations.get(head) ?? '',
      ...enrichEntry(
        { def: entry.def, ex: exampleTrimmed },
        {
          word: head,
          pos,
          senses: wordNet.senses,
          examples: synset ? [wordNet.examples.get(synset) ?? ''] : [],
          bandList,
          overrides: { ...(enrichmentOverrides[head] ?? {}), ...(curated[head] ?? {}) },
        },
      ),
    }
  }

  // Curated entries override the generated ones and backfill missing fields.
  for (const [head, value] of Object.entries(curated)) {
    const base = table[head] ?? {}
    const primary = canonicalBengali(value.bn ?? base.bn ?? '')
    const alts = value.bnAlts ?? base.bnAlts ?? []
    const source = bengali.get(head)
    const trans = value.trans ?? (primary === base.bn ? (base.trans ?? '') : (source ? romanOf(source, primary) : ''))
    const transAlts = alts.map((alt) => {
      if (!source) return ''
      const generated = base.bnAlts ?? []
      const index = generated.findIndex((a) => canonicalBengali(a) === canonicalBengali(alt))
      if (index !== -1) {
        return base.transAlts?.[index] ?? ''
      }
      return romanOf(source, alt)
    })
    table[head] = {
      // Preserve the generated enrichment fields; the explicit values below
      // still win over everything in `base`.
      ...(base ?? {}),
      bn: primary,
      bnAlts: alts,
      trans,
      transAlts,
      def: value.def ?? base.def ?? '',
      pos: value.pos ?? base.pos ?? '',
      syn: value.syn?.length ? value.syn : (base.syn ?? []),
      ant: value.ant?.length ? value.ant : (base.ant ?? []),
      ex: value.ex ?? base.ex ?? '',
      exBn: value.exBn ?? base.exBn ?? '',
      pron: value.pron ?? base.pron ?? pronunciations.get(head) ?? '',
      // Curated-only headwords never pass through the generated loop above.
      ...enrichEntry(
        { def: value.def ?? base.def ?? '', ex: value.ex ?? base.ex ?? '' },
        {
          word: head,
          pos: POS_TO_WORDNET[(value.pos ?? '').split(' ')[0]] ?? null,
          senses: wordNet.senses,
          examples: [],
          bandList,
          overrides: { ...(enrichmentOverrides[head] ?? {}), ...value },
        },
      ),
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
    exBn: [],
    pron: [],
    formalMeaning: [], conversationalMeaning: [], exampleFormal: [],
    exampleConversational: [], collocations: [], wordFamily: [],
    bandLevel: [], commonMistake: [],
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
    columns.exBn.push(entry.exBn ?? '')
    columns.pron.push(entry.pron)
    for (const column of NEW_COLUMNS) {
      const value = entry[column]
      columns[column].push(Array.isArray(value) ? value.join(SEP) : (value ?? ''))
    }
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
  const withPron = Object.values(table).filter((e) => e.pron).length
  console.log(`entries: ${count}`)
  console.log(`  with synonyms: ${withSyn}`)
  console.log(`  with antonyms: ${withAnt}`)
  console.log(`  with examples: ${withEx}`)
  console.log(`  with pronunciation: ${withPron}`)
  console.log(`  generated.json: ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`)
  console.log(`  dictionary.json.gz: ${(fs.statSync(gzFile).size / 1024).toFixed(0)} KB`)
}

main()
