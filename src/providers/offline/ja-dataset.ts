// Extension-side runtime for the Japanese offline dataset.
/** Japanese dataset version. */
export const JA_DATASET_VERSION = 1

/** Columnar Japanese dataset. */
export interface JaDataset {
  v: number
  headwords: string[]
  kana: string[]
  romaji: string[]
  en: string[]
  enAlt: string[]
  pos: string[]
  synEn: string[]
  antEn: string[]
  exampleJa: string[]
  exampleEn: string[]
  formalMeaning: string[]
  conversationalMeaning: string[]
  exampleFormal: string[]
  exampleConversational: string[]
  collocations: string[]
  wordFamily: string[]
  bandLevel: string[]
  commonMistake: string[]
}

/** A single Japanese entry. */
export interface JaEntry {
  surface: string
  kana: string
  romaji: string
  en: string
  enAlt: string[]
  pos: string
  synEn: string[]
  antEn: string[]
  exampleJa: string
  exampleEn: string
  formalMeaning: string
  conversationalMeaning: string
  exampleFormal: string
  exampleConversational: string
  collocations: string[]
  wordFamily: string
  bandLevel: string
  commonMistake: string
}

/** True for Hiragana, Katakana, Kanji and the iteration mark. */
export function isJapanese(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3005]/.test(text)
}

/** Normalizes a lookup key: katakana folds to hiragana, then lowercases. */
function lower(s: string): string {
  return [...s.trim()]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= 0x30a1 && code <= 0x30f6
        ? String.fromCodePoint(code - 0x60)
        : ch
    })
    .join('')
    .toLowerCase()
}

/** Indexed read-only view over the Japanese dataset. */
export class JapaneseDictionary {
  private readonly byKey = new Map<string, JaEntry>()
  private readonly byEnglish = new Map<string, JaEntry>()

  constructor(dataset: JaDataset) {
    if (dataset.v !== JA_DATASET_VERSION) {
      throw new Error(`Japanese dataset version ${String(dataset.v)} !== ${JA_DATASET_VERSION}`)
    }
    const n = dataset.headwords.length
    const add = (key: string, entry: JaEntry) => {
      const k = lower(key)
      if (k && !this.byKey.has(k)) this.byKey.set(k, entry)
    }
    for (let i = 0; i < n; i++) {
      const entry: JaEntry = {
        surface: dataset.headwords[i] ?? '',
        kana: dataset.kana[i] ?? '',
        romaji: dataset.romaji[i] ?? '',
        en: dataset.en[i] ?? '',
        enAlt: (dataset.enAlt[i] ?? '').split('\u0001').filter(Boolean),
        pos: dataset.pos[i] ?? '',
        synEn: (dataset.synEn[i] ?? '').split('\u0001').filter(Boolean),
        antEn: (dataset.antEn[i] ?? '').split('\u0001').filter(Boolean),
        exampleJa: dataset.exampleJa[i] ?? '',
        exampleEn: dataset.exampleEn[i] ?? '',
        formalMeaning: dataset.formalMeaning[i] ?? '',
        conversationalMeaning: dataset.conversationalMeaning[i] ?? '',
        exampleFormal: dataset.exampleFormal[i] ?? '',
        exampleConversational: dataset.exampleConversational[i] ?? '',
        collocations: (dataset.collocations[i] ?? '').split('\u0001').filter(Boolean),
        wordFamily: dataset.wordFamily[i] ?? '',
        bandLevel: dataset.bandLevel[i] ?? '',
        commonMistake: dataset.commonMistake[i] ?? '',
      }
      add(entry.surface, entry)
      add(entry.kana, entry)
      add(entry.romaji, entry)
      for (const en of [entry.en, ...entry.enAlt]) {
        const key = lower(en)
        if (key && !this.byEnglish.has(key)) this.byEnglish.set(key, entry)
      }
    }
  }

  /** Japanese script, kana or romaji lookup. */
  lookup(query: string): JaEntry | null {
    return this.byKey.get(lower(query)) ?? null
  }

  /** English → Japanese reverse lookup. */
  lookupEnglish(query: string): JaEntry | null {
    return this.byEnglish.get(lower(query)) ?? null
  }

  /** Prefix suggestions over Japanese surfaces, kana and romaji. */
  suggestions(query: string, limit = 8): Array<{ word: string; headword: string; japanese: boolean; hint: string }> {
    const q = lower(query)
    if (!q) return []
    const out: Array<{ word: string; headword: string; japanese: boolean; hint: string }> = []
    for (const [key, entry] of this.byKey) {
      if (key.startsWith(q) && out.length < limit && !out.some((s) => s.word === entry.surface)) {
        out.push({ word: entry.surface, headword: entry.en, japanese: true, hint: entry.en })
      }
    }
    return out
  }
}
