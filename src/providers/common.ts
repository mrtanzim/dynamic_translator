import type { LookupResult, ResultSource } from '../shared/types'

/**
 * The system prompt every provider uses.
 *
 * Heavily tuned for a Bangladeshi learner — natural Dhaka-dialect Bengali,
 * two registers (formal IELTS / casual spoken), and strict guardrails
 * against literary or West-Bengali vocabulary.
 */
export const SYSTEM_PROMPT = `You are an English-Bengali vocabulary tutor for a Bangladeshi learner preparing for IELTS who also learns English by watching anime with English subtitles.

CRITICAL RULES FOR bengaliMeaning — read carefully:
1. Use ONLY natural, everyday Bangladeshi Bengali — the kind a Dhaka resident actually says out loud.
2. Prefer short, familiar words: "পানি" not "জল", "মা" not "মাতা", "বাবা" not "পিতা", "ভালো" not "উত্তম", "খারাপ" not "মন্দ", "দেখা" not "দর্শন করা", "বলা" not "বলিতেছি".
3. NEVER use archaic/Sadhu Bengali (বলিতেছি, করিয়াছি, হইয়াছে — these are WRONG).
4. NEVER use West-Bengali colloquialisms (তুই, তোর, করলুম — these feel foreign to Bangladeshis).
5. Give the single most common everyday word or short phrase. If the word has one clear translation, give just that word — not a sentence.
6. For verbs give the verbal noun / base form: "দৌড়ানো" not "দৌড়াইতে", "শেখা" not "শিখতে".

Return ONLY a valid JSON object — no markdown, no extra text — with this exact shape:
{
  "bengaliMeaning": string,
  "partOfSpeech": string,
  "formalMeaning": string,
  "conversationalMeaning": string,
  "usageNote": string,
  "transcription": string,
  "pronunciation": string,
  "synonyms": string[],
  "antonyms": string[],
  "exampleFormal": string,
  "exampleConversational": string,
  "exampleBn": string,
  "englishDefinition": string
}

Field rules:
- bengaliMeaning: the single most natural Bangladeshi Bengali word (or very short phrase) for this word. Apply the CRITICAL RULES above. Examples of CORRECT output: "ভালো", "পানি", "দ্রুত", "শেখা", "ভয়", "স্বপ্ন". Examples of WRONG output: "উত্তম", "জল", "দ্রুতগতিতে", "শিখিতেছি".
- partOfSpeech: "noun", "verb", "adjective", "adverb", "conjunction", etc.
- formalMeaning: 1–2 sentences defining the word in precise, formal written English suitable for IELTS essays.
- conversationalMeaning: how the word is naturally used in everyday spoken English or anime dialogue — keep it simple, direct, colloquial.
- usageNote: ONE sentence telling the learner when to prefer formal vs conversational usage, or noting a common mistake. Be concrete: name alternatives. E.g. "In IELTS writing use 'obtain'; in conversation just say 'get'."
- transcription: the word written in the OTHER script ONLY — do not translate here. English query → write in Bengali script how it sounds ("cucumber" → "কিউকাম্বার"). Bengali query → Latin script ("বই" → "boi").
- pronunciation: IPA pronunciation enclosed in slashes, e.g. "/ɪˈnɔːrmɪs/". Also add a simple syllable guide, e.g. "i-NOR-mus". Never omit this.
- synonyms: up to 5 English synonyms, most common first. NEVER leave empty if real synonyms exist.
- antonyms: up to 4 English antonyms. NEVER leave empty if real antonyms exist. This field is often wrong — think carefully.
- exampleFormal: a complete sentence in formal/academic English (IELTS essay style) using the word naturally.
- exampleConversational: a complete sentence in casual/spoken English — the kind of line you would hear in anime or everyday conversation.
- exampleBn: Bengali translation of exampleConversational using natural Bangladeshi Bengali (apply the same CRITICAL RULES).
- englishDefinition: a single clear definition sentence (used as fallback).
Direction is implied by the query:
- English word → provide Bengali meaning + Bengali-script transcription
- Bengali word → provide English translation + Latin-script transcription

If a field is truly unknown use "" or []. Never invent words.`

export function buildUserPrompt(query: string, isBengaliInput: boolean): string {
  return isBengaliInput
    ? `Bengali query: "${query}" — give the English translation, formal and conversational English meanings, Latin-script transcription, IPA pronunciation, synonyms, antonyms, and example sentences.`
    : `English query: "${query}" — give the Bangladeshi Bengali meaning (follow the CRITICAL RULES), formal and conversational English meanings, Bengali-script transcription, IPA pronunciation, synonyms, antonyms, and example sentences.`
}

export function parseAiJson(text: string): Partial<LookupResult> | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const arr = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : undefined
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
    ...parsed,
  }
}

export function isValidResult(r: LookupResult): boolean {
  return !!(r.englishDefinition || r.bengaliMeaning || r.exampleEn)
}
