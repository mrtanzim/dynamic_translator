import type { LookupResult, ResultSource } from '../shared/types'

export const SYSTEM_PROMPT = `You are a bilingual English-Bengali vocabulary assistant for learners.
Return ONLY a JSON object with this exact shape:
{"bengaliMeaning": string, "englishDefinition": string, "synonyms": string[], "antonyms": string[], "exampleEn": string, "exampleBn": string, "partOfSpeech": string}
Use the direction implied by the user query (English->Bengali or Bengali->English).
If a field is unknown, use an empty string or empty array. Never invent synonyms or antonyms.`

export function buildUserPrompt(query: string, isBengaliInput: boolean): string {
  return isBengaliInput
    ? `Query (Bengali): "${query}"\nProvide the natural English translation plus usage context.`
    : `Query (English): "${query}"\nProvide the Bengali meaning, a contextual English definition, synonyms, antonyms and an example with Bengali translation.`
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
  word: string,
  requestId: string,
  parsed: Partial<LookupResult>,
): LookupResult {
  return {
    word,
    source,
    requestId,
    timestamp: Date.now(),
    ...parsed,
  }
}

export function isValidResult(r: LookupResult): boolean {
  return !!(r.englishDefinition || r.bengaliMeaning || r.exampleEn)
}
