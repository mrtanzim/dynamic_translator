// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TOGGLE_MESSAGE } from '../src/providers/bridge'
import { CONTENT_SCRIPT_STATE_KEY } from '../src/content/state'

/** Captures the message listener the content script registers. */
let messageListener: ((msg: { type?: string }) => void) | null = null

beforeEach(() => {
  messageListener = null
  document.body.innerHTML = ''
  // The content script state lives on the global object, shared by every
  // injection into a frame, so it has to be cleared between tests.
  delete (globalThis as unknown as Record<string, unknown>)[CONTENT_SCRIPT_STATE_KEY]
  // Each test needs a fresh module instance, because the content script
  // registers its listener only once per isolated world.
  vi.resetModules()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (fn: (msg: { type?: string }) => void) => {
          messageListener = fn
        },
      },
    },
    storage: {
      local: {
        get: (_key: string, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: (_items: Record<string, unknown>, cb?: () => void) => cb?.(),
      },
    },
  }
})

async function loadContentScript() {
  await import('../src/content/content-entry.iife')
  if (!messageListener) throw new Error('the content script registered no listener')
  return messageListener
}

describe('content script lifecycle', () => {
  it('mounts a host element on toggle and removes it again on the next toggle', async () => {
    const listener = await loadContentScript()

    expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(0)

    listener({ type: TOGGLE_MESSAGE })
    expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(1)

    listener({ type: TOGGLE_MESSAGE })
    // The host element must be removed with the overlay, otherwise every
    // toggle would leave another empty element behind in the page.
    expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(0)
  })

  it('keeps only one host element across repeated toggles', async () => {
    const listener = await loadContentScript()

    for (let i = 0; i < 5; i++) {
      listener({ type: TOGGLE_MESSAGE })
      expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(1)
      listener({ type: TOGGLE_MESSAGE })
      expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(0)
    }
  })

  it('ignores messages that are not the toggle', async () => {
    const listener = await loadContentScript()

    listener({ type: 'SOMETHING_ELSE' })
    expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(0)
  })

  it('injects its stylesheet into the shadow root', async () => {
    const listener = await loadContentScript()
    listener({ type: TOGGLE_MESSAGE })

    // The scrollbar rules live inside the shadow root, so they can never
    // reach the scrollbars of the host page.
    const host = document.querySelector('#vocabflow-host')
    const style = host?.shadowRoot?.querySelector('style')?.textContent ?? ''
    expect(style).toContain('::-webkit-scrollbar')
    expect(style).toContain('scrollbar-width: thin')
  })

  it('does not register a second listener when injected twice', async () => {
    const listener = await loadContentScript()
    // A second injection into the same frame must reuse the existing state
    // rather than opening a second overlay on the next toggle.
    await import('../src/content/content-entry.iife')

    listener({ type: TOGGLE_MESSAGE })
    expect(document.querySelectorAll('#vocabflow-host')).toHaveLength(1)
  })
})
