// Helpers for injecting the content script on demand.
//
// The content script is declared in the manifest for every page, so it is
// normally already running in a tab. It is missing when the page was loaded
// before the extension was installed or reloaded. In that case the service
// worker injects it on demand instead of reloading the tab, which would
// destroy the user's page state (video position, form input, scroll).

/**
 * The content script files, as declared in the manifest.
 *
 * The path is read from the runtime manifest rather than hard-coded: the
 * bundler emits a different file name in development (`*.iife.ts.iife.js`)
 * than in a production build (`*.iife.js`).
 */
export function contentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest()
  const files = manifest.content_scripts?.flatMap((cs) => cs.js ?? []) ?? []
  // The development reload bridge is not part of the extension's own code and
  // must not be injected on demand.
  return files.filter((file) => !file.startsWith('vendor/'))
}
