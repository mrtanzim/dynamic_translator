import {
  isBengali,
  normalize,
  offlineBengaliLookup,
  offlineJapaneseLookup,
  offlineLookupWithMatch,
  type OfflineEntryPayload,
} from '../providers/offline'
import { isJapanese } from '../providers/offline/ja-dataset'
import { decodeWordFamily } from '../providers/offline/dataset'
import {
  LOOKUP_MESSAGE,
  SEED_MESSAGE,
  type AiLookupRequest,
  type AiLookupResponse,
  type OfflineLookupMatch,
} from '../providers/bridge'
import { loadSettings, type ProviderId, type ProviderSettings } from '../storage/settings'
import { isSupportedPair, loadLanguagePair } from '../storage/languages'
import type { LookupDirection, LookupEvent, LookupResult, ResultSource } from '../shared/types'

/**
 * Provider ranking, best first.
 *
 * The offline dictionary is listed last on purpose: it is the provisional
 * result and must never outrank a real provider. Without it,
 * `PRIORITY.indexOf('offline')` would be -1, which wins every tie-break
 * against a provider.
 */
const PRIORITY: ResultSource[] = ['groq', 'openrouter', 'gemini', 'offline']

/** How long the offline dictionary lookup may take before it is given up on. */
const OFFLINE_TIMEOUT_MS = 3000

export interface CoordinatorOptions {
  onEvent: (e: LookupEvent) => void
}

/** The offline dictionary entry, plus the canonical headword it resolved to. */
interface OfflineHit {
  entry: OfflineEntryPayload
  /** The English headword, when it is worth showing next to the query. */
  headword?: string
  /**
   * The romanization of the queried Bengali spelling.
   *
   * It is the Latin-script spelling of the word the user typed ("বই" ->
   * "boi"), so it is only set for a Bengali query: for an English query the
   * other script is Bengali, which only the AI provider can write.
   */
  roman?: string
  via?: OfflineLookupMatch
}

export class LookupCoordinator {
  private seq = 0
  private currentId: string | null = null
  private best: LookupResult | null = null
  private cache = new Map<string, LookupResult>()
  private options: CoordinatorOptions

  constructor(options: CoordinatorOptions) {
    this.options = options
  }

  /** Cancels/Invalidates the in-flight lookup. */
  cancel(): void {
    this.currentId = null
  }

  private emit(e: LookupEvent) { this.options.onEvent(e) }

  private completeness(r: LookupResult): number {
    let score = 0
    if (r.englishDefinition) score += 1
    if (r.bengaliMeaning) score += 2
    if (r.transcription) score += 1
    if (r.synonyms?.length) score += 1
    if (r.antonyms?.length) score += 1
    if (r.exampleEn) score += 1
    if (r.exampleBn) score += 2
    if (r.partOfSpeech) score += 1
    return score
  }

  private isBetter(candidate: LookupResult, current: LookupResult): boolean {
    const cScore = this.completeness(candidate)
    const curScore = this.completeness(current)
    if (cScore !== curScore) return cScore > curScore
    const cRank = PRIORITY.indexOf(candidate.source)
    const curRank = PRIORITY.indexOf(current.source)
    if (cRank !== curRank) return cRank < curRank
    return candidate.timestamp > current.timestamp
  }

  /**
   * Decides whether a provider result may replace the current best one.
   *
   * The offline dictionary result is provisional: the first valid provider
   * result always replaces it, even when the offline entry happens to carry
   * more fields. Later provider results only replace the accepted one when
   * they are strictly better.
   */
  private accepts(result: LookupResult): boolean {
    const best = this.best
    if (best === null) return true
    if (best.source === 'offline') return true
    return this.isBetter(result, best)
  }

  /**
   * Loads the provider settings, making sure that the service worker has
   * applied the first-run seed first. Without this handshake a first lookup
   * could read the settings before the seed had written them, and the
   * built-in API key would never be used.
   */
  private async loadSeededSettings(): Promise<ProviderSettings> {
    try {
      await chrome.runtime.sendMessage({ type: SEED_MESSAGE })
    } catch {
      // The service worker may be unavailable; fall back to the stored settings.
    }
    return loadSettings()
  }

  /** Sends the provider request through the extension service worker. */
  private async callProvider(
    provider: ProviderId,
    query: string,
    bengaliInput: boolean,
    apiKey: string,
    model: string,
    requestId: string,
    direction: LookupDirection,
  ): Promise<LookupResult> {
    const request: AiLookupRequest = {
      type: LOOKUP_MESSAGE,
      provider,
      query,
      isBengali: bengaliInput,
      model,
      apiKey,
      requestId,
      direction,
    }
    const response = (await chrome.runtime.sendMessage(request).catch((err) => {
      if (String(err).includes('Extension context invalidated')) {
        throw new Error('Extension reloaded. Please refresh this page.')
      }
      throw err
    })) as AiLookupResponse | undefined
    if (!response) throw new Error('No response from VocabFlow service worker')
    if (!response.ok) throw new Error(response.error)
    return response.result
  }

