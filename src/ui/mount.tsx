import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'

/** The id of the host element the overlay is rendered into. */
export const HOST_ID = 'vocabflow-host'

/**
 * Mounts the React overlay into a shadow root on a dedicated host element.
 *
 * The host element is appended to the document body and the overlay is
 * rendered inside its shadow root, so no styles from the host page can reach
 * the overlay and none of the overlay's styles can leak out.
 *
 * The returned function tears everything down: the React tree is unmounted
 * and the host element is removed from the document. Leaving the host behind
 * would leak an empty element into the page on every toggle.
 */
export function mountOverlay(onClose: () => void) {
  // A host may still be around from a previous mount that did not clean up
  // (e.g. the page was navigated or the extension was reloaded). Reusing the
  // id would leave a second, unreachable element in the document.
  for (const stale of document.querySelectorAll(`#${HOST_ID}`)) stale.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)

  const container = document.createElement('div')
  shadow.appendChild(container)
  const root = createRoot(container)
  root.render(<Overlay onClose={onClose} />)

  return () => {
    root.unmount()
    container.remove()
    host.remove()
  }
}
