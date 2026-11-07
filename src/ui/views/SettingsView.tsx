import { useEffect, useState } from 'react'
import { loadAppSettings, saveAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '../../storage/app-settings'
import { inputStyle } from '../styles'

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

  useEffect(() => {
    void loadAppSettings().then(setSettings)
  }, [])

  function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    void saveAppSettings(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 20 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: '0 0 4px 0' }}>
          Translation & Display Settings
        </h2>
        <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>
          Customize screen layout and which sections you want to see.
        </p>
      </div>

      {/* Screen Density & Layout Mode */}
      <div
        style={{
          background: 'rgba(16, 24, 38, 0.65)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 10,
          padding: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
            Display Mode (Screen Density)
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
            Choose whether to fill large screens or fit everything on a single view.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => update({ layoutDensity: 'comfortable' })}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${settings.layoutDensity === 'comfortable' ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
              background: settings.layoutDensity === 'comfortable' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.5)',
              color: settings.layoutDensity === 'comfortable' ? '#38bdf8' : '#e2e8f0',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Spacious / Expanded</div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>
              Taller cards, fills large screen without blank gaps
            </div>
          </button>

          <button
            type="button"
            onClick={() => update({ layoutDensity: 'compact' })}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${settings.layoutDensity === 'compact' ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
              background: settings.layoutDensity === 'compact' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.5)',
              color: settings.layoutDensity === 'compact' ? '#38bdf8' : '#e2e8f0',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Compact (Single Screen)</div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>
              Compact layout to view all info without scrolling
            </div>
          </button>
        </div>
      </div>

      {/* Customizable Content Modules */}
      <div
        style={{
          background: 'rgba(16, 24, 38, 0.65)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 10,
          padding: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
            Content Modules (Customize What Appears)
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
            Word Meaning and Definition are compulsory. Toggle the rest:
          </div>
        </div>

        {/* Compulsory items */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.85, padding: '4px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
              Word Meaning (Bengali)
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Core translations & parts of speech</div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            LOCKED
          </span>
        </div>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.85, padding: '4px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
              English Definition
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Oxford/Cambridge standard definition</div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            LOCKED
          </span>
        </div>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        {/* Optional toggles */}
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '3px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Synonyms & Antonyms</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Direct similar and opposite words</div>
          </div>
          <input
            type="checkbox"
            checked={settings.showSynAnt}
            onChange={(e) => update({ showSynAnt: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '3px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Collocations</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>High-frequency word partnerships</div>
          </div>
          <input
            type="checkbox"
            checked={settings.showCollocations}
            onChange={(e) => update({ showCollocations: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '3px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Sentence Example</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Bilingual natural contextual sentence</div>
          </div>
          <input
            type="checkbox"
            checked={settings.showExample}
            onChange={(e) => update({ showExample: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '3px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Word Family</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Noun, Verb, Adjective, Adverb grid</div>
          </div>
          <input
            type="checkbox"
            checked={settings.showWordFamily}
            onChange={(e) => update({ showWordFamily: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '3px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Common Mistakes (IELTS Tips)</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Usage pitfalls and preposition traps</div>
          </div>
          <input
            type="checkbox"
            checked={settings.showCommonMistake}
            onChange={(e) => update({ showCommonMistake: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.1)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '3px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>IELTS Band Score Badge</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Numeric academic band rating (e.g. 7.5)</div>
          </div>
          <input
            type="checkbox"
            checked={settings.showBandLevel}
            onChange={(e) => update({ showBandLevel: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </label>
      </div>

      {/* Audio & History */}
      <div
        style={{
          background: 'rgba(16, 24, 38, 0.65)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 10,
          padding: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
          Audio & History
        </div>

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Auto-pronounce results</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Speak words aloud immediately after lookup</div>
          </div>
          <input
            type="checkbox"
            checked={settings.autoSpeak}
            onChange={(e) => update({ autoSpeak: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: '#38bdf8' }}
          />
        </label>

        <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.12)' }} />

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>History limit</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Maximum saved lookup entries</div>
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
              width: 75,
              height: 34,
              fontSize: 12.5,
              textAlign: 'center',
            }}
          />
        </label>
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
