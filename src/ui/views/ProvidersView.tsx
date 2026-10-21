import { useEffect, useState } from 'react'
import { PROVIDER_MODELS, loadSettings, saveSettings, type ProviderId, type ProviderSettings } from '../../storage/settings'
import { LIST_MODELS_MESSAGE, LOOKUP_MESSAGE, SEED_MESSAGE, type AiLookupRequest, type AiLookupResponse, type ListModelsRequest, type ListModelsResponse } from '../../providers/bridge'
import { btn, inputStyle } from '../styles'

const PROVIDERS: Array<{ id: ProviderId; name: string; keyUrl: string }> = [
  { id: 'groq', name: 'Groq', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'gemini', name: 'Google Gemini', keyUrl: 'https://aistudio.google.com/app/apikey' },
]

type Status = Record<ProviderId, { state: 'unknown' | 'testing' | 'ok' | 'error'; message?: string }>

const INITIAL: Status = { groq: { state: 'unknown' }, openrouter: { state: 'unknown' }, gemini: { state: 'unknown' } }

/**
 * Merges the models the account can actually use with the curated defaults and
 * the currently configured model, so that a live list never hides a model the
 * user has already selected.
 */
function mergeModels(provider: ProviderId, live: string[], current: string): string[] {
  const merged = new Set<string>([...PROVIDER_MODELS[provider], ...live, current])
  return [...merged]
}

