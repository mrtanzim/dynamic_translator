import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../../public/dictionary.ja.json', import.meta.url))
const dataset = JSON.parse(readFileSync(file, 'utf8'))

function findBy(column, value) {
  const i = dataset[column].indexOf(value)
  return i < 0 ? null : Object.fromEntries(Object.entries(dataset).map(([k, v]) => [k, Array.isArray(v) ? v[i] : v]))
}

describe('Japanese builder output', () => {
  it('applies curated overrides keyed by kana', () => {
    const entry = findBy('kana', 'こんにちは')
    expect(entry).not.toBeNull()
    expect(entry.en).toBe('Hello')
    expect(entry.exampleJa).toMatch(/お元気ですか/)
  })

  it('maps JMdict related references to English glosses', () => {
    const entry = findBy('kana', 'あそこ')
    expect(entry).not.toBeNull()
    expect(entry.synEn.length).toBeGreaterThan(0)
  })

  it('has no non-Latin romaji strings', () => {
    const bad = dataset.romaji.filter((r) => /[^\x00-\x7f]/.test(r))
    expect(bad.length).toBe(0)
  })
})
