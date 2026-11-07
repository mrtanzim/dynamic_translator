import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  APP_SETTINGS_KEY,
  type AppSettings,
} from '../src/storage/app-settings'

describe('AppSettings storage & defaults', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('provides default settings with comfortable density and all sections enabled', () => {
    expect(DEFAULT_APP_SETTINGS.layoutDensity).toBe('comfortable')
    expect(DEFAULT_APP_SETTINGS.showSynAnt).toBe(true)
    expect(DEFAULT_APP_SETTINGS.showCollocations).toBe(true)
    expect(DEFAULT_APP_SETTINGS.showExample).toBe(true)
    expect(DEFAULT_APP_SETTINGS.showWordFamily).toBe(true)
    expect(DEFAULT_APP_SETTINGS.showCommonMistake).toBe(true)
    expect(DEFAULT_APP_SETTINGS.showBandLevel).toBe(true)
  })

  it('merges partial stored settings with defaults', async () => {
    const fakeStorage: Record<string, unknown> = {
      [APP_SETTINGS_KEY]: {
        layoutDensity: 'compact',
        showCollocations: false,
      },
    }

    const chromeMock = {
      storage: {
        local: {
          get: vi.fn((key: string, cb: (res: Record<string, unknown>) => void) => {
            cb({ [key]: fakeStorage[key] })
          }),
        },
      },
      runtime: {},
    }

    vi.stubGlobal('chrome', chromeMock)

    const loaded = await loadAppSettings()
    expect(loaded.layoutDensity).toBe('compact')
    expect(loaded.showCollocations).toBe(false)
    // Non-overridden fields retain defaults
    expect(loaded.showWordFamily).toBe(true)
    expect(loaded.showExample).toBe(true)
    expect(loaded.autoSpeak).toBe(false)
  })

  it('saves updated settings to chrome.storage.local', async () => {
    const setMock = vi.fn().mockResolvedValue(undefined)
    const chromeMock = {
      storage: {
        local: {
          set: setMock,
        },
      },
    }

    vi.stubGlobal('chrome', chromeMock)

    const custom: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      layoutDensity: 'compact',
      showWordFamily: false,
    }

    await saveAppSettings(custom)
    expect(setMock).toHaveBeenCalledWith({ [APP_SETTINGS_KEY]: custom })
  })
})
