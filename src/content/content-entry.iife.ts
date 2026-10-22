import { TOGGLE_MESSAGE } from '../providers/bridge'
import { mountOverlay } from '../ui/mount'

/**
 * State shared by every instance of this content script in a frame.
 *
 * The service worker injects the script on demand when a tab was already
 * open before the extension was installed, so the same frame can run this
 * script more than once. The state lives on the isolated world's global
 * object, which is shared by all injections into that frame, so a second
 * injection reuses the existing state instead of opening a second overlay.
 */
interface ContentScriptState {
  /** Tears the overlay down; null while no overlay is mounted. */
  unmount: (() => void) | null
  /** True once this script has registered its message listener. */
  registered: boolean
}

const STATE_KEY = '__vocabflowContentScriptState'

function getState(): ContentScriptState {
  const scope = globalThis as unknown as Record<string, ContentScriptState | undefined>
  const existing = scope[STATE_KEY]
  if (existing) return existing
  const state: ContentScriptState = { unmount: null, registered: false }
  scope[STATE_KEY] = state
  return state
}

const state = getState()

if (!state.registered) {
  state.registered = true

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== TOGGLE_MESSAGE) return
    if (state.unmount) {
      state.unmount()
      state.unmount = null
      return
    }
    const host = document.createElement('div')
    host.id = 'vocabflow-host'
    const shadow = host.attachShadow({ mode: 'open' })
    document.body.appendChild(host)
    state.unmount = mountOverlay(shadow, () => {
      state.unmount?.()
      state.unmount = null
    })
  })
}
