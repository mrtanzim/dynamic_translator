import type { LookupResult, ResultSource } from '../shared/types'

/**
 * The system prompt every provider uses.
 *
 * Asks for two registers of meaning — formal (IELTS / writing) and
 * conversational (spoken / anime subtitles) — so the learner knows both
 * how to write the word correctly and how it sounds in real dialogue.
 */
export const SYSTEM_PROMPT = `You are a bilingual English-Bengali vocabulary assistant for Bengali-native English learners preparing for IELTS and learning through anime/media.

Return ONLY a JSON object with this exact shape:
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
- bengaliMeaning: the natural Bengali translation a Bangladeshi would use.
- partOfSpeech: e.g. "noun", "verb", "adjective", "adverb".
- formalMeaning: 1–2 sentences defining the word in formal/written English (IELTS register). Use precise vocabulary.
- conversationalMeaning: how the word is actually used in everyday speech, casual dialogue or anime subtitles. Keep it simple and natural.
- usageNote: one sentence advising the learner WHEN to use which register, e.g. "Use this word in formal writing; in conversation say '...' instead." If both registers are the same, say so.
- transcription: the query written in the OTHER script only (no translation). English query → Bengali script ("cucumber" → "কুকুম্বার"). Bengali query → Latin script ("বই" → "boi"). Use everyday spelling.
- pronunciation: IPA or plain respelling (e.g. "/ɔːrɡənaɪˈzeɪʃən/" or "or-guh-ny-ZAY-shun"). Never leave empty.
- synonyms: English synonyms, formal ones first. Leave empty if none.
- antonyms: English antonyms. Always include if they exist — never leave empty when antonyms are real. Leave empty only if there are genuinely none.
- exampleFormal: a sentence using the word in a formal/written context (IELTS essay style).
- exampleConversational: a sentence using the word in casual speech or anime-style dialogue.
- exampleBn: Bengali translation of exampleConversational (the casual one).
- englishDefinition: a single concise definition sentence (kept for backward compatibility).

Direction: use the direction implied by the query (English→Bengali or Bengali→English).
If a field is truly unknown use "" or []. Never invent synonyms or antonyms.`

export function buildUserPrompt(query: string, isBengaliInput: boolean): string {
  return isBengaliInput
    ? `Query (Bengali): "${query}"\nProvide the English translation with both formal and conversational meanings, transcription in Latin script, pronunciation, synonyms, antonyms, and example sentences.`
    : `Query (English): "${query}"\nProvide the Bengali meaning with both formal (IELTS) and conversational (spoken/anime) English meanings, transcription in Bengali script, pronunciation, synonyms, antonyms, and example sentences.`
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
