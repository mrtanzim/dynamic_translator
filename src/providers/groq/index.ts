import { buildUserPrompt, fetchWithTimeout, isValidResult, parseAiJson, SYSTEM_PROMPT, toResult } from '../common'
import type { LookupDirection, LookupResult } from '../../shared/types'
import type { ProviderConfig } from '../../storage/settings'

const URL = 'https://api.groq.com/openai/v1/chat/completions'

export async function groqLookup(
  query: string,
  isBengaliInput: boolean,
  config: ProviderConfig,
  requestId: string,
  direction?: LookupDirection,
): Promise<LookupResult> {
  const res = await fetchWithTimeout(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(query, direction ?? isBengaliInput) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned no content')
  const parsed = parseAiJson(content)
  if (!parsed) throw new Error('Groq returned malformed JSON')
  const result = toResult('groq', query, requestId, parsed)
  if (!isValidResult(result, direction)) throw new Error('Groq response missing required fields')
  return result
}
