// Tests for the type-ahead suggestion engine (src/suggest.ts).
//
// Tests cover:
//   * Exact dictionary word match
//   * Prefix matching ("cucu" → "cucumber")
//   * Typo/fuzzy tolerance ("cucnber" → "cucumber")
//   * Empty query returns empty list
//   * Limit enforcement
//   * Bengali suggestions
//   * Bengali transliteration suggestions

import { describe, expect, it } from 'vitest';
import { OfflineDictionary } from '../src/indexer';
import { suggestWords } from '../src/suggest';

/**
 * Builds an OfflineDictionary from a minimal dataset for testing.
 */
function buildDictionary(entries: Array<{
  headword: string;
  bn: string;
  bnAlts: string[];
  trans: string;
  transAlts: string[];
  def: string;
  pos: string;
  syn: string[];
  ant: string[];
  ex: string;
  pron: string;
}>): OfflineDictionary {
  const dataset = {
    v: 4,
    headwords: entries.map((e) => e.headword),
    bn: entries.map((e) => e.bn),
    bnAlt: entries.map((e) => e.bnAlts.join('\u0001')),
    trans: entries.map((e) => e.trans),
    transAlt: entries.map((e) => e.transAlts.join('\u0001')),
    def: entries.map((e) => e.def),
    pos: entries.map((e) => e.pos),
    syn: entries.map((e) => e.syn.join('\u0001')),
    ant: entries.map((e) => e.ant.join('\u0001')),
    ex: entries.map((e) => e.ex),
    pron: entries.map((e) => e.pron),
  };
  return new OfflineDictionary(dataset);
}

const entries = [
  {
    headword: 'cucumber',
    bn: 'শসা',
    bnAlts: [],
    trans: 'shosha',
    transAlts: [],
    def: 'A creeping vine plant...',
    pos: 'noun',
    syn: ['gourd', 'melon'],
    ant: [],
    ex: '',
    pron: '/ˈkjuːkʌmbər/',
  },
  {
    headword: 'book',
    bn: 'বই',
    bnAlts: [],
    trans: 'boi',
    transAlts: [],
    def: 'A written or printed work...',
    pos: 'noun',
    syn: ['volume', 'publication'],
    ant: [],
    ex: '',
    pron: '/bʊk/',
  },
  {
    headword: 'apple',
    bn: 'আপেল',
    bnAlts: [],
    trans: 'apel',
    transAlts: [],
    def: 'A round fruit...',
    pos: 'noun',
    syn: ['fruit'],
    ant: [],
    ex: '',
    pron: '/ˈæpəl/',
  },
];

const dictionary = buildDictionary(entries);

describe('type-ahead suggestions', () => {
  it('suggests exact dictionary word', () => {
    const list = suggestWords(dictionary, 'cucumber', 8);
    expect(list.suggestions[0]?.word).toBe('cucumber');
  });

  it('suggests prefix matches', () => {
    const list = suggestWords(dictionary, 'cucu', 8);
    expect(list.suggestions.map((s) => s.word)).toContain('cucumber');
  });

  it('finds misspelled word (typo tolerance)', () => {
    const list = suggestWords(dictionary, 'cucnber', 8);
    expect(list.suggestions.map((s) => s.word)).toContain('cucumber');
  });

  it('returns empty list for empty query', () => {
    const list = suggestWords(dictionary, '', 8);
    expect(list.suggestions).toEqual([]);
  });

  it('respects limit', () => {
    const list = suggestWords(dictionary, 'a', 1);
    expect(list.suggestions.length).toBeLessThanOrEqual(1);
  });

  it('includes Bengali translations as hints', () => {
    const list = suggestWords(dictionary, 'cucumber', 1);
    expect(list.suggestions[0]?.hint).toBe('শসা');
  });

  it('suggests Bengali words for Bengali query', () => {
    const list = suggestWords(dictionary, 'বই', 8);
    expect(list.suggestions.map((s) => s.word)).toContain('book');
    expect(list.suggestions[0]?.bengali).toBe(true);
    expect(list.suggestions[0]?.headword).toBe('book');
  });

  it('suggests within 10ms p95 latency', () => {
    const headwords = [
      'apple', 'apricot', 'banana', 'carrot', 'cucumber', 'dog', 'elephant', 'fish', 'grape', 'house',
    ];
    const largerDataset = {
      v: 4,
      headwords: ['apple', 'apricot', 'banana', 'carrot', 'cucumber', 'dog', 'elephant', 'fish', 'grape', 'house'],
      bn: ['আপেল', 'আপরicot', 'কলা', 'গাজর', 'শসা', 'কুকুর', 'হাতি', 'মাছ', 'আংগুর', 'বাড়ি'],
      bnAlt: headwords.map(() => ''),
      trans: ['apel', 'aprikot', 'kola', 'gajor', 'shosha', 'kukur', 'hati', 'mach', 'angur', 'bari'],
      transAlt: headwords.map(() => ''),
      def: headwords.map(() => 'definition'),
      pos: headwords.map(() => 'noun'),
      syn: headwords.map(() => 'synonyms'),
      ant: headwords.map(() => 'antonyms'),
      ex: headwords.map(() => 'example'),
      pron: headwords.map(() => '/ˈæpəl/'),
    };
    const dict = new OfflineDictionary(largerDataset);

    const latencies: number[] = [];
    for (const headword of headwords) {
      const start = performance.now();
      suggestWords(dict, headword, 8);
      latencies.push(performance.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(10);
  });
});
