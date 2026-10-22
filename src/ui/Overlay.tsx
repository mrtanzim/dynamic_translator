import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LookupCoordinator } from '../lookup/coordinator'
import type { LookupResult, View } from '../shared/types'
import { MENU_ITEMS } from '../shared/types'
import { addHistory, listSaved, updateHistory, pruneHistory, type HistoryEntry } from '../storage/history'
import { loadAppSettings } from '../storage/app-settings'
import { isBengali, suggestWords, type SuggestionPayload } from '../providers/offline'
import { ProvidersView } from './views/ProvidersView'
import { HistoryView } from './views/HistoryView'
import { SettingsView, AboutView } from './views/SettingsView'

const STORAGE_KEY = 'vocabflow.overlay'
/** How long the overlay position is left unsettled before it is persisted. */
const POSITION_WRITE_DEBOUNCE_MS = 300
/** How long the search waits before the query is sent to the dictionary. */
const LOOKUP_DEBOUNCE_MS = 300
/** How long the search waits before the type-ahead suggestions are requested. */
const SUGGEST_DEBOUNCE_MS = 120
/** How long the type-ahead suggestions may take before they are given up on. */
const SUGGEST_TIMEOUT_MS = 1000
/** The number of type-ahead suggestions that are shown. */
const SUGGEST_LIMIT = 8
type Pos = { x: number; y: number; w: number; h: number }
const DEFAULT: Pos = { x: window.innerWidth - 400, y: 80, w: 380, h: 520 }
function clamp(p: Pos): Pos {
  const w = Math.min(Math.max(p.w, 300), window.innerWidth - 20)
  const h = Math.min(Math.max(p.h, 260), window.innerHeight - 20)
  const x = Math.min(Math.max(p.x, 0), window.innerWidth - w)
  const y = Math.min(Math.max(p.y, 0), window.innerHeight - h)
  return { x, y, w, h }
}

/**
 * Whether the query is only the beginning of a suggested word.
 *
 * "cucu" is not a word the user wants looked up yet — the suggestion
 * "cucumber" is the answer they are looking for. But "book" is a word in its
 * own right, even though "bookcase" starts with it, so a query that is
 * exactly one of the suggestions is never treated as partial.
 */
