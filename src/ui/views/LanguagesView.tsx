import { useEffect, useState } from 'react'
import {
  DEFAULT_LANGUAGE_PAIR,
  isSupportedPair,
  loadLanguagePair,
  saveLanguagePair,
  type LanguagePair,
} from '../../storage/languages'
import { LanguageSelect } from './LanguageSelect'

export function LanguagesView() {
  const [pair, setPair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR)

  useEffect(() => {
    void loadLanguagePair().then(setPair)
  }, [])

  function update(patch: Partial<LanguagePair>) {
    const next = { ...pair, ...patch }
    setPair(next)
    void saveLanguagePair(next)
  }

  function swap() {
    update({ source: pair.target, target: pair.source })
  }

  const supported = isSupportedPair(pair)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 20 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: '0 0 4px 0' }}>
          Select Language
        </h2>
        <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>
          Choose which language to translate from and to.
        </p>
      </div>

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
        <LanguageSelect
          label="From"
          ariaLabel="Source language"
          value={pair.source}
          onChange={(source) => update({ source })}
        />

        <button
          type="button"
          aria-label="Swap languages"
          title="Swap languages"
          onClick={swap}
          style={{
            alignSelf: 'center',
            padding: '5px 14px',
            borderRadius: 6,
            border: '1px solid rgba(56, 189, 248, 0.4)',
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⇅ Swap
        </button>

        <LanguageSelect
          label="To"
          ariaLabel="Target language"
          value={pair.target}
          onChange={(target) => update({ target })}
        />
      </div>

      <div
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: supported ? '#6FCF97' : '#94a3b8',
          background: supported ? 'rgba(111, 207, 151, 0.08)' : 'rgba(148, 163, 184, 0.08)',
          border: `1px solid ${supported ? 'rgba(111, 207, 151, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
          borderRadius: 8,
          padding: '9px 11px',
        }}
      >
        {supported
          ? 'Bengali ⇄ English is fully supported.'
          : 'Preview only — Bengali ⇄ English translation is available now.'}
      </div>
    </div>
  )
}
