import { describe, expect, it } from 'vitest'
import { applyBengaliOverrides, loadBengaliOverrides } from '../scripts/builders/bn-curated.ts'
import { invertEnglishDataset } from '../scripts/builders/bn-invert.ts'
import { assertBengaliDataset, serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import type { DictionaryDataset } from '../src/types.ts'

const dataset: DictionaryDataset = {
  v: 4,
  headwords: ['book', 'volume'],
  bn: ['বই', 'বই'], bnAlt: ['', ''],
  trans: ['boi', 'bholium'], transAlt: ['', ''],
  def: ['a written work', 'a quantity'], pos: ['noun', 'noun'],
  syn: ['volume\u0001text', ''], ant: ['', ''],
  ex: ['I read a book.', ''], exBn: ['', ''], pron: ['/bʊk/', ''],
}

describe('Bengali dataset build', () => {
  it('inverts a Bengali spelling into a Bengali-headword entry with English fields', () => {
    const entries = invertEnglishDataset(dataset)
    const book = entries.find((e) => e.bengali === 'বই')
    expect(book).toBeDefined()
    expect(book?.en).toBe('book')
    expect(book?.roman).toBe('boi')
    expect(book?.defEn).toBe('a written work')
    expect(book?.synEn).toContain('volume')
    expect(book?.exEn).toBe('I read a book.')
  })

  it('aggregates multiple English equivalents for the same Bengali spelling', () => {
    const book = invertEnglishDataset(dataset).find((e) => e.bengali === 'বই')
    expect(book?.enAlt).toContain('volume')
  })

  it('curated overrides win over derived values', () => {
    const overrides = new Map([['বই', { en: 'book (curated)', synEn: ['override'] }]])
    const entries = applyBengaliOverrides(invertEnglishDataset(dataset), overrides)
    const book = entries.find((e) => e.bengali === 'বই')
    expect(book?.en).toBe('book (curated)')
    expect(book?.synEn).toEqual(['override'])
  })

  it('idiom override sets the natural English primary answer and literal in enAlt', () => {
    const overrides = loadBengaliOverrides('data/bn')
    const idiom = overrides.get('কি খবর')
    expect(idiom?.en).toBe('How are you?')
    expect(idiom?.enAlt).toContain('What is the news?')
  })

  it('serializes to a valid dataset', () => {
    const built = serializeBengaliDataset(applyBengaliOverrides(invertEnglishDataset(dataset), new Map()))
    expect(() => assertBengaliDataset(built)).not.toThrow()
  })
})
