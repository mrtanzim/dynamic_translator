// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST_ID, mountOverlay } from '../src/ui/mount'

beforeEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { onMessage: { addListener: () => {} } },
    storage: {
      local: {
        get: (_key: string, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: (_items: Record<string, unknown>, cb?: () => void) => cb?.(),
      },
    },
  }
})

afterEach(() => {
  document.body.innerHTML = ''
})

function keyFromShadow(host: HTMLElement, key: string, type: string) {
  const container = host.shadowRoot?.querySelector('div')
  if (!container) throw new Error('overlay container is missing')
  container.dispatchEvent(
    new KeyboardEvent(type, { key, bubbles: true, composed: true }),
  )
}

describe('overlay keyboard isolation', () => {
  it('does not let a Space pressed inside the overlay reach the page hotkey handler', () => {
    const unmount = mountOverlay(() => {})
    const host = document.querySelector<HTMLElement>(`#${HOST_ID}`)
    if (!host) throw new Error('overlay host is missing')

    for (const type of ['keydown', 'keyup', 'keypress']) {
      const pageHandler = vi.fn()
      document.addEventListener(type, pageHandler)
      keyFromShadow(host, ' ', type)
      expect(pageHandler).not.toHaveBeenCalled()
      document.removeEventListener(type, pageHandler)
    }
    unmount()
  })

  it('still lets keyboard events from outside the overlay reach the page', () => {
    const unmount = mountOverlay(() => {})
    const pageKeyDown = vi.fn()
    document.addEventListener('keydown', pageKeyDown)
    const pageInput = document.createElement('input')
    document.body.appendChild(pageInput)

    pageInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }),
    )

    expect(pageKeyDown).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', pageKeyDown)
    unmount()
  })
})
