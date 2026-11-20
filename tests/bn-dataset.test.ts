import { describe, expect, it } from 'vitest'
import { BanglaDictionary, toOfflineEntryPayload } from '../src/providers/offline/bn-dataset'
import type { BengaliDataset } from '../src/providers/offline/bn-dataset'

const dataset: BengaliDataset = {
  v: 1,
  headwords: ['বই'], roman: ['boi'], romanAlt: [''], en: ['book'], enAlt: ['volume'],
  defBn: ['পড়ার বই'], defEn: ['A written work'], pos: ['noun'],
  synEn: ['volume\u0001text'], antEn: [''], exBn: ['আমি বই পড়ি।'],
  exEn: ['I read a book.'], pron: ['/bʊk/'], usage: ['Everyday word'],
}

describe('extension Bengali dataset', () => {
  it('looks up Bengali and maps to the offline payload', () => {
    const dict = new BanglaDictionary(dataset)
    const entry = dict.lookup('বই')
    expect(entry).not.toBeNull()
    const payload = toOfflineEntryPayload(entry!)
    expect(payload).toMatchObject({
      headword: 'book', bn: 'পড়ার বই', def: 'A written work',
      syn: ['volume', 'text'], exBn: 'আমি বই পড়ি।', ex: 'I read a book.',
      trans: 'boi', usageNote: 'Everyday word',
    })
  })

  it('matches a Banglish spelling with or without spaces', () => {
    const spaced: BengaliDataset = {
      ...dataset,
      headwords: ['কি খবর'], roman: ['ki khobor'], romanAlt: [''], en: ['How are you?'],
      enAlt: [''], antEn: [''],
      defBn: [''], defEn: [''], pos: [''], synEn: [''], exBn: [''], exEn: [''], pron: [''], usage: [''],
    }
    const dict = new BanglaDictionary(spaced)
    expect(dict.lookup('ki khobor')?.en).toBe('How are you?')
    expect(dict.lookup('kikhobor')?.en).toBe('How are you?')
  })

  it('suggests the Bengali headword for romanized and Banglish input', () => {
    const spaced: BengaliDataset = {
      ...dataset,
      headwords: ['কি খবর'], roman: ['ki khobor'], romanAlt: [''], en: ['How are you?'],
      enAlt: [''], antEn: [''],
      defBn: [''], defEn: [''], pos: [''], synEn: [''], exBn: [''], exEn: [''], pron: [''], usage: [''],
    }
    const dict = new BanglaDictionary(spaced)
    const spacedHits = dict.suggestions('ki khobor', 5)
    expect(spacedHits[0]).toMatchObject({ word: 'কি খবর', headword: 'How are you?', bengali: true })
    const joinedHits = dict.suggestions('kikhobor', 5)
    expect(joinedHits[0]).toMatchObject({ word: 'কি খবর', headword: 'How are you?' })
  })

  it('rejects a wrong version', () => {
    expect(() => new BanglaDictionary({ ...dataset, v: 4 })).toThrow(/version/i)
  })
})
