import { describe, expect, it } from 'vitest'
import { parseAiJson } from '../src/providers/common'

describe('parseAiJson', () => {
  it('parses fenced ```json block', () => {
    const result = parseAiJson('```json\n{"bengaliMeaning":"x"}\n```')
    expect(result?.bengaliMeaning).toBe('x')
  })

  it('parses plain unfenced JSON object', () => {
    const result = parseAiJson('{"englishDefinition":"y"}')
    expect(result?.englishDefinition).toBe('y')
  })

  it('parses the English headword of a Bengali query', () => {
    const result = parseAiJson('{"englishHeadword":"book","bengaliMeaning":"বই"}')
    expect(result?.headword).toBe('book')
  })

  it('returns synonyms as string array', () => {
    const result = parseAiJson('{"synonyms":["a","b"]}')
    expect(result?.synonyms).toEqual(['a', 'b'])
  })

  it('filters non-string elements from synonyms array', () => {
    const result = parseAiJson('{"synonyms":["a",1,"b"]}')
    expect(result?.synonyms).toEqual(['a', 'b'])
  })

  it('returns null for input with no braces', () => {
    const result = parseAiJson('not json at all')
    expect(result).toBeNull()
  })

  it('returns null for broken JSON', () => {
    const result = parseAiJson('{broken:')
    expect(result).toBeNull()
  })

  it('handles nested braces in string values', () => {
    const result = parseAiJson('{"exampleEn":"a {b} c","bengaliMeaning":"x"}')
    expect(result?.exampleEn).toBe('a {b} c')
    expect(result?.bengaliMeaning).toBe('x')
  })

  it('returns undefined for empty string fields (str() helper)', () => {
    const result = parseAiJson('{"bengaliMeaning":""}')
    expect(result?.bengaliMeaning).toBeUndefined()
  })

  it('parses the transcription and the pronunciation', () => {
    const result = parseAiJson('{"transcription":"কুকুম্বার","pronunciation":"/kʌmˈbʌmbər/"}')
    expect(result?.transcription).toBe('কুকুম্বার')
    expect(result?.pronunciation).toBe('/kʌmˈbʌmbər/')
  })

  it('ignores a transcription that is not a string', () => {
    const result = parseAiJson('{"transcription":42}')
    expect(result?.transcription).toBeUndefined()
  })

  it('parses IELTS fields: bandLevel, collocations, wordFamily, and commonMistake', () => {
    const raw = JSON.stringify({
      bandLevel: '7.5',
      collocations: ['reluctant to admit', 'deeply reluctant'],
      wordFamily: {
        noun: 'reluctance',
        adj: 'reluctant',
        adv: 'reluctantly',
      },
      commonMistake: 'Followed by to-infinitive, not of.',
    })
    const result = parseAiJson(raw)
    expect(result?.bandLevel).toBe('7.5')
    expect(result?.collocations).toEqual(['reluctant to admit', 'deeply reluctant'])
    expect(result?.wordFamily).toEqual({
      noun: 'reluctance',
      verb: undefined,
      adj: 'reluctant',
      adv: 'reluctantly',
    })
    expect(result?.commonMistake).toBe('Followed by to-infinitive, not of.')
  })
})
