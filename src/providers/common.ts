import type { LookupDirection, LookupResult, ResultSource } from '../shared/types'

/**
 * The system prompt every provider uses.
 *
 * Grounded in Oxford & Cambridge dictionary standards for accurate IELTS preparation.
 */
export const SYSTEM_PROMPT = `You are an authoritative English-Bengali lexicographer and IELTS vocabulary mentor for a Bangladeshi learner.

CRITICAL ACCURACY & QUALITY RULES (ZERO TOLERANCE FOR HALLUCINATIONS):
1. ACCURACY FIRST: Ground every definition and Bengali meaning strictly in standard Oxford and Cambridge English Dictionaries. NEVER hallucinate, invent, or output absurd translations.
2. STRICT PART OF SPEECH MATCHING:
   - Adjectives MUST be translated as Adjectives (e.g. "reluctant" -> "অনিচ্ছুক", NOT "অনিচ্ছা প্রকাশ করা").
   - Nouns MUST be translated as Nouns (e.g. "laughter" -> "হাসি").
   - Verbs MUST be in base verbal-noun form (e.g. "learn" -> "শেখা", NOT inflected "শিখতে").
3. NATURAL BANGLADESHI BENGALI:
   - Use standard everyday Bangladeshi Bengali as spoken in Dhaka.
   - Prefer familiar words: "পানি" not "জল", "মা" not "মাতা", "বাবা" not "পিতা", "ভালো" not "উত্তম", "খারাপ" not "মন্দ".
   - NO archaic Sadhu Bhasha (করিতেছে, করিয়াছি are strictly forbidden).
   - If the query is an idiom or phrasal verb, provide its true figurative meaning, NEVER literal word-by-word translation.
4. IELTS BAND RATING: Estimate the IELTS lexical level as a number string (e.g. "6.5", "7.0", "7.5", "8.0", "8.5"). Only output the number, do not prefix with CEFR letters or words.
5. COLLOCATIONS: Provide 3 to 5 natural, high-frequency word partnerships essential for IELTS writing and speaking (e.g. ["reluctant to admit", "grow reluctant", "deeply reluctant"]).
6. WORD FAMILY: Provide related derivatives if they exist: noun, verb, adj, adv.
7. COMMON MISTAKE: ONE brief, practical sentence on preposition or usage trap (e.g. "Followed by 'to + infinitive' (reluctant to go), not 'of'."). If none, use "".
8. IDIOMATIC BENGALI QUERIES: for Bengali or Banglish input, the englishHeadword field must be the natural idiomatic English equivalent - the way a native English speaker would actually say it (e.g. "ki khobor" -> "How are you?", NOT "What's the news?"). Never put a literal word-for-word translation there. Keep literal or alternative renderings in the synonyms field.

Return ONLY a valid JSON object — no markdown, no backticks, no extra text:
{
  "englishHeadword": string,
  "bengaliMeaning": string,
  "partOfSpeech": string,
  "englishDefinition": string,
  "bandLevel": string,
  "transcription": string,
  "pronunciation": string,
  "synonyms": string[],
  "antonyms": string[],
  "collocations": string[],
  "wordFamily": {
    "noun": string,
    "verb": string,
    "adj": string,
    "adv": string
  },
  "commonMistake": string,
  "exampleEn": string,
  "exampleBn": string
}

Field rules:
- englishHeadword: for Bengali script or romanized Bengali (Banglish), the natural idiomatic English equivalent - how an English speaker would actually express it, not a literal word-for-word translation. For an idiom or greeting, use its true figurative meaning. Empty string for an English query.
- bengaliMeaning: standard Bengali translation(s). Multiple meanings joined with ", ". For a Bengali/Banglish query this is the Bengali word itself or its close variants.
- partOfSpeech: "noun", "verb", "adjective", "adverb", etc.
- englishDefinition: ONE concise, clear sentence explaining the dictionary meaning.
- bandLevel: number only, e.g. "7.5" or "8.0".
- transcription: query in the OTHER script only. English -> Bengali script; Bengali -> Latin script.
- pronunciation: IPA in slashes + respelling guide, e.g. "/rɪˈlʌktənt/ (ri-LUK-tant)".
- synonyms: 3-5 standard synonyms.
- antonyms: 2-4 true antonyms.
- collocations: 3-5 natural word collocations.
- wordFamily: related noun, verb, adj, adv. Omit or use "" if a form does not exist.
- commonMistake: short tip on common preposition/usage error.
- exampleEn: ONE natural, high-quality sentence.
- exampleBn: Natural Bengali translation of exampleEn.

Direction — the query may be English, Bengali script, or romanized Bengali (Banglish):
- English query -> Bengali meaning in bengaliMeaning, Bengali script transcription, and detailed English categories.
- Bengali or Banglish query -> put the natural idiomatic English equivalent in englishHeadword (never a literal translation), use English in englishDefinition, Latin-script transcription, and provide the SAME detailed categories (definition, pronunciation, part of speech, synonyms, antonyms, collocations, word family, band level, common mistake, bilingual examples). Literal or alternative English renderings belong in synonyms.
If unknown, use "" or []. Never invent.`

