// Minimal WordNet 3.0 reader (Princeton license, see wordnet-db/LICENSE).
//
// The npm `wordnet-db` package ships the raw `dict/` files. We only need three
// relations for the offline dictionary:
//
//   synonyms  - other lemmas that share a synset with the headword
//   antonyms  - lemmas reached through the `!` (antonym) pointer
//   examples  - the quoted example sentence of the headword's synset
//
// The on-disk format is positional and the pointer block is variable length,
// so synset offsets are located by scanning for the first 8-digit token.

import fs from 'node:fs'
import path from 'node:path'

const POS_FILES = ['noun', 'verb', 'adj', 'adv']

/** Synset key is `pos:offset` because offsets collide across POS files. */
const synsetKey = (pos, offset) => `${pos}:${offset}`

function readDictFile(dictDir, name) {
  const file = path.join(dictDir, name)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n')
}

/** Parses `data.{pos}` into synset -> lemma list, gloss, examples and antonym pointers. */
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
      const tokens = line.slice(0, bar).trim().split(/\s+/)
      const offset = tokens[0]
      const wordCount = Number.parseInt(tokens[3], 10)
      if (!Number.isFinite(wordCount)) continue

      const lemmas = []
      for (let i = 0; i < wordCount; i += 1) {
        const lemma = tokens[4 + i * 2]
        if (lemma) lemmas.push(lemma)
      }
      const key = synsetKey(pos, offset)
      synsetLemmas.set(key, lemmas)

      // The gloss is the definition, the example sentence follows it after a
      // semicolon.
      const after = line.slice(bar + 1)
      synsetGloss.set(key, after.split(';')[0].trim())
      const example = after.match(/;\s*"([^"]+)"/)
      if (example) synsetExample.set(key, example[1])

      // Pointer block: p_cnt followed by p_cnt (symbol, offset) pairs.
      let cursor = 4 + wordCount * 2
      const pointerCount = Number.parseInt(tokens[cursor], 10)
      if (!Number.isFinite(pointerCount)) continue
      for (let i = 0; i < pointerCount; i += 1) {
        const symbol = tokens[cursor + 1 + i * 4]
        const target = tokens[cursor + 2 + i * 4]
        if (symbol === '!' && target) {
          // The pointer never leaves the part of speech, so the target synset
          // is looked up in the same file.
          if (!antonymTargets.has(key)) antonymTargets.set(key, [])
          antonymTargets.get(key).push(synsetKey(pos, target))
        }
      }
    }
  }
  return { synsetLemmas, synsetGloss, synsetExample, antonymTargets }
}



/** Parses `index.{pos}` into lemma -> synset memberships. */
function parseIndexFiles(dictDir) {
  /** @type {Map<string, {pos: string, offset: string}[]>} */
  const senses = new Map()

  for (const pos of POS_FILES) {
    for (const raw of readDictFile(dictDir, `index.${pos}`)) {
      const line = raw.trim()
      if (!line || line.startsWith(' ')) continue
      const tokens = line.split(/\s+/)
      const lemma = tokens[0].toLowerCase()
      if (!/^[a-z][a-z-]*$/.test(lemma)) continue
      if (!Number.isFinite(Number.parseInt(tokens[2], 10))) continue

      // The trailing block is the list of 8-digit synset offsets.
      let start = -1
      for (let i = 3; i < tokens.length; i += 1) {
        if (/^\d{8}$/.test(tokens[i])) {
          start = i
          break
        }
      }
      if (start < 2) continue

      for (const offset of tokens.slice(start)) {
        if (!senses.has(lemma)) senses.set(lemma, [])
        senses.get(lemma).push({ pos, offset })
      }
    }
  }
  return senses
}


/**
 * Reads a `wordnet-db` package.
 *
 * The data is returned per synset, not per word: a word can be in several
 * synsets, and each of them has its own synonyms, its own antonyms and its
 * own example. The caller picks the synset that matches the entry, so the
 * relations of another reading never leak in.
 *
 * @param {string} packageRoot path to the `wordnet-db` package directory
 */
export function loadWordNet(packageRoot) {
  const dictDir = path.join(packageRoot, 'dict')
  if (!fs.existsSync(dictDir)) {
    throw new Error(`WordNet dictionary files not found at ${dictDir}`)
  }

  const { synsetLemmas, synsetGloss, synsetExample, antonymTargets } = parseDataFiles(dictDir)
  const senses = parseIndexFiles(dictDir)

  return {
    /** lemma -> the synsets it belongs to. */
    senses,
    /** synset key -> its lemmas. */
    synsets: synsetLemmas,
    /** synset key -> the definition. */
    glosses: synsetGloss,
    /** synset key -> the example sentence. */
    examples: synsetExample,
    /** synset key -> the keys of its antonym synsets. */
    antonyms: antonymTargets,
  }
}
