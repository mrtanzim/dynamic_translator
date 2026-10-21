import { useEffect, useState } from 'react'
import { loadAppSettings, saveAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '../../storage/app-settings'

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

  useEffect(() => { void loadAppSettings().then(setSettings) }, [])

  function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    void saveAppSettings(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Auto-pronounce results</span>
        <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => update({ autoSpeak: e.target.checked })} />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>History limit</span>
        <input
          type="number"
          min={20}
          max={2000}
          step={20}
          value={settings.historyLimit}
          onChange={(e) => update({ historyLimit: Number(e.target.value) })}
          style={{ width: 90, padding: 4, borderRadius: 6, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }}
        />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Theme</span>
        <select
          value={settings.theme}
          onChange={(e) => update({ theme: e.target.value as 'glass' })}
          style={{ padding: 4, borderRadius: 6, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }}
        >
          <option value="glass">Glass (dark)</option>
        </select>
      </label>
      <p style={{ color: '#AAB8C8', fontSize: 12, margin: 0 }}>
        Settings are stored locally in this browser profile.
      </p>
    </div>
  )
}

export function AboutView() {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, color: '#F3F6FA' }}>
      <p style={{ marginTop: 0 }}>
        <strong style={{ color: '#65CFFF' }}>VocabFlow</strong> — a floating bilingual vocabulary overlay for language learners.
      </p>
      <ul style={{ paddingLeft: 18, color: '#AAB8C8' }}>
        <li>Click the extension icon to show or hide the overlay.</li>
        <li>Drag the header to move it; drag the bottom-right corner to resize.</li>
        <li>Type a word and press Enter for an instant lookup, or wait for live suggestions.</li>
        <li>Offline results are marked <em>Offline dictionary</em>; AI results show their provider name.</li>
        <li>Your API keys never leave this browser — they are stored in chrome.storage.local.</li>
      </ul>
      <p style={{ color: '#AAB8C8', fontSize: 12 }}>Version 0.1.0</p>
    </div>
  )
}
