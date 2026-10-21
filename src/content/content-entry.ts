import { mountOverlay } from '../ui/mount'

let unmount: (() => void) | null = null

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'VOCABFLOW_TOGGLE') return
  if (unmount) { unmount(); unmount = null; return }
  const host = document.createElement('div')
  host.id = 'vocabflow-host'
  const shadow = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)
  unmount = mountOverlay(shadow, () => { unmount?.(); unmount = null })
})

