// Types for the Bengali-first offline dataset. Bengali is the headword
// language; English is the target language. Random-access indexes are built
// from these columnar arrays at runtime.

/** Field separator for multi-valued columns (cannot appear in natural text). */
export const BN_SEP = '\u0001'

/** Version of the Bengali-first columnar dataset format. */
export const BN_DATASET_VERSION = 2

/** A single Bengali-first dictionary entry. */
export interface BengaliEntry {
  /** Bengali headword, NFC-normalized. */
  bengali: string
  /** Primary Latin spelling ("বই" -> "boi"). */
  roman: string
  /** Alternative Latin spellings. */
  romanAlt: string[]
  /** Natural/idiomatic primary English equivalent. */
  en: string
  /** Alternative English equivalents (literal renderings belong here). */
  enAlt: string[]
  /** Bengali definition or explanation. */
  defBn: string
  /** English gloss. */
  defEn: string
  /** Part of speech. */
  pos: string
  /** English synonyms. */
  synEn: string[]
  /** English antonyms. */
  antEn: string[]
  /** Bengali example sentence. */
  exBn: string
  /** English example sentence. */
  exEn: string
  /** IPA / respelling guide. */
  pron: string
  /** Register / literal-vs-idiomatic / usage note. */
  usage: string
  formalMeaning: string
  conversationalMeaning: string
  exampleFormal: string
  exampleConversational: string
  collocations: string[]
  wordFamily: string
  bandLevel: string
  commonMistake: string
}

/** Columnar dataset; every array shares the same index space. */
export interface BengaliDataset {
  v: number
  headwords: string[]
  roman: string[]
  romanAlt: string[]
  en: string[]
  enAlt: string[]
  defBn: string[]
  defEn: string[]
  pos: string[]
  synEn: string[]
  antEn: string[]
  exBn: string[]
  exEn: string[]
  pron: string[]
  usage: string[]
  formalMeaning: string[]
  conversationalMeaning: string[]
  exampleFormal: string[]
  exampleConversational: string[]
  collocations: string[]
  wordFamily: string[]
  bandLevel: string[]
  commonMistake: string[]
}
