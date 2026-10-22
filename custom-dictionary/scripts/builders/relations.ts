// Synonym and antonym inheritance for the offline dictionary builder.
//
// WordNet marks synonyms and antonyms per synset. A word can belong to
// multiple synsets (different senses), each with its own synonym set and
// optional antonym pointer. To avoid cross-sense noise (e.g. "book" as a
// noun picking up antonyms from "volume" as loudness), relations are only
// taken from synsets that match the entry's part of speech.
//
// Antonym inheritance: WordNet marks the opposite on a synset, so a word
// only gets an antonym when its own synset carries one. But the relation
// holds for the whole group: if "large" is the opposite of "small", then
// "big" — a synonym of "large" — is the opposite of "small" as well.
// Inherited antonyms only come from synonyms within the same synset.

/**
 * Maps a source part-of-speech string to its WordNet equivalent.
 *
 * Returns null if the source POS has no WordNet equivalent (no relations
 * can be looked up for it).
 *
 * @param pos - Source part-of-speech string, e.g. "noun", "adj", "name"
 * @returns WordNet POS code or null
 */
export function posToWordnet(pos: string): string | null {
  switch (pos) {
    case 'noun':
    case 'name':
      return 'noun'
    case 'verb':
      return 'verb'
    case 'adj':
      return 'adj'
    case 'adv':
      return 'adv'
    default:
      return null
  }
}

/**
 * Whether a relation word is worth keeping.
 *
 * WordNet lists every lemma sharing a synset, including rare morphological
 * variants. Only single words of at least three letters are kept, and the
 * headword itself is excluded.
 *
 * @param word - Candidate relation word
 * @param headword - The headword being processed (excluded from results)
 * @returns true if the relation should be kept
 */
export function isUsableRelation(word: string, headword: string): boolean {
  if (!/^[a-z][a-z-]*$/.test(word)) return false
  if (word.length < 3) return false
  if (word === headword) return false
  return true
}

/**
 * Collects synonyms for a word from all its synsets of a given part of
 * speech.
 *
 * @param wordnet - Loaded WordNet data (senses, synsets)
 * @param word - The headword
 * @param pos - WordNet part-of-speech code
 * @returns Unique synonym strings, excluding the headword
 */
export function getSynonyms(
  wordnet: { senses: Map<string, Map<string, string[]>>; synsets: Map<string, string[]> },
  word: string,
  pos: string,
): string[] {
  const synsetKeys = wordnet.senses.get(word)?.get(pos)
  if (!synsetKeys) return []

  const synonyms = new Set<string>()
  for (const key of synsetKeys) {
    const lemmas = wordnet.synsets.get(key)
    if (!lemmas) continue
    for (const lemma of lemmas) {
      if (isUsableRelation(lemma, word)) synonyms.add(lemma)
    }
  }

  return [...synonyms]
}

/**
 * Collects antonyms for a word from its own synset(s), plus inherited
 * antonyms from each synonym's synset(s) of the same part of speech.
 *
 * WordNet marks the opposite on a synset, so a word only gets an antonym
 * when its own synset carries one. But the relation holds for the whole
 * group: if "large" is the opposite of "small", then "big" — a synonym of
 * "large" — is the opposite of "small" as well.
 *
 * Inherited antonyms only come from synonyms within the same synset and
 * part of speech, preventing cross-sense noise.
 *
 * @param wordnet - Loaded WordNet data (senses, synsets, antonyms)
 * @param word - The headword
 * @param pos - WordNet part-of-speech code
 * @returns Unique antonym strings, excluding the headword
 */
export function getAntonyms(
  wordnet: {
    senses: Map<string, Map<string, string[]>>
    synsets: Map<string, string[]>
    antonyms: Map<string, string[]>
  },
  word: string,
  pos: string,
): string[] {
  const synsetKeys = wordnet.senses.get(word)?.get(pos)
  if (!synsetKeys) return []

  const antonyms = new Set<string>()

  // Direct antonyms from each synset the word belongs to
  for (const key of synsetKeys) {
    const targets = wordnet.antonyms.get(key)
    if (!targets) continue
    for (const targetKey of targets) {
      const targetLemmas = wordnet.synsets.get(targetKey)
      if (!targetLemmas) continue
      for (const lemma of targetLemmas) {
        if (isUsableRelation(lemma, word)) antonyms.add(lemma)
      }
    }
  }

  // Inherited antonyms: antonyms of each synonym's synset(s)
  const synonyms = getSynonyms(wordnet, word, pos)
  for (const synonym of synonyms) {
    const synSenseKeys = wordnet.senses.get(synonym)?.get(pos)
    if (!synSenseKeys) continue
    for (const key of synSenseKeys) {
      const targets = wordnet.antonyms.get(key)
      if (!targets) continue
      for (const targetKey of targets) {
        const targetLemmas = wordnet.synsets.get(targetKey)
        if (!targetLemmas) continue
        for (const lemma of targetLemmas) {
          if (isUsableRelation(lemma, word)) antonyms.add(lemma)
        }
      }
    }
  }

  return [...antonyms]
}
