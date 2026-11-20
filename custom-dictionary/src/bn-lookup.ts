// Pure lookup coordinator for Bengali-first results.
import { BanglaDictionary } from './bn-indexer'
import type { LookupResult } from './types'

export class BanglaLookupCoordinator {
  constructor(private readonly dictionary: BanglaDictionary) {}

  /** Looks up a Bengali or Banglish query and returns a shared LookupResult. */
  lookup(query: string): LookupResult | null {
    const hit = this.dictionary.lookup(query)
    if (!hit) return null
    return {
      word: query,
      query,
      headword: hit.en,
      bengaliMeaning: hit.defBn || hit.bengali,
      englishDefinition: hit.defEn || undefined,
      transcription: hit.roman || undefined,
      pronunciation: hit.pron || undefined,
      synonyms: hit.synEn.length > 0 ? hit.synEn : undefined,
      antonyms: hit.antEn.length > 0 ? hit.antEn : undefined,
      exampleEn: hit.exEn || undefined,
      exampleBn: hit.exBn || undefined,
      partOfSpeech: hit.pos || undefined,
      usageNote: hit.usage || undefined,
      source: 'offline',
      requestId: '',
      timestamp: Date.now(),
    }
  }
}
