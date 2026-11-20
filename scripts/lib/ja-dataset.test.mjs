import { describe, expect, it } from 'vitest'
import { toRomaji } from './ja-romaji.mjs'
import { JA_DATASET_VERSION, serializeJapaneseDataset } from './ja-schema.mjs'

const entry = {
  surface: 'こんにちは', kana: 'こんにちは', romaji: 'konnichiwa',
  en: 'hello', enAlt: ['good afternoon'], pos: 'phrase',
  synEn: ['hi'], antEn: ['goodbye'], exampleJa: 'こんにちは。', exampleEn: 'Hello.',
  formalMeaning: 'hello', conversationalMeaning: 'hi',
  exampleFormal: 'こんにちは。', exampleConversational: 'やあ。',
  collocations: [], wordFamily: '', bandLevel: '5.5', commonMistake: '',
}

describe('Japanese dataset', () => {
  it('romanizes common kana including small kana and sokuon', () => {
    expect(toRomaji('こんにちは')).toBe('konnichiwa')
    expect(toRomaji('きゃ')).toBe('kya')
    expect(toRomaji('がっこう')).toBe('gakkou')
  })

  it('romanizes katakana loanwords without leaving non-Latin characters', () => {
    expect(toRomaji('コーヒー')).toBe('koohii')
    expect(toRomaji('スーパー')).toBe('suupaa')
    expect(toRomaji('ヴィ')).toBe('vui')
    expect(toRomaji('カタ・カナ')).toBe('katakana')
  })

  it('serializes a version-1 columnar dataset with equal column lengths', () => {
    const d = serializeJapaneseDataset([entry])
    expect(d.v).toBe(JA_DATASET_VERSION)
    const lengths = Object.values(d).filter(Array.isArray).map((a) => a.length)
    expect(new Set(lengths).size).toBe(1)
    expect(d.headwords[0]).toBe('こんにちは')
  })
})
