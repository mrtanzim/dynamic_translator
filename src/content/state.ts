/**
 * State shared by every instance of the content script in a frame.
 *
 * The service worker injects the script on demand when a tab was already
 * open before the extension was installed, so the same frame can run the
 * script more than once. The state lives on the isolated world's global
 * object, which is shared by all injections into that frame, so a second
 * injection reuses the existing state instead of opening a second overlay.
 */
export interface ContentScriptState {
  /** Tears the overlay down; null while no overlay is mounted. */
  unmount: (() => void) | null
  /** True once this script has registered its message listener. */
  registered: boolean
}

/** The key the state is stored under on the global object. */
export const CONTENT_SCRIPT_STATE_KEY = '__vocabflowContentScriptState'

/** Reads the shared state, creating it on the first call. */
export function getContentScriptState(): ContentScriptState {
  const scope = globalThis as unknown as Record<string, ContentScriptState | undefined>
  const existing = scope[CONTENT_SCRIPT_STATE_KEY]
  if (existing) return existing
  const state: ContentScriptState = { unmount: null, registered: false }
  scope[CONTENT_SCRIPT_STATE_KEY] = state
  return state
}
