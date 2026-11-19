# VocabFlow — Design

## Palette
- bg #10151D; surface rgba(30,41,54,.82); border rgba(148,163,184,.28); accent #65CFFF; text #F3F6FA; secondary #AAB8C8.
## Typography
Noto Sans Bengali + system sans. Compact hierarchy.
## Layout
Overlay 360-390w, min 300x260, max viewport. Header/search/results/actions. Internal scroll for long results; header+search sticky.
## Glassmorphism
Translucent dark glass, subtle blur, thin borders, soft shadows. Solid fallback. No neon/glow/pink-purple. Reduced motion respected.
## Scrollbars
Thin (6 px) and barely visible: a transparent track, a translucent slate thumb that turns accent-blue on hover, no arrow buttons. The scrollbar is styled from inside the shadow root, so the page it is injected into keeps its own. The overlay declares `color-scheme: dark`, so the native fallback is dark as well and never a white bar.
## Components
- **Header** — product name (accent), three-dot menu, close button. Draggable.
- **Menu** — Search (the home screen), Account, History, Saved Words,
  AI Providers, Select Language, Settings, Help / About. The open view is
  marked in the accent colour.
- **Search input** — single field with a cross button on the right that clears
  the word, the result and the error; live lookup after a 300 ms debounce,
  Enter forces an immediate lookup.
- **Type-ahead list** — drops below the search field while typing: the word,
  a muted hint (the Bengali meaning, or the English headword of a Bengali
  word), arrow keys to walk it, Enter to take it, Escape to close it.
- **Result body** — main word (accent), part of speech, Bengali meaning, English definition,
   transcription (the word in the other script), pronunciation guide,
   synonyms row, antonyms row, example card (en + bn), source label
   (`Offline dictionary` for the provisional result, provider name for AI results).
- **Action row** — Pronounce (Web Speech API), Save (toggles the saved flag in history).
- **Select Language view** — "From" and "To" custom glass listbox dropdowns
  over a popular-language list, a swap button, and a support note. Never native
  `<select>`: its OS popup and white focus ring cannot be themed inside the
  shadow root. Bengali ⇄ English is the only functional pair; other pairs show
  "Preview only". The pair is stored under `vocabflow.languages` and does not
  change the auto-detected lookup direction.
- **Providers view** — per provider: enable checkbox, masked API key with show/hide,
  model select, Test (live connection check), Save, Remove, and a link to the
  provider's key console.
- **History / Saved views** — timestamped list, click to re-run a lookup, per-item Delete, Clear all.
- **Resize grip** — 16×16 square, bottom-right corner, cursor `se-resize`.
- **Feedback** — inline "Searching…" indicator, per-provider error line in a muted red.

## States
- Empty: "Search any word to begin."
- Loading: offline result shows immediately; a subtle "Searching…" line appears
  above it while AI providers are in flight.
- Error: a provider failure is shown but never clears an already displayed result.

