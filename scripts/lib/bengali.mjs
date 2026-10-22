// Reader for the `bn-en-dictionary` npm package (Wiktionary dump, CC BY-SA 3.0).
//
// The package ships `data/dictionary.jsonl`: one JSON object per line with
// `en` (English headword), `bn` (Bengali translation), `pos`, `def` (English
// gloss), `source`, `license` and `romanised` (romanized Bengali).
//
// A single headword usually appears several times, once per sense and once per
// accepted Bengali spelling, so records are grouped by headword.

import fs from 'node:fs'
import path from 'node:path'

/**
 * @typedef {object} BengaliSense
 * @property {string} en      English headword (lowercased)
 * @property {string} bn      Bengali translation
 * @property {string} pos     Part of speech
 * @property {string} def     English definition
 * @property {string} roman   Romanized Bengali
 */

/**
 * @typedef {object} BengaliHeadword
 * @property {string} head
 * @property {string[]} meanings  Distinct Bengali spellings, most common first
 * @property {string[]} roman     The romanized spelling of `meanings[i]`
 *                                 (an empty string when there is none)
 * @property {string[]} pos       Distinct parts of speech
 * @property {string} def         Best English definition
 * @property {number} senses      Number of records for this headword
 */

/**
 * Canonical form for Bengali text.
 *
 * The dataset mixes the precomposed YYA (`য়`, U+09DF) and the decomposed
 * `য` + nukta (`U+09AF U+09BC`). Unicode NFC maps both onto the same sequence
 * (the decomposed one), so applying NFC to every stored and queried string
 * makes the two spellings compare equal without any manual substitution.
 * @param {string} value
 * @returns {string}
 */
export function canonicalBengali(value) {
  return value.normalize('NFC')
}

/** Only single-token headwords are useful for a vocabulary lookup. */
const isSingleToken = (word) => /^[a-z][a-z-]*$/.test(word)

/**
 * Reads the `bn-en-dictionary` package and groups its records by headword.
 * @param {string} packageRoot path to the `bn-en-dictionary` package directory
 * @returns {Map<string, BengaliHeadword>}
 */
export function loadBengaliDictionary(packageRoot) {
  const file = path.join(packageRoot, 'data', 'dictionary.jsonl')
  if (!fs.existsSync(file)) {
    throw new Error(`Bengali dictionary data not found at ${file}`)
  }

  /** @type {Map<string, BengaliHeadword>} */
  const headwords = new Map()

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const record = JSON.parse(line)
    const en = String(record.en ?? '').trim().toLowerCase()
    const bn = canonicalBengali(String(record.bn ?? '').trim())
    if (!en || !bn) continue

    let entry = headwords.get(en)
    if (!entry) {
      entry = { head: en, meanings: [], roman: [], pos: [], def: '', senses: 0 }
      headwords.set(en, entry)
    }
    entry.senses += 1

    const roman = String(record.romanised ?? '').trim().toLowerCase()
    // The romanized spelling belongs to one specific Bengali spelling, so
    // the two are kept in step: `roman[i]` is the romanization of
    // `meanings[i]`.
    const index = entry.meanings.indexOf(bn)
    if (index === -1) {
      entry.meanings.push(bn)
      entry.roman.push(roman)
    } else if (roman && !entry.roman[index]) {
      entry.roman[index] = roman
    }
    const pos = String(record.pos ?? '').trim()
    if (pos && !entry.pos.includes(pos)) entry.pos.push(pos)

    // Prefer the longest gloss: short Wiktionary stubs are less useful.
    // The gloss is English, so it must not be Bengali-canonicalized.
    const def = String(record.def ?? '').trim()
    if (def.length > entry.def.length) entry.def = def
  }

  return headwords
}

/**
 * Filters to the headwords that make a good vocabulary entry.
 *
 * Multi-word headwords are mostly proper nouns and phrases ("united states of
 * america", "i love you") and are not looked up as vocabulary, so only
 * single-token words are kept.
 * @param {Map<string, BengaliHeadword>} headwords
 * @returns {Map<string, BengaliHeadword>}
 */
export function selectVocabulary(headwords) {
  const selected = new Map()
  for (const [head, entry] of headwords) {
    if (!isSingleToken(head)) continue
    if (!entry.def) continue
    selected.set(head, entry)
  }
  return selected
}
