export type LayoutDensity = 'comfortable' | 'compact'

export interface AppSettings {
  autoSpeak: boolean
  historyLimit: number
  theme: 'glass'
  layoutDensity: LayoutDensity
  // Section customization (Word meaning & definition are compulsory)
  showSynAnt: boolean
  showCollocations: boolean
  showExample: boolean
  showWordFamily: boolean
  showCommonMistake: boolean
  showBandLevel: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSpeak: false,
  historyLimit: 200,
  theme: 'glass',
  layoutDensity: 'comfortable',
  showSynAnt: true,
  showCollocations: true,
  showExample: true,
  showWordFamily: true,
  showCommonMistake: true,
  showBandLevel: true,
}

export const APP_SETTINGS_KEY = 'vocabflow.settings'

export function loadAppSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
        resolve(DEFAULT_APP_SETTINGS)
        return
      }
      chrome.storage.local.get(APP_SETTINGS_KEY, (r) => {
        if (chrome.runtime?.lastError) {
          resolve(DEFAULT_APP_SETTINGS)
          return
        }
        const stored = r?.[APP_SETTINGS_KEY] as Partial<AppSettings> | undefined
        resolve({ ...DEFAULT_APP_SETTINGS, ...stored })
      })
    } catch {
      resolve(DEFAULT_APP_SETTINGS)
    }
  })
}

export async function saveAppSettings(s: AppSettings): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) return
    await chrome.storage.local.set({ [APP_SETTINGS_KEY]: s })
  } catch {
    // Ignore invalidated context
  }
}
