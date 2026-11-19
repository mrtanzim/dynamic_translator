# Project Instructions — VocabFlow

## Tech Stack
- Manifest V3 Chrome extension; Vite 8 + `@crxjs/vite-plugin`; React 19; strict TypeScript ~6.0.
- Vitest + Testing Library (jsdom, fake-indexeddb); oxlint.
- `chrome.storage.local` for settings/keys/overlay geometry; IndexedDB `vocabflow` / `history` for history and saved words.

## Authoritative Docs
Read before changing code: `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `MEMORY.md`.
`DESIGN.md` is the source of truth for colors, typography and layout.

## Code Style
- Match existing files: single quotes, no semicolons, 2-space indent.
- Strict TypeScript; no `any` unless justified.
- kebab-case filenames; PascalCase components/classes.
- Comments explain *why*, especially MV3 and Shadow DOM quirks.

## Architecture Rules (do not break)
- The service worker owns the dictionary and all provider HTTP. The content script never calls provider APIs directly.
- The overlay renders in Shadow DOM; inject CSS only through `src/ui/styles.ts` — no global CSS.
- The message contract lives in `src/providers/bridge.ts`; add new message types there.
- Lookup identities: `requestId` = search action, `query` = typed word, `word` = display only. Never mix them.
- The offline result is provisional and ranks last: `groq > openrouter > gemini > offline`.
- Drop responses whose `requestId` is no longer current; one history row per search.
- Normalize with Unicode classes (`\p{L}\p{N}\p{M}`), never `\w` — Bengali vowel signs are combining marks.
- The toolbar toggle must never reload the tab; the content script is idempotent across repeated injections.

## Testing & Verification
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` must all pass before claiming success.
- Tests live in `tests/*.test.ts(x)`; use Testing Library for React in jsdom.
- `custom-dictionary/` is a separate package with its own scripts and tests — verify it separately.

## Build & Run
- Dev: `npm run dev`. Production: `npm run build`, then load `dist/` as an unpacked extension.
- `npm run build:dictionary` regenerates the dataset (also runs automatically via `prebuild`).

## Git
- Conventional Commits with scope, e.g. `feat(ui):`, `fix(offline):`, `docs:`.
- Update `TASKS.md` and `MEMORY.md` after meaningful work.
