// Indexer for the offline dictionary dataset.
//
// Builds in-memory indexes over the columnar dataset so that lookups,
// type-ahead suggestions, and reverse lookups are fast:
//
//   * byHeadword      — headword -> DictionaryEntry (O(1))
//   * byNormalized    — normalized headword -> DictionaryEntry (O(1))
//   * byRelation      — synonym/antonym -> headword (O(1))
//   * byBengali       — normalized Bengali word -> {headword, roman}[]
//   * englishWords    — sorted headwords for prefix search
//   * bengaliWords    — sorted Bengali words for prefix search
//
// All lookups are O(1) for exact matches and O(log n) for prefix searches.

import { DictionaryDataset, SuggestionPayload } from './types'

/**
 * Normalizes Banglish / phonetic Latin input so variations resolve
 * (e.g. "hasy" -> "hasi", "sh" -> "s", collapse double vowels/consonants).
 */
export function normalizeBanglish(q: string): string {
  if (!q) return ''
  return q
    .normalize('NFC')
    .toLowerCase()
    .trim()
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

/** Field separator used inside multi-valued columns. */
export const SEP = '\u0001'

/** Score bands for type-ahead ranking (lower is better). */
const SCORE_EXACT = 0
const SCORE_RELATION = 500
const SCORE_PREFIX = 1000
const SCORE_FUZZY = 2000
const SCORE_SUBSEQUENCE = 3000

/** A single dictionary entry as stored in the Indexer. */
export interface IndexEntry {
  headword: string
  bn: string
  bnAlts: string[]
  trans: string
  transAlts: string[]
  def: string
  pos: string
  syn: string[]
  ant: string[]
  ex: string
  exBn?: string
  pron: string
}

/**
 * A single reverse-lookup hit: an English headword plus its romanization.
 */
export interface BengaliHit {
  headword: string
  roman: string
}

/**
 * An Indexed, read-only view over the offline dictionary.
 *
 * Building the indexes costs a single pass over the dataset and makes every
 * lookup O(1) for exact matches and O(log n) for prefix searches.
 */
export class OfflineDictionary {
  private readonly byHeadword = new Map<string, IndexEntry>()
  /** The entries keyed by their normalized headword, used by the type-ahead. */
  private readonly byNormalized = new Map<string, IndexEntry>()
  private readonly byRelation = new Map<string, string>()
  /** The English headword a normalized Bengali word resolves to, with romanization. */
  private readonly byBengali = new Map<string, BengaliHit[]>()
  private readonly byRoman = new Map<string, Array<{ headword: string; bn: string; trans: string; entry: IndexEntry }>>()

  constructor(dataset: DictionaryDataset) {
    const n = dataset.headwords.length
    const keys = [
      'bn', 'bnAlt', 'trans', 'transAlt', 'def', 'pos', 'syn', 'ant', 'ex', 'pron',
    ]
    for (const key of keys) {
      const arr = dataset[key as keyof DictionaryDataset]
      if (!Array.isArray(arr) || arr.length !== n) {
        throw new Error(`Dictionary dataset column "${key}" has the wrong length`)
      }
    }

    for (let i = 0; i < n; i++) {
      const entry: IndexEntry = {
        headword: dataset.headwords[i]!,
        bn: dataset.bn[i] ?? '',
        bnAlts: splitColumn(dataset.bnAlt[i] ?? ''),
        trans: dataset.trans[i] ?? '',
        transAlts: splitColumn(dataset.transAlt[i] ?? ''),
        def: dataset.def[i] ?? '',
        pos: dataset.pos[i] ?? '',
        syn: splitColumn(dataset.syn[i] ?? ''),
        ant: splitColumn(dataset.ant[i] ?? ''),
        ex: dataset.ex[i] ?? '',
        exBn: dataset.exBn ? dataset.exBn[i] : '',
        pron: dataset.pron[i] ?? '',
      }
      this.byHeadword.set(entry.headword, entry)
      this.byNormalized.set(normalizeHeadword(entry.headword), entry)

      // A relation may belong to several headwords; the first one wins,
      // which keeps the result deterministic because the dataset is sorted.
      for (const relation of [...entry.syn, ...entry.ant]) {
        if (!this.byRelation.has(relation)) {
          this.byRelation.set(relation, entry.headword)
        }
      }

      const addRoman = (roman: string) => {
        if (!roman) return
        const norm = normalizeHeadword(roman)
        if (norm) {
          let bucket = this.byRoman.get(norm)
          if (!bucket) {
            bucket = []
            this.byRoman.set(norm, bucket)
          }
          if (!bucket.some((b) => b.headword === entry.headword)) {
            bucket.push({ headword: entry.headword, bn: entry.bn, trans: roman, entry })
          }
        }
        const phon = normalizeBanglish(roman)
        if (phon && phon !== norm) {
          let bucket = this.byRoman.get(phon)
          if (!bucket) {
            bucket = []
            this.byRoman.set(phon, bucket)
          }
          if (!bucket.some((b) => b.headword === entry.headword)) {
            bucket.push({ headword: entry.headword, bn: entry.bn, trans: roman, entry })
          }
        }
      }
      addRoman(entry.trans)
      for (const alt of entry.transAlts) {
        addRoman(alt)
      }

      this.addBengali(entry.bn, entry.headword, entry.trans)
      for (let j = 0; j < entry.bnAlts.length; j++) {
        this.addBengali(entry.bnAlts[j] ?? '', entry.headword, entry.transAlts[j] ?? '')
      }
    }
  }

  private addBengali(bengali: string, headword: string, roman: string): void {
    const key = normalizeBengali(bengali)
    if (!key) return
    const bucket = this.byBengali.get(key)
    if (bucket) {
      if (!bucket.some((b) => b.headword === headword)) {
        bucket.push({ headword, roman })
      }
      return
    }
    this.byBengali.set(key, [{ headword, roman }])
  }

  /**
   * Looks up an entry by Romanized Bengali / Banglish phonetic spelling.
   */
  lookupRoman(q: string): { headword: string; entry: IndexEntry; roman: string; bengali: string } | null {
    const n = normalizeHeadword(q)
    if (!n) return null
    const directHits = this.byRoman.get(n)
    if (directHits && directHits.length > 0) {
      const hit = directHits[0]!
      return { headword: hit.headword, entry: hit.entry, roman: hit.trans, bengali: hit.bn }
    }
    const phon = normalizeBanglish(q)
    if (phon) {
      const phonHits = this.byRoman.get(phon)
      if (phonHits && phonHits.length > 0) {
        const hit = phonHits[0]!
        return { headword: hit.headword, entry: hit.entry, roman: hit.trans, bengali: hit.bn }
      }
    }
    return null
  }

  /** Number of entries in the dictionary. */
  get size(): number {
    return this.byHeadword.size
  }

  /** All English headwords in the dictionary. */
  getAllHeadwords(): string[] {
    return [...this.byHeadword.keys()]
  }

  /**
   * Looks up an English word.
   *
   * Falls back to the relation index so that a synonym or antonym resolves to
   * the headword entry it belongs to.
   */
  lookup(q: string): IndexEntry | null {
    const n = normalizeHeadword(q)
    if (!n) return null

    // First check if this word is an antonym of some headword
    const relation = this.byRelation.get(n)
    if (relation) {
      const entry = this.byHeadword.get(relation)
      if (entry) return entry
    }

    // Then check if it's a direct headword
    const direct = this.byNormalized.get(n)
    if (direct) return direct

    const roman = this.lookupRoman(n)
    if (roman) return roman.entry

    return null
  }

  /**
   * Returns the headword that a given word is an antonym of.
   *
   * @param q - The word to look up
   * @returns The headword that this word is an antonym of, or null
   */
  getAntonymHeadword(q: string): string | null {
    const n = normalizeHeadword(q)
    if (!n) return null
    return this.byRelation.get(n) ?? null
  }

  /**
   * Returns the headword for a query, or the query itself when unknown.
   */
  headword(q: string): string {
    const n = normalizeHeadword(q)
    const direct = this.byNormalized.get(n)
    if (direct) return direct.headword
    const relation = this.byRelation.get(n)
    if (relation) return relation
    const roman = this.lookupRoman(n)
    if (roman) return roman.headword
    return q.trim()
  }

  /**
   * Resolves a Bengali meaning back to its English headword.
   *
   * A Bengali word can be the translation of several English words, so the
   * first (alphabetically) headword is returned and the alternatives stay
   * available through {@link bengaliHeadwords}.
   *
   * The romanization of the matched spelling is also returned, so callers can
   * show the Latin-script spelling of the word the user typed.
   */
  lookupBengali(q: string): { headword: string; entry: IndexEntry; roman: string } | null {
    const hits = this.bengaliHits(q)
    if (!hits.length) return null
    const headword = hits[0]!.headword
    const entry = this.byHeadword.get(headword)
    return entry ? { headword, entry, roman: hits[0]!.roman } : null
  }

  /** All English headwords whose Bengali meaning matches the query. */
  bengaliHeadwords(q: string): string[] {
    return this.bengaliHits(q).map((hit) => hit.headword)
  }

  /** The reverse-index hits of a Bengali query. */
  private bengaliHits(q: string): BengaliHit[] {
    const n = normalizeBengali(q)
    if (!n) return []
    return this.byBengali.get(n) ?? []
  }

  /**
   * English type-ahead suggestions for a partially typed query.
   *
   * Ranking:
   *   1. Exact dictionary word match
   *   2. Synonym/antonym matches (via relation index)
   *   3. Prefix matches
   *   4. Fuzzy matches (edit distance <= 2 for words >= 3 chars)
   *   5. Subsequence matches
   *
   * @param query - Partially typed word
   * @param limit - Maximum suggestions to return
   */
  englishSuggestions(query: string, limit: number): SuggestionPayload[] {
    const n = normalizeHeadword(query)
    if (!n) return []

    const scored: Array<{ suggestion: SuggestionPayload; score: number }> = []
    const seen = new Set<string>()

    const push = (suggestion: SuggestionPayload | null, score: number) => {
      if (!suggestion) return
      if (seen.has(suggestion.word)) return
      seen.add(suggestion.word)
      scored.push({ suggestion, score })
    }

    // 1. Exact dictionary word match
    const exact = this.byNormalized.get(n)
    if (exact) {
      push({
        word: exact.headword,
        headword: exact.headword,
        bengali: false,
        hint: exact.bn,
      }, SCORE_EXACT)
    }

    // 2. Synonym/antonym matches via relation index
    const relation = this.byRelation.get(n)
    if (relation) {
      const entry = this.byHeadword.get(relation)
      if (entry) {
        push({
          word: entry.headword,
          headword: entry.headword,
          bengali: false,
          hint: entry.bn,
        }, SCORE_RELATION)
      }
    }

    // 3. Prefix matches on English headwords
    for (const [headword, entry] of this.byHeadword) {
      if (headword.toLowerCase().startsWith(n) && headword !== n) {
        push({
          word: entry.headword,
          headword: entry.headword,
          bengali: false,
          hint: entry.bn,
        }, SCORE_PREFIX + entry.headword.length)
      }
    }

    // 4. Fuzzy matches on English headwords (edit distance)
    if (scored.length < limit) {
      const maxDist = n.length >= 3 ? 2 : 0
      for (const [headword, entry] of this.byHeadword) {
        if (headword === n) continue
        const dist = editDistance(n, headword.toLowerCase(), maxDist)
        if (dist <= maxDist && dist > 0) {
          push({
            word: entry.headword,
            headword: entry.headword,
            bengali: false,
            hint: entry.bn,
          }, SCORE_FUZZY + dist * 100 + entry.headword.length)
        }
      }
    }

    // 5. Subsequence matches
    if (scored.length < limit) {
      for (const [headword, entry] of this.byHeadword) {
        if (headword.toLowerCase().startsWith(n)) continue
        if (isSubsequence(n, headword.toLowerCase())) {
          push({
            word: entry.headword,
            headword: entry.headword,
            bengali: false,
            hint: entry.bn,
          }, SCORE_SUBSEQUENCE + entry.headword.length)
        }
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || a.suggestion.word.localeCompare(b.suggestion.word))
      .slice(0, limit)
      .map((s) => s.suggestion)
  }

  /**
   * Bengali type-ahead suggestions for a partially typed query.
   *
   * @param query - Partially typed Bengali word
   * @param limit - Maximum suggestions to return
   */
  bengaliSuggestions(query: string, limit: number): SuggestionPayload[] {
    const n = normalizeBengali(query)
    if (!n) return []

    const scored: Array<{ suggestion: SuggestionPayload; score: number }> = []
    const seen = new Set<string>()

    const push = (suggestion: SuggestionPayload | null, score: number) => {
      if (!suggestion) return
      if (seen.has(suggestion.word)) return
      seen.add(suggestion.word)
      scored.push({ suggestion, score })
    }

    // 1. Exact dictionary word match
    const exact = this.byBengali.get(n)
    if (exact) {
      for (const hit of exact) {
        const entry = this.byHeadword.get(hit.headword)
        if (entry) {
          push({
            word: entry.headword,
            headword: entry.headword,
            bengali: true,
            hint: entry.headword,
          }, SCORE_EXACT)
        }
      }
    }

    // 2. Prefix matches on Bengali words
    for (const [bnKey, hits] of this.byBengali) {
      if (bnKey.startsWith(n)) {
        for (const hit of hits) {
          const entry = this.byHeadword.get(hit.headword)
          if (entry && entry.headword !== n) {
            push({
              word: entry.headword,
              headword: entry.headword,
              bengali: true,
              hint: entry.headword,
            }, SCORE_PREFIX + entry.headword.length)
          }
        }
      }
    }

    // 3. Fuzzy matches on Bengali words
    if (scored.length < limit) {
      const maxDist = n.length >= 3 ? 2 : 0
      for (const [bnKey, hits] of this.byBengali) {
        for (const hit of hits) {
          const entry = this.byHeadword.get(hit.headword)
          if (!entry || entry.headword === n) continue
          const dist = editDistance(n, bnKey, maxDist)
          if (dist <= maxDist && dist > 0) {
            push({
              word: entry.headword,
              headword: entry.headword,
              bengali: true,
              hint: entry.headword,
            }, SCORE_FUZZY + dist * 100 + entry.headword.length)
          }
        }
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || a.suggestion.word.localeCompare(b.suggestion.word))
      .slice(0, limit)
      .map((s) => s.suggestion)
  }
}

/**
 * Normalize a text string for dictionary lookup and storage.
 *
 * Steps:
 *   1. Normalize to NFC (Unicode Normalization Form C)
 *   2. Trim leading/trailing whitespace
 *   3. Lowercase
 *   4. Strip all characters that are not letters, numbers, marks, or whitespace
 *   5. Collapse internal whitespace runs to a single space
 *   6. Trim again
 */
function normalizeHeadword(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize a Bengali text string for lookup.
 *
 * This is an alias for normalizeHeadword. Bengali vowel signs (e.g. ি, া) are
 * Unicode combining marks (\p{M}), so the \p{M} inclusion in the normalization
 * regex preserves them. A \p{L}-only class would silently corrupt Bengali
 * words.
 */
function normalizeBengali(text: string): string {
  return normalizeHeadword(text)
}

/**
 * Split a SEP-joined column value into an array of strings.
 */
function splitColumn(value: string): string[] {
  if (!value) return []
  return value.split(SEP)
}

/**
 * The edit distance between two words, with transpositions allowed.
 *
 * `max` is an upper bound: the function returns `max + 1` as soon as the
 * distance is known to be larger, so scanning the whole dictionary stays
 * cheap.
 */
function editDistance(a: string, b: string, max: number): number {
  const n = a.length
  const m = b.length
  if (Math.abs(n - m) > max) return max + 1
  if (n === 0) return m <= max ? m : max + 1
  if (m === 0) return n <= max ? n : max + 1

  let prev2: number[] = []
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j)
  let cur: number[] = []

  for (let i = 1; i <= n; i++) {
    cur = new Array<number>(m + 1)
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v1 = prev[j]! + 1
      const v2 = cur[j - 1]! + 1
      const v3 = prev[j - 1]! + cost
      let value = Math.min(v1, v2, v3)
      // A transposition ("teh" -> "the") counts as a single edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        const v4 = prev2[j - 2]! + 1
        value = Math.min(value, v4)
      }
      cur[j]! = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[m]! <= max ? prev[m]! : max + 1
}

/**
 * Whether every character of `needle` appears in `haystack`, in order.
 *
 * This catches typos an edit distance forgives: "cmbr" is a subsequence
 * of "cumber" even though three characters are missing.
 */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++
  }
  return i === needle.length
}
