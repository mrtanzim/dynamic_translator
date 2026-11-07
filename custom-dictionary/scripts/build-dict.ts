// Main build script for the offline dictionary dataset.
//
// Orchestrates the full pipeline:
//   1. Load Bengali dictionary from Wiktionary JSONL
//   2. Load WordNet synsets/antonyms/examples
//   3. Load CMUdict pronunciations (ARPAbet → IPA)
//   4. For each headword: collect synonyms/antonyms, get pronunciation
//   5. Apply curated.json overrides (hand-written entries always win)
//   6. Serialize to columnar JSON + gzip artifact

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { loadBengaliDictionary, selectVocabulary } from './lib/bengali.mjs'
import { loadWordNet } from './lib/wordnet.mjs'
import { loadPronunciations } from './lib/pronunciation.mjs'
import { posToWordnet, getSynonyms, getAntonyms } from './builders/relations.ts'
import { serializeDataset, type DictionaryEntry } from './builders/columnar.ts'

const LIMITS = {
  synonyms: 8,
  antonyms: 6,
  meanings: 10,
  definition: 220,
  example: 150,
}

interface BuildOptions {
  bengaliRoot: string
  wordnetRoot: string
  cmudictRoot: string
  curatedPath: string
  outputPath: string
}

interface BuildResult {
  entries: number
  withSynonyms: number
  withAntonyms: number
  withExamples: number
  withPronunciation: number
}

/**
 * Builds the full offline dictionary dataset from all sources.
 */
export async function buildDictionary(options: BuildOptions): Promise<BuildResult> {
  const { bengaliRoot, wordnetRoot, cmudictRoot, curatedPath, outputPath } = options

  console.log('Loading Bengali dictionary...')
  const bengaliDict = loadBengaliDictionary(bengaliRoot)
  const selected = selectVocabulary(bengaliDict)
  console.log(`  ${selected.size} headwords selected`)

  console.log('Loading WordNet...')
  const wordnet = loadWordNet(wordnetRoot)
  console.log(`  ${wordnet.senses.size} lemmas loaded`)

  console.log('Loading CMU Pronouncing Dictionary...')
  const pronunciations = await loadPronunciations(cmudictRoot)
  console.log(`  ${pronunciations.size} pronunciations`)

  console.log('Loading curated entries...')
  const curated = JSON.parse(fs.readFileSync(curatedPath, 'utf8')) as Record<string, {
    bn?: string; bnAlts?: string[]; trans?: string; transAlts?: string[]
    def?: string; pos?: string; syn?: string[]; ant?: string[]; ex?: string; exBn?: string; pron?: string
  }>
  console.log(`  ${Object.keys(curated).length} curated entries`)

  const table = new Map<string, DictionaryEntry>()

  for (const [headword, entry] of selected) {
    const wnPos = posToWordnet(entry.pos[0] ?? '') ?? null

    // Collect synonyms and antonyms using the relations builder
    const syn = wnPos
      ? getSynonyms(wordnet, headword, wnPos).slice(0, LIMITS.synonyms)
      : []
    const ant = wnPos
      ? getAntonyms(wordnet, headword, wnPos).slice(0, LIMITS.antonyms)
      : []

    // Get pronunciation
    const pron = pronunciations.get(headword) ?? ''

    // Collect Bengali spellings (up to LIMITS.meanings)
    const spellings: { meaning: string; roman: string }[] = []
    for (let i = 0; i < entry.meanings.length && spellings.length < LIMITS.meanings; i++) {
      const meaning = (entry.meanings[i] ?? '').normalize('NFC')
      if (meaning && !spellings.some((s) => s.meaning === meaning)) {
        spellings.push({ meaning, roman: entry.roman[i] ?? '' })
      }
    }

    table.set(headword, {
      headword,
      bn: spellings[0]?.meaning ?? '',
      bnAlts: spellings.slice(1).map((s) => s.meaning),
      trans: spellings[0]?.roman ?? '',
      transAlts: spellings.slice(1).map((s) => s.roman),
      def: (entry.def ?? '').slice(0, LIMITS.definition),
      pos: entry.pos.slice(0, 3).join('/'),
      syn,
      ant,
      ex: '',
      exBn: '',
      pron,
    })
  }

  // Apply curated overrides — curated data always wins over generated data.
  // Empty syn/ant arrays in curated DO override generated (unlike the old
  // extension behaviour) so curated entries are fully deterministic.
  for (const [headword, value] of Object.entries(curated)) {
    const existing = table.get(headword)

    table.set(headword, {
      headword,
      bn:       value.bn       ?? existing?.bn       ?? '',
      bnAlts:   value.bnAlts   ?? existing?.bnAlts   ?? [],
      trans:    value.trans    ?? existing?.trans    ?? '',
      transAlts:value.transAlts?? existing?.transAlts?? [],
      def:      (value.def    ?? existing?.def    ?? '').slice(0, LIMITS.definition),
      pos:      value.pos      ?? existing?.pos      ?? '',
      // curated syn/ant: non-null means "use exactly this list"
      syn:      (value.syn != null ? value.syn : (existing?.syn ?? [])).slice(0, LIMITS.synonyms),
      ant:      (value.ant != null ? value.ant : (existing?.ant ?? [])).slice(0, LIMITS.antonyms),
      ex:       (value.ex      ?? existing?.ex      ?? '').slice(0, LIMITS.example),
      exBn:     value.exBn     ?? existing?.exBn     ?? '',
      pron:     value.pron     ?? existing?.pron     ?? '',
    })
  }

  // Serialize to columnar dataset, sorted alphabetically by headword
  const entries = [...table.values()]
  const dataset = serializeDataset(entries)

  // Write JSON (for test imports) and gzipped artifact (for runtime)
  const jsonPath = outputPath.endsWith('.gz') ? outputPath.slice(0, -3) : outputPath
  const gzPath   = outputPath.endsWith('.gz') ? outputPath : `${outputPath}.gz`

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(gzPath), { recursive: true })

  fs.writeFileSync(jsonPath, JSON.stringify(dataset), 'utf8')
  fs.writeFileSync(gzPath, zlib.gzipSync(JSON.stringify(dataset), { level: 9 }))

  // Stats
  const withSynonyms     = entries.filter((e) => e.syn.length > 0).length
  const withAntonyms     = entries.filter((e) => e.ant.length > 0).length
  const withExamples     = entries.filter((e) => e.ex.length > 0).length
  const withPronunciation= entries.filter((e) => e.pron.length > 0).length

  console.log(`  entries:        ${entries.length}`)
  console.log(`  with synonyms:  ${withSynonyms}`)
  console.log(`  with antonyms:  ${withAntonyms}`)
  console.log(`  with examples:  ${withExamples}`)
  console.log(`  with IPA:       ${withPronunciation}`)

  return { entries: entries.length, withSynonyms, withAntonyms, withExamples, withPronunciation }
}
