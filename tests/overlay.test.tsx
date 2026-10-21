// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { Overlay } from '../src/ui/Overlay'
import type { LookupResult } from '../src/shared/types'

vi.mock('../src/storage/history', () => ({
  addHistory: vi.fn().mockResolvedValue(1),
  listSaved: vi.fn().mockResolvedValue([]),
  updateHistory: vi.fn().mockResolvedValue(undefined),
  pruneHistory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/storage/app-settings', () => ({
  loadAppSettings: vi.fn().mockResolvedValue({ autoSpeak: false, historyLimit: 200, theme: 'glass' }),
  DEFAULT_APP_SETTINGS: { autoSpeak: false, historyLimit: 200, theme: 'glass' },
}))

const offlineEntry = {
  headword: 'hello',
  bn: 'হ্যালো',
  bnAlts: [],
  def: 'a greeting',
  pos: 'noun',
  syn: [],
  ant: [],
  ex: '',
}

const aiResult: LookupResult = {
  word: 'hello',
  source: 'groq' as const,
  requestId: 'r1',
  timestamp: Date.now(),
  englishDefinition: 'a greeting (AI)',
  bengaliMeaning: 'হ্যালো',
  exampleEn: 'Hello!',
  exampleBn: 'হ্যালো!',
  partOfSpeech: 'noun',
  synonyms: ['hi'],
  antonyms: [],
}

beforeEach(() => {
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn().mockImplementation(async (req: { type?: string }) => {
        if (req.type === 'VOCABFLOW_SEED') return { ok: true }
        if (req.type === 'VOCABFLOW_OFFLINE_LOOKUP') return { ok: true, result: offlineEntry }
        if (req.type === 'VOCABFLOW_AI_LOOKUP')
          return new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, result: aiResult }), 40),
          )
        return { ok: false, error: 'unknown' }
      }),
    },
    storage: {
      local: {
        get: vi.fn().mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
          if (key === 'vocabflow.providers')
            cb({
              'vocabflow.providers': {
                groq: { apiKey: 'k', enabled: true, model: 'm' },
                openrouter: { apiKey: '', enabled: false, model: 'openai/gpt-4o-mini' },
                gemini: { apiKey: '', enabled: false, model: 'gemini-2.0-flash' },
              },
            })
          else cb({})
        }),
        set: vi.fn(),
      },
    },
  } as unknown as typeof chrome
})

describe('Overlay integration', () => {
  it('displays offline result first, then AI result replaces it, and Searching… is cleared', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/Offline dictionary/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/groq/)).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByText('Searching\u2026')).toBeNull()
  })
})
