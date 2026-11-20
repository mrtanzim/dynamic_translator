# Bengali dataset sources

This folder is the **Bengali-first** dataset. Bengali is the headword language;
English is the target language.

- `curated.json` — hand-authored high-value words. Keys are Bengali headwords,
  NFC-normalized. Fields match `BengaliEntry` minus `bengali`.
- `idioms.json` — greetings and idioms. The `en` field must be the **natural
  idiomatic English** equivalent; literal renderings go into `enAlt`/`usage`.

Rules:
- Use everyday Bangladeshi Bengali (`পানি` not `জল`), no Sadhu/archaic forms.
- Verbs use the base/verbal-noun form (`শেখা` not `শিখতে`).
- Every curated entry should carry `defBn`, `defEn`, `exBn`, `exEn`, and `synEn`
  where meaningful. Never fabricate a Bengali example with machine translation.
- Curated/idiom values override derived values entirely.

Rebuild with `npm run build:bn-dictionary` from `custom-dictionary/`.
