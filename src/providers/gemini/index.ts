import { buildUserPrompt, fetchWithTimeout, isValidResult, parseAiJson, SYSTEM_PROMPT, toResult } from '../common'
import type { LookupResult } from '../../shared/types'
import type { ProviderConfig } from '../../storage/settings'

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * A single part of a Gemini response.
 *
 * `thought` marks a reasoning part; it is only returned when the request asks
 * for thoughts, but filtering defensively keeps a reasoning prefix out of the
 * JSON payload.
 */
interface GeminiPart {
  text?: string
  thought?: boolean
}

export async function geminiLookup(
  query: string,
  isBengaliInput: boolean,
  config: ProviderConfig,
  requestId: string,
): Promise<LookupResult> {
  const url = `${URL_BASE}/${encodeURIComponent(config.model)}:generateContent`
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The key travels in a header rather than the query string, so it never
      // lands in a URL, a referrer header or a request log.
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(query, isBengaliInput) }] }],
      generationConfig: {
        // NOTE: `temperature`, `top_p` and `top_k` are intentionally absent.
        // The Gemini 3.x line deprecated them and answers with HTTP 400 when
        // they are supplied, so the sampling parameters must not be sent.
        responseMimeType: 'application/json',
        // A vocabulary lookup is a simple, latency-sensitive task, so the
        // thinking depth is kept minimal. `thinkingLevel` replaces the legacy
        // `thinkingBudget` on the Gemini 3 line.
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const content = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
  if (!content) throw new Error('Gemini returned no content')
  const parsed = parseAiJson(content)
  if (!parsed) throw new Error('Gemini returned malformed JSON')
  const result = toResult('gemini', query, requestId, parsed)
  if (!isValidResult(result)) throw new Error('Gemini response missing required fields')
  return result
}
