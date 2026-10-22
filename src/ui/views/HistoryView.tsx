import { useEffect, useState } from 'react'
import { clearHistory, deleteHistory, listHistory, listSaved, updateHistory, type HistoryEntry } from '../../storage/history'
import { btn } from '../styles'

export function HistoryView({ savedOnly, onPick }: { savedOnly?: boolean; onPick: (q: string) => void }) {
  const [items, setItems] = useState<HistoryEntry[]>([])

  const refresh = () => {
    void (savedOnly ? listSaved() : listHistory()).then(setItems)
  }
  useEffect(refresh, [savedOnly])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#AAB8C8', fontSize: 12 }}>{items.length} item(s)</span>
        {!savedOnly && (
          <button
            style={btn}
            onClick={() => {
              if (!confirm('Clear all history?')) return
              void clearHistory().then(refresh)
            }}
          >
            Clear all
          </button>
        )}
      </div>
      {items.length === 0 && <div style={{ color: '#AAB8C8' }}>{savedOnly ? 'No saved words yet.' : 'No search history yet.'}</div>}
      {items.map((h) => (
        <div
          key={h.id}
          style={{ border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, padding: 8, background: 'rgba(16,21,29,0.45)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ color: '#65CFFF', cursor: 'pointer' }} onClick={() => onPick(h.query)}>{h.query}</strong>
            <span style={{ fontSize: 11, color: '#AAB8C8' }}>{new Date(h.timestamp).toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#AAB8C8' }}>Source: {h.source}</span>
            <span style={{ fontSize: 11, color: '#AAB8C8' }}>{h.direction}</span>
            {h.saved && <span style={{ fontSize: 11, color: '#F3C969' }}>★</span>}
            {h.id !== undefined && (
              <button
                style={{ ...btn, marginLeft: 'auto' }}
                onClick={() => {
                  if (savedOnly) {
                    void updateHistory(h.id as number, { saved: false }).then(refresh)
                  } else {
                    void deleteHistory(h.id as number).then(refresh)
                  }
                }}
              >
                {savedOnly ? 'Unsave' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
