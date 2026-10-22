// Main build script for the offline dictionary dataset.
//
// Orchestrates the full pipeline:
//   1. Load Bengali dictionary from Wiktionary JSONL (headwords + meanings + romanizations)
//   2. Load WordNet synsets/antonyms/examples per part of speech
//   3. Load CMUdict pronunciations (ARPAbet → IPA)
//   4. For each headword: match WordNet synset, collect synonyms/antonyms,
//      get pronunciation, normalize Bengali meanings
//   5. Apply curated.json overrides (hand-written entries win)
//   6. Serialize to columnar JSON + gzip artifact
//
// @param {string} packageRoot path to the `bn-en-dictionary` package directory
// @param {string} wordnetRoot path to the `wordnet-db` package directory
// @param {string} cmudictRoot path to the `cmu-pronouncing-dictionary` package directory
// @param {string} curatedPath path to `src/dictionary/curated.json`
// @param {string} outputPath path to write `public/dictionary.json.gz`
// @returns {Promise<void>}

import fs from 'node:fs'
import zlib from 'node:zlib'

import { loadBengaliDictionary, selectVocabulary } from './lib/bengali.mjs'
import { loadWordNet } from './lib/wordnet.mjs'
import { loadPronunciations } from './lib/pronunciation.mjs'
import { posToWordnet } from './builders/relations.ts'
import { serializeDataset } from './builders/columnar.ts'

const LIMITS = {
  synonyms: 8,
  antonyms: 6,
  meanings: 10,
  definition: 220,
  example: 150,
}

/**
 * Builds the full offline dictionary dataset from all sources.
 *
 * @param {Object} options
 * @param {string} options.bengaliRoot - path to `bn-en-dictionary` package
 * @param {string} options.wordnetRoot - path to `wordnet-db` package
 * @param {string} options.cmudictRoot - path to `cmu-pronouncing-dictionary` package
 * @param {string} options.curatedPath - path to `curated.json`
 * @param {string} options.outputPath - path to write `dictionary.json.gz`
 * @returns {Promise<{entries: number, withSynonyms: number, withAntonyms: number, withExamples: number, withPronunciation: number}>}
 */
