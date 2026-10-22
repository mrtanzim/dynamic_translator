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
import { loadPronunciations } from './lib/pronunciation.mjs'
import { loadWordNet } from './lib/wordnet.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Field separator for multi-valued columns. */
const SEP = '\u0001'

/** Dataset format version, bumped when the layout changes. */
const FORMAT_VERSION = 3

const LIMITS = {
  synonyms: 8,
  antonyms: 6,
  meanings: 4,
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

/**
 * The parts of speech of the source that WordNet also knows.
 *
 * A word that is both a noun and a verb has different synonyms and
 * different antonyms in the two readings, so the relations are only taken
 * from the part of speech the entry is listed under.
 */
const POS_TO_WORDNET = {
  noun: 'noun',
  name: 'noun',
  verb: 'verb',
  adj: 'adj',
  adv: 'adv',
}

/**
 * Writes the part of speech out.
 *
 * @param {string} pos the source value, e.g. "adj" or "name, old"
 * @returns {string}
 */
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

/** Curated entries are the source of truth for the words they cover. */
function loadCurated() {
  const file = path.join(root, 'src', 'dictionary', 'curated.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
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

/**
 * Whether a relation is worth showing.
 *
 * WordNet lists every lemma that shares a synset, which includes rare
 * morphological variants ("well-chosen" for "happy"). Only single words of
 * at least three letters are kept.
 */
function isUsableRelation(word) {
  return /^[a-z][a-z-]*$/.test(word) && word.length >= 3
}

/**
 * The part of speech the relations of an entry are taken from.
 *
 * @param {import('./lib/bengali.mjs').BengaliHeadword} entry
 * @returns {string | null} a WordNet part of speech
 */
function wordnetPos(entry) {
  for (const pos of entry.pos) {
    const mapped = POS_TO_WORDNET[pos]
    if (mapped) return mapped
  }
  return null
}

/** The words of a text that carry meaning. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this',
  'these', 'those', 'it', 'its', 'any', 'some', 'or', 'and', 'but', 'not',
  'used', 'one', 'who', 'which', 'whose', 'when', 'where', 'how', 'than',
  'them', 'they', 'their', 'there', 'here', 'into', 'onto', 'upon', 'about',
])

/**
 * The meaningful words of a text.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function contentWords(text) {
  const out = new Set()
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word.length < 3) continue
    if (STOP_WORDS.has(word)) continue
    out.add(word)
  }
  return out
}

/**
 * The WordNet synset that describes the entry.
 *
 * A word can be in several synsets -- "volume" is a set of books and also a
 * loudness -- and each of them has its own synonyms, antonyms and example.
 * The synset whose definition has the most words in common with the
 * definition of the entry is the one that describes it.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} head
 * @param {string} pos
 * @param {string} definition
 * @returns {string | null} the synset key
 */
function matchSynset(wordnet, head, pos, definition) {
  const candidates = (wordnet.senses.get(head) ?? []).filter((s) => s.pos === pos)
  if (!candidates.length) return null
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
 * The lemmas of a synset, cleaned up.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} key
 * @returns {string[]}
 */
function synsetLemmas(wordnet, key) {
  return (wordnet.synsets.get(key) ?? [])
    .map((lemma) => lemma.split('(')[0].toLowerCase())
    .filter((lemma) => lemma !== '' && lemma.length < 30)
}

/**
 * The antonyms of a synset.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} key
 * @returns {string[]}
 */
function synsetAntonyms(wordnet, key) {
  const out = []
  for (const target of wordnet.antonyms.get(key) ?? []) {
    for (const lemma of synsetLemmas(wordnet, target)) out.push(lemma)
  }
  return out
}

/**
 * The antonyms of the synonyms of a synset.
 *
 * WordNet marks the opposite on a synset, so a word only gets an antonym
 * when its own synset carries one. But the relation holds for the whole
 * group: if "large" is the opposite of "small", then "big" -- a synonym of
 * "large" -- is the opposite of "small" as well.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} key
 * @param {string} pos
 * @returns {string[]}
 */
function inheritedAntonyms(wordnet, key, pos) {
  const out = []
  for (const lemma of synsetLemmas(wordnet, key)) {
    for (const sense of wordnet.senses.get(lemma) ?? []) {
      if (sense.pos !== pos) continue
      out.push(...synsetAntonyms(wordnet, synsetKey(sense.pos, sense.offset)))
    }
  }
  return out
}

/**
 * The synonyms of the antonyms of a synset.
 *
 * The reverse of the antonym inheritance: if "unhappy" is the opposite of
 * "happy", it can name the same synonyms.
 *
 * @param {ReturnType<typeof loadWordNet>} wordnet
 * @param {string} key
 * @param {string} pos
 * @returns {string[]}
 */
function inheritedSynonyms(wordnet, key, pos) {
  const out = []
  for (const antonymKey of wordnet.antonyms.get(key) ?? []) {
    for (const lemma of synsetLemmas(wordnet, antonymKey)) {
      for (const sense of wordnet.senses.get(lemma) ?? []) {
        if (sense.pos !== pos) continue
        for (const other of synsetLemmas(wordnet, synsetKey(sense.pos, sense.offset))) {
          out.push(other)
        }
      }
    }
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
    const synonyms = pos ? synonymsWithInherited(wordNet, head, pos, LIMITS.synonyms) : []
    const antonyms = pos ? antonymsWithInherited(wordNet, head, pos, LIMITS.antonyms) : []
    const example = (wordNet.examples.get(head) ?? '').trim().slice(0, LIMITS.example)

    const spellings = bengaliSpellings(entry)
    table[head] = {
      bn: spellings[0]?.meaning ?? '',
      bnAlts: spellings.slice(1).map((s) => s.meaning),
      trans: spellings[0]?.roman ?? '',
      transAlts: spellings.slice(1).map((s) => s.roman),
      def: entry.def.slice(0, LIMITS.definition),
      pos: posLabel(entry.pos.slice(0, 3).join('/')),
      syn: synonyms,
      ant: antonyms,
      ex: example,
      pron: pronunciations.get(head) ?? '',
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
      // The pronunciation belongs to the English word, so a curated entry
      // never changes it.
      pron: base.pron ?? pronunciations.get(head) ?? '',
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
    pron: [],
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
    columns.pron.push(entry.pron)
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
