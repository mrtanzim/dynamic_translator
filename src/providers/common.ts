import type { LookupResult, ResultSource } from '../shared/types'

/**
 * The system prompt every provider uses.
 *
 * Kept intentionally simple: one Bengali meaning, one definition, one example.
 * The learner just wants to understand the word and see it used naturally.
 */
export const SYSTEM_PROMPT = `You are an English-Bengali vocabulary tutor for a Bangladeshi learner who watches anime in English and is preparing for IELTS.

CRITICAL RULES FOR bengaliMeaning:
1. Use ONLY natural, everyday Bangladeshi Bengali — the kind a Dhaka resident actually says.
2. Prefer the short, familiar word: "পানি" not "জল", "মা" not "মাতা", "বাবা" not "পিতা", "ভালো" not "উত্তম", "খারাপ" not "মন্দ".
3. NEVER use archaic/Sadhu Bengali (বলিতেছি, করিয়াছি — WRONG).
4. For verbs give the verbal-noun / base form: "শেখা" not "শিখতে", "দৌড়ানো" not "দৌড়াইতে".
5. Give the single most common word. If multiple meanings exist, join them with ", " (comma-space).

Return ONLY a valid JSON object — no markdown, no extra text:
{
  "bengaliMeaning": string,
  "partOfSpeech": string,
  "englishDefinition": string,
  "transcription": string,
  "pronunciation": string,
  "synonyms": string[],
  "antonyms": string[],
  "exampleEn": string,
  "exampleBn": string
}

Field rules:
- bengaliMeaning: natural Bangladeshi Bengali word(s). CORRECT: "ভালো", "পানি", "শেখা". WRONG: "উত্তম", "জল", "শিখিতেছি".
- partOfSpeech: "noun", "verb", "adjective", "adverb", etc.
- englishDefinition: ONE short, plain sentence explaining what the word means. Not academic, not casual — just clear.
- transcription: the query written in the OTHER script only (no translation). English → Bengali script; Bengali → Latin script.
- pronunciation: IPA in slashes + simple guide, e.g. "/rɪˈlʌktənt/ (ri-LUK-tant)". Never omit.
- synonyms: up to 4 common English synonyms. Never leave empty when synonyms exist.
- antonyms: up to 3 antonyms. Think carefully — never leave empty when real antonyms exist.
- exampleEn: ONE natural sentence using the word the way a native speaker would say it in daily life or anime.
- exampleBn: Bengali translation of exampleEn using natural Bangladeshi Bengali.

Direction: English query → Bengali meaning + Bengali-script transcription. Bengali query → English meaning + Latin-script transcription.
If unknown, use "" or []. Never invent.`

export function buildUserPrompt(query: string, isBengaliInput: boolean): string {
  return isBengaliInput
    ? `Bengali: "${query}" — give English meaning, transcription in Latin script, pronunciation, synonyms, antonyms, definition, and one example sentence.`
    : `English: "${query}" — give Bangladeshi Bengali meaning (CRITICAL RULES), transcription in Bengali script, pronunciation, synonyms, antonyms, definition, and one example sentence.`
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
