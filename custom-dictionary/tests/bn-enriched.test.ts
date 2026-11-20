import { describe, expect, it } from 'vitest'
import { BN_DATASET_VERSION } from '../src/bn-types.ts'
import { decodeWordFamily } from '../../scripts/lib/enrichment.mjs'
import { assertBengaliDataset, serializeBengaliDataset } from '../scripts/builders/bn-schema.ts'
import type { BengaliEntry } from '../src/bn-types.ts'

function base(): BengaliEntry {
  return {
    bengali: 'বই', roman: 'boi', romanAlt: [], en: 'book', enAlt: [],
    defBn: '', defEn: 'a written work', pos: 'noun', synEn: [], antEn: [],
    exBn: '', exEn: '', pron: '', usage: '',
    formalMeaning: 'a written work', conversationalMeaning: 'a book',
    exampleFormal: 'I read a book.', exampleConversational: 'I read books.',
    collocations: ['read a book'], wordFamily: 'noun:book',
    bandLevel: '5.5', commonMistake: '',
  }
}

describe('Bengali-first enriched dataset', () => {
  it('is version 2 and carries the new columns', () => {
    const dataset = serializeBengaliDataset([base()])
    expect(dataset.v).toBe(BN_DATASET_VERSION)
    expect(BN_DATASET_VERSION).toBe(2)
    expect(dataset.bandLevel[0]).toBe('5.5')
    expect(decodeWordFamily(dataset.wordFamily[0] ?? '')).toEqual({ noun: 'book' })
  })

  it('rejects a v1 dataset', () => {
    const dataset = serializeBengaliDataset([base()]) as Record<string, unknown>
    dataset.v = 1
    expect(() => assertBengaliDataset(dataset)).toThrow(/version/i)
  })
})
