// Tests for the build script output (scripts/build-dict.ts).
//
// Tests cover:
//   * Output artifact exists (public/dictionary.json.gz)
//   * Dataset version is correct
//   * Column lengths all match headwords length
//   * Curated entries override generated data
//   * No empty headwords
//   * Gzip round-trip produces identical data to JSON output

import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDataset, DATASET_VERSION as _DATASET_VERSION } from '../scripts/builders/columnar.ts'
import type { DictionaryDataset } from '../scripts/builders/columnar.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const GZ_PATH  = path.join(root, 'public', 'dictionary.json.gz')
const JSON_PATH = path.join(root, 'public', 'dictionary.json')

describe('build script output', () => {
  let dataset: DictionaryDataset

  beforeAll(() => {
    // The build must have been run before tests.
    const raw = fs.readFileSync(GZ_PATH)
    const decompressed = zlib.gunzipSync(raw)
    dataset = JSON.parse(new TextDecoder().decode(decompressed)) as DictionaryDataset
  })

  it('artifact exists at public/dictionary.json.gz', () => {
    expect(fs.existsSync(GZ_PATH)).toBe(true)
  })

  it('has correct dataset version', () => {
    expect(dataset.v).toBe(5)
  })

  it('all columns have the same length', () => {
    expect(validateDataset(dataset)).toBe(true)
  })

  it('has at least 6600 entries', () => {
    expect(dataset.headwords.length).toBeGreaterThanOrEqual(6600)
  })

  it('no empty headwords', () => {
    const empty = dataset.headwords.filter((h) => !h.trim())
    expect(empty).toHaveLength(0)
  })

  it('headwords are sorted alphabetically', () => {
    for (let i = 1; i < dataset.headwords.length; i++) {
      expect(dataset.headwords[i]!.localeCompare(dataset.headwords[i - 1]!)).toBeGreaterThan(0)
    }
  })

  it('curated entry "friend" has correct Bengali meaning', () => {
    const idx = dataset.headwords.indexOf('friend')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(dataset.bn[idx]).toBe('বন্ধু')
  })

  it('curated entry "sad" has corrected Bengali meaning (not খুশি নয়)', () => {
    const idx = dataset.headwords.indexOf('sad')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(dataset.bn[idx]).toBe('দুঃখিত')
    expect(dataset.bn[idx]).not.toBe('খুশি নয়')
  })

  it('curated entry "warm" has correct Bengali meaning (not গরম)', () => {
    const idx = dataset.headwords.indexOf('warm')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(dataset.bn[idx]).toBe('উষ্ণ')
  })

  it('curated entry "learn" has base form Bengali (not oblique)', () => {
    const idx = dataset.headwords.indexOf('learn')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(dataset.bn[idx]).toBe('শেখা')
    expect(dataset.bn[idx]).not.toBe('শিখতে')
  })

  it('curated entry "hero" exists (anime vocabulary)', () => {
    const idx = dataset.headwords.indexOf('hero')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(dataset.bn[idx]).toBe('নায়ক')
  })

  it('most entries have a Bengali meaning', () => {
    const withBn = dataset.bn.filter((bn) => bn.trim().length > 0).length
    expect(withBn / dataset.headwords.length).toBeGreaterThan(0.95)
  })

  it('over 50% of entries have synonyms', () => {
    const withSyn = dataset.syn.filter((s) => s.trim().length > 0).length
    expect(withSyn / dataset.headwords.length).toBeGreaterThan(0.50)
  })

  it('over 15% of entries have antonyms', () => {
    const withAnt = dataset.ant.filter((a) => a.trim().length > 0).length
    expect(withAnt / dataset.headwords.length).toBeGreaterThan(0.15)
  })

  it('over 75% of entries have IPA pronunciation', () => {
    const withPron = dataset.pron.filter((p) => p.trim().length > 0).length
    expect(withPron / dataset.headwords.length).toBeGreaterThan(0.75)
  })

  it('gzip round-trip matches JSON output', () => {
    const jsonContent = fs.readFileSync(JSON_PATH, 'utf8')
    const gzContent   = zlib.gunzipSync(fs.readFileSync(GZ_PATH))
    // Both must parse to the same data
    const fromJson = JSON.parse(jsonContent) as DictionaryDataset
    const fromGz   = JSON.parse(new TextDecoder().decode(gzContent)) as DictionaryDataset
    expect(fromJson.v).toBe(fromGz.v)
    expect(fromJson.headwords.length).toBe(fromGz.headwords.length)
    expect(fromJson.headwords[0]).toBe(fromGz.headwords[0])
    expect(fromJson.headwords.at(-1)).toBe(fromGz.headwords.at(-1))
  })
})
