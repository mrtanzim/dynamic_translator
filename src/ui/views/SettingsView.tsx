import { useEffect, useState } from 'react'
import { loadAppSettings, saveAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '../../storage/app-settings'
import { inputStyle } from '../styles'

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

  useEffect(() => { void loadAppSettings().then(setSettings) }, [])

  function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    void saveAppSettings(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: 0 }}>
        Translation Settings
      </h2>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
        Settings are saved locally in your browser profile.
      </p>

      <div style={{ background: 'rgba(16, 24, 38, 0.55)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Auto-pronounce results</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Speak words aloud immediately after looking up</div>
          </div>
          <input
            type="checkbox"
            checked={settings.autoSpeak}
            onChange={(e) => update({ autoSpeak: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: '#38bdf8' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.12)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>History limit</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Maximum saved lookup entries</div>
          </div>
          <input
            type="number"
            min={20}
            max={2000}
            step={20}
            value={settings.historyLimit}
            onChange={(e) => update({ historyLimit: Number(e.target.value) })}
            style={{
              ...inputStyle,
              width: 80,
              height: 36,
              fontSize: 13,
              textAlign: 'center',
            }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.12)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Theme</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Visual surface appearance</div>
          </div>
          <select
            value={settings.theme}
            onChange={(e) => update({ theme: e.target.value as 'glass' })}
            style={{
              ...inputStyle,
              width: 140,
              height: 36,
              fontSize: 12,
            }}
          >
            <option value="glass">Glass (dark)</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export function AboutView() {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, color: '#e8edf2', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'rgba(16, 24, 38, 0.55)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 12, padding: 14 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong style={{ color: '#38bdf8' }}>VocabFlow</strong> — a floating bilingual vocabulary companion for media & anime streaming.
        </p>
      </div>

      <div style={{ background: 'rgba(16, 24, 38, 0.55)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>Quick Tips</div>
        <ul style={{ paddingLeft: 18, color: '#94a3b8', margin: 0, lineHeight: 1.7 }}>
          <li>Click the extension icon to toggle the overlay on any page.</li>
          <li>Drag the top bar to move; drag the bottom corner to resize.</li>
          <li>Click <strong style={{ color: '#f1f5f9' }}>—</strong> in the header to minimize the overlay during videos.</li>
          <li>Type any word and press Enter for instant lookup or use live autocomplete suggestions.</li>
          <li>Works 100% offline; AI seamlessly upgrades definitions when keys are connected.</li>
        </ul>
      </div>

      <p style={{ color: '#94a3b8', fontSize: 11, margin: '4px 0 0 4px' }}>Version 1.0.0</p>
    </div>
  )
}
