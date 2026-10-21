import { buildUserPrompt, fetchWithTimeout, isValidResult, parseAiJson, SYSTEM_PROMPT, toResult } from '../common'
import type { LookupResult } from '../../shared/types'
import type { ProviderConfig } from '../../storage/settings'

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function geminiLookup(
  query: string,
  isBengaliInput: boolean,
  config: ProviderConfig,
  requestId: string,
): Promise<LookupResult> {
  const url = `${URL_BASE}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(query, isBengaliInput) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!content) throw new Error('Gemini returned no content')
  const parsed = parseAiJson(content)
  if (!parsed) throw new Error('Gemini returned malformed JSON')
  const result = toResult('gemini', query, requestId, parsed)
  if (!isValidResult(result)) throw new Error('Gemini response missing required fields')
  return result
}
