export type ResultSource = 'offline' | 'groq' | 'openrouter' | 'gemini'

export interface LookupResult {
  word: string
  bengaliMeaning?: string
  englishDefinition?: string
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
  { view: 'providers', label: 'AI Providers' },
  { view: 'history', label: 'Search History' },
  { view: 'saved', label: 'Saved Words' },
  { view: 'settings', label: 'Translation Settings' },
  { view: 'about', label: 'Help / About' },
]
