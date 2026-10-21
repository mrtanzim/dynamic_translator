export interface AppSettings {
  autoSpeak: boolean
  historyLimit: number
  theme: 'glass'
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSpeak: false,
  historyLimit: 200,
  theme: 'glass',
}

export const APP_SETTINGS_KEY = 'vocabflow.settings'

export function loadAppSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(APP_SETTINGS_KEY, (r) => {
      const stored = r?.[APP_SETTINGS_KEY] as Partial<AppSettings> | undefined
      resolve({ ...DEFAULT_APP_SETTINGS, ...stored })
    })
  })
}

export async function saveAppSettings(s: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [APP_SETTINGS_KEY]: s })
}