export function buildUserPrompt(query: string, direction: LookupDirection | boolean): string {
  if (direction === 'ja-en' || direction === 'en-ja') {
    return `Word: "${query}" — this is a Japanese lookup (${direction}). Put the natural English equivalent in englishHeadword, the reading in kana, the Latin spelling in romaji, and a Japanese example in exampleJa. Never give a literal word-by-word translation as the primary answer. Return every category you can support.`
  }
  const isBengaliInput = direction === 'bn-en' || direction === true
  const base = `Word: "${query}" — the query may be English, Bengali script, or romanized Bengali (Banglish). Detect the script yourself and follow the direction rules in the system prompt. Return every category you can support.`
  if (!isBengaliInput) return base
  // The primary answer is rendered from englishHeadword. Without this hint the
  // model returns a literal translation for greetings and idioms, while the
  // natural equivalent ends up buried in synonyms.
  return `${base}\nThis is Bengali/Banglish input: put the natural idiomatic English equivalent in englishHeadword (how an English speaker would actually say it), never a literal word-for-word translation. Keep literal or alternative renderings in synonyms.`
}

export function parseAiJson(text: string): Partial<LookupResult> | null {
  const cleaned = text.trim().replace(/^`(?:json)?/i, '').replace(/`$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const arr = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : undefined

    let wordFamily: LookupResult['wordFamily'] | undefined
    if (typeof obj.wordFamily === 'object' && obj.wordFamily !== null) {
      const fam = obj.wordFamily as Record<string, unknown>
      const noun = str(fam.noun)
      const verb = str(fam.verb)
      const adj = str(fam.adj)
      const adv = str(fam.adv)
      if (noun || verb || adj || adv) {
        wordFamily = { noun, verb, adj, adv }
      }
    }

    return {
      headword: str(obj.englishHeadword),
      bengaliMeaning: str(obj.bengaliMeaning),
      englishDefinition: str(obj.englishDefinition),
      formalMeaning: str(obj.formalMeaning),
      conversationalMeaning: str(obj.conversationalMeaning),
      usageNote: str(obj.usageNote),
      transcription: str(obj.transcription),
      pronunciation: str(obj.pronunciation),
      synonyms: arr(obj.synonyms),
      antonyms: arr(obj.antonyms),
      collocations: arr(obj.collocations),
      bandLevel: str(obj.bandLevel),
      wordFamily,
      commonMistake: str(obj.commonMistake),
      exampleEn: str(obj.exampleEn) ?? str(obj.exampleConversational),
      exampleConversational: str(obj.exampleConversational),
      exampleFormal: str(obj.exampleFormal),
      exampleBn: str(obj.exampleBn),
      kana: str(obj.kana),
      romaji: str(obj.romaji),
      exampleJa: str(obj.exampleJa),
      partOfSpeech: str(obj.partOfSpeech),
    }
  } catch {
    return null
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function toResult(
  source: ResultSource,
  query: string,
  requestId: string,
  parsed: Partial<LookupResult>,
): LookupResult {
  return {
    word: query,
    query,
    source,
    requestId,
    timestamp: Date.now(),
    headword: parsed.headword,
    bengaliMeaning: parsed.bengaliMeaning,
    englishDefinition: parsed.englishDefinition,
    formalMeaning: parsed.formalMeaning,
    conversationalMeaning: parsed.conversationalMeaning,
    usageNote: parsed.usageNote,
    transcription: parsed.transcription,
    pronunciation: parsed.pronunciation,
    synonyms: parsed.synonyms,
    antonyms: parsed.antonyms,
    collocations: parsed.collocations,
    bandLevel: parsed.bandLevel,
    wordFamily: parsed.wordFamily,
    commonMistake: parsed.commonMistake,
    exampleEn: parsed.exampleEn,
    exampleConversational: parsed.exampleConversational,
    exampleFormal: parsed.exampleFormal,
    exampleBn: parsed.exampleBn,
    kana: parsed.kana,
    romaji: parsed.romaji,
    exampleJa: parsed.exampleJa,
    partOfSpeech: parsed.partOfSpeech,
  }
}
export function isValidResult(r: LookupResult): boolean {
  return !!(r.englishDefinition || r.bengaliMeaning || r.exampleEn)
}