export async function buildDictionary({
  bengaliRoot,
  wordnetRoot,
  cmudictRoot,
  curatedPath,
  outputPath,
}) {
  console.log('Loading Bengali dictionary...')
  const bengaliDict = loadBengaliDictionary(bengaliRoot)
  const selected = selectVocabulary(bengaliDict)
  console.log(`  ${selected.size} headwords selected`)

  console.log('Loading WordNet...')
  const wordnet = loadWordNet(wordnetRoot)
  console.log(`  ${wordnet.senses.size} lemmas, ${wordnet.synsets.size} synsets`)

  console.log('Loading CMU Pronouncing Dictionary...')
  const pronunciations = await loadPronunciations(cmudictRoot)
  console.log(`  ${pronunciations.size} pronunciations`)

  console.log('Loading curated entries...')
  const curated = JSON.parse(fs.readFileSync(curatedPath, 'utf8'))
  console.log(`  ${Object.keys(curated).length} curated entries`)

  /** @type {Map<string, DictionaryEntry>} */
  const table = new Map()

  for (const [headword, entry] of selected) {
    const pos = posToWordnet(entry.pos[0]) || null

    // Match WordNet synset for this headword
    const synsetKeys = []
    if (pos) {
      const senses = wordnet.senses.get(headword)
      if (senses) {
        for (const [sensePos, keys] of senses) {
          if (sensePos === pos) {
            for (const k of keys) synsetKeys.push(k)
          }
        }
      }
    }

    // Collect synonyms from all matching synsets
    const synonyms = new Set()
    for (const key of synsetKeys) {
      const lemmas = wordnet.synsets.get(key)
      if (lemmas) {
        for (const lemma of lemmas) {
          if (lemma !== headword && isUsableRelation(lemma, headword)) {
            synonyms.add(lemma)
          }
        }
      }
    }

    // Collect antonyms from all matching synsets + inherited from synonyms
    const antonyms = new Set()
    for (const key of synsetKeys) {
      const targets = wordnet.antonyms.get(key)
      if (targets) {
        for (const targetKey of targets) {
          const targetLemmas = wordnet.synsets.get(targetKey)
          if (targetLemmas) {
            for (const lemma of targetLemmas) {
              if (isUsableRelation(lemma, headword)) antonyms.add(lemma)
            }
          }
        }
      }
    }

    // Get pronunciation
    const pron = pronunciations.get(headword) || ''

    // Build entry
    const spellings = entry.meanings.map((m, idx) => ({
      meaning: m,
      roman: entry.roman[idx] || '',
    }))

    table.set(headword, {
      headword,
      bn: spellings[0]?.meaning || '',
      bnAlts: spellings.slice(1).map((s) => s.meaning),
      trans: spellings[0]?.roman || '',
      transAlts: spellings.slice(1).map((s) => s.roman),
      def: entry.def.slice(0, LIMITS.definition),
      pos: entry.pos.slice(0, 3).join('/'),
      syn: [...synonyms].slice(0, LIMITS.synonyms),
      ant: [...antonyms].slice(0, LIMITS.antonyms),
      ex: '',
      pron,
    })
  }

  // Apply curated overrides
  for (const [headword, value] of Object.entries(curated)) {
    const existing = table.get(headword)
    const bn = value.bn || (existing ? existing.bn : '')
    const bnAlts = value.bnAlts || (existing ? existing.bnAlts : [])
    const trans = value.trans || (existing ? existing.trans : '')
    const transAlts = value.transAlts || (existing ? existing.transAlts : [])
    const def = value.def || (existing ? existing.def : '')
    const pos = value.pos || (existing ? existing.pos : '')
    const syn = value.syn || (existing ? existing.syn : [])
    const ant = value.ant || (existing ? existing.ant : [])
    const ex = value.ex || (existing ? existing.ex : '')
    const pron = value.pron || (existing ? existing.pron : '')

    table.set(headword, {
      headword,
      bn,
      bnAlts,
      trans,
      transAlts,
      def: def.slice(0, LIMITS.definition),
      pos,
      syn: syn.slice(0, LIMITS.synonyms),
      ant: ant.slice(0, LIMITS.antonyms),
      ex: ex.slice(0, LIMITS.example),
      pron,
    })
  }

  // Serialize to columnar dataset
  const entries = [...table.values()]
  const dataset = serializeDataset(entries)

  // Write JSON
  const json = JSON.stringify(dataset, null, 2)
  const jsonPath = outputPath.replace(/\.gz$/, '.json')
  fs.writeFileSync(jsonPath, json, 'utf8')

  // Write gzipped
  const gzipped = zlib.gzipSync(json, { level: 9 })
  fs.writeFileSync(outputPath, gzipped)

  // Stats
  const withSynonyms = entries.filter((e) => e.syn.length > 0).length
  const withAntonyms = entries.filter((e) => e.ant.length > 0).length
  const withExamples = entries.filter((e) => e.ex.length > 0).length
  const withPronunciation = entries.filter((e) => e.pron.length > 0).length

  console.log(`Entries: ${entries.length}`)
  console.log(`  With synonyms: ${withSynonyms}`)
  console.log(`  With antonyms: ${withAntonyms}`)
  console.log(`  With examples: ${withExamples}`)
  console.log(`  With pronunciation: ${withPronunciation}`)
  console.log(`  Output: ${outputPath}`)

  return {
    entries: entries.length,
    withSynonyms,
    withAntonyms,
    withExamples,
    withPronunciation,
  }
}

/**
 * Whether a relation word is worth keeping.
 * Single words of at least 3 letters, excluding the headword itself.
 *
 * @param {string} word - Candidate relation word
 * @param {string} headword - The headword being processed
 * @returns {boolean}
 */
function isUsableRelation(word: string, headword: string): boolean {
  if (!/^[a-z][a-z-]*$/.test(word)) return false
  if (word.length < 3) return false
  if (word === headword) return false
  return true
}
