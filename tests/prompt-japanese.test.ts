import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT, buildUserPrompt, isValidResult, parseAiJson } from '../src/providers/common'

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

  it('declares the Japanese fields in the authoritative JSON schema', () => {
    expect(SYSTEM_PROMPT).toMatch(/"kana": string/)
    expect(SYSTEM_PROMPT).toMatch(/"romaji": string/)
    expect(SYSTEM_PROMPT).toMatch(/"exampleJa": string/)
  })

  it('accepts a Japanese-only AI result', () => {
    const result = parseAiJson(JSON.stringify({
      englishHeadword: 'Hello', kana: 'こんにちは', romaji: 'konnichiwa', exampleJa: 'こんにちは。',
    }))
    expect(isValidResult({ ...result, source: 'groq', requestId: 'r1', timestamp: 1, word: 'こんにちは', query: 'こんにちは' }, 'ja-en')).toBe(true)
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
