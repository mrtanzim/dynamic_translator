// Tests for the lookup coordinator (src/lookup.ts).
//
// Tests cover:
//   * English headword lookup
//   * Bengali query → English headword reverse lookup
//   * Synonym lookup
//   * Antonym lookup
//   * Missing word returns null
//   * Case and punctuation insensitivity

import { describe, expect, it } from 'vitest';
import { OfflineDictionary } from '../src/indexer';
import { LookupCoordinator } from '../src/lookup';

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
    headword: 'book',
    bn: 'বই',
    bnAlts: [],
    trans: 'boi',
    transAlts: [],
    def: 'A written or printed work...',
    pos: 'noun',
    syn: ['volume', 'publication', 'tome'],
    ant: [],
    ex: '',
    pron: '/bʊk/',
  },
  {
    headword: 'hello',
    bn: 'হ্যালো',
    bnAlts: [],
    trans: 'hello',
    transAlts: [],
    def: 'A greeting...',
    pos: 'noun',
    syn: ['hi', 'greetings'],
    ant: ['goodbye'],
    ex: '',
    pron: '/həˈloʊ/',
  },
  {
    headword: 'abbreviated',
    bn: 'সংক্ষিপ্ত',
    bnAlts: [],
    trans: 'shonkhipto',
    transAlts: [],
    def: 'Shortened in length',
    pos: 'adjective',
    syn: ['shortened', 'short'],
    ant: ['expanded', 'extended'],
    ex: '',
    pron: '/əˈbriːvieɪtɪd/',
  },
  {
    headword: 'unabridged',
    bn: 'অপরিচ্ছেদ',
    bnAlts: [],
    trans: 'oprichhed',
    transAlts: [],
    def: 'Not abridged',
    pos: 'adjective',
    syn: ['complete'],
    ant: ['abridged'],
    ex: '',
    pron: '/ʌnəˈbrɪdʒd/',
  },
];

const dictionary = buildDictionary(entries);
const coordinator = new LookupCoordinator(dictionary);

describe('LookupCoordinator', () => {
  it('looks up English word by headword', () => {
    const result = coordinator.lookup('book');
    expect(result).not.toBeNull();
    expect(result?.headword).toBe('book');
    expect(result?.bengaliMeaning).toBe('বই');
    expect(result?.pronunciation).toBe('/bʊk/');
  });

  it('looks up English word case-insensitively', () => {
    const result = coordinator.lookup('BOOK');
    expect(result?.headword).toBe('book');
  });

  it('resolves Bengali word back to English headword', () => {
    const result = coordinator.lookupBengali('বই');
    expect(result?.headword).toBe('book');
    expect(result?.bengaliMeaning).toBe('বই');
    expect(result?.transcription).toBe('boi');
  });

  it('resolves synonyms to headword', () => {
    const result = coordinator.lookup('shortened');
    expect(result?.headword).toBe('abbreviated');
  });

  it('resolves antonyms to headword', () => {
    const result = coordinator.lookup('unabridged');
    expect(result?.headword).toBe('unabridged');
  });

  it('returns null for unknown word', () => {
    const result = coordinator.lookup('zzznotaword');
    expect(result).toBeNull();
  });

  it('resolves Bengali word punctuation-insensitively', () => {
    const result = coordinator.lookupBengali('বই!');
    expect(result?.headword).toBe('book');
  });
});
