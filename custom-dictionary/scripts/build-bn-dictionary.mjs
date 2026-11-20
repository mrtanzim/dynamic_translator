// Builds the Bengali-first dataset and writes it to both packages' public/.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

async function loadModule(relative) {
  return import(pathToFileURL(path.join(__dirname, relative)).href)
}

const { invertEnglishDataset } = await loadModule('builders/bn-invert.ts')
const { loadBengaliOverrides, applyBengaliOverrides } = await loadModule('builders/bn-curated.ts')
const { serializeBengaliDataset } = await loadModule('builders/bn-schema.ts')

const englishPath = path.join(root, 'public', 'dictionary.json')
const english = JSON.parse(fs.readFileSync(englishPath, 'utf8'))
const derived = invertEnglishDataset(english)
const overrides = loadBengaliOverrides(path.join(root, 'data', 'bn'))
const entries = applyBengaliOverrides(derived, overrides)
const dataset = serializeBengaliDataset(entries)
const json = JSON.stringify(dataset)

const outputs = [
  path.join(root, 'public', 'dictionary.bn.json'),
  path.join(root, 'public', 'dictionary.bn.json.gz'),
  path.join(root, '..', 'public', 'dictionary.bn.json.gz'),
]
fs.mkdirSync(path.dirname(outputs[2]), { recursive: true })
fs.writeFileSync(outputs[0], json, 'utf8')
fs.writeFileSync(outputs[1], zlib.gzipSync(json, { level: 9 }))
fs.writeFileSync(outputs[2], zlib.gzipSync(json, { level: 9 }))

console.log('Bengali-first dictionary build complete')
console.log(`  entries:               ${entries.length}`)
console.log(`  with English synonyms: ${entries.filter((e) => e.synEn.length).length}`)
console.log(`  with English antonyms: ${entries.filter((e) => e.antEn.length).length}`)
console.log(`  with bilingual ex:     ${entries.filter((e) => e.exBn && e.exEn).length}`)
console.log(`  curated overrides:     ${overrides.size}`)
