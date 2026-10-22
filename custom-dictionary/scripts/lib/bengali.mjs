// Reader for the `bn-en-dictionary` npm package (Wiktionary dump, CC BY-SA 3.0).
//
// The package ships `data/dictionary.jsonl`: one JSON object per line with
// `en` (English headword), `bn` (Bengali translation), `pos` (part of speech),
// `def` (English gloss), `source`, `license` and `romanised` (romanized
// Bengali). A single headword usually appears several times, once per sense
// and once per accepted Bengali spelling, so records are grouped by headword.
//
// @param {string} packageRoot path to the `bn-en-dictionary` package directory
// @returns {Map<string, BengaliHeadword>}

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
 * @property {string[]} pos       Distinct parts of speech
 * @property {string} def         Best English definition
 * @property {number} senses      Number of records for this headword
 */

/** Canonical form for Bengali text. NFC maps both the precomposed YYA
 * (য়, U+09DF) and the decomposed য + nukta (য + U+09BC) onto the same
 * sequence, so both spellings compare equal. */
function canonicalBengali(value) {
  return value.normalize('NFC')
}

/** Only single-token headwords are useful for a vocabulary lookup. */
function isSingleToken(word) {
  return /^[a-z][a-z-]*$/.test(word)
}

/**
 * Reads the `bn-en-dictionary` package and groups its records by headword.
 *
 * Records with the same English headword are merged into one entry. Bengali
 * spellings are de-duplicated (NFC-normalized) and kept in first-seen order;
 * the romanization is aligned index-by-index with `meanings`.
 *
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

    // De-duplicate Bengali spellings (NFC-normalized), keeping first-seen
    // order. The romanization is aligned index-by-index with meanings.
    const existingIndex = entry.meanings.indexOf(bn)
    if (existingIndex === -1) {
      entry.meanings.push(bn)
      entry.roman.push(String(record.romanised ?? '').trim().toLowerCase())
    } else if (
      String(record.romanised ?? '').trim() &&
      !entry.roman[existingIndex]
    ) {
      entry.roman[existingIndex] = String(record.romanised ?? '').trim().toLowerCase()
    }

    const pos = String(record.pos ?? '').trim()
    if (pos && !entry.pos.includes(pos)) {
      entry.pos.push(pos)
    }

    // Prefer the longest gloss: short Wiktionary stubs are less useful.
    const def = String(record.def ?? '').trim()
    if (def.length > entry.def.length) {
      entry.def = def
    }
  }

  return headwords
}

/** Only single-token headwords are useful for a vocabulary lookup. */
export function selectVocabulary(headwords) {
  const selected = new Map()
  for (const [head, entry] of headwords) {
    if (!isSingleToken(head)) continue
    if (!entry.def) continue
    selected.set(head, entry)
  }
  return selected
}
