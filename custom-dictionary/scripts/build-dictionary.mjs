// Entry point for building the offline dictionary dataset.
//
// Usage:
//   npm run build:dictionary
//
// This script imports and runs build-dict.ts, which orchestrates the full
// pipeline:
//   1. Load Bengali dictionary from Wiktionary JSONL
//   2. Load WordNet synsets/antonyms/examples
//   3. Load CMUdict pronunciations (ARPAbet → IPA)
//   4. Build LookupResult entries per headword
//   5. Apply curated.json overrides
//   6. Serialize to columnar JSON + gzip artifact
//
// @module scripts/build-dictionary.mjs

import { buildDictionary } from './build-dict.ts'

const root = new URL('.', import.meta.url).pathname
const bengaliRoot = new URL('../node_modules/bn-en-dictionary', import.meta.url).pathname
const wordnetRoot = new URL('../node_modules/wordnet-db', import.meta.url).pathname
const cmudictRoot = new URL('../node_modules/cmu-pronouncing-dictionary', import.meta.url).pathname
const curatedPath = new URL('./src/dictionary/curated.json', root).pathname
const outputPath = new URL('./public/dictionary.json.gz', root).pathname

async function main() {
  console.log('Starting VocabFlow offline dictionary build...')
  console.log(`  Bengali: ${bengaliRoot}`)
  console.log(`  WordNet: ${wordnetRoot}`)
  console.log(`  CMUdict: ${cmudictRoot}`)
  console.log(`  Curated: ${curatedPath}`)
  console.log(`  Output:  ${outputPath}`)
  console.log('')

  const result = await buildDictionary({
    bengaliRoot,
    wordnetRoot,
    cmudictRoot,
    curatedPath,
    outputPath,
  })

  console.log('')
  console.log('Build complete!')
  console.log(`  Entries:        ${result.entries}`)
  console.log(`  With synonyms:  ${result.withSynonyms}`)
  console.log(`  With antonyms:  ${result.withAntonyms}`)
  console.log(`  With examples:  ${result.withExamples}`)
  console.log(`  With IPA:       ${result.withPronunciation}`)
}

main().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
