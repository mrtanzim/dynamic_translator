# VocabFlow — Rules

- Strict TypeScript, no `any` unless justified.
- Never hard-code secrets or fake provider responses.
- API keys only in chrome.storage.local; never sync/log/export.
- One history entry per search action; update result on AI replacement.
- Stale responses ignored by requestId.
- Debounce 300-500ms; cancel stale.
- Offline first; never wait for all providers.
- Provider HTTP calls go through the service worker, never directly from the content script.
- Shadow DOM isolation; no global CSS pollution.
- Least-privilege permissions.
- Update TASKS.md and MEMORY.md after meaningful work.
- Run typecheck/build and the test suite before claiming success.
