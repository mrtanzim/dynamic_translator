// Pure lookup coordinator for Bengali-first results.
import { BanglaDictionary } from './bn-indexer'
import type { LookupResult } from './types'

/** Decodes the `wordFamily` column into its four optional roles. */
function decodeFamily(value: string): LookupResult['wordFamily'] | undefined {
  if (!value) return undefined
  const out: NonNullable<LookupResult['wordFamily']> = {}
  for (const part of value.split('\u0001')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const role = part.slice(0, i)
    if (role === 'noun' || role === 'verb' || role === 'adj' || role === 'adv') {
      out[role] = part.slice(i + 1)
    }
  }
  return Object.keys(out).length ? out : undefined
}

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
      formalMeaning: hit.formalMeaning || undefined,
      conversationalMeaning: hit.conversationalMeaning || undefined,
      exampleFormal: hit.exampleFormal || undefined,
      exampleConversational: hit.exampleConversational || undefined,
      collocations: hit.collocations.length ? hit.collocations : undefined,
      wordFamily: decodeFamily(hit.wordFamily),
      bandLevel: hit.bandLevel || undefined,
      commonMistake: hit.commonMistake || undefined,
      source: 'offline',
      requestId: '',
      timestamp: Date.now(),
    }
  }
}
