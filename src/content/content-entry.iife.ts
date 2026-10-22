import { TOGGLE_MESSAGE } from '../providers/bridge'
import { getContentScriptState } from './state'
import { mountOverlay } from '../ui/mount'

const state = getContentScriptState()

if (!state.registered) {
  state.registered = true

  chrome.runtime.onMessage.addListener((msg) => {
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
}
