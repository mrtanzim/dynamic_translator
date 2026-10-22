export type ResultSource = 'offline' | 'groq' | 'openrouter' | 'gemini'

export interface LookupResult {
  /**
   * The word being displayed, i.e. the query exactly as the user typed it.
   *
   * It is stable across sources: the offline dictionary and the AI providers
   * describe the same query. Never use it as an identity — the canonical
   * English headword is `headword` and the search identity is `query`.
   */
  word: string
  /**
   * The original user query that produced this result.
   *
   * This is the stable identity of a lookup: it is the same for the offline
   * and the AI result of one search, so it is what the history, the saved
   * words and the lookup direction are keyed on.
   */
  query: string
  /**
   * The canonical English headword, when the offline dictionary resolved one.
   *
   * For a Bengali query this is the English word the Bengali meaning maps
   * back to; for an English query that is a synonym it is the headword the
   * synonym belongs to. Absent when the query is not in the dictionary.
   */
  headword?: string
  bengaliMeaning?: string
  englishDefinition?: string
  /**
   * The word written in the other script.
   *
   * An English word in Bengali script ("cucumber" -> "কুকুম্বার") and a
   * Bengali word in Latin script ("বই" -> "boi"). It comes from the AI
   * provider, because the offline dictionary has no transliteration.
   */
  transcription?: string
  /** How the word is pronounced, in IPA or in a plain respelling. */
  pronunciation?: string
  synonyms?: string[]
  antonyms?: string[]
  exampleEn?: string
  exampleBn?: string
  partOfSpeech?: string
  source: ResultSource
  requestId: string
  timestamp: number
}

export type LookupEvent =
  | { type: 'LOCAL_RESULT'; result: LookupResult }
  | { type: 'AI_RESULT'; result: LookupResult }
  | { type: 'LOOKUP_COMPLETE'; requestId: string }
  | { type: 'LOOKUP_ERROR'; requestId: string; provider: ResultSource; error: string }


export type View = 'search' | 'providers' | 'history' | 'saved' | 'settings' | 'about'

export const MENU_ITEMS: Array<{ view: View; label: string }> = [
  { view: 'search', label: 'Search' },
  { view: 'providers', label: 'AI Providers' },
  { view: 'history', label: 'Search History' },
  { view: 'saved', label: 'Saved Words' },
  { view: 'settings', label: 'Translation Settings' },
  { view: 'about', label: 'Help / About' },
]