export function ProvidersView() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [draftKeys, setDraftKeys] = useState<Record<ProviderId, string>>({ groq: '', openrouter: '', gemini: '' })
  const [showKey, setShowKey] = useState<Record<ProviderId, boolean>>({ groq: false, openrouter: false, gemini: false })
  const [status, setStatus] = useState<Status>(INITIAL)
  const [modelsStatus, setModelsStatus] = useState<Status>(INITIAL)
  const [liveModels, setLiveModels] = useState<Record<ProviderId, string[]>>({
    groq: [],
    openrouter: [],
    gemini: [],
  })

  useEffect(() => {
    // Ask the service worker to apply the first-run seed before reading the
    // settings, so the built-in key is visible on a fresh profile.
    void (async () => {
      try {
        await chrome.runtime.sendMessage({ type: SEED_MESSAGE })
      } catch {
        // The service worker may not be ready; the stored settings are used.
      }
      const s = await loadSettings()
      setSettings(s)
      setDraftKeys({ groq: s.groq.apiKey, openrouter: s.openrouter.apiKey, gemini: s.gemini.apiKey })
    })()
  }, [])

  if (!settings) return <div style={{ color: '#AAB8C8' }}>Loading…</div>

  const update = (id: ProviderId, patch: Partial<ProviderSettings[ProviderId]>) => {
    const next: ProviderSettings = { ...settings, [id]: { ...settings[id], ...patch } }
    setSettings(next)
    void saveSettings(next)
  }

  const test = async (id: ProviderId) => {
    const cfg = { ...settings[id], apiKey: draftKeys[id] || settings[id].apiKey }
    if (!cfg.apiKey) {
      setStatus((s) => ({ ...s, [id]: { state: 'error', message: 'API key required' } }))
      return
    }
    setStatus((s) => ({ ...s, [id]: { state: 'testing' } }))
    try {
      const request: AiLookupRequest = {
        type: LOOKUP_MESSAGE,
        provider: id,
        query: 'test',
        isBengali: false,
        model: cfg.model,
        apiKey: cfg.apiKey,
        requestId: 'test',
      }
      const response = (await chrome.runtime.sendMessage(request)) as AiLookupResponse | undefined
      if (!response) throw new Error('No response from VocabFlow service worker')
      if (!response.ok) throw new Error(response.error)
      setStatus((s) => ({ ...s, [id]: { state: 'ok', message: 'Connection successful' } }))
    } catch (err) {
      setStatus((s) => ({ ...s, [id]: { state: 'error', message: err instanceof Error ? err.message : 'Failed' } }))
    }
  }

  /** Fetches the models the account can actually use (Groq only, for now). */
  const fetchModels = async (id: ProviderId) => {
    const key = draftKeys[id] || settings[id].apiKey
    if (!key) {
      setModelsStatus((s) => ({ ...s, [id]: { state: 'error', message: 'API key required' } }))
      return
    }
    setModelsStatus((s) => ({ ...s, [id]: { state: 'testing' } }))
    try {
      const request: ListModelsRequest = { type: LIST_MODELS_MESSAGE, provider: id, apiKey: key }
      const response = (await chrome.runtime.sendMessage(request)) as ListModelsResponse | undefined
      if (!response) throw new Error('No response from VocabFlow service worker')
      if (!response.ok) throw new Error(response.error)
      setLiveModels((m) => ({ ...m, [id]: response.models }))
      setModelsStatus((s) => ({ ...s, [id]: { state: 'ok', message: `${response.models.length} models available` } }))
    } catch (err) {
      setModelsStatus((s) => ({ ...s, [id]: { state: 'error', message: err instanceof Error ? err.message : 'Failed' } }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, color: '#AAB8C8', fontSize: 12 }}>
        API keys are stored only in this browser profile and are never synced or uploaded.
      </p>
      {PROVIDERS.map(({ id, name, keyUrl }) => {
        const st = status[id]
        const mst = modelsStatus[id]
        return (
          <div key={id} style={{ border: '1px solid rgba(148,163,184,0.28)', borderRadius: 12, padding: 12, background: 'rgba(16,21,29,0.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: '#65CFFF' }}>{name}</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#AAB8C8' }}>
                <input type="checkbox" checked={settings[id].enabled} onChange={(e) => update(id, { enabled: e.target.checked })} />
                Enabled
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showKey[id] ? 'text' : 'password'}
                value={draftKeys[id]}
                placeholder="API key"
                onChange={(e) => setDraftKeys((d) => ({ ...d, [id]: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => setShowKey((s) => ({ ...s, [id]: !s[id] }))} style={btn}>Show</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <select value={settings[id].model} onChange={(e) => update(id, { model: e.target.value })} style={{ ...inputStyle, flex: 1, fontSize: 12 }}>
                {mergeModels(id, liveModels[id], settings[id].model).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {id === 'groq' && (
                <button
                  onClick={() => void fetchModels(id)}
                  style={btn}
                  title="Load the models this account can use"
                >
                  {mst.state === 'testing' ? '…' : 'Models'}
                </button>
              )}
              <button onClick={() => void test(id)} style={btn}>{st.state === 'testing' ? 'Testing…' : 'Test'}</button>
              <button onClick={() => { update(id, { apiKey: draftKeys[id] }); setStatus((s) => ({ ...s, [id]: { state: 'unknown' } })) }} style={btn}>Save</button>
              <button
                onClick={() => {
                  if (!confirm(`Remove the ${name} API key?`)) return
                  setDraftKeys((d) => ({ ...d, [id]: '' }))
                  update(id, { apiKey: '', enabled: false })
                  setStatus((s) => ({ ...s, [id]: { state: 'unknown' } }))
                }}
                style={{ ...btn, color: '#E58A8A' }}
              >
                Remove
              </button>
            </div>
            {st.state !== 'unknown' && (
              <div style={{ marginTop: 6, fontSize: 12, color: st.state === 'ok' ? '#7FD1A6' : st.state === 'error' ? '#E58A8A' : '#AAB8C8' }}>
                {st.state === 'ok' ? 'Connected' : st.state === 'error' ? (st.message ?? 'Failed') : 'Testing…'}
              </div>
            )}
            {id === 'groq' && mst.state !== 'unknown' && (
              <div style={{ marginTop: 6, fontSize: 12, color: mst.state === 'ok' ? '#7FD1A6' : mst.state === 'error' ? '#E58A8A' : '#AAB8C8' }}>
                {mst.state === 'ok' ? mst.message : mst.state === 'error' ? mst.message : 'Loading models…'}
              </div>
            )}
            <a href={keyUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: '#65CFFF' }}>
              Get a {name} API key →
            </a>
          </div>
        )
      })}
    </div>
  )
}

