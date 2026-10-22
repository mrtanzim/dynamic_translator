import type React from 'react'

/**
 * The stylesheet of the overlay.
 *
 * It is injected into the shadow root, so it can only ever affect the
 * overlay itself — the scrollbars of the host page are untouched.
 *
 * The scrollbars are the default Chrome ones: a light, wide bar that does
 * not belong to a dark glass panel. They are replaced by a thin, nearly
 * transparent bar with a soft accent thumb:
 *
 *   * `scrollbar-width` / `scrollbar-color` are the standard properties
 *     and style the scrollbar in Firefox,
 *   * the `::-webkit-scrollbar` rules style it in Chromium.
 */
export const OVERLAY_STYLES = `
:host { color-scheme: dark; }

* {
  scrollbar-width: thin;
  scrollbar-color: rgba(101, 207, 255, 0.45) transparent;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.38);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(101, 207, 255, 0.65);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}

*::-webkit-scrollbar-button {
  display: none;
}
`

/** Shared small button style used across the overlay views. */
export const btn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'rgba(101,207,255,0.12)',
  color: '#F3F6FA',
  cursor: 'pointer',
  fontSize: 12,
}

/** Shared input/select style used across the overlay views. */
export const inputStyle: React.CSSProperties = {
  padding: 6,
  borderRadius: 8,
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'rgba(16,21,29,0.6)',
  color: '#F3F6FA',
}
