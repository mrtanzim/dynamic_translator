import { describe, expect, it } from 'vitest'
import { buildUserPrompt, parseAiJson } from '../src/providers/common'

describe('Japanese AI prompt', () => {
  it('asks for kana and romaji for ja→en', () => {
    const prompt = buildUserPrompt('こんにちは', 'ja-en')
    expect(prompt).toMatch(/kana/i)
    expect(prompt).toMatch(/romaji/i)
  })

  it('keeps the Bengali instruction for bn→en', () => {
    const prompt = buildUserPrompt('কি খবর', 'bn-en')
    expect(prompt).toMatch(/Bengali/i)
  })

  it('parses kana, romaji and exampleJa', () => {
    const parsed = parseAiJson(JSON.stringify({
      englishHeadword: 'Hello', kana: 'こんにちは', romaji: 'konnichiwa',
      exampleJa: 'こんにちは。', bengaliMeaning: '', partOfSpeech: 'greeting',
    }))
    expect(parsed?.kana).toBe('こんにちは')
    expect(parsed?.romaji).toBe('konnichiwa')
    expect(parsed?.exampleJa).toBe('こんにちは。')
  })
})
