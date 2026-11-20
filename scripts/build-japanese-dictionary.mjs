// Builds the Japanese offline dataset from the committed JMdict subset.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
async function load(rel) { return import(pathToFileURL(path.join(__dirname, rel)).href) }

const { toRomaji } = await load('lib/ja-romaji.mjs')
const { serializeJapaneseDataset } = await load('lib/ja-schema.mjs')
const { enrichEntry, loadBandList } = await load('lib/enrichment.mjs')

const source = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'jmdict-common-subset.json'), 'utf8'))
const overrides = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'ja-overrides.json'), 'utf8'))
const bandList = loadBandList(path.join(root, 'scripts', 'data', 'cefr-bands.json'))

const POS_LABELS = { n: 'noun', v5r: 'verb', vs: 'verb', 'adj-i': 'adjective', adv: 'adverb', int: 'interjection' }

/** Japanese surface -> first English gloss, used to resolve related/antonym refs. */
const glossByWord = new Map()
for (const w of source.words) {
  const gloss = w.sense?.flatMap((s) => s.gloss ?? []).find((g) => g.lang === 'eng' && g.text)?.text
  if (!gloss) continue
  for (const k of [...(w.kana ?? []), ...(w.kanji ?? [])]) {
    const key = k.text.toLowerCase()
    if (key && !glossByWord.has(key)) glossByWord.set(key, gloss)
  }
}
/** Resolves JMdict related/antonym refs (arrays of [word, sense?]) to glosses. */
const glossesFor = (refs) => (refs ?? [])
  .map((ref) => glossByWord.get(String(Array.isArray(ref) ? ref[0] : ref).toLowerCase()))
  .filter((g) => !!g && typeof g === 'string')

const entries = []

for (const word of source.words) {
  const kanaEntry = word.kana?.find((k) => k.common) ?? word.kana?.[0]
  if (!kanaEntry) continue
  const sense = word.sense?.find((s) => s.gloss?.some((g) => g.lang === 'eng')) ?? word.sense?.[0]
  if (!sense) continue
  const glosses = sense.gloss?.filter((g) => g.lang === 'eng').map((g) => g.text).filter(Boolean) ?? []
  if (!glosses.length) continue
  const surface = word.kanji?.find((k) => k.common)?.text ?? kanaEntry.text
  const pos = POS_LABELS[sense.partOfSpeech?.[0]] ?? 'word'
  // Curated entries may be keyed by kana or by the surface form.
  const ov = overrides[surface] ?? overrides[kanaEntry.text] ?? {}
  const examples = ov.exampleJa ? [ov.exampleJa] : []
  const enriched = enrichEntry(
    { def: glosses[0], ex: '' },
    {
      word: surface,
      pos: sense.partOfSpeech?.[0] ?? '',
      senses: new Map(),
      examples,
      bandList,
      overrides: ov,
    },
  )
  entries.push({
    surface,
    kana: kanaEntry.text,
    romaji: toRomaji(kanaEntry.text),
    en: ov.en ?? glosses[0],
    enAlt: ov.enAlt ?? glosses.slice(1),
    pos,
    synEn: ov.synEn ?? glossesFor(sense.related),
    antEn: ov.antEn ?? glossesFor(sense.antonym),
    exampleJa: ov.exampleJa ?? '',
    exampleEn: ov.exampleEn ?? '',
    ...enriched,
    ...ov,
  })
}

const dataset = serializeJapaneseDataset(entries)
const json = JSON.stringify(dataset)
const jsonPath = path.join(root, 'public', 'dictionary.ja.json')
const gzPath = path.join(root, 'public', 'dictionary.ja.json.gz')
fs.mkdirSync(path.dirname(gzPath), { recursive: true })
fs.writeFileSync(jsonPath, json, 'utf8')
fs.writeFileSync(gzPath, zlib.gzipSync(json, { level: 9 }))
console.log(`Japanese dataset: ${entries.length} entries`)
