// Reader for the `wordnet-db` npm package (Princeton WordNet 3.0).
//
// The package ships raw `dict/` files: `data.{pos}` and `index.{pos}` for
// noun, verb, adj, adv. We parse the data files directly to extract synsets,
// lemmas, glosses, examples, and antonym pointers.
//
// @param {string} packageRoot path to the `wordnet-db` package directory
// @returns {Object} with senses, synsets, glosses, examples, antonyms

import fs from 'node:fs'
import path from 'node:path'

const POS_FILES = ['noun', 'verb', 'adj', 'adv']

/** WordNet POS code -> canonical POS name. */
const WN_POS = {
  n: 'noun',
  v: 'verb',
  a: 'adj',
  r: 'adv',
  s: 'adj', // satellite adjectives are treated as adjectives
}

/** Synset key is `pos:offset` because offsets collide across POS files. */
function synsetKey(pos, offset) {
  return `${pos}:${offset}`
}

function readDictFile(dictDir, name) {
  const file = path.join(dictDir, name)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n')
}

/**
 * Parses `data.{pos}` files into synset data.
 *
 * Each line has the format:
 *   offset lex_filenum pos lex_cnt [lemma lex_id]* ptr_cnt
 *   [ptr_symbol target_offset target_pos target_sense]* | gloss
 *
 * @param {string} dictDir
 * @returns {Object} with synsetLemmas, synsetGloss, synsetExample, antonymTargets
 */
function parseDataFiles(dictDir) {
  /** @type {Map<string, string[]>} */
  const synsetLemmas = new Map()
  /** @type {Map<string, string>} */
  const synsetGloss = new Map()
  /** @type {Map<string, string>} */
  const synsetExample = new Map()
  /** @type {Map<string, string[]>} */
  const antonymTargets = new Map()

  for (const pos of POS_FILES) {
    for (const line of readDictFile(dictDir, `data.${pos}`)) {
      if (!/^\d{8} /.test(line)) continue

      const bar = line.indexOf('|')
      if (bar === -1) continue

      const header = line.slice(0, bar).trim()
      const tokens = header.split(/\s+/)

      // offset lex_filenum pos lex_cnt [lemma lex_id]* ptr_cnt ...
      const offset = tokens[0]
      const wPos = WN_POS[tokens[2]] || tokens[2]
      const lexCnt = parseInt(tokens[3], 10)
      if (!Number.isFinite(lexCnt)) continue

      // Collect lemmas: lex_cnt pairs of [lemma lex_id]
      const lemmas = []
      let idx = 4
      for (let i = 0; i < lexCnt; i += 1) {
        const lemma = tokens[idx]
        if (lemma) lemmas.push(lemma.toLowerCase())
        idx += 2 // skip lemma + lex_id
      }

      const key = synsetKey(wPos, offset)
      synsetLemmas.set(key, lemmas)

      // Gloss is everything after the bar, trimmed
      const gloss = line.slice(bar + 1).trim()
      synsetGloss.set(key, gloss)

      // Example is the first quoted string in the gloss
      const exampleMatch = gloss.match(/"([^"]*)"/)
      if (exampleMatch) {
        synsetExample.set(key, exampleMatch[1])
      }

      // Pointer block: ptr_cnt followed by ptr_cnt (symbol, offset, pos, sense) groups
      const ptrCnt = parseInt(tokens[idx], 10)
      if (!Number.isFinite(ptrCnt)) continue
      idx += 1

      for (let i = 0; i < ptrCnt; i += 1) {
        const symbol = tokens[idx + i * 4]
        const target = tokens[idx + i * 4 + 1]
        if (symbol === '!' && target) {
          if (!antonymTargets.has(key)) antonymTargets.set(key, [])
          antonymTargets.get(key).push(synsetKey(wPos, target))
        }
      }
    }
  }
  return { synsetLemmas, synsetGloss, synsetExample, antonymTargets }
}

/**
 * Parses `index.{pos}` files into lemma -> synset memberships.
 *
 * @param {string} dictDir
 * @returns {Map<string, Map<string, string[]>>} lemma -> pos -> synset keys
 */
function parseIndexFiles(dictDir) {
  /** @type {Map<string, Map<string, string[]>>} */
  const senses = new Map()

  for (const pos of POS_FILES) {
    for (const line of readDictFile(dictDir, `index.${pos}`)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(' ')) continue

      const tokens = line.split(/\s+/)
      const lemma = tokens[0].toLowerCase()
      if (!/^[a-z][a-z-]*$/.test(lemma)) continue
      if (!Number.isFinite(Number.parseInt(tokens[2], 10))) continue

      // Scan for the first 8-digit synset offset; everything from there is
      // a synset offset for this lemma in this part of speech.
      let start = -1
      for (let i = 3; i < tokens.length; i += 1) {
        if (/^\d{8}$/.test(tokens[i])) {
          start = i
          break
        }
      }
      if (start < 0) continue

      if (!senses.has(lemma)) senses.set(lemma, new Map())
      const byPos = senses.get(lemma)
      if (!byPos.has(pos)) byPos.set(pos, [])
      for (let i = start; i < tokens.length; i += 1) {
        if (/^\d{8}$/.test(tokens[i])) {
          byPos.get(pos).push(synsetKey(pos, tokens[i]))
        }
      }
    }
  }
  return senses
}

/**
 * Reads a `wordnet-db` package and extracts synset data.
 *
 * @param {string} packageRoot path to the `wordnet-db` package directory
 * @returns {Object} with senses, synsets, glosses, examples, antonyms
 */
export function loadWordNet(packageRoot) {
  const dictDir = path.join(packageRoot, 'dict')
  if (!fs.existsSync(dictDir)) {
    throw new Error(`WordNet dictionary files not found at ${dictDir}`)
  }

  const { synsetLemmas, synsetGloss, synsetExample, antonymTargets } =
    parseDataFiles(dictDir)
  const senses = parseIndexFiles(dictDir)

  return {
    /** lemma -> part of speech -> synset keys[] */
    senses,
    /** synset key -> lemmas[] */
    synsets: synsetLemmas,
    /** synset key -> gloss string */
    glosses: synsetGloss,
    /** synset key -> example sentence */
    examples: synsetExample,
    /** synset key -> target synset keys[] (antonyms) */
    antonyms: antonymTargets,
  }
}