  /**
   * Looks the query up in the offline dictionary.
   *
   * The dictionary itself lives in the service worker, so this is an
   * asynchronous round trip. Failures are swallowed and the lookup is given up
   * on after a timeout: a broken offline dictionary must never break the AI
   * lookups.
   */
  private async fetchOffline(
    query: string,
    bengaliInput: boolean,
    direction: LookupDirection,
  ): Promise<OfflineHit | null> {
    const useBengaliDataset = direction === 'bn-en' || bengaliInput
    const lookup = (async () => {
      let payload: OfflineEntryPayload | null = null
      let roman = ''
      let via: OfflineLookupMatch | undefined
      if (direction === 'ja-en' || direction === 'en-ja') {
        const ja = await offlineJapaneseLookup(query, direction)
        if (ja) {
          payload = {
            headword: ja.en,
            bn: ja.surface,
            bnAlts: [],
            trans: ja.romaji,
            transAlts: [],
            def: ja.en,
            pos: ja.pos,
            syn: ja.synEn,
            ant: ja.antEn,
            ex: ja.exampleEn,
            exBn: '',
            pron: '',
            kana: ja.kana,
            romaji: ja.romaji,
            exampleJa: ja.exampleJa,
            formalMeaning: ja.formalMeaning,
            conversationalMeaning: ja.conversationalMeaning,
            exampleFormal: ja.exampleFormal,
            exampleConversational: ja.exampleConversational,
            collocations: ja.collocations,
            wordFamily: decodeWordFamily(ja.wordFamily),
            bandLevel: ja.bandLevel,
            commonMistake: ja.commonMistake,
          }
          // No offline English-in-Japanese-script transcription exists; the
          // dedicated kana/romaji fields carry the reading instead.
          roman = ''
          via = 'japanese'
        }
      } else if (useBengaliDataset) {
        const hit = await offlineBengaliLookup(query, direction)
        payload = hit?.entry ?? null
        roman = hit?.roman ?? ''
        via = 'bengali'
      } else {
        const hit = await offlineLookupWithMatch(query)
        payload = hit.entry
        via = hit.via
        if (payload?.trans) roman = payload.trans
      }
      if (!payload) return null
      // The headword is the canonical English word of the entry. It is only
      // worth showing when it differs from what the user typed: for a Bengali
      // query it is the English answer, for an English synonym it is the
      // headword the synonym belongs to.
      const headword = payload.headword
      const interesting =
        !!headword && headword.toLowerCase() !== query.toLowerCase() ? headword : undefined
      return { entry: payload, headword: interesting, roman, via }
    })()

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), OFFLINE_TIMEOUT_MS)
    })
    try {
      return await Promise.race([lookup, timeout])
    } catch {
      // Offline lookup is best-effort.
      return null
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /** Runs a full offline + concurrent AI lookup. */
  async lookup(rawQuery: string, settings?: ProviderSettings): Promise<void> {
    const query = rawQuery.trim()
    if (!query) return
    const normalized = normalize(query)
    if (!normalized) return

    const cached = this.cache.get(normalized)
    if (cached) {
      // A cache hit is still its own search action, so it gets a fresh
      // request id: it must not be merged with the entry of the lookup that
      // originally produced the cached result.
      const requestId = `r${++this.seq}`
      this.currentId = requestId
      this.emit({ type: 'AI_RESULT', result: { ...cached, word: query, query, requestId } })
      this.emit({ type: 'LOOKUP_COMPLETE', requestId })
      return
    }

    const requestId = `r${++this.seq}`
    this.currentId = requestId
    this.best = null

    // 1) Offline dictionary (provisional) and 2) AI providers run concurrently.
    //    The offline lookup is proxied through the service worker, so it is
    //    asynchronous: its result is emitted as soon as it arrives, without
    //    waiting for the AI providers.
    const bengaliInput = isBengali(query)
    const japaneseInput = isJapanese(query)

    // The seed handshake is dispatched first (without awaiting it) so that the
    // service worker applies the first-run seed while the offline lookup is
    // already in flight. The settings are awaited further down.
    const settingsPromise = settings ? Promise.resolve(settings) : this.loadSeededSettings()
    const pairPromise = loadLanguagePair()

    // The explicit language choice must be resolved before any result is
    // emitted. Banglish is Latin script, so it cannot be detected from the
    // query alone; the offline roman index is incomplete and can even
    // misclassify a Banglish word as an English headword.
    const [cfg, pair] = await Promise.all([settingsPromise, pairPromise])
    const pinnedToBengali = isSupportedPair(pair) && pair.source === 'bn' && pair.target === 'en'
    const pinnedJaEn = isSupportedPair(pair) && pair.source === 'ja' && pair.target === 'en'
    const pinnedEnJa = isSupportedPair(pair) && pair.source === 'en' && pair.target === 'ja'
    let direction: LookupDirection
    if (japaneseInput || pinnedJaEn) direction = 'ja-en'
    else if (pinnedEnJa) direction = 'en-ja'
    else direction = bengaliInput || pinnedToBengali ? 'bn-en' : 'en-bn'

    // A single offline round trip serves two purposes: it produces the
    // provisional result and it resolves the canonical headword. The headword
    // is read without awaiting the lookup, so a slow offline dictionary can
    // never delay a provider result. The resolved direction is passed so the
    // service worker can pick the Bengali-first dataset for a Banglish query.
    const offlinePromise = this.fetchOffline(query, bengaliInput, direction)

    let headword: string | undefined
    const offlineJob = offlinePromise.then((hit) => {
      headword = hit?.headword
      // Auto-detect from the offline match only when the user has not pinned
      // the direction. A pinned Bengali-to-English choice must never be
      // overridden by an ambiguous dictionary match.
      if (!pinnedToBengali && (hit?.via === 'roman' || hit?.via === 'bengali')) direction = 'bn-en'
      if (!hit) return
      if (this.currentId !== requestId) return // stale
      const source = hit.entry
      const bengaliMeanings = [source.bn, ...source.bnAlts].filter(Boolean)
      const offlineResult: LookupResult = {
        // The word is always the query as typed; the canonical headword is
        // carried separately so that the display stays stable.
        word: query,
        query,
        headword: hit.headword,
        source: 'offline',
        direction,
        requestId,
        timestamp: Date.now(),
        // All Bengali meanings of the headword, not just the first one.
        bengaliMeaning: bengaliMeanings.join(', '),
        englishDefinition: source.def,
        // Prefer the generated formal meaning; fall back to the definition so
        // the dual-register UI still shows something useful on older entries.
        formalMeaning: source.formalMeaning || source.def || undefined,
        // Prefer the generated conversational example; fall back to the single
        // dataset example on older entries.
        exampleConversational: source.exampleConversational || source.ex || undefined,
        // The Latin-script spelling of the Bengali word the user typed. It
        // comes from the dataset, so the offline answer carries it even when
        // no AI provider is reachable.
        transcription: hit.roman || undefined,
        // The pronunciation guide (IPA), from the dataset.
        pronunciation: source.pron || undefined,
        partOfSpeech: source.pos || undefined,
        usageNote: source.usageNote || undefined,
        kana: source.kana,
        romaji: source.romaji,
        exampleJa: source.exampleJa,
        conversationalMeaning: source.conversationalMeaning,
        exampleFormal: source.exampleFormal,
        collocations: source.collocations,
        wordFamily: source.wordFamily,
        bandLevel: source.bandLevel,
        commonMistake: source.commonMistake,
        synonyms: source.syn,
        antonyms: source.ant,
        exampleEn: source.ex,
        exampleBn: source.exBn || undefined,
      }
      // The offline result is provisional: it is only shown while no provider
      // has answered yet, and it never replaces a provider result.
      const best = this.best
      if (best === null || best.source === 'offline') {
        this.best = offlineResult
        this.emit({ type: 'LOCAL_RESULT', result: offlineResult })
      }
    })

    // Tell providers the resolved direction, not just whether the query
    // contains Bengali script: a Banglish query is Bengali input too.
    const providerIsBengali = direction === 'bn-en'

    const jobs: Array<{ id: ProviderId; run: () => Promise<LookupResult> }> = []
    if (cfg.groq.enabled && cfg.groq.apiKey) {
      jobs.push({ id: 'groq', run: () => this.callProvider('groq', query, providerIsBengali, cfg.groq.apiKey, cfg.groq.model, requestId, direction) })
    }
    if (cfg.openrouter.enabled && cfg.openrouter.apiKey) {
      jobs.push({ id: 'openrouter', run: () => this.callProvider('openrouter', query, providerIsBengali, cfg.openrouter.apiKey, cfg.openrouter.model, requestId, direction) })
    }
    if (cfg.gemini.enabled && cfg.gemini.apiKey) {
      jobs.push({ id: 'gemini', run: () => this.callProvider('gemini', query, providerIsBengali, cfg.gemini.apiKey, cfg.gemini.model, requestId, direction) })
    }

    if (jobs.length === 0) {
      await offlineJob
      this.emit({ type: 'LOOKUP_COMPLETE', requestId })
      return
    }

    await Promise.all([
      offlineJob,
      ...jobs.map(async (job) => {
        try {
          const raw = await job.run()
          if (this.currentId !== requestId) return // stale
          const result: LookupResult = {
            ...raw,
            word: query,
            query,
            // The headword is a display detail from the offline dictionary.
            // It is used when it is already known and simply left out when
            // the dictionary has not answered yet — a provider result is
            // never delayed for it.
            headword: headword ?? raw.headword,
            direction,
          }
          // The first valid provider result always replaces the provisional
          // offline result; later provider results only replace the accepted
          // one when they are strictly better.
          if (this.accepts(result)) {
            this.best = result
            this.cache.set(normalized, result)
            // Only the accepted (best-so-far) AI result is surfaced, so a late,
            // inferior response can never overwrite a superior one.
            this.emit({ type: 'AI_RESULT', result })
          }
        } catch (err) {
          if (this.currentId !== requestId) return
          this.emit({
            type: 'LOOKUP_ERROR',
            requestId,
            provider: job.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }),
    ])

    if (this.currentId === requestId) {
      this.emit({ type: 'LOOKUP_COMPLETE', requestId })
    }
  }
}
