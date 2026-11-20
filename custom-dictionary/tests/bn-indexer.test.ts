import { describe, expect, it } from 'vitest'
import { BanglaDictionary } from '../src/bn-indexer.ts'
import { serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function dict(entries: BengaliEntry[]): BanglaDictionary {
  return new BanglaDictionary(serializeBengaliDataset(entries))
}

function entry(overrides: Partial<BengaliEntry> = {}): BengaliEntry {
  return {
    bengali: 'বই', roman: 'boi', romanAlt: ['boi-alt'], en: 'book', enAlt: ['volume'],
    defBn: '', defEn: 'A written work', pos: 'noun', synEn: ['volume'],
    antEn: [], exBn: '', exEn: '', pron: '', usage: '', ...overrides,
  }
}

describe('BanglaDictionary', () => {
  it('looks up a Bengali spelling and returns its English equivalent', () => {
    const d = dict([entry()])
    expect(d.lookupBengali('বই')?.en).toBe('book')
    expect(d.lookup('বই')?.synEn).toContain('volume')
  })

  it('resolves NFC-equivalent Bengali spellings', () => {
    const d = dict([entry({ bengali: 'য়' })])
    const decomposed = 'য়'.normalize('NFD')
    expect(d.lookupBengali(decomposed)?.bengali).toBe('য়')
  })

  it('resolves a romanized spelling and returns null for an unknown one', () => {
    const d = dict([entry({ bengali: 'খবর', roman: 'khobor', en: 'news' })])
    expect(d.lookupRoman('khobor')?.entry.en).toBe('news')
    expect(d.lookup('khobor')?.en).toBe('news')
    expect(d.lookup('অজানা')).toBeNull()
  })

  it('matches Banglish phonetic variants ("ki khobor" -> "kikhobor")', () => {
    const d = dict([entry({ bengali: 'কি খবর', roman: 'ki khobor', en: 'How are you?' })])
    expect(d.lookup('kikhobor')?.en).toBe('How are you?')
    expect(d.lookup('ki khobor')?.en).toBe('How are you?')
  })

  it('returns null for a missing word', () => {
    expect(dict([entry()]).lookup('অজানা')).toBeNull()
  })

  it('suggests Bengali words with the English equivalent as hint', () => {
    const d = dict([entry(), entry({ bengali: 'পানি', roman: 'pani', en: 'water' })])
    const s = d.suggestions('বই', 5)
    expect(s[0]?.word).toBe('বই')
    expect(s[0]?.headword).toBe('book')
    expect(s[0]?.hint).toBe('book')
    expect(s[0]?.bengali).toBe(true)
  })

  it('rejects a mismatched dataset version', () => {
    const dataset = serializeBengaliDataset([entry()]) as { v: number }
    dataset.v = 999
    expect(() => new BanglaDictionary(dataset)).toThrow(/version/i)
  })
})
