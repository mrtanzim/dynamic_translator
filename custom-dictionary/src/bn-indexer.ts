// In-memory indexes over the Bengali-first columnar dataset.
import { BN_DATASET_VERSION, BN_SEP } from './bn-types'
import type { BengaliDataset, BengaliEntry } from './bn-types'
import type { SuggestionPayload } from './types'

/** NFC-normalized lookup key; Bengali vowel signs (\p{M}) are preserved. */
export function normalizeBengaliKey(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tolerant Latin-script (Banglish) spelling key. Whitespace is stripped so
 * "ki khobor" and "kikhobor" collapse to the same key. */
export function normalizeBanglishKey(query: string): string {
  if (!query) return ''
  return query
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/ee/g, 'i')
    .replace(/ea/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/v/g, 'bh')
    .replace(/w/g, 'b')
    .replace(/y$/g, 'i')
    .replace(/y([bcdfghjklmnpqrstvwxz])/g, 'i$1')
    .replace(/(.)\1+/g, '$1')
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

/** Read-only indexed view over the Bengali dataset. */
export class BanglaDictionary {
  private readonly byBengali = new Map<string, BengaliEntry>()
  private readonly byRoman = new Map<string, BengaliEntry>()
  private readonly byEnglish = new Map<string, BengaliEntry[]>()
  private readonly bengaliKeys: string[] = []

  constructor(dataset: BengaliDataset) {
    if (dataset.v !== BN_DATASET_VERSION) {
      throw new Error(`Bengali dataset version ${String(dataset.v)} !== ${BN_DATASET_VERSION}`)
    }
    const n = dataset.headwords.length
    for (const column of ['roman', 'romanAlt', 'en', 'enAlt', 'defBn', 'defEn', 'pos', 'synEn', 'antEn', 'exBn', 'exEn', 'pron', 'usage'] as const) {
      const arr = dataset[column]
      if (!Array.isArray(arr) || arr.length !== n) {
        throw new Error(`Bengali dataset column "${column}" has the wrong length`)
      }
    }
    for (let i = 0; i < n; i++) {
      const entry: BengaliEntry = {
        bengali: dataset.headwords[i] ?? '',
        roman: dataset.roman[i] ?? '',
        romanAlt: (dataset.romanAlt[i] ?? '').split(BN_SEP).filter(Boolean),
        en: dataset.en[i] ?? '',
        enAlt: (dataset.enAlt[i] ?? '').split(BN_SEP).filter(Boolean),
        defBn: dataset.defBn[i] ?? '',
        defEn: dataset.defEn[i] ?? '',
        pos: dataset.pos[i] ?? '',
        synEn: (dataset.synEn[i] ?? '').split(BN_SEP).filter(Boolean),
        antEn: (dataset.antEn[i] ?? '').split(BN_SEP).filter(Boolean),
        exBn: dataset.exBn[i] ?? '',
        exEn: dataset.exEn[i] ?? '',
        pron: dataset.pron[i] ?? '',
        usage: dataset.usage[i] ?? '',
      }
      const bnKey = normalizeBengaliKey(entry.bengali)
      if (bnKey) {
        this.byBengali.set(bnKey, entry)
        this.bengaliKeys.push(bnKey)
      }
      for (const roman of [entry.roman, ...entry.romanAlt]) {
        const rk = normalizeBengaliKey(roman)
        if (rk) this.byRoman.set(rk, entry)
        const pk = normalizeBanglishKey(roman)
        if (pk && pk !== rk) this.byRoman.set(pk, entry)
      }
      for (const english of [entry.en, ...entry.enAlt]) {
        const ek = normalizeBengaliKey(english)
        if (!ek) continue
        const bucket = this.byEnglish.get(ek) ?? []
        if (!bucket.includes(entry)) bucket.push(entry)
        this.byEnglish.set(ek, bucket)
      }
    }
    this.bengaliKeys.sort()
  }

  /** Number of Bengali headwords. */
  get size(): number {
    return this.byBengali.size
  }

  /** Exact Bengali-script lookup. */
  lookupBengali(query: string): BengaliEntry | null {
    return this.byBengali.get(normalizeBengaliKey(query)) ?? null
  }

  /** Romanized / Banglish lookup. */
  lookupRoman(query: string): { entry: BengaliEntry; roman: string } | null {
    const entry = this.byRoman.get(normalizeBengaliKey(query))
      ?? this.byRoman.get(normalizeBanglishKey(query))
    return entry ? { entry, roman: query } : null
  }

  /** Bengali script first, then romanized/Banglish. */
  lookup(query: string): BengaliEntry | null {
    return this.lookupBengali(query) ?? this.lookupRoman(query)?.entry ?? null
  }

  /** Type-ahead over Bengali headwords; English equivalent is the hint. */
  suggestions(query: string, limit = 8): SuggestionPayload[] {
    const n = normalizeBengaliKey(query)
    if (!n) return []
    const scored: Array<{ suggestion: SuggestionPayload; score: number }> = []
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
    const roman = this.byRoman.get(n)
    if (roman) push(roman, 100)
    for (const key of this.bengaliKeys) {
      if (key.startsWith(n)) {
        const entry = this.byBengali.get(key)
        if (entry) push(entry, 1000 + key.length)
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
    }
    return scored
      .sort((a, b) => a.score - b.score || a.suggestion.word.localeCompare(b.suggestion.word))
      .slice(0, limit)
      .map((s) => s.suggestion)
  }
}
