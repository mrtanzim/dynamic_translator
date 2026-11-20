import { describe, expect, it } from 'vitest'
import dataset from '../src/dictionary/generated.json'
import { DATASET_VERSION } from '../src/providers/offline/dataset'

const NEW_COLUMNS = [
  'formalMeaning', 'conversationalMeaning', 'exampleFormal', 'exampleConversational',
  'collocations', 'wordFamily', 'bandLevel', 'commonMistake',
] as const

describe('English-first enriched dataset', () => {
  it('is version 5 with equal-length new columns', () => {
    expect(dataset.v).toBe(DATASET_VERSION)
    expect(DATASET_VERSION).toBe(5)
    for (const column of NEW_COLUMNS) {
      expect((dataset as unknown as Record<string, unknown[]>)[column]?.length).toBe(dataset.headwords.length)
    }
  })

  it('populates band level and word family for a curated word', () => {
    const i = dataset.headwords.indexOf('reluctant')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(dataset.bandLevel[i]).toBeTruthy()
    expect(dataset.wordFamily[i]).toContain('noun:')
  })
})
