// Bengali <-> Latin transliteration table.
//
// Implements a phonetic transliteration between Bengali script and Latin
// script using a common phonetic convention (similar to ISO 15919 /
// National Romanisation) so that:
//   - Bengali words can be written in Latin script for learners
//   - Latin-script input can be converted back to Bengali script
//
// Characters not in the mapping table are passed through unchanged.

/** Bengali vowel letters (স্বরবর্ণ) -> Latin. */
const BN_VOWELS = {
  'অ': 'a',
  'আ': 'a',
  'ই': 'i',
  'ঈ': 'ii',
  'উ': 'u',
  'ঊ': 'uu',
  'ঋ': 'ri',
  'ঌ': 'li',
  'এ': 'e',
  'ঐ': 'oi',
  'ও': 'o',
  'ঔ': 'ou',
}

/** Bengali vowel signs (কার) -> Latin. */
const BN_VOWEL_SIGNS = {
  'া': 'a',
  'ি': 'i',
  'ী': 'ii',
  'ু': 'u',
  'ূ': 'uu',
  'ৃ': 'ri',
  'ৄ': 'li',
  'ে': 'e',
  'ৈ': 'oi',
  'ো': 'o',
  'ৌ': 'ou',
}

/** Bengali consonants (ব্যঞ্জনবর্ণ) -> Latin. */
const BN_CONSONANTS = {
  'ক': 'k',
  'খ': 'kh',
  'গ': 'g',
  'ঘ': 'gh',
  'ঙ': 'ng',
  'চ': 'ch',
  'ছ': 'chh',
  'জ': 'j',
  'ঝ': 'jh',
  'ঞ': 'ny',
  'ট': 't',
  'ঠ': 'th',
  'ড': 'd',
  'ঢ': 'dh',
  'ণ': 'n',
  'ত': 't',
  'থ': 'th',
  'দ': 'd',
  'ধ': 'dh',
  'ন': 'n',
  'প': 'p',
  'ফ': 'ph',
  'ব': 'b',
  'ভ': 'bh',
  'ম': 'm',
  'য': 'y',
  'র': 'r',
  'ল': 'l',
  'শ': 'sh',
  'ষ': 'sh',
  'স': 's',
  'হ': 'h',
  'ড়': 'ṛ',
  'ঢ়': 'ṝ',
  'য়': 'y',
}

/** Latin consonant clusters -> Bengali (for latinToBn). Ordered by length
 * descending so longer matches win. */
const LATIN_CONSONANTS = {
  'chh': 'ছ',
  'jh': 'ঝ',
  'ny': 'ঞ',
  'th': 'থ',
  'ph': 'ফ',
  'bh': 'ভ',
  'sh': 'শ',
  'ṛ': 'ড়',
  'ṝ': 'ঢ়',
  'ch': 'চ',
  'kh': 'খ',
  'gh': 'ঘ',
  'ng': 'ঙ',
}

/** Latin single consonants -> Bengali. */
const LATIN_SINGLE_CONSONANTS = {
  'k': 'ক',
  'g': 'গ',
  'j': 'জ',
  't': 'ত',
  'd': 'দ',
  'n': 'ন',
  'p': 'প',
  'b': 'ব',
  'm': 'ম',
  'y': 'য',
  'r': 'র',
  'l': 'ল',
  's': 'স',
  'h': 'হ',
}

/** Latin vowels -> Bengali vowel signs. */
const LATIN_VOWELS = {
  'a': 'া',
  'i': 'ি',
  'ii': 'ী',
  'u': 'ু',
  'uu': 'ূ',
  'ri': 'ৃ',
  'li': 'ৄ',
  'e': 'ে',
  'oi': 'ৈ',
  'o': 'ো',
  'ou': 'ৌ',
}

/** Diacritics. */
const BN_DIACRITICS = {
  'ং': 'ṅ',
  'ঁ': 'ñ',
  'ঃ': 'ḥ',
  '্': '', // virama (halant) - suppresses inherent vowel
}

/** Latin diacritics -> Bengali. */
const LATIN_DIACRITICS = {
  'ṅ': 'ং',
  'ñ': 'ঁ',
  'ḥ': 'ঃ',
}

/** Bengali punctuation. */
const BN_PUNCTUATION = {
  '।': '.',
  'ঀ': ',',
}

/** Latin punctuation -> Bengali. */
const LATIN_PUNCTUATION = {
  '.': '।',
  ',': 'ঀ',
}

