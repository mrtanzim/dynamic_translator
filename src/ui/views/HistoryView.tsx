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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: 0 }}>
          {savedOnly ? 'Saved Words' : 'Search History'}
        </h2>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{items.length} item(s)</span>
      </div>

      {!savedOnly && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={{
              ...btn,
              fontSize: 11,
              padding: '4px 10px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              color: '#f87171',
            }}
            onClick={() => {
              if (!confirm('Clear all history?')) return
              void clearHistory().then(refresh)
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
          {savedOnly ? 'No saved words yet.' : 'No search history yet.'}
        </div>
      )}

      {items.map((h) => (
        <div
          key={h.id}
          className="history-item"
        >
          <div className="history-item-header">
            <strong className="history-query" onClick={() => onPick(h.query)}>
              {h.query}
            </strong>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {new Date(h.timestamp).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="history-meta">
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Source: {h.source}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(148, 163, 184, 0.12)',
                color: '#cbd5e1',
              }}
            >
              {h.direction}
            </span>
            {h.saved && <span style={{ fontSize: 11, color: '#f3c969' }}>★ Saved</span>}
          </div>

          <div className="history-actions">
            {h.id !== undefined && (
              <button
                type="button"
                style={{
                  ...btn,
                  fontSize: 11,
                  padding: '4px 10px',
                  background: savedOnly ? 'rgba(243, 201, 105, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  borderColor: savedOnly ? 'rgba(243, 201, 105, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                  color: savedOnly ? '#f3c969' : '#f87171',
                }}
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
