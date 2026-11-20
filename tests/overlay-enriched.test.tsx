// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { Overlay } from '../src/ui/Overlay'

const { addHistory, listHistory, listSaved, updateHistory, pruneHistory } = vi.hoisted(() => ({
  addHistory: vi.fn().mockResolvedValue(1),
  listHistory: vi.fn().mockResolvedValue([]),
  listSaved: vi.fn().mockResolvedValue([]),
  updateHistory: vi.fn().mockResolvedValue(undefined),
  pruneHistory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/storage/history', () => ({ addHistory, listHistory, listSaved, updateHistory, pruneHistory }))
vi.mock('../src/storage/app-settings', () => ({
  loadAppSettings: vi.fn().mockResolvedValue({ autoSpeak: false, historyLimit: 200, theme: 'glass' }),
  DEFAULT_APP_SETTINGS: { autoSpeak: false, historyLimit: 200, theme: 'glass' },
}))

const RESULT = {
  headword: 'reluctant', bn: 'অনিচ্ছুক', bnAlts: [], trans: 'onichchuk', transAlts: [],
  def: 'unwilling', pos: 'adjective', syn: [], ant: [], ex: '', pron: '',
  formalMeaning: 'Unwilling to do something.',
  conversationalMeaning: 'Not keen on it.',
  usageNote: 'Prefer "reluctant to" in IELTS writing.',
}

const sendMessage = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (req: { type?: string }) => {
        if (req.type === 'VOCABFLOW_SEED') return Promise.resolve({ ok: true })
        if (req.type === 'VOCABFLOW_OFFLINE_LOOKUP') return Promise.resolve({ ok: true, result: RESULT, via: 'english' })
        if (req.type === 'VOCABFLOW_SUGGEST') return Promise.resolve({ ok: true, suggestions: [] })
        return new Promise(() => {})
      },
    },
    storage: {
      local: {
        get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: (_i: unknown, cb?: () => void) => cb?.(),
      },
    },
  }
})

afterEach(() => cleanup())

describe('enriched result cards', () => {
  it('renders formal meaning, conversational meaning and usage note', async () => {
    render(<Overlay onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'reluctant' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText(/Unwilling to do something/)
    expect(screen.getByText(/Not keen on it/)).toBeTruthy()
    expect(screen.getByText(/Prefer "reluctant to"/)).toBeTruthy()
  })
})
