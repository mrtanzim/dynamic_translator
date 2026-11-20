// Artifact-level assertions: the rich fields must actually contain data.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function load(name: string): Record<string, string[]> {
  const gz = fs.readFileSync(path.join(root, 'public', name))
  return JSON.parse(new TextDecoder().decode(zlib.gunzipSync(gz))) as Record<string, string[]>
}

describe('enriched artifacts contain real data', () => {
  it('the English dataset has non-empty collocations and formal examples', () => {
    const d = load('dictionary.json.gz')
    expect(d.collocations.filter(Boolean).length).toBeGreaterThan(100)
    expect(d.exampleFormal.filter(Boolean).length).toBeGreaterThan(100)
  })

  it('the curated-only headword "reluctant" is fully enriched', () => {
    const d = load('dictionary.json.gz')
    const i = d.headwords.indexOf('reluctant')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(d.bandLevel[i]).toBeTruthy()
    expect(d.collocations[i]).toBeTruthy()
    expect(d.wordFamily[i]).toBeTruthy()
    expect(d.commonMistake[i]).toBeTruthy()
    expect(d.exampleFormal[i]).toBeTruthy()
    expect(d.exampleConversational[i]).toBeTruthy()
  })

  it('the Bengali-first dataset carries collocations and formal examples', () => {
    const d = load('dictionary.bn.json.gz')
    expect(d.collocations.filter(Boolean).length).toBeGreaterThan(100)
    expect(d.exampleFormal.filter(Boolean).length).toBeGreaterThan(100)
  })
})
