import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TOGGLE_MESSAGE } from '../src/providers/bridge'

/**
 * Mocks the parts of the `chrome` API that the service worker's action
 * handler uses, and captures the registered click listener.
 */
function installChrome(options: {
  /** Fails the first `sendMessage` call, as if no content script is running. */
  noContentScript?: boolean
  /** Fails `executeScript`, as on a page that forbids extension scripts. */
  injectionForbidden?: boolean
}) {
  const sendMessage = vi.fn(async (_tabId: number, _msg: unknown) => {
    if (options.noContentScript) throw new Error('Receiving end does not exist')
    return { ok: true }
  })
  const executeScript = vi.fn(async () => {
    if (options.injectionForbidden) throw new Error('Cannot access contents of the page')
    return []
  })
  const reload = vi.fn(async () => {})

  let onClicked: ((tab: { id?: number }) => Promise<void>) | null = null

  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getManifest: () => ({
        content_scripts: [{ js: ['src/content/content-entry.iife.js'] }],
      }),
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
    },
    action: {
      onClicked: {
        addListener: (fn: (tab: { id?: number }) => Promise<void>) => {
          onClicked = fn
        },
      },
    },
    tabs: { sendMessage, reload },
    scripting: { executeScript },
    storage: { local: { get: (_k: string, cb: (r: Record<string, unknown>) => void) => cb({}), set: (_i: Record<string, unknown>, cb?: () => void) => cb?.() } },
  }

  return {
    sendMessage,
    executeScript,
    reload,
    click: async (tabId?: number) => {
      if (!onClicked) throw new Error('no action listener registered')
      await onClicked({ id: tabId })
    },
  }
}

/** Imports the service worker with a freshly installed `chrome` mock. */
async function loadServiceWorker() {
  vi.resetModules()
  await import('../src/background/service-worker')
}

beforeEach(() => {
  vi.resetModules()
})

describe('action click handler', () => {
  it('toggles the overlay through the running content script', async () => {
    const chromeMock = installChrome({})
    await loadServiceWorker()

    await chromeMock.click(7)

    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(1)
    expect(chromeMock.sendMessage).toHaveBeenCalledWith(7, { type: TOGGLE_MESSAGE })
    expect(chromeMock.executeScript).not.toHaveBeenCalled()
  })

  it('injects the content script instead of reloading the tab when it is missing', async () => {
    const chromeMock = installChrome({ noContentScript: true })
    await loadServiceWorker()

    await chromeMock.click(7)

    // The tab must never be reloaded: that would destroy the user's page
    // state (video position, form input, scroll offset).
    expect(chromeMock.reload).not.toHaveBeenCalled()
    expect(chromeMock.executeScript).toHaveBeenCalledTimes(1)
    expect(chromeMock.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['src/content/content-entry.iife.js'],
    })
    // The toggle is sent again once the script is in place.
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(2)
    expect(chromeMock.sendMessage).toHaveBeenLastCalledWith(7, { type: TOGGLE_MESSAGE })
  })

  it('does not reload the tab when the page forbids extension scripts', async () => {
    const chromeMock = installChrome({ noContentScript: true, injectionForbidden: true })
    await loadServiceWorker()

    await chromeMock.click(7)

    expect(chromeMock.reload).not.toHaveBeenCalled()
    expect(chromeMock.executeScript).toHaveBeenCalledTimes(1)
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a tab without an id', async () => {
    const chromeMock = installChrome({})
    await loadServiceWorker()

    await chromeMock.click(undefined)

    expect(chromeMock.sendMessage).not.toHaveBeenCalled()
    expect(chromeMock.executeScript).not.toHaveBeenCalled()
    expect(chromeMock.reload).not.toHaveBeenCalled()
  })
})
