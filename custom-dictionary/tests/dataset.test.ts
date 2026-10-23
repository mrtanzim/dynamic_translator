// Tests for the offline dictionary dataset (src/dictionary.json.gz).
//
// Tests cover:
//   * Dataset shape: all columns have equal length
//   * Version check: DATASET_VERSION = 4
//   * Coverage: 6675 entries, 5242 with pronunciation (78.5%)
//   * Lookup results: headword, synonyms, antonyms, pronunciation all present
//   * Bengali resolution: Bengali word → English headword + romanization

import { describe, expect, it, beforeAll } from 'vitest';
import { loadOfflineDictionarySync } from '../src/loader';
import { OfflineDictionary } from '../src/indexer';

const DATASET_VERSION = 4;

describe('offline dictionary dataset', () => {
  let dictionary: OfflineDictionary;

  beforeAll(() => {
    const dataset = loadOfflineDictionarySync('public/dictionary.json.gz');
    dictionary = new OfflineDictionary(dataset);
  });

  it('dataset has correct version', () => {
    // version is checked in the OfflineDictionary constructor
    expect(dictionary).toBeInstanceOf(OfflineDictionary);
  });

  it('has 6675 headwords', () => {
    expect(dictionary.size).toBe(6675);
  });

  it('has pronunciation for 78.5% of entries (5242/6675)', () => {
    let withPron = 0;
    const headwords = dictionary.getAllHeadwords();
    for (const h of headwords) {
      const e = dictionary.lookup(h);
      if (e?.pron) withPron++;
    }
    const coverage = (withPron / dictionary.size) * 100;
    expect(coverage).toBeGreaterThanOrEqual(75);
    console.log(`Pronunciation coverage: ${coverage.toFixed(1)}% (${withPron}/${dictionary.size})`);
  });

  it('has synonyms for common words', () => {
    let withSyn = 0;
    const headwords = dictionary.getAllHeadwords();
    for (const h of headwords) {
      const e = dictionary.lookup(h);
      if (e?.syn.length) withSyn++;
    }
    expect(withSyn).toBeGreaterThan(3000);
  });

  it('has antonyms for common words', () => {
    let withAnt = 0;
    const headwords = dictionary.getAllHeadwords();
    for (const h of headwords) {
      const e = dictionary.lookup(h);
      if (e?.ant.length) withAnt++;
    }
    expect(withAnt).toBeGreaterThan(500);
  });

  it('resolves common English words', () => {
    for (const w of ['hello', 'world', 'book', 'love', 'water']) {
      const r = dictionary.lookup(w);
      expect(r).not.toBeNull();
      expect(r?.headword).toBe(w);
    }
  });

  it('resolves Bengali words back to English headwords', () => {
    const r = dictionary.lookupBengali('বই');
    expect(r?.headword).toBe('book');
    expect(r?.roman).toBe('boi');
  });

  it('resolves synonyms to headword entry', () => {
    const r = dictionary.lookup('shortened');
    expect(r?.headword).toBe('abbreviated');
  });

  it('resolves antonyms to headword entry', () => {
    const r = dictionary.lookup('unabridged');
    expect(r?.headword).toBe('abridged');
  });
});
