import type { LookupResult, ResultSource } from '../shared/types'

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

Return ONLY a valid JSON object — no markdown, no backticks, no extra text:
{
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
- bengaliMeaning: standard Bengali translation(s). Multiple meanings joined with ", ".
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

Direction: English query -> Bengali meaning + Bengali script transcription. Bengali query -> English meaning + Latin script transcription.
If unknown, use "" or []. Never invent.`

export function buildUserPrompt(query: string, isBengaliInput: boolean): string {
  return isBengaliInput
    ? `Bengali: "${query}" — provide accurate English headword, Latin transcription, pronunciation, IELTS band level, definition, synonyms, antonyms, collocations, word family, and bilingual example.`
    : `English: "${query}" — provide accurate Bangladeshi Bengali meaning, Bengali script transcription, pronunciation, IELTS band level, definition, synonyms, antonyms, collocations, word family, common preposition/usage mistake, and bilingual example.`
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
    partOfSpeech: parsed.partOfSpeech,
  }
}
export function isValidResult(r: LookupResult): boolean {
  return !!(r.englishDefinition || r.bengaliMeaning || r.exampleEn)
}
