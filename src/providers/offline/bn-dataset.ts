// Extension-side runtime for the Bengali-first dataset. Mirrors
// custom-dictionary/src/bn-indexer.ts so the dataset stays in one format.
import type { OfflineEntryPayload } from '../bridge'

/** Version of the Bengali-first dataset. */
export const BN_DATASET_VERSION = 2

/** Bengali-first columnar dataset. */
export interface BengaliDataset {
  v: number
  headwords: string[]
  roman: string[]
  romanAlt: string[]
  en: string[]
  enAlt: string[]
  defBn: string[]
  defEn: string[]
  pos: string[]
  synEn: string[]
  antEn: string[]
  exBn: string[]
  exEn: string[]
  pron: string[]
  usage: string[]
  formalMeaning: string[]
  conversationalMeaning: string[]
  exampleFormal: string[]
  exampleConversational: string[]
  collocations: string[]
  wordFamily: string[]
  bandLevel: string[]
  commonMistake: string[]
}

/** A single Bengali-first entry. */
export interface BengaliEntry {
  bengali: string
  roman: string
  romanAlt: string[]
  en: string
  enAlt: string[]
  defBn: string
  defEn: string
  pos: string
  synEn: string[]
  antEn: string[]
  exBn: string
  exEn: string
  pron: string
  usage: string
  formalMeaning: string
  conversationalMeaning: string
  exampleFormal: string
  exampleConversational: string
  collocations: string[]
  wordFamily: string
  bandLevel: string
  commonMistake: string
}

/** Decodes the `wordFamily` column into its four optional roles. */
function decodeFamily(value: string | undefined): { noun?: string; verb?: string; adj?: string; adv?: string } | undefined {
  if (!value) return undefined
  const out: { noun?: string; verb?: string; adj?: string; adv?: string } = {}
  for (const part of value.split('\u0001')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const role = part.slice(0, i)
    if (role === 'noun' || role === 'verb' || role === 'adj' || role === 'adv') out[role] = part.slice(i + 1)
  }
  return Object.keys(out).length ? out : undefined
}

