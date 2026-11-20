import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('./jmdict-common-subset.json', import.meta.url))

describe('JMdict subset', () => {
  const data = JSON.parse(readFileSync(file, 'utf8'))

  it('contains at least 8,000 entries with kana and English glosses', () => {
    expect(data.words.length).toBeGreaterThanOrEqual(8000)
    const valid = data.words.filter((w) =>
      w.kana?.some((k) => k.common) &&
      w.sense?.some((s) => s.gloss?.some((g) => g.lang === 'eng' && g.text)),
    )
    expect(valid.length).toBeGreaterThanOrEqual(8000)
  })

  it('carries attribution metadata', () => {
    expect(data.source).toMatch(/JMdict/i)
    expect(data.license).toMatch(/EDRDG/i)
  })
})
