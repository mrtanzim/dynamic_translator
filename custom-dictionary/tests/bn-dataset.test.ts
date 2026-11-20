import { describe, expect, it } from 'vitest'
import {
  assertBengaliDataset,
  deserializeBengaliDataset,
  serializeBengaliDataset,
  BN_COLUMNS,
} from '../scripts/builders/bn-schema.ts'
import { BN_DATASET_VERSION } from '../src/bn-types.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function entry(overrides: Partial<BengaliEntry> = {}): BengaliEntry {
  return {
    bengali: 'বই', roman: 'boi', romanAlt: ['boi-alt'],
    en: 'book', enAlt: ['volume'],
    defBn: 'পড়ার বই', defEn: 'A written work', pos: 'noun',
    synEn: ['volume', 'publication'], antEn: ['digital'],
    exBn: 'আমি বই পড়ি।', exEn: 'I read a book.',
    pron: '/bʊk/', usage: 'Everyday word',
    ...overrides,
  }
}

describe('Bengali dataset schema', () => {
  it('serializes to equal-length, sorted columns and round-trips', () => {
    const dataset = serializeBengaliDataset([entry(), entry({ bengali: 'পানি', en: 'water' })])
    expect(dataset.v).toBe(BN_DATASET_VERSION)
    const lengths = BN_COLUMNS.map((c) => dataset[c].length)
    expect(new Set(lengths).size).toBe(1)
    expect(dataset.headwords[0]).toBe('পানি') // sorted
    expect(deserializeBengaliDataset(dataset)[0]?.en).toBe('water')
  })

  it('joins and splits multi-valued columns with U+0001', () => {
    const dataset = serializeBengaliDataset([entry()])
    expect(dataset.synEn[0]).toBe('volume\u0001publication')
    expect(deserializeBengaliDataset(dataset)[0]?.synEn).toEqual(['volume', 'publication'])
  })

  it('rejects a mismatched version', () => {
    const dataset = serializeBengaliDataset([entry()]) as Record<string, unknown>
    dataset['v'] = 999
    expect(() => assertBengaliDataset(dataset)).toThrow(/version/i)
  })

  it('rejects a short column', () => {
    const dataset = serializeBengaliDataset([entry()]) as Record<string, unknown>
    dataset['synEn'] = []
    expect(() => assertBengaliDataset(dataset)).toThrow(/wrong length/i)
  })
})
