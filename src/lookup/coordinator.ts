import {
  isBengali,
  normalize,
  offlineBengaliLookup,
  offlineLookup,
  type OfflineEntryPayload,
} from '../providers/offline'
import { LOOKUP_MESSAGE, SEED_MESSAGE, type AiLookupRequest, type AiLookupResponse } from '../providers/bridge'
import { loadSettings, type ProviderId, type ProviderSettings } from '../storage/settings'
import type { LookupEvent, LookupResult, ResultSource } from '../shared/types'

const PRIORITY: ResultSource[] = ['groq', 'openrouter', 'gemini']

export interface CoordinatorOptions {
  onEvent: (e: LookupEvent) => void
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
  ): Promise<LookupResult> {
    const request: AiLookupRequest = {
      type: LOOKUP_MESSAGE,
      provider,
      query,
      isBengali: bengaliInput,
      model,
      apiKey,
      requestId,
    }
    const response = (await chrome.runtime.sendMessage(request)) as AiLookupResponse | undefined
    if (!response) throw new Error('No response from VocabFlow service worker')
    if (!response.ok) throw new Error(response.error)
    return response.result
  }

  /** Runs a full offline + concurrent AI lookup. */
  async lookup(rawQuery: string, settings?: ProviderSettings): Promise<void> {
    const query = rawQuery.trim()
    if (!query) return
    const normalized = normalize(query)
    if (!normalized) return

    const cached = this.cache.get(normalized)
    if (cached) {
      this.emit({ type: 'AI_RESULT', result: { ...cached, requestId: 'cached' } })
      this.emit({ type: 'LOOKUP_COMPLETE', requestId: 'cached' })
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

    // The seed handshake is dispatched first (without awaiting it) so that the
    // service worker applies the first-run seed while the offline lookup is
    // already in flight. The settings are awaited further down.
    const settingsPromise = settings ? Promise.resolve(settings) : this.loadSeededSettings()
    const offlineJob = this.lookupOffline(query, bengaliInput, requestId)

    const cfg = await settingsPromise

    const jobs: Array<{ id: ProviderId; run: () => Promise<LookupResult> }> = []
    if (cfg.groq.enabled && cfg.groq.apiKey) {
      jobs.push({ id: 'groq', run: () => this.callProvider('groq', query, bengaliInput, cfg.groq.apiKey, cfg.groq.model, requestId) })
    }
    if (cfg.openrouter.enabled && cfg.openrouter.apiKey) {
      jobs.push({ id: 'openrouter', run: () => this.callProvider('openrouter', query, bengaliInput, cfg.openrouter.apiKey, cfg.openrouter.model, requestId) })
    }
    if (cfg.gemini.enabled && cfg.gemini.apiKey) {
      jobs.push({ id: 'gemini', run: () => this.callProvider('gemini', query, bengaliInput, cfg.gemini.apiKey, cfg.gemini.model, requestId) })
    }

    if (jobs.length === 0) {
      this.emit({ type: 'LOOKUP_COMPLETE', requestId })
      return
    }

    await Promise.all([
      offlineJob,
      ...jobs.map(async (job) => {
        try {
          const result = await job.run()
          if (this.currentId !== requestId) return // stale
          // Only a strictly better result is accepted, so a late, inferior AI
          // response can never overwrite a superior offline or AI result.
          const best = this.best
          const replace = best === null || this.isBetter(result, best)
          if (replace) {
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

  /**
   * Looks the query up in the offline dictionary.
   *
   * The dictionary itself lives in the service worker, so this is an
   * asynchronous round trip. Failures are swallowed: a broken offline
   * dictionary must never break the AI lookups.
   */
  private async lookupOffline(
    query: string,
    bengaliInput: boolean,
    requestId: string,
  ): Promise<void> {
    try {
      const entry = bengaliInput
        ? await offlineBengaliLookup(query)
        : ((await offlineLookup(query)) as OfflineEntryPayload | null)
      if (!entry) return
      if (this.currentId !== requestId) return // stale
      const source = bengaliInput
        ? (entry as { headword: string; entry: OfflineEntryPayload }).entry
        : (entry as OfflineEntryPayload)
      const headword = bengaliInput
        ? (entry as { headword: string; entry: OfflineEntryPayload }).headword
        : query
      const offlineResult: LookupResult = {
        word: headword,
        source: 'offline',
        requestId,
        timestamp: Date.now(),
        bengaliMeaning: source.bn,
        englishDefinition: source.def,
        partOfSpeech: source.pos || undefined,
        synonyms: source.syn,
        antonyms: source.ant,
        exampleEn: source.ex,
      }
      // An AI result that already arrived may be better; keep the best one.
      const best = this.best
      if (best === null || this.isBetter(offlineResult, best)) {
        this.best = offlineResult
        this.emit({ type: 'LOCAL_RESULT', result: offlineResult })
      }
    } catch {
      // Offline lookup is best-effort.
    }
  }
}
