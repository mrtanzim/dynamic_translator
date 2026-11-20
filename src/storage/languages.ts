export type LanguageCode =
  | 'en'
  | 'bn'
  | 'hi'
  | 'ur'
  | 'ar'
  | 'es'
  | 'fr'
  | 'de'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'pt'
  | 'ru'
  | 'tr'

export interface LanguagePair {
  source: LanguageCode
  target: LanguageCode
}

export const POPULAR_LANGUAGES: ReadonlyArray<{ code: LanguageCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'Bengali' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: '日本語 / Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
]

export const DEFAULT_LANGUAGE_PAIR: LanguagePair = { source: 'en', target: 'bn' }

export const LANGUAGE_PAIR_KEY = 'vocabflow.languages'

export function isSupportedPair(pair: LanguagePair): boolean {
  return (
    (pair.source === 'en' && (pair.target === 'bn' || pair.target === 'ja')) ||
    ((pair.source === 'bn' || pair.source === 'ja') && pair.target === 'en')
  )
}

export function loadLanguagePair(): Promise<LanguagePair> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
        resolve(DEFAULT_LANGUAGE_PAIR)
        return
      }
      chrome.storage.local.get(LANGUAGE_PAIR_KEY, (r) => {
        if (chrome.runtime?.lastError) {
          resolve(DEFAULT_LANGUAGE_PAIR)
          return
        }
        const stored = r?.[LANGUAGE_PAIR_KEY] as Partial<LanguagePair> | undefined
        resolve({
          source: stored?.source ?? DEFAULT_LANGUAGE_PAIR.source,
          target: stored?.target ?? DEFAULT_LANGUAGE_PAIR.target,
        })
      })
    } catch {
      resolve(DEFAULT_LANGUAGE_PAIR)
    }
  })
}

export async function saveLanguagePair(pair: LanguagePair): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) return
    await chrome.storage.local.set({ [LANGUAGE_PAIR_KEY]: pair })
  } catch {
    return
  }
}
