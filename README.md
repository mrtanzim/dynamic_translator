# VocabFlow

A floating bilingual vocabulary companion for Bengali-native English learners.

Look up any word from any page. VocabFlow answers instantly from a bundled
offline dictionary, then upgrades the answer with an AI provider (Groq,
OpenRouter or Gemini) when one is configured — including English ⇄ Bengali
translation in both directions.

## Repository

Source: https://github.com/mrtanzim/dynamic_translator (branch `main`).

```bash
git clone https://github.com/mrtanzim/dynamic_translator.git
cd dynamic_translator
npm install
npm run build
```

Then load `dist/` as an unpacked extension as described in [Installing](#installing).

## Features

- **Floating overlay** — a draggable, resizable glass panel injected into every
  page. It never reloads the page and never leaks styles into it.
- **Type-ahead** — the search field suggests dictionary words while you type.
  It is forgiving: a half-typed word (`cucu` → *cucumber*) and a misspelled
  one (`cucnber`) both find the entry.
- **One-key clear** — the cross on the right of the search field removes the
  previous word, its result and the answer that is still on its way.
- **Offline first** — 6,675 English headwords with Bengali meanings,
  definitions, parts of speech, synonyms, antonyms and example sentences ship
  with the extension. The answer appears immediately, without a network round
  trip. If an AI provider fails, its answer is simply skipped and the offline
  one stays on screen.
- **Bengali ⇄ English** — type a Bengali word and get its English headword, or
  type an English word and get the Bengali meaning.
- **AI upgrade** — Groq, OpenRouter and Gemini are queried concurrently; the
  first good answer wins. Any provider can be enabled, and a failure in one
  never affects the others.
- **Transcription and pronunciation** — the AI answer carries the word in the
  other script (*cucumber* → কুকুম্বার, বই → *boi*) and a pronunciation guide,
  not just a translation.
- **Search history and saved words** — stored locally in IndexedDB, with a
  search direction and the source of each answer.
- **Pronunciation** — uses the Web Speech API with the right voice for the
  script.

## Installing

```bash
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension
(`chrome://extensions` → *Developer mode* → *Load unpacked*).

For development with hot reload:

```bash
npm run dev
```

## Configuring a provider

Open the overlay's ⋯ menu → **AI Providers**, paste an API key and pick a
model. Keys are stored in `chrome.storage.local` only — they are never synced,
logged or exported.

The extension works without any provider: the bundled dictionary answers the
6,675 words it covers on its own.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with live reload |
| `npm run build` | Production extension build into `dist/` |
| `npm run build:dictionary` | Regenerates `public/dictionary.json.gz` |
| `npm run lint` | Oxlint |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc -b` over the app sources |

## Documentation

- [`PRD.md`](PRD.md) — product requirements
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — runtime, messaging, storage, lookup flow
- [`DESIGN.md`](DESIGN.md) — visual design system
- [`RULES.md`](RULES.md) — engineering rules the code follows
- [`TASKS.md`](TASKS.md) — feature status
- [`MEMORY.md`](MEMORY.md) — decisions and findings

## Status

The core is complete and covered by an automated test suite. Manual Chrome
verification, cloud sync, history export and a larger licensed corpus are still
outstanding — see [`TASKS.md`](TASKS.md).

## Credits

The offline dataset is generated from the bundled WordNet and Bengali-English
dictionary sources by `scripts/build-dictionary.mjs`. It is not yet a
formally licensed corpus; see [`TASKS.md`](TASKS.md) for the plan to replace it.
