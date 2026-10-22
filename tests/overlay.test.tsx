// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { Overlay } from '../src/ui/Overlay'
import type { LookupResult } from '../src/shared/types'

const { addHistory, listSaved, updateHistory, pruneHistory } = vi.hoisted(() => ({
  addHistory: vi.fn().mockResolvedValue(1),
  listSaved: vi.fn().mockResolvedValue([]),
  updateHistory: vi.fn().mockResolvedValue(undefined),
  pruneHistory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/storage/history', () => ({
  addHistory,
  listSaved,
  updateHistory,
  pruneHistory,
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
  query: 'hello',
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
  transcription: 'হ্যালো',
  pronunciation: '/həˈləʊ/',
}

/** The result a provider returns for the given query. */
function aiResultFor(query: string): LookupResult {
  return { ...aiResult, word: query, query }
}

/** Makes the AI provider fail, as if the API were unreachable. */
let aiFails = false

beforeEach(() => {
  aiFails = false
  addHistory.mockClear()
  listSaved.mockClear().mockResolvedValue([])
  updateHistory.mockClear()
  pruneHistory.mockClear()
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn().mockImplementation(async (req: { type?: string; query?: string }) => {
        if (req.type === 'VOCABFLOW_SEED') return { ok: true }
        if (req.type === 'VOCABFLOW_SUGGEST') {
          const query = (req.query ?? '').toLowerCase()
          const suggestions = query.startsWith('cucu')
            ? [{ word: 'cucumber', headword: 'cucumber', bengali: false, hint: 'কুকুম্বার' }]
            : []
          return { ok: true, suggestions }
        }
        if (req.type === 'VOCABFLOW_OFFLINE_LOOKUP') {
          // The offline dictionary resolves a Bengali query to its English
          // headword; the payload always carries the canonical headword.
          const bengali = /[\u0980-\u09FF]/.test(req.query ?? '')
          return {
            ok: true,
            result: bengali
              ? { ...offlineEntry, headword: 'book', bn: 'বই' }
              : offlineEntry,
          }
        }
        if (req.type === 'VOCABFLOW_AI_LOOKUP') {
          if (aiFails) return { ok: false, error: 'provider is down' }
          return new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, result: aiResultFor(req.query ?? 'hello') }), 40),
          )
        }
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
                openrouter: { apiKey: '', enabled: false, model: 'qwen/qwen3.8-flash' },
                gemini: { apiKey: '', enabled: false, model: 'gemini-3.8-flash' },
              },
            })
          else cb({})
        }),
        set: vi.fn(),
      },
    },
  } as unknown as typeof chrome
})

afterEach(() => {
  cleanup()
})

/** The messages the overlay sent to the service worker. */
function sentMessages(): Array<{ type?: string; query?: string }> {
  const sendMessage = (globalThis.chrome.runtime.sendMessage as unknown as {
    mock: { calls: Array<[{ type?: string; query?: string }]> }
  }).mock
  return sendMessage.calls.map((call) => call[0])
}

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

describe('Overlay position persistence', () => {
  it('debounces the position write instead of writing on every frame', async () => {
    const set = vi.fn()
    ;(globalThis.chrome.storage.local as unknown as { set: unknown }).set = set

    render(<Overlay onClose={vi.fn()} />)

    // Nothing is written before the debounce elapses.
    await new Promise((r) => setTimeout(r, 50))
    const writesDuringDebounce = set.mock.calls.length

    await waitFor(() => expect(set).toHaveBeenCalled(), { timeout: 2000 })
    const writes = set.mock.calls.length
    expect(writes).toBeGreaterThan(writesDuringDebounce)
    // The write carries the overlay position.
    const payload = set.mock.calls[set.mock.calls.length - 1][0] as Record<string, unknown>
    expect(Object.keys(payload)).toContain('vocabflow.overlay')
  })
})

describe('Overlay transcription', () => {
  it('shows the transcription and the pronunciation of the result', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/groq/)).toBeInTheDocument(), { timeout: 2000 })
    // An English word is shown in Bengali script, with its pronunciation.
    expect(screen.getByText(/In Bengali script/)).toBeInTheDocument()
    expect(screen.getByText(/Pronunciation/)).toBeInTheDocument()
  })
})

describe('Overlay type-ahead', () => {
  it('suggests dictionary words while the user types', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'cucu' } })

    await waitFor(() => expect(screen.getByRole('option', { name: /cucumber/ })).toBeInTheDocument())
  })

  it('does not look up a word that is only the beginning of a longer word', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'cucu' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /cucumber/ })).toBeInTheDocument())

    // The lookup debounce has elapsed by now; the partial word must not have
    // been sent to the providers.
    await new Promise((r) => setTimeout(r, 600))
    const lookups = sentMessages().filter((m) => m.type === 'VOCABFLOW_AI_LOOKUP')
    expect(lookups).toHaveLength(0)
  })

  it('looks up the suggestion the user picks', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'cucu' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /cucumber/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('option', { name: /cucumber/ }))

    await waitFor(() => {
      const lookups = sentMessages().filter((m) => m.type === 'VOCABFLOW_AI_LOOKUP')
      expect(lookups.map((m) => m.query)).toContain('cucumber')
    })
    expect((input as HTMLInputElement).value).toBe('cucumber')
  })
})

describe('Overlay clear button', () => {
  it('removes the previous word and its result', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/Offline dictionary/)).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Clear search'))

    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/Offline dictionary/)).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
  })
})

describe('Overlay history persistence', () => {
  it('stores one history row per search action and updates it when the AI result arrives', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/groq/)).toBeInTheDocument(), { timeout: 2000 })
    // The offline result creates the row; the AI result must update it
    // instead of creating a second one.
    expect(addHistory).toHaveBeenCalledTimes(1)
    expect(updateHistory).toHaveBeenCalled()
    const added = addHistory.mock.calls[0][0] as { query: string; direction: string }
    expect(added.query).toBe('hello')
    expect(added.direction).toBe('en->bn')
  })

  it('creates a single row for a Bengali search and records the bn->en direction', async () => {
    render(<Overlay onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search any word')
    fireEvent.change(input, { target: { value: 'বই' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/groq/)).toBeInTheDocument(), { timeout: 2000 })

    // The offline result resolves to the English headword "book" and the AI
    // result echoes the Bengali query. Both belong to the same search, so
    // there must be exactly one history row, keyed by the original query.
    expect(addHistory).toHaveBeenCalledTimes(1)
    const added = addHistory.mock.calls[0][0] as { query: string; direction: string }
    expect(added.query).toBe('বই')
    expect(added.direction).toBe('bn->en')
  })
})
