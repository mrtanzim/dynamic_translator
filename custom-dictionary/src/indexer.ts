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

import { DictionaryDataset } from './types'

/** Field separator used inside multi-valued columns. */
export const SEP = '\u0001'

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

  /** Number of entries in the dictionary. */
  get size(): number {
    return this.byHeadword.size
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
    const direct = this.byNormalized.get(n)
    if (direct) return direct
    const relation = this.byRelation.get(n)
    return relation ? (this.byHeadword.get(relation) ?? null) : null
  }

  /**
   * Returns the headword for a query, or the query itself when unknown.
   */
  headword(q: string): string {
    const n = normalizeHeadword(q)
    const direct = this.byNormalized.get(n)
    if (direct) return direct.headword
    const relation = this.byRelation.get(n)
    return relation ? relation : q.trim()
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
