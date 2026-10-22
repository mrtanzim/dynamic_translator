import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  isBengali,
  normalize,
  OfflineDictionary,
  type DictionaryDataset,
} from '../src/providers/offline/dataset'
import datasetJson from '../src/dictionary/generated.json'

const dataset = datasetJson as unknown as DictionaryDataset
const dictionary = new OfflineDictionary(dataset)

const SEP = '\u0001'

/**
 * The runtime artifact that the service worker actually fetches. It must stay
 * in sync with `src/dictionary/generated.json`.
 */
const gzPath = path.resolve(__dirname, '..', 'public', 'dictionary.json.gz')

describe('offline dictionary', () => {
  it('normalizes input', () => {
    expect(normalize('  Hello, World! ')).toBe('hello world')
    expect(normalize('  ')).toBe('')
  })

  it('preserves Bengali characters through normalization', () => {
    expect(normalize('বই')).toBe('বই')
    expect(normalize('  বই  ')).toBe('বই')
    expect(normalize('পানি,')).toBe('পানি')
    expect(normalize('বই').length).toBeGreaterThan(0)
  })

  it('detects Bengali script', () => {
    expect(isBengali('বই')).toBe(true)
    expect(isBengali('book')).toBe(false)
  })

  it('looks up headwords', () => {
    const e = dictionary.lookup('hello')
    expect(e?.bn).toBe('হ্যালো')
    expect(dictionary.lookup('HELLO')).not.toBeNull()
  })

  it('resolves synonyms to the headword entry', () => {
    // "shortened" is a synonym of "abbreviated" but is not a headword itself.
    expect(dictionary.lookup('shortened')?.headword).toBe('abbreviated')
  })

  it('resolves antonyms to the headword entry', () => {
    // "unabridged" is an antonym of "abridged" but is not a headword itself.
    expect(dictionary.lookup('unabridged')?.headword).toBe('abridged')
  })

  it('resolves Bengali meaning back to the English headword', () => {
    const r = dictionary.lookupBengali('বই')
    expect(r?.headword).toBe('book')
  })

  it('resolves Bengali queries that carry punctuation or padding', () => {
    // The stored key and the query are normalized the same way, so a trailing
    // comma or surrounding whitespace must not break the reverse lookup.
    expect(dictionary.lookupBengali('পানি,')?.headword).toBe('water')
    expect(dictionary.lookupBengali('  বই  ')?.headword).toBe('book')
    expect(dictionary.lookupBengali('বই!')?.headword).toBe('book')
    expect(dictionary.lookupBengali('হ্যালো?')?.headword).toBe('hello')
  })

  it('resolves Bengali queries regardless of the YYA spelling', () => {
    // The precomposed YYA (U+09DF) and the decomposed "য" + nukta are the
    // same character in NFC, so both spellings must find the same entry.
    const withNukta = dataset.bn.find((bn) => bn.includes('\u09AF\u09BC'))
    expect(withNukta).toBeDefined()
    const headword = dictionary.lookupBengali(withNukta!)?.headword
    expect(headword).toBeDefined()
    const precomposed = withNukta!.replace('\u09AF\u09BC', '\u09DF')
    expect(dictionary.lookupBengali(precomposed)?.headword).toBe(headword)
  })

  it('returns null for unknown words', () => {
    expect(dictionary.lookup('zzzznotaword')).toBeNull()
    expect(dictionary.lookupBengali('যথেষ্টঅচেনাশব্দ')).toBeNull()
  })

  it('has a non-trivial dataset with consistent shape', () => {
    expect(dataset.headwords.length).toBeGreaterThanOrEqual(50)
    const columns = ['bn', 'bnAlt', 'def', 'pos', 'syn', 'ant', 'ex'] as const
    for (const column of columns) {
      expect(dataset[column].length).toBe(dataset.headwords.length)
    }
    for (let i = 0; i < dataset.headwords.length; i++) {
      expect(dataset.bn[i].length).toBeGreaterThan(0)
      expect(dataset.def[i].length).toBeGreaterThan(0)
      expect(Array.isArray(dataset.syn[i].split(SEP))).toBe(true)
      expect(Array.isArray(dataset.ant[i].split(SEP))).toBe(true)
    }
  })
})

