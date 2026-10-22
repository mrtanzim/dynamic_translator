import type { LookupResult, ResultSource } from '../shared/types'

/**
 * The system prompt every provider uses.
 *
 * It asks for more than a translation: a learner needs to know how the word
 * is written in the other script and how it is pronounced, otherwise an
 * English word is unreadable for them and a Bengali word is unpronounceable.
 */
export const SYSTEM_PROMPT = `You are a bilingual English-Bengali vocabulary assistant for Bengali-native English learners.
Return ONLY a JSON object with this exact shape:
{"bengaliMeaning": string, "englishDefinition": string, "transcription": string, "pronunciation": string, "synonyms": string[], "antonyms": string[], "exampleEn": string, "exampleBn": string, "partOfSpeech": string}

Field rules:
- bengaliMeaning: the Bengali translation of the query, in natural Bengali.
- englishDefinition: one or two short sentences that explain the word in English.
- transcription: the query written in the OTHER script, so that the learner can read it.
  For an English query give the Bengali script ("cucumber" -> "কুকুম্বার");
  for a Bengali query give the Latin script ("বই" -> "boi").
  Use the common everyday spelling, not a scholarly transliteration, and never translate the word here.
- pronunciation: how the word is pronounced, in IPA or in a plain respelling
  ("cucumber" -> "/kʌmˈbʌmbər/" or "kuhm-BUM-ber"). Never leave it empty when the word can be pronounced.
- synonyms and antonyms: English words only. Leave them empty when the word has none.
- exampleEn: an English sentence that uses the word naturally.
- exampleBn: the same sentence in Bengali.
- partOfSpeech: the most common part of speech, e.g. "noun", "verb", "adjective".

Use the direction implied by the user query (English->Bengali or Bengali->English).
If a field is unknown, use an empty string or empty array. Never invent synonyms or antonyms.`

export function buildUserPrompt(query: string, isBengaliInput: boolean): string {
  return isBengaliInput
    ? `Query (Bengali): "${query}"\nGive the English translation, a short English definition, the Latin-script transcription, the pronunciation, synonyms, antonyms and an example sentence with its English translation.`
    : `Query (English): "${query}"\nGive the Bengali meaning, a short English definition, the Bengali-script transcription, the pronunciation, synonyms, antonyms and an example sentence with its Bengali translation.`
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
      transcription: str(obj.transcription),
      pronunciation: str(obj.pronunciation),
      synonyms: arr(obj.synonyms),
      antonyms: arr(obj.antonyms),
      exampleEn: str(obj.exampleEn),
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
