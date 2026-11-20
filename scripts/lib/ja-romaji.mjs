// Build-time kana -> romaji conversion. Covers common kana, small kana and
// sokuon; it is a fixed table, not a general romanization engine.
const BASE = {
  あ:'a', い:'i', う:'u', え:'e', お:'o',
  か:'ka', き:'ki', く:'ku', け:'ke', こ:'ko',
  さ:'sa', し:'shi', す:'su', せ:'se', そ:'so',
  た:'ta', ち:'chi', つ:'tsu', て:'te', と:'to',
  な:'na', に:'ni', ぬ:'nu', ね:'ne', の:'no',
  は:'ha', ひ:'hi', ふ:'fu', へ:'he', ほ:'ho',
  ま:'ma', み:'mi', む:'mu', め:'me', も:'mo',
  や:'ya', ゆ:'yu', よ:'yo',
  ら:'ra', り:'ri', る:'ru', れ:'re', ろ:'ro',
  わ:'wa', を:'wo', ん:'n',
  が:'ga', ぎ:'gi', ぐ:'gu', げ:'ge', ご:'go',
  ざ:'za', じ:'ji', ず:'zu', ぜ:'ze', ぞ:'zo',
  だ:'da', ぢ:'ji', づ:'zu', で:'de', ど:'do',
  ば:'ba', び:'bi', ぶ:'bu', べ:'be', ぼ:'bo',
  ぱ:'pa', ぴ:'pi', ぷ:'pu', ぺ:'pe', ぽ:'po',
}
const SMALL = { ゃ:'ya', ゅ:'yu', ょ:'yo', っ:'', ぁ:'a', ぃ:'i', ぅ:'u', ぇ:'e', ぉ:'o' }
const KATAKANA_OFFSET = 0x60
// The topic particle は is pronounced "wa" in set greetings.
const EXCEPTIONS = { 'こんにちは': 'konnichiwa', 'こんばんは': 'konbanwa' }

function normalize(ch) {
  const code = ch.codePointAt(0)
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - KATAKANA_OFFSET)
  return ch
}

/** Converts kana to a lowercase romaji string. */
export function toRomaji(kana) {
  if (!kana) return ''
  if (EXCEPTIONS[kana]) return EXCEPTIONS[kana]
  const chars = [...kana].map(normalize)
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === 'っ') {
      const next = BASE[chars[i + 1]] ?? SMALL[chars[i + 1]] ?? ''
      out += next ? next[0] : ''
      continue
    }
    if (SMALL[ch]) {
      const prev = BASE[chars[i - 1]] ?? ''
      if (prev) {
        out = out.slice(0, -prev.length) + prev.slice(0, -1) + SMALL[ch]
      } else {
        out += SMALL[ch]
      }
      continue
    }
    out += BASE[ch] ?? ch
  }
  return out.toLowerCase()
}
