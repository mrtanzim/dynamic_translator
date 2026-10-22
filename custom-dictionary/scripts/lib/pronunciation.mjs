// Reader for the `cmu-pronouncing-dictionary` npm package.
//
// The package ships `index.js` which exports `{ dictionary }` where each key
// is a lowercase English word and each value is an ARPAbet pronunciation
// string (e.g. "K AH0 M B ER0" for "cucumber").
//
// We convert ARPAbet to IPA so that results are human-readable for learners.
//
// @param {string} packageRoot path to the `cmu-pronouncing-dictionary` package directory
// @returns {Map<string, string>} word -> IPA pronunciation

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** ARPAbet phoneme -> IPA mapping. */
const ARPABET_TO_IPA = {
  AA: 'ɑ',
  AE: 'æ',
  AH: 'ʌ',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  EH: 'ɛ',
  ER: 'ɝ',
  EY: 'eɪ',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  IH: 'ɪ',
  IY: 'i',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  OW: 'oʊ',
  OY: 'ɔɪ',
  P: 'p',
  R: 'ɹ',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  UH: 'ʊ',
  UW: 'u',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
}

/** A single ARPAbet token: phoneme + optional stress digit (0, 1, or 2). */
const TOKEN_RE = /^([A-Z]+)([012]?)$/

/**
 * Convert one ARPAbet token to IPA.
 *
 * Stress digits:
 *   0 = no stress (schwa reduction where applicable)
 *   1 = primary stress (ˈ before the vowel)
 *   2 = secondary stress (ˌ before the vowel)
 *
 * @param {string} token e.g. "AH0", "ER1", "K"
 * @returns {string} IPA string for this token
 */
function tokenToIPA(token) {
  const match = TOKEN_RE.exec(token)
  if (!match) return token // pass through unknown tokens unchanged
  const [, phoneme, stress] = match
  let ipa = ARPABET_TO_IPA[phoneme]
  if (!ipa) return token // unknown phoneme, pass through

  // Stress handling: place stress mark before the vowel
  if (stress === '1') ipa = 'ˈ' + ipa
  else if (stress === '2') ipa = 'ˌ' + ipa

  // Reduced vowels: unstressed AH -> schwa, unstressed ER -> schwa-r
  if (stress === '0') {
    if (phoneme === 'AH') ipa = 'ə'
    if (phoneme === 'ER') ipa = 'əɹ'
  }

  return ipa
}

/**
 * Convert an ARPAbet string to IPA.
 *
 * @param {string} arpabet e.g. "K AH0 M B ER0"
 * @returns {string} e.g. "/kəm.bɝ/" or "kəm.bɝ" if no stress markers
 */
export function arpabetToIPA(arpabet) {
  if (!arpabet) return ''
  const tokens = arpabet.trim().split(/\s+/)
  const ipaTokens = tokens.map(tokenToIPA)
  const ipa = ipaTokens.join('')
  return ipa ? `/${ipa}/` : ''
}

/**
 * Load the CMU Pronouncing Dictionary and convert all entries to IPA.
 *
 * @param {string} packageRoot path to the `cmu-pronouncing-dictionary` package directory
 * @returns {Map<string, string>} word -> IPA pronunciation
 */
export function loadPronunciations(packageRoot) {
  const modulePath = path.join(packageRoot, 'index.js')
  if (!fs.existsSync(modulePath)) {
    throw new Error(`CMU pronouncing dictionary not found at ${modulePath}`)
  }

  // cmu-pronouncing-dictionary is a CommonJS module; use createRequire to load it
  const mod = require(modulePath)
  const dictionary = mod.default?.dictionary ?? mod.dictionary
  if (!dictionary) {
    throw new Error(`CMU pronouncing dictionary export 'dictionary' not found`)
  }

  /** @type {Map<string, string>} */
  const pronunciations = new Map()

  for (const [word, arpabet] of Object.entries(dictionary)) {
    const ipa = arpabetToIPA(arpabet)
    if (ipa) {
      pronunciations.set(word, ipa)
    }
  }

  return pronunciations
}
