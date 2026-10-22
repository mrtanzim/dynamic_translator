// Pronunciation data for the offline dictionary.
//
// The `cmu-pronouncing-dictionary` package ships the CMU Pronouncing
// Dictionary (public domain): 135,000 English words with their North
// American pronunciation in ARPAbet. ARPAbet is a machine notation, not
// something a learner can read, so it is converted to IPA here.
//
// The conversion is a fixed table, so the result is deterministic and needs
// no network and no model.

/** The ARPAbet phoneme table, mapped to IPA. */
const ARPABET = {
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

/**
 * Converts one ARPAbet pronunciation into IPA.
 *
 * The stress marker of a vowel becomes the IPA stress mark: `1` is the
 * primary stress, `2` the secondary one. The two "reduced" vowels depend on
 * the stress: an unstressed AH is a schwa (`ə`), an unstressed ER is the
 * r-coloured schwa (`əɹ`).
 *
 * @param {string} arpabet e.g. "K AH0 M B ER0"
 * @returns {string} e.g. "/kəmbəɹ/", or an empty string when nothing is left
 */
export function arpabetToIpa(arpabet) {
  if (!arpabet) return ''
  let out = ''
  for (const token of arpabet.trim().split(/\s+/)) {
    const match = /^([A-Z]+)([012])?$/.exec(token)
    if (!match) continue
    const [, symbol, stress] = match
    let ipa = ARPABET[symbol]
    if (!ipa) continue
    if (symbol === 'AH') ipa = stress === '0' ? 'ə' : 'ʌ'
    if (symbol === 'ER') ipa = stress === '0' ? 'əɹ' : 'ɝ'
    if (stress === '1') out += 'ˈ'
    else if (stress === '2') out += 'ˌ'
    out += ipa
  }
  return out ? `/${out}/` : ''
}

/**
 * Reads the `cmu-pronouncing-dictionary` package.
 *
 * The package is ESM only, so it is imported dynamically. Its keys are the
 * words; the special entries of the raw dictionary ("name, old") are skipped,
 * because they are not words.
 *
 * @param {string} packageRoot path to the package directory
 * @returns {Promise<Map<string, string>>} the word -> IPA map
 */
export async function loadPronunciations(packageRoot) {
  const url = new URL(`file://${packageRoot.replace(/\\/g, '/')}/index.js`)
  const module = await import(url.href)
  const dictionary = module.dictionary ?? module.default
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const [word, arpabet] of Object.entries(dictionary)) {
    if (!/^[a-z][a-z'-]*$/.test(word)) continue
    const ipa = arpabetToIpa(arpabet)
    if (ipa) out.set(word, ipa)
  }
  return out
}
