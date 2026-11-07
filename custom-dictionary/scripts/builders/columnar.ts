// Columnar JSON serialization for the custom dictionary dataset.
//
// The dataset uses a columnar layout: one array per field, all arrays sharing
// the same index space. Multi-valued fields are joined with U+0001 (SEP), a
// control character that cannot occur in any of the text.
//
// Layout:
//   {
//     v: number,
//     headwords: string[],   // English headword, sorted
//     bn: string[],          // primary Bengali meaning
//     bnAlt: string[],       // ALL other Bengali meanings, U+0001-joined
//     trans: string[],       // romanization of the primary meaning
//     transAlt: string[],    // romanization of each alternative meaning,
//                            // U+0001-joined, same order as bnAlt
//     def: string[],         // English definition
//     pos: string[],         // part of speech
//     syn: string[],         // synonyms, U+0001-joined
//     ant: string[],         // antonyms, U+0001-joined
//     ex: string[],          // example sentence
//     pron: string[],        // pronunciation guide (IPA)
//   }

// Field separator used inside multi-valued columns.
export const SEP = '\u0001'

/** Dataset format version, bumped when the layout changes. */
export const DATASET_VERSION = 4

/** A single dictionary entry as held in memory during the build. */
export interface DictionaryEntry {
  headword: string
  bn: string
  bnAlts: string[]
  trans: string
  transAlts: string[]
  def: string
  pos: string
  syn: string[]
  ant: string[]
  ex: string
  exBn?: string
  pron: string
}

/** The raw columnar dataset as stored on disk. */
export interface DictionaryDataset {
  v: number
  headwords: string[]
  bn: string[]
  bnAlt: string[]
  trans: string[]
  transAlt: string[]
  def: string[]
  pos: string[]
  syn: string[]
  ant: string[]
  ex: string[]
  exBn?: string[]
  pron: string[]
}

/**
 * Joins an array of strings into a single SEP-joined string.
 * Empty strings are preserved; arrays with no elements produce ''.
 *
 * @param values - String array to join
 * @returns SEP-joined string
 */
export function joinColumn(values: string[]): string {
  return values.join(SEP)
}

/**
 * Splits a SEP-joined string back into an array of strings.
 *
 * @param value - SEP-joined string
 * @returns Array of strings; empty string produces []
 */
export function splitColumn(value: string): string[] {
  if (!value) return []
  return value.split(SEP)
}

/**
 * Serializes an array of DictionaryEntry objects into a columnar DictionaryDataset.
 *
 * The headwords array is sorted alphabetically. All other columns share the
 * same index space as headwords.
 *
 * @param entries - Array of DictionaryEntry objects
 * @returns DictionaryDataset ready for JSON serialization
 */
export function serializeDataset(entries: DictionaryEntry[]): DictionaryDataset {
  const sorted = [...entries].sort((a, b) => a.headword.localeCompare(b.headword))

  return {
    v: DATASET_VERSION,
    headwords: sorted.map((e) => e.headword),
    bn: sorted.map((e) => e.bn),
    bnAlt: sorted.map((e) => e.bnAlts.join(SEP)),
    trans: sorted.map((e) => e.trans),
    transAlt: sorted.map((e) => e.transAlts.join(SEP)),
    def: sorted.map((e) => e.def),
    pos: sorted.map((e) => e.pos),
    syn: sorted.map((e) => e.syn.join(SEP)),
    ant: sorted.map((e) => e.ant.join(SEP)),
    ex: sorted.map((e) => e.ex),
    exBn: sorted.map((e) => e.exBn ?? ''),
    pron: sorted.map((e) => e.pron),
  }
}

/**
 * Deserializes a DictionaryDataset back into an array of DictionaryEntry objects.
 *
 * @param dataset - Columnar dataset object
 * @returns Array of DictionaryEntry objects in dataset order
 */
export function deserializeDataset(dataset: DictionaryDataset): DictionaryEntry[] {
  const n = dataset.headwords.length
  const entries: DictionaryEntry[] = []

  for (let i = 0; i < n; i += 1) {
    entries.push({
      headword: dataset.headwords[i],
      bn: dataset.bn[i],
      bnAlts: splitColumn(dataset.bnAlt[i]),
      trans: dataset.trans[i],
      transAlts: splitColumn(dataset.transAlt[i]),
      def: dataset.def[i],
      pos: dataset.pos[i],
      syn: splitColumn(dataset.syn[i]),
      ant: splitColumn(dataset.ant[i]),
      ex: dataset.ex[i],
      exBn: dataset.exBn ? dataset.exBn[i] : '',
      pron: dataset.pron[i],
    })
  }

  return entries
}

/**
 * Validates that all columns in a DictionaryDataset have the same length.
 *
 * @param dataset - DictionaryDataset to validate
 * @returns true if all columns match headwords length, false otherwise
 */
export function validateDataset(dataset: DictionaryDataset): boolean {
  const n = dataset.headwords.length
  const columns = [
    'bn',
    'bnAlt',
    'trans',
    'transAlt',
    'def',
    'pos',
    'syn',
    'ant',
    'ex',
    'pron',
  ]

  for (const column of columns) {
    if (dataset[column as keyof DictionaryDataset].length !== n) {
      return false
    }
  }

  if (dataset.exBn && dataset.exBn.length !== n) {
    return false
  }

  return true
}
