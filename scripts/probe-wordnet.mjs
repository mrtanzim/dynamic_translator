// Scratch probe for the WordNet loader (not part of the build).
//
//   node scripts/probe-wordnet.mjs

import { loadWordNet } from './lib/wordnet.mjs'

const wn = loadWordNet('./node_modules/wordnet-db')
console.log('lemmas:', wn.senses.size, 'syn:', wn.synonyms.size, 'ant:', wn.antonyms.size, 'ex:', wn.examples.size)
for (const w of ['happy', 'big', 'fast', 'quick', 'small', 'book', 'beautiful', 'good', 'bad', 'greetings']) {
  console.log(
    ' ',
    w,
    '| syn:', (wn.synonyms.get(w) || []).slice(0, 5).join(','),
    '| ant:', (wn.antonyms.get(w) || []).slice(0, 4).join(','),
    '| ex:', (wn.examples.get(w) || '').slice(0, 50),
  )
}
