import { describe, expect, it } from 'vitest'
import {
  decodeWordFamily, encodeWordFamily, deriveWordFamily, deriveCollocations,
  estimateBand, deriveCommonMistake, enrichEntry,
} from '../scripts/lib/enrichment.mjs'

const senses = new Map([
  ['reluctant', [{ pos: 'adj', offset: '1' }]],
  ['reluctance', [{ pos: 'noun', offset: '2' }]],
  ['reluctantly', [{ pos: 'adv', offset: '3' }]],
])

describe('enrichment', () => {
  it('derives word-family forms only when WordNet knows them', () => {
    expect(deriveWordFamily('reluctant', 'adj', senses)).toEqual({
      noun: 'reluctance', adv: 'reluctantly',
    })
    expect(deriveWordFamily('unknown', 'adj', senses)).toEqual({})
  })

  it('round-trips the word-family encoding', () => {
    const encoded = encodeWordFamily({ noun: 'reluctance', adv: 'reluctantly' })
    expect(encoded).toBe('noun:reluctance\u0001adv:reluctantly')
    expect(decodeWordFamily(encoded)).toEqual({ noun: 'reluctance', adv: 'reluctantly' })
  })

  it('extracts a collocation containing the headword from an example', () => {
    const phrases = deriveCollocations('reluctant', ['She was reluctant to admit the mistake.'])
    expect(phrases).toContain('reluctant to admit')
  })

  it('returns empty collocations when no example mentions the word', () => {
    expect(deriveCollocations('reluctant', ['The weather was cold.'])).toEqual([])
  })

  it('uses the licensed band list before the heuristic', () => {
    expect(estimateBand('reluctant', new Map([['reluctant', '7.5']]), senses)).toBe('7.5')
    expect(estimateBand('unlisted', new Map(), senses)).toBe('5.5')
  })

  it('emits a mistake note only when the word is directly followed by a preposition', () => {
    expect(deriveCommonMistake('reluctant', ['reluctant to admit'])).toMatch(/reluctant to/)
    expect(deriveCommonMistake('reluctant', ['a reluctant student'])).toBe('')
  })

  it('lets curated overrides win and fills derived fields', () => {
    const result = enrichEntry(
      { def: 'unwilling', ex: 'She was reluctant.' },
      {
        word: 'reluctant', pos: 'adj', senses,
        examples: ['She was reluctant to admit the mistake.'],
        bandList: new Map(),
        overrides: { bandLevel: '8.0', collocations: ['reluctant to go'], commonMistake: 'Use "to", not "of".' },
      },
    )
    expect(result.bandLevel).toBe('8.0')
    expect(result.collocations).toEqual(['reluctant to go'])
    expect(result.commonMistake).toBe('Use "to", not "of".')
    expect(result.formalMeaning).toBe('unwilling')
    expect(result.conversationalMeaning).toBe('unwilling')
  })
})
