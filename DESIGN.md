# VocabFlow — Design

## Palette
- bg #10151D; surface rgba(30,41,54,.82); border rgba(148,163,184,.28); accent #65CFFF; text #F3F6FA; secondary #AAB8C8.
## Typography
Noto Sans Bengali + system sans. Compact hierarchy.
## Layout
Overlay 360-390w, min 300x260, max viewport. Header/search/results/actions. Internal scroll for long results; header+search sticky.
## Glassmorphism
Translucent dark glass, subtle blur, thin borders, soft shadows. Solid fallback. No neon/glow/pink-purple. Reduced motion respected.
## Components
- **Header** — product name (accent), three-dot menu, close button. Draggable.
- **Menu** — AI Providers, Search History, Saved Words, Translation Settings, Help / About.
- **Search input** — single field; live lookup after a 400 ms debounce, Enter forces an immediate lookup.
- **Result body** — main word (accent), part of speech, Bengali meaning, English definition,
  synonyms row, antonyms row, example card (en + bn), source label
  (`Offline dictionary` for the provisional result, provider name for AI results).
- **Action row** — Pronounce (Web Speech API), Save (toggles the saved flag in history).
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

