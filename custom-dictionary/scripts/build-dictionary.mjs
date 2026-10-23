// Entry point for building the offline dictionary dataset.
//
// Usage:
//   npm run build:dictionary
//
// This uses node --experimental-strip-types (or tsx/ts-node) to import
// build-dict.ts. PHASES 1-4 complete — this script orchestrates all sources.

import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Import build-dict.ts via file:// URL so Windows absolute paths work
const buildDictUrl = pathToFileURL(path.join(__dirname, 'build-dict.ts')).href
const { buildDictionary } = await import(buildDictUrl)

const bengaliRoot  = path.join(root, 'node_modules', 'bn-en-dictionary')
const wordnetRoot  = path.join(root, 'node_modules', 'wordnet-db')
const cmudictRoot  = path.join(root, 'node_modules', 'cmu-pronouncing-dictionary')
// Use the extension's curated dictionary (the single source of truth)
const curatedPath  = path.join(root, '..', 'src', 'dictionary', 'curated.json')
const outputPath   = path.join(root, 'public', 'dictionary.json.gz')

console.log('VocabFlow custom dictionary build')
console.log('==================================')
console.log(`Bengali:  ${bengaliRoot}`)
console.log(`WordNet:  ${wordnetRoot}`)
console.log(`CMUdict:  ${cmudictRoot}`)
console.log(`Curated:  ${curatedPath}`)
console.log(`Output:   ${outputPath}`)
console.log('')

const result = await buildDictionary({
  bengaliRoot,
  wordnetRoot,
  cmudictRoot,
  curatedPath,
  outputPath,
}).catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})

console.log('')
console.log('Build complete!')
console.log(`  Entries:        ${result.entries}`)
console.log(`  With synonyms:  ${result.withSynonyms}`)
console.log(`  With antonyms:  ${result.withAntonyms}`)
console.log(`  With examples:  ${result.withExamples}`)
console.log(`  With IPA:       ${result.withPronunciation}`)
