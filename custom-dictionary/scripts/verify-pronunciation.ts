// Verify CMUdict IPA coverage against the offline dictionary headwords.
// Phase 4 micro-task 1: Verify CMUdict pronunciation coverage ≥ 75%.

import { loadBengaliDictionary, selectVocabulary } from './lib/bengali.mjs'
import { loadPronunciations } from './lib/pronunciation.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function main() {
  const root = path.dirname(fileURLToPath(import.meta.url))
  const bengaliRoot = path.join(root, '..', 'node_modules', 'bn-en-dictionary')
  const cmudictRoot = path.join(root, '..', 'node_modules', 'cmu-pronouncing-dictionary')

  const bengaliDict = loadBengaliDictionary(bengaliRoot)
  const selected = selectVocabulary(bengaliDict)
  const pronunciations = await loadPronunciations(cmudictRoot)

  const totalHeadwords = selected.size
  let withPronunciation = 0
  const missing: string[] = []

  for (const [headword] of selected) {
    if (pronunciations.has(headword)) {
      withPronunciation++
    } else {
      missing.push(headword)
    }
  }

  const coverage = (withPronunciation / totalHeadwords) * 100

  console.log(`Total headwords: ${totalHeadwords}`)
  console.log(`With IPA pronunciation: ${withPronunciation}`)
  console.log(`Coverage: ${coverage.toFixed(1)}%`)
  console.log(`Missing pronunciations (first 20): ${missing.slice(0, 20).join(', ')}`)

  if (coverage >= 75) {
    console.log('\n✓ PASS: IPA coverage meets 75% threshold')
    process.exit(0)
  } else {
    console.log('\n✗ FAIL: IPA coverage below 75% threshold')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
