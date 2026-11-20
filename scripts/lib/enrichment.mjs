// Build-time generation of the rich fields the AI providers return.
// No browser APIs; no network; no runtime dependencies.
import fs from 'node:fs'

const SEP = '\u0001'
const ROLES = ['noun', 'verb', 'adj', 'adv']

const STOP = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this',
  'these', 'those', 'it', 'its', 'any', 'some', 'or', 'and', 'but', 'not',
  'one', 'who', 'which', 'whose', 'when', 'where', 'how', 'than', 'them',
  'they', 'their', 'there', 'here', 'into', 'onto', 'upon', 'about', 'she',
  'he', 'has', 'had', 'have', 'did', 'does',
])

/** Reads a { word: band } JSON file; returns an empty map when absent. */
export function loadBandList(filePath) {
  if (!fs.existsSync(filePath)) return new Map()
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return new Map(Object.entries(parsed))
}

/** Encodes a word-family object as role:value pairs joined with U+0001. */
export function encodeWordFamily(family) {
  return ROLES.filter((role) => family?.[role])
    .map((role) => `${role}:${family[role]}`)
    .join(SEP)
}

/** Decodes the word-family column back into an object. */
export function decodeWordFamily(value) {
  const out = {}
  for (const part of (value || '').split(SEP).filter(Boolean)) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const role = part.slice(0, i)
    if (ROLES.includes(role)) out[role] = part.slice(i + 1)
  }
  return out
}

/** Normalizes both WordNet sense shapes: array of {pos} or Map<pos, …>. */
function sensesFor(senses, word) {
  const value = senses.get(word.toLowerCase())
  if (!value) return []
  if (typeof value.some === 'function') return value
  if (value instanceof Map) return [...value.keys()].map((pos) => ({ pos }))
  return []
}

const RULES = [
  ['adj', 'noun', /ant$/, 'ance'],
  ['adj', 'noun', /ent$/, 'ence'],
  ['adj', 'adv', /ant$/, 'antly'],
  ['adj', 'adv', /ent$/, 'ently'],
  ['adj', 'adv', /le$/, 'ly'],
  ['adj', 'adv', /y$/, 'ily'],
  ['adj', 'adv', /$/, 'ly'],
  ['noun', 'verb', /tion$/, 'te'],
  ['noun', 'verb', /ment$/, ''],
  ['verb', 'noun', /ize$/, 'ization'],
  ['verb', 'noun', /ate$/, 'ation'],
]

/** Derives related forms, keeping only those WordNet knows. */
export function deriveWordFamily(word, pos, senses) {
  const known = (candidate, target) =>
    !!candidate && sensesFor(senses, candidate).some((s) => s.pos === target)
  const family = {}
  for (const [from, to, pattern, replacement] of RULES) {
    if (from !== pos || !pattern.test(word) || family[to]) continue
    const candidate = word.replace(pattern, replacement)
    if (known(candidate, to)) family[to] = candidate
  }
  return family
}

/** Extracts short phrases containing the headword from example sentences. */
export function deriveCollocations(word, examples) {
  const lower = word.toLowerCase()
  const out = []
  for (const sentence of examples.filter(Boolean)) {
    const words = sentence.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    const i = words.indexOf(lower)
    if (i === -1) continue
    for (let length = 2; length <= 4; length++) {
      const start = Math.max(0, Math.min(i, words.length - length))
      const phrase = words.slice(start, start + length)
      if (!phrase.includes(lower)) continue
      while (phrase.length && STOP.has(phrase[0])) phrase.shift()
      while (phrase.length && STOP.has(phrase[phrase.length - 1])) phrase.pop()
      if (!phrase.includes(lower) || phrase.length < 2) continue
      const text = phrase.join(' ')
      if (!out.includes(text)) out.push(text)
      if (out.length >= 5) return out
    }
  }
  return out
}

/** Uses the committed list first; falls back to a sense-count heuristic. */
export function estimateBand(word, bandList, senses) {
  const listed = bandList.get(word.toLowerCase())
  if (listed) return listed
  const count = sensesFor(senses, word).length
  if (count >= 6) return '8.0'
  if (count >= 4) return '7.5'
  if (count >= 2) return '7.0'
  return word.length >= 10 ? '6.5' : '5.5'
}

/** Emits a note only when the headword is directly followed by a preposition. */
export function deriveCommonMistake(word, collocations) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const phrase of collocations) {
    const match = phrase.match(new RegExp(`\\b${escaped}\\s+(to|of|for|with|in)\\b`, 'i'))
    if (match) {
      return `Use '${word} ${match[1].toLowerCase()}' (as in '${phrase}'); check the preposition in context.`
    }
  }
  return ''
}

/** Produces all eight rich fields; curated overrides are applied last. */
export function enrichEntry(entry, options) {
  const { word, pos, senses = new Map(), examples = [], bandList = new Map(), overrides = {} } = options
  const collocations = deriveCollocations(word, examples)
  const generated = {
    formalMeaning: entry.def ?? '',
    conversationalMeaning: entry.def ?? '',
    exampleFormal: entry.ex ?? '',
    exampleConversational: entry.ex ?? '',
    collocations,
    wordFamily: encodeWordFamily(deriveWordFamily(word, pos, senses)),
    bandLevel: estimateBand(word, bandList, senses),
    commonMistake: deriveCommonMistake(word, collocations),
  }
  const result = { ...generated }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null && value !== '') result[key] = value
  }
  return result
}
