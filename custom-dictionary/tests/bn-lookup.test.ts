import { describe, expect, it } from 'vitest'
import { serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import { BanglaDictionary } from '../src/bn-indexer.ts'
import { BanglaLookupCoordinator } from '../src/bn-lookup.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function coordinator(overrides: Partial<BengaliEntry> = {}): BanglaLookupCoordinator {
  const entry: BengaliEntry = {
    bengali: 'বই', roman: 'boi', romanAlt: [], en: 'book', enAlt: ['volume'],
    defBn: 'পড়ার বই', defEn: 'A written work', pos: 'noun',
    synEn: ['volume', 'text'], antEn: ['digital'],
    exBn: 'আমি বই পড়ি।', exEn: 'I read a book.', pron: '/bʊk/',
    usage: 'Everyday word', ...overrides,
  }
  return new BanglaLookupCoordinator(new BanglaDictionary(serializeBengaliDataset([entry])))
}

describe('BanglaLookupCoordinator', () => {
  it('maps every Bengali-first field to the shared result shape', () => {
    const result = coordinator().lookup('বই')
    expect(result).toMatchObject({
      word: 'বই', query: 'বই', headword: 'book',
      englishDefinition: 'A written work', bengaliMeaning: 'পড়ার বই',
      synonyms: ['volume', 'text'], antonyms: ['digital'],
      exampleEn: 'I read a book.', exampleBn: 'আমি বই পড়ি।',
      transcription: 'boi', pronunciation: '/bʊk/',
      partOfSpeech: 'noun', usageNote: 'Everyday word', source: 'offline',
    })
  })

  it('primary headword is the idiomatic English equivalent', () => {
    const result = coordinator({
      bengali: 'কি খবর', roman: 'ki khobor', en: 'How are you?',
      enAlt: ['What is the news?'], defBn: '', defEn: 'A casual greeting',
      synEn: [], antEn: [], exBn: '', exEn: '', pron: '', usage: '',
    }).lookup('ki khobor')
    expect(result?.headword).toBe('How are you?')
    expect(result?.bengaliMeaning).toBe('কি খবর')
  })

  it('returns null for a missing word', () => {
    expect(coordinator().lookup('অজানা')).toBeNull()
  })
})