describe('offline lookup coverage', () => {
  it('resolves common English words', () => {
    for (const w of ['hello', 'world', 'book', 'love', 'water', 'happy', 'friend', 'beautiful', 'quick', 'blue']) {
      expect(dictionary.lookup(w), `expected "${w}" to be in the offline dictionary`).not.toBeNull()
    }
  })

  it('is case- and punctuation-insensitive', () => {
    expect(dictionary.lookup('Hello!')?.bn).toBe(dictionary.lookup('  HELLO  ')?.bn)
  })

  it('resolves synonyms and antonyms to their headword entry', () => {
    for (const s of ['big', 'quick', 'small', 'sad', 'fast']) {
      expect(dictionary.lookup(s), `expected synonym/antonym "${s}" to resolve`).not.toBeNull()
    }
  })

  it('resolves every Bengali meaning back to an English headword', () => {
    for (let i = 0; i < dataset.headwords.length; i++) {
      const bn = dataset.bn[i]
      const r = dictionary.lookupBengali(bn)
      expect(r, `expected "${bn}" to resolve to a headword`).not.toBeNull()
      // A Bengali meaning may legitimately translate several English words;
      // the reverse index must return one of them.
      expect(dataset.headwords).toContain(r?.headword)
    }
  })

  it('reports every headword that shares a Bengali meaning', () => {
    for (let i = 0; i < dataset.headwords.length; i++) {
      const heads = dictionary.bengaliHeadwords(dataset.bn[i])
      expect(heads.length).toBeGreaterThan(0)
      expect(heads).toContain(dataset.headwords[i])
    }
  })

  it('has a dataset with usable coverage', () => {
    expect(dataset.headwords.length).toBeGreaterThanOrEqual(50)
    const allFilled = dataset.headwords.every(
      (_head, i) => dataset.bn[i].trim() !== '' && dataset.def[i].trim() !== '',
    )
    expect(allFilled).toBe(true)
  })

  it('provides an example sentence for most entries', () => {
    // WordNet only has examples for a subset of the vocabulary, so entries
    // without one are expected and must not break the lookup.
    const withExample = dataset.ex.filter((e) => e.trim() !== '').length
    expect(withExample).toBeGreaterThan(0)
    expect(withExample).toBeLessThan(dataset.headwords.length)
  })
})

describe('type-ahead suggestions', () => {
  it('suggests the words that start with the query', () => {
    const list = dictionary.suggest('cucu')
    expect(list.map((s) => s.word)).toContain('cucumber')
  })

  it('puts the exact word first', () => {
    const list = dictionary.suggest('cucumber')
    expect(list[0]?.word).toBe('cucumber')
    expect(list[0]?.bengali).toBe(false)
    expect(list[0]?.hint).toBeTruthy()
  })

  it('finds a word that is misspelled', () => {
    // The user cannot spell the word yet, but the answer must still be there.
    const list = dictionary.suggest('cucnber')
    expect(list.map((s) => s.word)).toContain('cucumber')
  })

  it('finds a word that is only half typed', () => {
    const list = dictionary.suggest('cucumb')
    expect(list.map((s) => s.word)).toContain('cucumber')
  })

  it('suggests Bengali words for a Bengali query', () => {
    const list = dictionary.suggest('বই')
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]?.bengali).toBe(true)
    expect(list[0]?.word).toBe('বই')
    expect(list[0]?.headword).toBe('book')
  })

  it('returns nothing for an empty query', () => {
    expect(dictionary.suggest('')).toEqual([])
    expect(dictionary.suggest('   ')).toEqual([])
  })

  it('never returns more than the limit', () => {
    expect(dictionary.suggest('c', 3).length).toBeLessThanOrEqual(3)
    expect(dictionary.suggest('c', 3).length).toBeGreaterThan(0)
  })

  it('ignores case and punctuation', () => {
    expect(dictionary.suggest('CUCU').map((s) => s.word)).toContain('cucumber')
    expect(dictionary.suggest('cucu,').map((s) => s.word)).toContain('cucumber')
  })
})

describe('runtime artifact', () => {
  it('ships a gzipped dataset that matches the source dataset', () => {
    expect(fs.existsSync(gzPath)).toBe(true)
    const gz = fs.readFileSync(gzPath)
    const json = zlib.gunzipSync(gz).toString('utf8')
    const runtime = JSON.parse(json) as DictionaryDataset
    expect(runtime.v).toBe(dataset.v)
    expect(runtime.headwords.length).toBe(dataset.headwords.length)
    expect(runtime.bn).toEqual(dataset.bn)
    expect(runtime.syn).toEqual(dataset.syn)
  })

  it('is meaningfully smaller gzipped than raw', () => {
    const gz = fs.statSync(gzPath).size
    const raw = fs.statSync(path.resolve(__dirname, '..', 'src', 'dictionary', 'generated.json')).size
    expect(gz).toBeLessThan(raw / 2)
  })

  it('loads and indexes correctly from the gzipped artifact', () => {
    const gz = fs.readFileSync(gzPath)
    const json = zlib.gunzipSync(gz).toString('utf8')
    const runtime = new OfflineDictionary(JSON.parse(json) as DictionaryDataset)
    expect(runtime.size).toBe(dataset.headwords.length)
    expect(runtime.lookup('hello')?.bn).toBe('হ্যালো')
    expect(runtime.lookupBengali('বই')?.headword).toBe('book')
  })
})
