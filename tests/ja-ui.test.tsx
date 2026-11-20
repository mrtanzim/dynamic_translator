// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { Overlay } from '../src/ui/Overlay'

vi.mock('../src/storage/history', () => ({
  addHistory: vi.fn().mockResolvedValue(1),
  listHistory: vi.fn().mockResolvedValue([]),
  listSaved: vi.fn().mockResolvedValue([]),
  updateHistory: vi.fn().mockResolvedValue(undefined),
  pruneHistory: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/storage/app-settings', () => ({
  loadAppSettings: vi.fn().mockResolvedValue({ autoSpeak: false, historyLimit: 200, theme: 'glass' }),
  DEFAULT_APP_SETTINGS: { autoSpeak: false, historyLimit: 200, theme: 'glass' },
}))

const JA_ENTRY = {
  surface: 'こんにちは', kana: 'コンニチハ', romaji: 'KONNICHIWA',
  en: 'Hello', enAlt: ['Hi'], pos: 'greeting', synEn: ['Hi'], antEn: [],
  exampleJa: 'こんにちは、お元気ですか？', exampleEn: 'A greeting.',
  formalMeaning: 'Hello', conversationalMeaning: 'Hi',
  exampleFormal: '', exampleConversational: '', collocations: [], wordFamily: '',
  bandLevel: '5.5', commonMistake: '',
}

beforeEach(() => {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (req: { type?: string }) => {
        if (req.type === 'VOCABFLOW_SEED') return Promise.resolve({ ok: true })
        if (req.type === 'VOCABFLOW_JA_LOOKUP') return Promise.resolve({ ok: true, result: JA_ENTRY })
        if (req.type === 'VOCABFLOW_SUGGEST') return Promise.resolve({ ok: true, suggestions: [] })
        return new Promise(() => {})
      },
    },
    storage: {
      local: {
        get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: () => {},
      },
    },
  }
})

describe('Japanese result UI', () => {
  it('renders kana, romaji and the Japanese example', async () => {
    render(<Overlay onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'こんにちは' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText(/A greeting/)
    expect(screen.getByText('コンニチハ')).toBeTruthy()
    expect(screen.getByText(/KONNICHIWA/)).toBeTruthy()
    expect(screen.getByText(/お元気ですか/)).toBeTruthy()
  })
})
