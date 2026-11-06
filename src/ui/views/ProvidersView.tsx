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

  if (!settings) return <div style={{ color: '#94a3b8' }}>Loading…</div>

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: 0 }}>
        AI Providers
      </h2>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
        API keys are stored safely in this browser profile and are never synced or exposed.
      </p>

      {PROVIDERS.map(({ id, name, keyUrl }) => {
        const st = status[id]
        const mst = modelsStatus[id]
        return (
          <div key={id} className="provider-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ color: '#38bdf8', fontSize: 15 }}>{name}</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings[id].enabled}
                  onChange={(e) => update(id, { enabled: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: '#38bdf8' }}
                />
                Enabled
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey[id] ? 'text' : 'password'}
                value={draftKeys[id]}
                placeholder="Paste API key"
                onChange={(e) => setDraftKeys((d) => ({ ...d, [id]: e.target.value }))}
                style={{ ...inputStyle, flex: 1, height: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => ({ ...s, [id]: !s[id] }))}
                style={{ ...btn, padding: '0 12px', height: 38 }}
              >
                {showKey[id] ? 'Hide' : 'Show'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={settings[id].model}
                onChange={(e) => update(id, { model: e.target.value })}
                style={{ ...inputStyle, flex: 1, minWidth: 140, height: 36, fontSize: 12 }}
              >
                {mergeModels(id, liveModels[id], settings[id].model).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              {id === 'groq' && (
                <button
                  type="button"
                  onClick={() => void fetchModels(id)}
                  style={{ ...btn, height: 36, fontSize: 11 }}
                  title="Load the models this account can use"
                >
                  {mst.state === 'testing' ? '…' : 'Models'}
                </button>
              )}

              <button
                type="button"
                onClick={() => void test(id)}
                style={{ ...btn, height: 36, fontSize: 11 }}
              >
                {st.state === 'testing' ? 'Testing…' : 'Test'}
              </button>

              <button
                type="button"
                onClick={() => {
                  update(id, { apiKey: draftKeys[id] })
                  setStatus((s) => ({ ...s, [id]: { state: 'unknown' } }))
                }}
                style={{ ...btn, height: 36, fontSize: 11, background: 'rgba(56, 189, 248, 0.25)' }}
              >
                Save
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Remove the ${name} API key?`)) return
                  setDraftKeys((d) => ({ ...d, [id]: '' }))
                  update(id, { apiKey: '', enabled: false })
                  setStatus((s) => ({ ...s, [id]: { state: 'unknown' } }))
                }}
                style={{
                  ...btn,
                  height: 36,
                  fontSize: 11,
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                }}
              >
                Remove
              </button>
            </div>

            {st.state !== 'unknown' && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: st.state === 'ok' ? '#7fd1a6' : st.state === 'error' ? '#f87171' : '#38bdf8',
                }}
              >
                {st.state === 'ok' ? '✓ Connection successful' : st.state === 'error' ? (st.message ?? 'Failed') : 'Testing…'}
              </div>
            )}

            {id === 'groq' && mst.state !== 'unknown' && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: mst.state === 'ok' ? '#7fd1a6' : mst.state === 'error' ? '#f87171' : '#38bdf8',
                }}
              >
                {mst.state === 'ok' ? mst.message : mst.state === 'error' ? mst.message : 'Loading models…'}
              </div>
            )}

            <a
              href={keyUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 10,
                fontSize: 12,
                color: '#38bdf8',
                textDecoration: 'none',
              }}
            >
              Get a {name} API key →
            </a>
          </div>
        )
      })}
    </div>
  )
}