/** NFC lookup key; Bengali vowel signs (\p{M}) are preserved. */
function normalize(text: string): string {
  if (!text) return ''
  return text.normalize('NFC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tolerant Banglish key; whitespace is stripped so "ki khobor" == "kikhobor". */
function banglish(query: string): string {
  if (!query) return ''
  return query.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/ee/g, 'i').replace(/ea/g, 'i')
    .replace(/oo/g, 'u').replace(/ou/g, 'u').replace(/v/g, 'bh').replace(/w/g, 'b')
    .replace(/y$/g, 'i').replace(/y([bcdfghjklmnpqrstvwxz])/g, 'i$1').replace(/(.)\1+/g, '$1')
}

/** Bounded Damerau-Levenshtein distance; transpositions count as one edit. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1)
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2]! + 1)
      }
      cur[j] = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]! <= max ? prev[b.length]! : max + 1
}

/** Indexed read-only view over the Bengali dataset. */
export class BanglaDictionary {
  private readonly byBengali = new Map<string, BengaliEntry>()
  private readonly byRoman = new Map<string, BengaliEntry>()
  private readonly bengaliKeys: string[] = []

  constructor(dataset: BengaliDataset) {
    if (dataset.v !== BN_DATASET_VERSION) {
      throw new Error(`Bengali dataset version ${String(dataset.v)} !== ${BN_DATASET_VERSION}`)
    }
    const n = dataset.headwords.length
    for (const key of [
      'roman', 'romanAlt', 'en', 'enAlt', 'defBn', 'defEn', 'pos', 'synEn', 'antEn', 'exBn', 'exEn',
      'pron', 'usage', 'formalMeaning', 'conversationalMeaning', 'exampleFormal', 'exampleConversational',
      'collocations', 'wordFamily', 'bandLevel', 'commonMistake',
    ] as const) {
      const arr = dataset[key]
      if (arr !== undefined && (!Array.isArray(arr) || arr.length !== n)) {
        throw new Error(`Bengali dataset column "${key}" has the wrong length`)
      }
    }
    for (let i = 0; i < n; i++) {
      const entry: BengaliEntry = {
        bengali: dataset.headwords[i] ?? '',
        roman: dataset.roman[i] ?? '',
        romanAlt: (dataset.romanAlt[i] ?? '').split('\u0001').filter(Boolean),
        en: dataset.en[i] ?? '',
        enAlt: (dataset.enAlt[i] ?? '').split('\u0001').filter(Boolean),
        defBn: dataset.defBn[i] ?? '',
        defEn: dataset.defEn[i] ?? '',
        pos: dataset.pos[i] ?? '',
        synEn: (dataset.synEn[i] ?? '').split('\u0001').filter(Boolean),
        antEn: (dataset.antEn[i] ?? '').split('\u0001').filter(Boolean),
        exBn: dataset.exBn[i] ?? '',
        exEn: dataset.exEn[i] ?? '',
        pron: dataset.pron[i] ?? '',
        usage: dataset.usage[i] ?? '',
        formalMeaning: dataset.formalMeaning[i] ?? '',
        conversationalMeaning: dataset.conversationalMeaning[i] ?? '',
        exampleFormal: dataset.exampleFormal[i] ?? '',
        exampleConversational: dataset.exampleConversational[i] ?? '',
        collocations: (dataset.collocations[i] ?? '').split('\u0001').filter(Boolean),
        wordFamily: dataset.wordFamily[i] ?? '',
        bandLevel: dataset.bandLevel[i] ?? '',
        commonMistake: dataset.commonMistake[i] ?? '',
      }
      const bn = normalize(entry.bengali)
      if (bn) {
        this.byBengali.set(bn, entry)
        this.bengaliKeys.push(bn)
      }
      for (const roman of [entry.roman, ...entry.romanAlt]) {
        const rk = normalize(roman)
        const pk = banglish(roman)
        if (rk) this.byRoman.set(rk, entry)
        if (pk && pk !== rk) this.byRoman.set(pk, entry)
      }
    }
    this.bengaliKeys.sort()
  }

  /** Bengali script first, then romanized/Banglish. */
  lookup(query: string): BengaliEntry | null {
    const bn = this.byBengali.get(normalize(query))
    if (bn) return bn
    return this.byRoman.get(normalize(query)) ?? this.byRoman.get(banglish(query)) ?? null
  }

  /** Type-ahead over Bengali headwords and their romanized spellings. */
  suggestions(query: string, limit = 8): Array<{ word: string; headword: string; bengali: boolean; hint: string }> {
    type Suggestion = { word: string; headword: string; bengali: boolean; hint: string }
    const n = normalize(query)
    if (!n) return []
    const scored: Array<{ suggestion: Suggestion; score: number }> = []
    const seen = new Set<string>()
    const push = (entry: BengaliEntry, score: number) => {
      if (seen.has(entry.bengali)) return
      seen.add(entry.bengali)
      scored.push({
        suggestion: { word: entry.bengali, headword: entry.en, bengali: true, hint: entry.en },
        score,
      })
    }

    const exact = this.byBengali.get(n)
    if (exact) push(exact, 0)
    const roman = this.byRoman.get(n) ?? this.byRoman.get(banglish(query))
    if (roman) push(roman, 100)
    for (const key of this.bengaliKeys) {
      if (key.startsWith(n)) {
        const entry = this.byBengali.get(key)
        if (entry) push(entry, 1000 + key.length)
      }
    }
    for (const key of this.byRoman.keys()) {
      if (key.startsWith(n)) {
        const entry = this.byRoman.get(key)
        if (entry) push(entry, 1100 + key.length)
      }
    }

    const maxDist = n.length >= 3 ? 2 : 0
    if (maxDist && scored.length < limit) {
      for (const key of this.bengaliKeys) {
        const distance = editDistance(n, key, maxDist)
        if (distance > 0 && distance <= maxDist) {
          const entry = this.byBengali.get(key)
          if (entry) push(entry, 2000 + distance * 100 + key.length)
        }
      }
      for (const key of this.byRoman.keys()) {
        const distance = editDistance(n, key, maxDist)
        if (distance > 0 && distance <= maxDist) {
          const entry = this.byRoman.get(key)
          if (entry) push(entry, 2100 + distance * 100 + key.length)
        }
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || a.suggestion.word.localeCompare(b.suggestion.word))
      .slice(0, limit)
      .map((s) => s.suggestion)
  }
}

/** Maps a Bengali-first entry onto the existing offline message payload. */
export function toOfflineEntryPayload(entry: BengaliEntry): OfflineEntryPayload {
  return {
    headword: entry.en,
    bn: entry.defBn || entry.bengali,
    bnAlts: [],
    trans: entry.roman,
    transAlts: entry.romanAlt,
    def: entry.defEn,
    pos: entry.pos,
    syn: entry.synEn,
    ant: entry.antEn,
    ex: entry.exEn,
    exBn: entry.exBn,
    pron: entry.pron,
    usageNote: entry.usage || undefined,
    formalMeaning: entry.formalMeaning || undefined,
    conversationalMeaning: entry.conversationalMeaning || undefined,
    exampleFormal: entry.exampleFormal || undefined,
    exampleConversational: entry.exampleConversational || undefined,
    collocations: entry.collocations,
    wordFamily: decodeFamily(entry.wordFamily),
    bandLevel: entry.bandLevel || undefined,
    commonMistake: entry.commonMistake || undefined,
  }
}