function isPartialWord(query: string, suggestions: SuggestionPayload[]): boolean {
  if (!suggestions.length) return false
  const q = query.toLowerCase()
  if (suggestions.some((s) => s.word.toLowerCase() === q)) return false
  return suggestions.some((s) => s.word.toLowerCase().startsWith(q))
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
  const [suggestions, setSuggestions] = useState<SuggestionPayload[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const dragging = useRef(false)
  const resizing = useRef(false)
  const start = useRef({ mx: 0, my: 0, pos: DEFAULT })
  const coordinator = useRef<LookupCoordinator | null>(null)
  const lastRequestId = useRef<string | null>(null)
  const lastLookup = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // The suggestions arrive out of order when the user types quickly, so only
  // the answer of the newest request is used.
  const suggestSeq = useRef(0)
  // The suggestions of the current query, and the query they belong to. The
  // refs hold the values the lookup needs, the state holds the values the
  // list is rendered from.
  const suggestionsRef = useRef<SuggestionPayload[]>([])
  const suggestionsForRef = useRef<string>('')
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

  /**
   * Type-ahead suggestions.
   *
   * The dictionary lives in the service worker, so the request is proxied
   * through it. The answer of a request that has been overtaken by a newer
   * keystroke is dropped, and a request that never comes back is given up on
   * so that the lookup is not blocked by it.
   */
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      suggestionsRef.current = []
      suggestionsForRef.current = ''
      return
    }
    const seq = ++suggestSeq.current
    const t = setTimeout(() => {
      let expiryTimer: ReturnType<typeof setTimeout> | undefined
      const request = suggestWords(trimmed, SUGGEST_LIMIT)
        .then((list) => ({ list }))
        // The suggestions are a convenience: a failure must not break the
        // lookup that follows.
        .catch(() => ({ list: [] as SuggestionPayload[] }))
      const expiry = new Promise<{ list: SuggestionPayload[] }>((resolve) => {
        expiryTimer = setTimeout(() => resolve({ list: [] }), SUGGEST_TIMEOUT_MS)
      })
      void Promise.race([request, expiry]).then(({ list }) => {
        if (expiryTimer !== undefined) clearTimeout(expiryTimer)
        if (seq !== suggestSeq.current) return
        suggestionsRef.current = list
        suggestionsForRef.current = trimmed
        setSuggestions(list)
        setHighlight(-1)
      })
    }, SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = query.trim()
      if (!trimmed) { setResult(null); setLoading(false); return }
      // The lookup waits for the suggestions of *this* query: a half-typed
      // word must not be sent to the AI providers before it is known that it
      // is only the beginning of a longer word. The suggestions arrive as a
      // state change, which re-runs this effect.
      if (suggestionsForRef.current !== trimmed) return
      // A word that is only the beginning of a known word is not looked up:
      // the suggestions are the better answer while the user is still typing.
      if (isPartialWord(trimmed, suggestionsRef.current)) return
      // Skip if this exact query was already looked up (e.g. via Enter).
      if (lastLookup.current === trimmed) return
      lastLookup.current = trimmed
      setLoading(true)
      setError(null)
      void coordinator.current?.lookup(trimmed)
    }, LOOKUP_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, suggestions])

  // The position is persisted on every drag/resize frame, which would write
  // to storage hundreds of times per second. The write is debounced so that
  // only the final position is stored.
  const posRef = useRef(pos)
  posRef.current = pos
  useEffect(() => {
    const t = setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: pos })
    }, POSITION_WRITE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [pos])

  // The debounced write is cancelled when the overlay closes, so the last
  // position is flushed on unmount.
  useEffect(() => {
    return () => {
      chrome.storage.local.set({ [STORAGE_KEY]: posRef.current })
    }
  }, [])

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
    setSuggestOpen(false)
    setLoading(true)
    setError(null)
    void coordinator.current?.lookup(trimmed)
  }

  /**
   * Empties the search field and everything it produced.
   *
   * The in-flight lookup is cancelled as well, so a slow provider cannot
   * resurrect the word that was just removed.
   */
  const clearSearch = () => {
    setQuery('')
    setResult(null)
    setError(null)
    setLoading(false)
    setSuggestions([])
    setHighlight(-1)
    setSuggestOpen(false)
    suggestionsRef.current = []
    suggestionsForRef.current = ''
    lastLookup.current = null
    coordinator.current?.cancel()
    inputRef.current?.focus()
  }

  /** Looks up a word the user picked from the suggestions. */
  const pickSuggestion = (suggestion: SuggestionPayload) => {
    setQuery(suggestion.word)
    setSuggestions([])
    setHighlight(-1)
    setSuggestOpen(false)
    lastLookup.current = suggestion.word
    setLoading(true)
    setError(null)
    void coordinator.current?.lookup(suggestion.word)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const list = visibleSuggestions
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault()
      setSuggestOpen(true)
      setHighlight((h) => (h + 1) % list.length)
      return
    }
    if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault()
      setSuggestOpen(true)
      setHighlight((h) => (h <= 0 ? list.length - 1 : h - 1))
      return
    }
    if (e.key === 'Escape') {
      setSuggestOpen(false)
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    // A word that is in the dictionary is searched as it was typed; anything
    // else takes the highlighted suggestion, so a half-typed or misspelled
    // word still finds its entry.
    const exact = list.find((s) => s.word.toLowerCase() === trimmed.toLowerCase())
    if (exact) {
      doSearch(trimmed)
      return
    }
    if (list.length) {
      pickSuggestion(list[highlight >= 0 ? highlight : 0])
      return
    }
    doSearch(trimmed)
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

  // The suggestions of an empty search are stale by definition, so they are
  // not shown.
  const visibleSuggestions = query.trim() ? suggestions : []

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
          <div style={{ padding: 12, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(16,21,29,0.6)' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true) }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setSuggestOpen(false)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search any word"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: '#F3F6FA', padding: '8px 0' }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={clearSearch}
                  style={{ background: 'transparent', border: 'none', color: '#AAB8C8', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                >
                  ×
                </button>
              )}
            </div>
            {suggestOpen && visibleSuggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Suggestions"
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  top: 'calc(100% - 6px)',
                  zIndex: 20,
                  background: 'rgba(16,21,29,0.98)',
                  border: '1px solid rgba(148,163,184,0.28)',
                  borderRadius: 10,
                  overflow: 'hidden auto',
                  maxHeight: 210,
                }}
              >
                {visibleSuggestions.map((s, i) => (
                  <div
                    key={`${s.word}-${i}`}
                    role="option"
                    aria-selected={i === highlight}
                    // Keeping the focus in the input means the click lands on
                    // the suggestion instead of closing the list first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                    style={{
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      background: i === highlight ? 'rgba(101,207,255,0.16)' : 'transparent',
                      color: '#F3F6FA',
                    }}
                  >
                    <span>{s.word}</span>
                    {s.hint && (
                      <span style={{ color: '#AAB8C8', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                        {s.hint}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
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
            {result.transcription && (
              <div style={{ marginTop: 6 }}>
                <span style={{ color: '#AAB8C8' }}>
                  {isBengali(result.query) ? 'In Latin script' : 'In Bengali script'}:
                </span>{' '}
                {result.transcription}
              </div>
            )}
            {result.pronunciation && (
              <div style={{ color: '#AAB8C8', marginTop: 4 }}>Pronunciation: {result.pronunciation}</div>
            )}
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
