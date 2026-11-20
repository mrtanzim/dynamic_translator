import { describe, expect, it } from 'vitest'
import { JapaneseDictionary } from '../src/providers/offline/ja-dataset'
import type { JaDataset } from '../src/providers/offline/ja-dataset'

const dataset: JaDataset = {
  v: 1,
  headwords: ['こんにちは'], kana: ['こんにちは'], romaji: ['konnichiwa'],
  en: ['Hello'], enAlt: ['Hi'], pos: ['greeting'], synEn: ['Hi'], antEn: [''],
  exampleJa: ['こんにちは。'], exampleEn: ['Hello.'],
  formalMeaning: ['Hello'], conversationalMeaning: ['Hi'],
  exampleFormal: [''], exampleConversational: [''],
  collocations: [''], wordFamily: [''], bandLevel: ['5.5'], commonMistake: [''],
}

describe('JapaneseDictionary', () => {
  const d = new JapaneseDictionary(dataset)
  it('looks up Japanese script, kana and romaji', () => {
    expect(d.lookup('こんにちは')?.en).toBe('Hello')
    expect(d.lookup('コンニチハ')?.en).toBe('Hello')
    expect(d.lookup('konnichiwa')?.en).toBe('Hello')
  })
  it('looks up English back to Japanese', () => {
    expect(d.lookupEnglish('hello')?.surface).toBe('こんにちは')
  })
  it('rejects a wrong version', () => {
    expect(() => new JapaneseDictionary({ ...dataset, v: 4 })).toThrow(/version/i)
  })
})