/**
 * Convert Bengali script to Latin script (transliteration).
 *
 * Processes the string character by character, handling multi-character
 * Bengali sequences (conjuncts with virama) and vowel signs.
 *
 * A standalone Bengali consonant (not followed by a vowel sign) outputs its
 * Latin equivalent; the inherent vowel is implicit.
 *
 * @param {string} text Bengali text to transliterate
 * @returns {string} Latin transliteration
 */
export function bnToLatin(text) {
  if (!text) return ''
  let result = ''
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]

    // Check for consonant + vowel sign (e.g. ব + ি = বি)
    if (ch in BN_CONSONANTS && next in BN_VOWEL_SIGNS) {
      result += BN_CONSONANTS[ch] + BN_VOWEL_SIGNS[next]
      i += 2
      continue
    }

    // Check for consonant + virama + consonant (conjunct, e.g. ক্ষ = ক + ্ + ষ)
    if (
      ch in BN_CONSONANTS &&
      next === '্' &&
      i + 2 < text.length &&
      text[i + 2] in BN_CONSONANTS
    ) {
      // First consonant loses its inherent vowel
      result += BN_CONSONANTS[ch]
      i += 2 // skip consonant + virama
      continue
    }

    // Check for standalone consonant (inherent vowel is implicit)
    if (ch in BN_CONSONANTS) {
      result += BN_CONSONANTS[ch]
      i += 1
      continue
    }

    // Check for independent vowel
    if (ch in BN_VOWELS) {
      result += BN_VOWELS[ch]
      i += 1
      continue
    }

    // Check for standalone vowel sign (shouldn't normally occur standalone)
    if (ch in BN_VOWEL_SIGNS) {
      result += BN_VOWEL_SIGNS[ch]
      i += 1
      continue
    }

    // Check for diacritics
    if (ch in BN_DIACRITICS) {
      if (ch === '্') {
        // Virama: suppress inherent vowel of previous consonant
        // Already handled above for conjuncts; standalone virama skips
        i += 1
        continue
      }
      result += BN_DIACRITICS[ch]
      i += 1
      continue
    }

    // Check for punctuation
    if (ch in BN_PUNCTUATION) {
      result += BN_PUNCTUATION[ch]
      i += 1
      continue
    }

    // Pass through unknown characters (Latin letters, digits, spaces, etc.)
    result += ch
    i += 1
  }

  return result
}

/**
 * Convert Latin script to Bengali script (transliteration).
 *
 * Processes the string looking for multi-character Latin sequences first
 * (e.g. "chh", "jh", "ny", "sh", "th", "ph", "bh", "ch", "kh", "gh", "ng")
 * before falling back to single characters and vowels.
 *
 * @param {string} text Latin text to transliterate
 * @returns {string} Bengali transliteration
 */
export function latinToBn(text) {
  if (!text) return ''
  let result = ''
  let i = 0

  while (i < text.length) {
    const ch = text[i].toLowerCase()
    const next2 = text.slice(i, i + 2).toLowerCase()
    const next3 = text.slice(i, i + 3).toLowerCase()

    // Try 3-character sequences first (longest match wins)
    if (next3 in LATIN_CONSONANTS) {
      result += LATIN_CONSONANTS[next3]
      i += 3
      continue
    }

    // Try 2-character sequences
    if (next2 in LATIN_VOWELS) {
      result += LATIN_VOWELS[next2]
      i += 2
      continue
    }
    if (next2 in LATIN_CONSONANTS) {
      result += LATIN_CONSONANTS[next2]
      i += 2
      continue
    }
    if (next2 in LATIN_DIACRITICS) {
      result += LATIN_DIACRITICS[next2]
      i += 2
      continue
    }

    // Try single characters
    if (ch in LATIN_VOWELS) {
      result += LATIN_VOWELS[ch]
      i += 1
      continue
    }
    if (ch in LATIN_SINGLE_CONSONANTS) {
      result += LATIN_SINGLE_CONSONANTS[ch]
      i += 1
      continue
    }
    if (ch in LATIN_DIACRITICS) {
      result += LATIN_DIACRITICS[ch]
      i += 1
      continue
    }
    if (ch in LATIN_PUNCTUATION) {
      result += LATIN_PUNCTUATION[ch]
      i += 1
      continue
    }

    // Pass through unknown characters
    result += text[i]
    i += 1
  }

  return result
}
