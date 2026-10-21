import { useState } from 'react'

export function SettingsView() {
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(200)
  const [theme, setTheme] = useState('glass')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Auto-pronounce results</span>
        <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>History limit</span>
        <input
          type="number"
          min={20}
          max={2000}
          step={20}
          value={historyLimit}
          onChange={(e) => setHistoryLimit(Number(e.target.value))}
          style={{ width: 90, padding: 4, borderRadius: 6, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }}
        />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Theme</span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          style={{ padding: 4, borderRadius: 6, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }}
        >
          <option value="glass">Glass (dark)</option>
          <option value="light">Light</option>
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
