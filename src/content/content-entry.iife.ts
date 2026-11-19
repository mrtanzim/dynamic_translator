import { TOGGLE_MESSAGE } from '../providers/bridge'
import { getContentScriptState } from './state'
import { mountOverlay } from '../ui/mount'

const state = getContentScriptState()

// After an extension reload, a tab that was open before the reload can still
// run a content script whose extension APIs are gone: `chrome.runtime` is
// undefined. Accessing it unguarded throws and, because the flag was set first,
// permanently prevents a later injection from registering the toggle listener.
type Messaging = { addListener(fn: (msg: { type?: string }) => void): void }
const scope = globalThis as unknown as {
  chrome?: { runtime?: { onMessage?: Messaging } }
}
const messaging = scope.chrome?.runtime?.onMessage

if (!state.registered && messaging?.addListener) {
  messaging.addListener((msg) => {
    if (msg?.type !== TOGGLE_MESSAGE) return
    if (state.unmount) {
      state.unmount()
      state.unmount = null
      return
    }
    state.unmount = mountOverlay(() => {
      state.unmount?.()
      state.unmount = null
    })
  })

  // Only mark the frame as registered once the listener actually exists, so a
  // later injection can retry when the extension runtime is available again.
  state.registered = true
}
