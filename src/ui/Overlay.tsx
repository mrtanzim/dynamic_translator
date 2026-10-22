import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LookupCoordinator } from '../lookup/coordinator'
import type { LookupResult, View } from '../shared/types'
import { MENU_ITEMS } from '../shared/types'
import { addHistory, listSaved, updateHistory, pruneHistory, type HistoryEntry } from '../storage/history'
import { loadAppSettings } from '../storage/app-settings'
import { isBengali } from '../providers/offline'
import { ProvidersView } from './views/ProvidersView'
import { HistoryView } from './views/HistoryView'
import { SettingsView, AboutView } from './views/SettingsView'

const STORAGE_KEY = 'vocabflow.overlay'
type Pos = { x: number; y: number; w: number; h: number }
const DEFAULT: Pos = { x: window.innerWidth - 400, y: 80, w: 380, h: 520 }
function clamp(p: Pos): Pos {
  const w = Math.min(Math.max(p.w, 300), window.innerWidth - 20)
  const h = Math.min(Math.max(p.h, 260), window.innerHeight - 20)
  const x = Math.min(Math.max(p.x, 0), window.innerWidth - w)
  const y = Math.min(Math.max(p.y, 0), window.innerHeight - h)
  return { x, y, w, h }
}

export function Overlay({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState<Pos>(DEFAULT)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('search')
  const [menuOpen, setMenuOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const dragging = useRef(false)
  const resizing = useRef(false)
  const start = useRef({ mx: 0, my: 0, pos: DEFAULT })
  const coordinator = useRef<LookupCoordinator | null>(null)
  const lastRequestId = useRef<string | null>(null)
  const lastLookup = useRef<string | null>(null)
  // FIX B: use ref instead of state to avoid stale closure in coordinator
  const historyIdRef = useRef<number | null>(null)
  // FIX C-overlay: app settings refs
  const autoSpeakRef = useRef(false)
  const historyLimitRef = useRef(200)
  const resultRef = useRef<LookupResult | null>(null)

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (r) => { if (r?.[STORAGE_KEY]) setPos(clamp(r[STORAGE_KEY] as Pos)) })
  }, [])

  // FIX C-overlay: load app settings on mount
  useEffect(() => {
    void loadAppSettings().then((s) => {
      autoSpeakRef.current = s.autoSpeak
      historyLimitRef.current = s.historyLimit
    })
  }, [])

  // FIX B: persistHistory has stable [] dep array so coordinator is created once
  const persistHistory = useCallback(async (r: LookupResult) => {
    try {
      // Two identities are in play and must not be mixed up:
      //   * `r.requestId` identifies the *search action*. The offline result
      //     and the AI result of one search share it, so the AI result
      //     updates the existing row instead of creating a second one.
      //   * `r.query` is the word the user actually typed. It is what the
      //     history row stores and what the lookup direction is derived
      //     from. It must not be the display word: a Bengali query is
      //     resolved to its English headword, so the offline and the AI
      //     result of one search would otherwise look like two different
      //     words.
      const query = r.query
      const direction = isBengali(query) ? 'bn->en' : 'en->bn'
      if (historyIdRef.current !== null && lastRequestId.current === r.requestId) {
        await updateHistory(historyIdRef.current as number, { result: r, source: r.source, timestamp: Date.now() })
      } else {
        const id = await addHistory({
          query,
          direction,
          result: r,
          source: r.source,
          timestamp: Date.now(),
          saved: false,
        })
        // FIX C-overlay: prune history after adding
        if (historyLimitRef.current > 0) await pruneHistory(historyLimitRef.current)
        lastRequestId.current = r.requestId
        historyIdRef.current = id
      }
      // A word is saved as a whole, not as a single row: the bookmark
      // follows the word, so re-searching a saved word does not create a
      // second saved entry for it.
      const savedForQuery = (await listSaved()).filter((h: HistoryEntry) => h.query === query)
      setSaved(savedForQuery.length > 0)
    } catch {
      // History persistence is best-effort; never break the lookup flow.
    }
  }, [])

  useEffect(() => {
    const c = new LookupCoordinator({
      onEvent: (e) => {
        if (e.type === 'LOCAL_RESULT' || e.type === 'AI_RESULT') {
          setResult(e.result)
          setError(null)
          // FIX C-overlay: track latest result before persisting
          resultRef.current = e.result
          void persistHistory(e.result)
        } else if (e.type === 'LOOKUP_ERROR') {
          setError(`${e.provider}: ${e.error}`)
        } else if (e.type === 'LOOKUP_COMPLETE') {
          setLoading(false)
          // FIX C-overlay: auto-speak on lookup complete
          if (autoSpeakRef.current && resultRef.current) speakWord(resultRef.current.query)
        }
      },
    })
    coordinator.current = c
    return () => c.cancel()
  }, [persistHistory])

  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) { setResult(null); setLoading(false); return }
      // Skip if this exact query was already looked up (e.g. via Enter).
      if (lastLookup.current === query.trim()) return
      lastLookup.current = query.trim()
      setLoading(true)
      setError(null)
      void coordinator.current?.lookup(query)
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => { chrome.storage.local.set({ [STORAGE_KEY]: pos }) }, [pos])

  /**
   * Toggles the bookmark for the word that is currently displayed.
   *
   * The bookmark belongs to the *word*, not to a single history row: a word
   * that was saved in an earlier search must not end up saved twice, so all
   * rows for the same query are toggled together.
   */
  async function toggleSave() {
    const word = resultRef.current?.query
    if (!word) return
    const savedRows = (await listSaved()).filter((h: HistoryEntry) => h.query === word)
    if (savedRows.length > 0) {
      for (const h of savedRows) {
        if (h.id !== undefined) await updateHistory(h.id, { saved: false })
      }
      setSaved(false)
      return
    }
    if (historyIdRef.current === null) return
    await updateHistory(historyIdRef.current, { saved: true })
    setSaved(true)
  }

  // FIX E: set utterance language by script (Bengali vs English)
  function speakWord(word: string) {
    try {
      const u = new SpeechSynthesisUtterance(word)
      u.lang = isBengali(word) ? 'bn-IN' : 'en-US'
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    } catch {
      // Speech is optional.
    }
  }

  const doSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    lastLookup.current = trimmed
    setLoading(true)
    setError(null)
    void coordinator.current?.lookup(trimmed)
  }

  const onHeaderDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input')) return
    dragging.current = true
    start.current = { mx: e.clientX, my: e.clientY, pos }
    const move = (ev: MouseEvent) => {
      if (!dragging.current) return
      const dx = ev.clientX - start.current.mx
      const dy = ev.clientY - start.current.my
      setPos(clamp({ ...start.current.pos, x: start.current.pos.x + dx, y: start.current.pos.y + dy }))
    }
    const up = () => { dragging.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const onResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    resizing.current = true
    start.current = { mx: e.clientX, my: e.clientY, pos }
    const move = (ev: MouseEvent) => {
      if (!resizing.current) return
      const dw = ev.clientX - start.current.mx
      const dh = ev.clientY - start.current.my
      setPos(clamp({ ...start.current.pos, w: start.current.pos.w + dw, h: start.current.pos.h + dh }))
    }
    const up = () => { resizing.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  const headerBtn: React.CSSProperties = { background: 'transparent', color: '#AAB8C8', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 6px' }
  const actionBtn: React.CSSProperties = { padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(101,207,255,0.12)', color: '#F3F6FA', cursor: 'pointer', fontSize: 12 }

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, width: pos.w, height: pos.h, background: 'rgba(30,41,54,0.82)', backdropFilter: 'blur(12px)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: 16, color: '#F3F6FA', zIndex: 2147483647, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
      <div onMouseDown={onHeaderDown} style={{ padding: 12, cursor: 'move', borderBottom: '1px solid rgba(148,163,184,0.28)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <span style={{ color: '#65CFFF', fontWeight: 600 }}>VocabFlow</span>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button style={headerBtn} title="Menu" onClick={() => setMenuOpen((o) => !o)}>⋯</button>
          <button style={headerBtn} title="Close" onClick={onClose}>×</button>
        </span>
        {menuOpen && (
          <div style={{ position: 'absolute', top: 42, right: 8, background: 'rgba(16,21,29,0.96)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: 10, padding: 6, minWidth: 180, zIndex: 10, cursor: 'default' }}>
            {MENU_ITEMS.map((m) => (
              <div
                key={m.view}
                onClick={() => { setView(m.view); setMenuOpen(false) }}
                style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(101,207,255,0.14)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {m.label}
              </div>
            ))}
          </div>
        )}
      </div>
      {view === 'search' && (
        <>
          <div style={{ padding: 12 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch(query) }} placeholder="Search any word" style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(16,21,29,0.6)', color: '#F3F6FA' }} />
          </div>
      <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ color: '#AAB8C8', fontSize: 12, marginBottom: 8 }}>Searching…</div>}
        {error && <div style={{ color: '#E58A8A', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        {!result && !loading && !error && <div style={{ color: '#AAB8C8' }}>Search any word to begin.</div>}
        {result && (
          <>
            <div style={{ color: '#65CFFF', fontSize: 20, fontWeight: 700 }}>{result.query}</div>
            {result.headword && (
              <div style={{ color: '#AAB8C8', fontSize: 12, marginTop: 2 }}>
                {isBengali(result.query) ? 'English' : 'Headword'}: {result.headword}
              </div>
            )}
            {result.partOfSpeech && <div style={{ color: '#AAB8C8', fontSize: 12, fontStyle: 'italic' }}>{result.partOfSpeech}</div>}
            {result.bengaliMeaning && <div style={{ marginTop: 6 }}>{result.bengaliMeaning}</div>}
            {result.englishDefinition && <div style={{ color: '#AAB8C8', marginTop: 6 }}>{result.englishDefinition}</div>}
            {result.synonyms && result.synonyms.length > 0 && (
              <div style={{ marginTop: 6 }}>Synonyms: {result.synonyms.join(', ')}</div>
            )}
            {result.antonyms && result.antonyms.length > 0 && (
              <div style={{ marginTop: 6 }}>Antonyms: {result.antonyms.join(', ')}</div>
            )}
            {result.exampleEn && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(16,21,29,0.55)', fontStyle: 'italic' }}>
                {result.exampleEn}
                {result.exampleBn && <div style={{ marginTop: 4, fontStyle: 'normal' }}>{result.exampleBn}</div>}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: '#AAB8C8' }}>Source: {result.source === 'offline' ? 'Offline dictionary' : result.source}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={() => speakWord(result.query)} style={actionBtn}>🔊 Pronounce</button>
              <button onClick={() => void toggleSave()} style={actionBtn}>{saved ? '★ Saved' : '☆ Save'}</button>
            </div>
          </>
        )}
      </div>
        </>
      )}
      {view === 'providers' && (
        <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
          <ProvidersView />
        </div>
      )}
      {view === 'history' && (
        <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
          <HistoryView onPick={(q) => { setQuery(q); setView('search'); doSearch(q) }} />
        </div>
      )}
      {view === 'saved' && (
        <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
          <HistoryView savedOnly onPick={(q) => { setQuery(q); setView('search'); doSearch(q) }} />
        </div>
      )}
      {view === 'settings' && (
        <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
          <SettingsView />
        </div>
      )}
      {view === 'about' && (
        <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
          <AboutView />
        </div>
      )}
      <div onMouseDown={onResizeDown} style={{ position: 'absolute', right: 4, bottom: 4, width: 16, height: 16, cursor: 'se-resize', background: 'rgba(101,207,255,0.4)', borderRadius: 4 }} />
    </div>
  )
}
