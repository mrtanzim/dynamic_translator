export const JA_DATASET_VERSION = 1
export const JA_SEP = '\u0001'

export const JA_COLUMNS = [
  'headwords', 'kana', 'romaji', 'en', 'enAlt', 'pos', 'synEn', 'antEn',
  'exampleJa', 'exampleEn', 'formalMeaning', 'conversationalMeaning',
  'exampleFormal', 'exampleConversational', 'collocations', 'wordFamily',
  'bandLevel', 'commonMistake',
]

/** Serializes entries to a sorted columnar dataset. */
export function serializeJapaneseDataset(entries) {
  const sorted = [...entries].sort((a, b) => a.surface.localeCompare(b.surface))
  const column = (get) => sorted.map(get)
  const dataset = { v: JA_DATASET_VERSION }
  for (const key of JA_COLUMNS) dataset[key] = []
  dataset.headwords = column((e) => e.surface)
  dataset.kana = column((e) => e.kana)
  dataset.romaji = column((e) => e.romaji)
  dataset.en = column((e) => e.en)
  dataset.enAlt = column((e) => (e.enAlt ?? []).join(JA_SEP))
  dataset.pos = column((e) => e.pos ?? '')
  dataset.synEn = column((e) => (e.synEn ?? []).join(JA_SEP))
  dataset.antEn = column((e) => (e.antEn ?? []).join(JA_SEP))
  dataset.exampleJa = column((e) => e.exampleJa ?? '')
  dataset.exampleEn = column((e) => e.exampleEn ?? '')
  dataset.formalMeaning = column((e) => e.formalMeaning ?? '')
  dataset.conversationalMeaning = column((e) => e.conversationalMeaning ?? '')
  dataset.exampleFormal = column((e) => e.exampleFormal ?? '')
  dataset.exampleConversational = column((e) => e.exampleConversational ?? '')
  dataset.collocations = column((e) => (e.collocations ?? []).join(JA_SEP))
  dataset.wordFamily = column((e) => e.wordFamily ?? '')
  dataset.bandLevel = column((e) => e.bandLevel ?? '')
  dataset.commonMistake = column((e) => e.commonMistake ?? '')
  return dataset
}
