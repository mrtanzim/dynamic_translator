// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguagesView } from '../src/ui/views/LanguagesView'
import {
  DEFAULT_LANGUAGE_PAIR,
  POPULAR_LANGUAGES,
  isSupportedPair,
  loadLanguagePair,
  saveLanguagePair,
} from '../src/storage/languages'

let store: Record<string, unknown>

afterEach(cleanup)

beforeEach(() => {
  store = {}
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (key: string, cb: (r: Record<string, unknown>) => void) => {
          cb(key in store ? { [key]: store[key] } : {})
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items)
          cb?.()
        },
      },
    },
  }
})

describe('language pair storage', () => {
  it('treats only Bengali and English as a supported pair', () => {
    expect(isSupportedPair({ source: 'en', target: 'bn' })).toBe(true)
    expect(isSupportedPair({ source: 'bn', target: 'en' })).toBe(true)
    expect(isSupportedPair({ source: 'en', target: 'hi' })).toBe(false)
  })

  it('loads the stored pair and falls back to English -> Bengali', async () => {
    expect(await loadLanguagePair()).toEqual(DEFAULT_LANGUAGE_PAIR)
    await saveLanguagePair({ source: 'bn', target: 'en' })
    expect(await loadLanguagePair()).toEqual({ source: 'bn', target: 'en' })
  })
})

describe('LanguagesView', () => {
  it('offers popular languages in a custom listbox for both directions', () => {
    render(<LanguagesView />)
    const source = screen.getByLabelText('Source language')
    const target = screen.getByLabelText('Target language')
    expect(source).toHaveTextContent('English')
    expect(target).toHaveTextContent('Bengali')
    expect(source).toHaveAttribute('aria-haspopup', 'listbox')
    expect(source).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(source)
    const list = screen.getByRole('listbox', { name: 'Source language' })
    for (const lang of POPULAR_LANGUAGES) {
      expect(within(list).getByRole('option', { name: lang.label })).toBeInTheDocument()
    }
    expect(within(list).getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText(/preview only/i)).toBeNull()
  })

  it('marks non Bangla-English pairs as preview only', async () => {
    render(<LanguagesView />)
    fireEvent.click(screen.getByLabelText('Target language'))
    fireEvent.click(screen.getByRole('option', { name: 'Hindi' }))
    expect(await screen.findByText(/preview only/i)).toBeInTheDocument()
    expect(await loadLanguagePair()).toEqual({ source: 'en', target: 'hi' })
  })

  it('swaps the two languages', async () => {
    render(<LanguagesView />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }))
    expect(screen.getByLabelText('Source language')).toHaveTextContent('Bengali')
    expect(screen.getByLabelText('Target language')).toHaveTextContent('English')
    expect(await loadLanguagePair()).toEqual({ source: 'bn', target: 'en' })
  })

  it('supports keyboard selection', async () => {
    render(<LanguagesView />)
    const target = screen.getByLabelText('Target language')
    fireEvent.keyDown(target, { key: 'ArrowDown' })
    fireEvent.keyDown(target, { key: 'ArrowDown' })
    fireEvent.keyDown(target, { key: 'Enter' })
    expect(target).toHaveTextContent('Hindi')
    expect(await loadLanguagePair()).toEqual({ source: 'en', target: 'hi' })
  })

  it('closes the list with Escape', () => {
    render(<LanguagesView />)
    const source = screen.getByLabelText('Source language')
    fireEvent.keyDown(source, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox', { name: 'Source language' })).toBeInTheDocument()
    fireEvent.keyDown(source, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'Source language' })).toBeNull()
  })
})
