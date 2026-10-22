# DESIGN.md — Custom Dictionary Package System

## 1. Visual Identity (Console / CLI First)

This is primarily a command-line build tool + headless service worker library. There is no traditional web UI. The "design" applies to:

1. CLI output formatting (build script logs)
2. Data schema design (columnar JSON)
3. Extension overlay integration (if/when embedded in `Translator extention`)

## 2. CLI Build Output Style

```
$ npm run build:dictionary
wordnet lemmas: 82674
bengali headwords (single token): 6674
pronunciations: 125917
entries: 6675
  with synonyms: 3638
  with antonyms: 720
  with examples: 1144
  with pronunciation: 5242
  generated.json: 1285 KB
  dictionary.json.gz: 391 KB
```

- No colors, no emojis, no spinners.
- One line per metric, aligned left.
- Errors go to `stderr`, summary goes to `stdout`.
- Exit code 0 on success, non-zero on failure.

## 3. Color Palette (Extension Overlay Integration)

If the custom dictionary is rendered inside the VocabFlow overlay, use these exact hex codes:

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `rgba(30,41,54,0.82)` | Overlay panel |
| Surface | `rgba(16,21,29,0.6)` | Input fields, dropdowns |
| Border | `rgba(148,163,184,0.28)` | Cards, dividers |
| Accent | `#65CFFF` | Primary text, active states |
| Text primary | `#F3F6FA` | Headwords, main content |
| Text secondary | `#AAB8C8` | Definitions, hints, metadata |
| Error | `#E58A8A` | Provider errors, missing data |
| Success | `#6FCF97` | Saved, offline hit |
| Muted accent | `rgba(101,207,255,0.12)` | Button backgrounds, hover states |
| Highlight | `rgba(101,207,255,0.16)` | Selected suggestion in list |

## 4. Typography

- Font stack: `Noto Sans Bengali`, system sans-serif (fallback)
- Headword size: `20px`, font-weight `700`, color `#65CFFF`
- Bengali meaning size: `16px`, color `#F3F6FA`
- English definition size: `14px`, color `#AAB8C8`, italic
- Part of speech size: `12px`, color `#AAB8C8`
- Pronunciation size: `12px`, color `#AAB8C8`, label `Pronunciation:`
- Transcription size: `13px`, color `#AAB8C8`, label `In Latin script:` / `In Bengali script:`
- Synonyms/antonyms size: `13px`, color `#F3F6FA`
- Example size: `14px`, color `#F3F6FA`, italic, padded background `rgba(16,21,29,0.55)`
- Source label size: `12px`, color `#AAB8C8` (`Offline dictionary`, provider name)

## 5. Component Specifications

### 5.1 Search Bar

- Container: `flex`, `align-items: center`, gap `6px`, padding `0 8px`, border-radius `8px`, border `1px solid rgba(148,163,184,0.28)`, background `rgba(16,21,29,0.6)`
- Input: `flex: 1`, `min-width: 0`, border `none`, outline `none`, background `transparent`, color `#F3F6FA`, padding `8px 0`
- Clear button: `background: transparent`, border `none`, color `#AAB8C8`, cursor `pointer`, font-size `16px`, line-height `1`, padding `0 2px`, only visible when query non-empty
- Placeholder: `Search any word`

### 5.2 Type-Ahead Dropdown

- Position: `absolute`, `left: 12px`, `right: 12px`, `top: calc(100% - 6px)`, `z-index: 20`
- Background: `rgba(16,21,29,0.98)`, border `1px solid rgba(148,163,184,0.28)`, border-radius `10px`
- Max height: `210px`, overflow: hidden auto
- Item padding: `6px 10px`, font-size `13px`, display `flex`, justify-content `space-between`, gap `8px`
- Item background (hover): `rgba(101,207,255,0.16)`
- Item text color: `#F3F6FA`
- Hint color: `#AAB8C8`, font-size `11px`, white-space `nowrap`, overflow `hidden`, text-overflow `ellipsis`, max-width `150px`
- Arrow-key navigation: highlight index cycles, `aria-selected` on active item
- `Escape` closes dropdown; `Enter` selects highlighted or searches exact match

### 5.3 Result Card

- Headword: `color: #65CFFF`, font-size `20px`, font-weight `700`
- Headword label (English / Bengali): `color: #AAB8C8`, font-size `12px`, margin-top `2px`
- Part of speech: `color: #AAB8C8`, font-size `12px`, font-style `italic`
- Bengali meaning: margin-top `6px`, color `#F3F6FA`
- Transcription: margin-top `6px`, flex row with label color `#AAB8C8` + value color `#F3F6FA`
- Pronunciation: `color: #AAB8C8`, margin-top `4px`, label `Pronunciation:`
- Synonyms / Antonyms: margin-top `6px`, color `#F3F6FA`, comma-separated
- Example card: margin-top `8px`, padding `8px`, border-radius `8px`, background `rgba(16,21,29,0.55)`, font-style `italic`; Bengali example below English example, font-style `normal`
- Source label: margin-top `8px`, font-size `12px`, color `#AAB8C8` (`Offline dictionary` or provider name)
- Action row: margin-top `10px`, display `flex`, gap `6px`, buttons with `actionBtn` style

## 6. Animation / Motion (Respect Reduced Motion)

- Dropdown open/close: no animation, instant toggle (respects `prefers-reduced-motion`)
- Suggestion highlight: instant background color change
- Result source swap (offline → AI): instant, no crossfade (avoids layout shift)

## 7. Accessibility

- Dropdown role: `listbox`, `aria-label: Suggestions`
- Suggestion item role: `option`, `aria-selected` reflects highlight
- Clear button: `aria-label: Clear search`
- Input: `placeholder: Search any word`, no `aria-label` needed (placeholder is descriptive)
- All buttons: `type="button"` to prevent form submission

---

*Last updated: 2026-10-22*
