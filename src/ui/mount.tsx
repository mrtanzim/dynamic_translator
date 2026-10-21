import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'

/** Mounts the React overlay into a shadow root and returns an unmount function. */
export function mountOverlay(shadow: ShadowRoot, onClose: () => void) {
  const container = document.createElement('div')
  shadow.appendChild(container)
  const root = createRoot(container)
  root.render(<Overlay onClose={onClose} />)
  return () => { root.unmount(); container.remove() }
}
