import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { tokenizersApi } from '@/api/tokenizers'
import { estimateTokens } from '@/lib/tokenEstimate'
import { entryTokenCacheKey } from '@/lib/entryTokenKey'
import { readStoredTokenCount } from '@/lib/storedTokenCount'
import {
  getTokenCountVersion,
  hasTokenCountByKey,
  peekTokenCountByKey,
  setTokenCount,
  subscribeTokenCounts,
  touchTokenCount,
} from '@/lib/tokenCountCache'
import {
  TokenCountScheduler,
  type TokenCountPriority,
} from '@/lib/tokenCountScheduler'
import { planSelectionPrefetch, type SelectionPrefetchDeps } from '@/lib/tokenPrefetchPlan'
import { DEFAULT_LOREBOOK_EDITOR_SETTINGS } from '@/lib/uiProductivityDefaults'
import { useStore } from '@/store'
import type { WorldBookEntry } from '@/types/api'

/**
 * React wiring for the background token pipeline.
 *
 * The three moving parts live in `lib/` (`tokenEstimate`, `tokenCountCache`,
 * `tokenCountScheduler`) and are React-, store- and DOM-free so they unit-test
 * without a renderer. This file is the only place that knows about hooks, the
 * store, `requestIdleCallback` and `document`.
 *
 * **Nothing in this file writes to the server.** Background counts land in the
 * shared cache and reach the UI through its subscription; they never travel
 * through the entry object, so they cannot reach the entry-update path or the
 * world-books client at all. That is what makes a whole-book sweep cost zero
 * PUTs, and therefore zero `revision` bumps and zero `expected_revision`
 * conflicts. `tests/lorebook-editor.test.ts` greps the raw text of this file for
 * the three identifiers that would break it, so this note deliberately does not
 * name them.
 */

// ---- Shared scheduler ----

let sharedScheduler: TokenCountScheduler | null = null

/**
 * The process-wide scheduler.
 *
 * A singleton for the same reason the cache is one: the hover prefetch is issued
 * by the entry list while the count-on-open is issued by the entry editor, and
 * those two are different components. Sharing the queue is what makes
 * hover-then-click a single request instead of two.
 */
export function getTokenCountScheduler(): TokenCountScheduler {
  if (sharedScheduler) return sharedScheduler
  sharedScheduler = new TokenCountScheduler({
    count: async (text, signal, model) => {
      if (!model) return null
      const result = await tokenizersApi.countForModel(model, text, { signal })
      return result.token_count
    },
    onResult: (outcome) => {
      // A transient failure is not an answer: leaving it uncached means the next
      // hover retries instead of pinning a wrong number for the session.
      if (outcome.error !== undefined) return
      setTokenCount(outcome.model, outcome.text, outcome.count != null
        ? { count: outcome.count, approximate: false, model: outcome.model }
        // `token_count: null` means no tokenizer pattern matched. Cache the
        // heuristic so we stop asking the server a question it has already
        // answered — and mark it approximate so it renders `~` and can never be
        // persisted.
        : { count: estimateTokens(outcome.text), approximate: true, model: outcome.model })
    },
  })
  return sharedScheduler
}

// ---- Tokenizer availability ----

export type TokenizerAvailabilityStatus = 'no-model' | 'checking' | 'available' | 'unavailable'

export interface TokenizerAvailability {
  status: TokenizerAvailabilityStatus
  model: string | null
  tokenizerName: string | null
}

/** Probed once per model per session — the answer only changes when a tokenizer is installed. */
const patternProbes = new Map<string, { matched: boolean; tokenizerName: string | null }>()

/** The model the lorebook editor counts against: the active profile, else the default one. */
export function useActiveTokenizerModel(): string | null {
  const activeProfileId = useStore((state) => state.activeProfileId)
  const profiles = useStore((state) => state.profiles)
  return useMemo(() => {
    const profile = profiles.find((item) => item.id === activeProfileId)
      ?? profiles.find((item) => item.is_default)
    return profile?.model ?? null
  }, [activeProfileId, profiles])
}

/**
 * Whether an exact count is even possible right now.
 *
 * `countForModel` returns `null` — not an error — when no pattern matches the
 * model, and with no profile there is no model at all. "Count every entry" has to
 * be *disabled with a reason* in those cases rather than silently estimating,
 * otherwise the option promises exact numbers and quietly delivers `length / 4`.
 */
export function useTokenizerAvailability(): TokenizerAvailability {
  const model = useActiveTokenizerModel()
  const [, setProbeVersion] = useState(0)

  useEffect(() => {
    if (!model || patternProbes.has(model)) return
    let cancelled = false
    void tokenizersApi.testPattern(model)
      .then((result) => {
        patternProbes.set(model, { matched: result.matched, tokenizerName: result.tokenizer_name })
      })
      .catch(() => {
        // Treat an unreachable probe as "not proven", not as "broken forever":
        // it is not cached, so the next mount asks again.
      })
      .finally(() => {
        if (!cancelled) setProbeVersion((version) => version + 1)
      })
    return () => {
      cancelled = true
    }
  }, [model])

  if (!model) return { status: 'no-model', model: null, tokenizerName: null }
  const probe = patternProbes.get(model)
  if (!probe) return { status: 'checking', model, tokenizerName: null }
  return {
    status: probe.matched ? 'available' : 'unavailable',
    model,
    tokenizerName: probe.tokenizerName,
  }
}

// ---- Reading a count ----

export interface ResolvedTokenCount {
  value: number
  /** `false` renders a leading `~`, matching the entry editor's existing convention. */
  exact: boolean
}

export interface UseTokenCountsOptions {
  /** The open book. The sweep never leaves it. */
  bookId: string | null
  /** Entries in render order — adjacency and the sweep both walk this list. */
  entries: WorldBookEntry[]
  selectedEntryId: string | null
}

export interface UseTokenCountsResult {
  /**
   * Resolve order: validated stored count -> exact cached count -> the stored
   * count as an estimate -> a cached estimate -> `length / 4`. Only the first two
   * ever report `exact: true`; see `lib/storedTokenCount` for what "validated"
   * proves and what it does not.
   */
  resolveTokenCount: (entry: WorldBookEntry) => ResolvedTokenCount
  handleEntryPointerEnter: (entryId: string) => void
  handleEntryPointerLeave: (entryId: string) => void
  availability: TokenizerAvailability
}

function idleCallback(fn: () => void): number {
  const request = (window as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }).requestIdleCallback
  // `setTimeout(fn, 1)` is the documented fallback; this codebase uses neither
  // API anywhere else, so there is no existing helper to reuse.
  if (typeof request === 'function') return request(fn, { timeout: 2_000 })
  return window.setTimeout(fn, 1)
}

function cancelIdleCallback(handle: number): void {
  const cancel = (window as unknown as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback
  if (typeof cancel === 'function') cancel(handle)
  else window.clearTimeout(handle)
}

export function useTokenCounts({
  bookId,
  entries,
  selectedEntryId,
}: UseTokenCountsOptions): UseTokenCountsResult {
  const settings = useStore((state) => state.lorebookEditorSettings)
  const hoverEnabled = settings.tokenPrefetchHover ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHover
  const hoverDelayMs = Math.min(1_000, Math.max(0,
    settings.tokenPrefetchHoverDelayMs ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHoverDelayMs))
  const sweepEnabled = settings.tokenCountAllEntries ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountAllEntries

  const model = useActiveTokenizerModel()
  const availability = useTokenizerAvailability()

  // Refs so the effects below can read the current list without re-running on
  // every keystroke — `entries` is rebuilt by `commitEntries` on each edit.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const modelRef = useRef(model)
  modelRef.current = model

  // Id -> entry, so the pointer handlers do not linearly scan a 554-entry list
  // on every row the cursor crosses. Rebuilt only when the array identity
  // changes, which is once per edit, not once per hover.
  const entryIndex = useMemo(() => {
    const index = new Map<string, WorldBookEntry>()
    for (const entry of entries) index.set(entry.id, entry)
    return index
  }, [entries])
  const entryIndexRef = useRef(entryIndex)
  entryIndexRef.current = entryIndex

  /** Dedupe token for the selection prefetch below; see `lib/tokenPrefetchPlan`. */
  const plannedSelectionRef = useRef<string | null>(null)

  // A completed background count causes no store write and no entry-object
  // change, so the inspector never remounts and an in-progress edit never loses
  // focus. It does re-render the whole workspace, though — this hook is called
  // there, not per row — which is why `EntryTable`'s rows are `React.memo`'d on
  // their resolved value. Without that, one number cost a 554-row repaint.
  const cacheVersion = useSyncExternalStore(
    subscribeTokenCounts,
    getTokenCountVersion,
    getTokenCountVersion,
  )

  /**
   * Ordering here is a performance contract, not a style choice.
   *
   * A persisted exact count is authoritative and costs a handful of property
   * reads; probing the cache costs an FNV pass over the whole entry. This used to
   * probe the cache *first* and check the stored value two lines later, so every
   * entry that already had a persisted exact count paid for a hash that could not
   * change the answer — once per row, on every render of a 554-row table.
   * Cheapest authoritative source first, and the hash that remains is memoised
   * per entry object by `entryTokenCacheKey`.
   *
   * The resulting precedence is unchanged in every case that can actually
   * disagree: an exact stored count and an exact cached count are two exact
   * counts of the same text.
   *
   * What *did* change: the stored tier is no longer trusted blind. It is
   * validated by `readStoredTokenCount`, which demotes it to `~` unless it was
   * recorded for the current model and for content of the current length —
   * previously the recorded model was never compared at all, and nothing ever
   * invalidated the count when the text was edited, so both cases rendered a
   * wrong number with no marker. That module documents exactly what its length
   * check still misses.
   *
   * Reads are non-promoting. This runs during render, so it must not mutate the
   * cache's recency order — see `tokenCountCache#getTokenCount`.
   */
  const resolveTokenCount = useCallback((entry: WorldBookEntry): ResolvedTokenCount => {
    void cacheVersion
    // `extensions._lumiverse_token_count` and its three companion keys: property
    // reads only, deliberately ahead of the O(content) probe below.
    const stored = readStoredTokenCount(entry.extensions, entry.content, model)
    if (stored?.exact) return stored
    const cached = peekTokenCountByKey(entryTokenCacheKey(entry, model, entry.content))
    if (cached && !cached.approximate) return { value: cached.count, exact: true }
    // A stored-but-unverifiable count is still a better guess than `length / 4`,
    // so it is reported rather than dropped — as an estimate, never as exact.
    if (stored) return { value: stored.value, exact: false }
    if (cached) return { value: cached.count, exact: false }
    return { value: estimateTokens(entry.content), exact: false }
  }, [cacheVersion, model])

  const enqueue = useCallback((
    entry: WorldBookEntry | undefined,
    priority: TokenCountPriority,
  ) => {
    if (!entry) return
    const currentModel = modelRef.current
    const text = entry.content
    if (!text.trim()) return
    // One key for both the presence probe and the request: they were two separate
    // hashes of the same string.
    const key = entryTokenCacheKey(entry, currentModel, text)
    if (hasTokenCountByKey(key)) return
    const scheduler = getTokenCountScheduler()
    if (scheduler.has(key)) return
    void scheduler.request({ key, text, model: currentModel, priority })
  }, [])

  // Cancellation. Aborting clears the queue and keeps the cache, so returning to
  // a book is instant. Re-runs (and therefore aborts) on book change, on
  // profile/model change, and on unmount.
  useEffect(() => {
    const scheduler = getTokenCountScheduler()
    // Aborting drops whatever was planned for the previous book/model, so the
    // selection prefetch below has to be re-plannable rather than reporting
    // `already-planned` against a request that no longer exists.
    plannedSelectionRef.current = null
    return () => scheduler.abortAll()
  }, [bookId, model])

  // A hidden tab parks the sweep. It deliberately does not abort an interactive
  // request the user is waiting on.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const scheduler = getTokenCountScheduler()
    const sync = () => scheduler.setPaused(document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      scheduler.setPaused(false)
    }
  }, [])

  /**
   * The selected entry, counted the moment it is knowable.
   *
   * This is the fix for "the token indicator takes time to appear". The open
   * entry's count used to be issued only by the entry editor's own timer,
   * `tokenCountDelayMs` after mount — a full second by default — and then had to
   * win a slot from whatever the idle sweep had already queued. It is interactive
   * work and must not be paced by the background pass at all.
   *
   * Issued here it rides the commit that the entries fetch resolves into: `entries`
   * is a dependency, so the request goes out in the same tick the first row paints,
   * in parallel with everything else that open does, rather than a debounce later.
   *
   * Deduped by `(model, entry id)`, so re-renders and typing cannot re-issue it,
   * and by cache key inside `planSelectionPrefetch` and the scheduler, so an entry
   * the sweep or a hover already holds is promoted rather than counted twice.
   * **The sweep's own pacing is untouched** — this only ever concerns one entry.
   */
  const prefetchDeps = useMemo<SelectionPrefetchDeps>(() => ({
    resolveKey: entryTokenCacheKey,
    hasCachedCount: hasTokenCountByKey,
    isScheduled: (key) => getTokenCountScheduler().has(key),
  }), [])

  useEffect(() => {
    const plan = planSelectionPrefetch({
      entryId: selectedEntryId,
      entry: selectedEntryId ? entryIndexRef.current.get(selectedEntryId) : null,
      model,
      plannedFor: plannedSelectionRef.current,
    }, prefetchDeps)
    if (plan.planKey) plannedSelectionRef.current = plan.planKey
    if (plan.request) void getTokenCountScheduler().request(plan.request)
  }, [bookId, entries, model, prefetchDeps, selectedEntryId])

  // Selection adjacency: arrow-key navigation produces no hover signal, so the
  // rows either side of the selection are prefetched at a lower band.
  useEffect(() => {
    if (!hoverEnabled || !selectedEntryId) return
    const list = entriesRef.current
    const index = list.findIndex((entry) => entry.id === selectedEntryId)
    if (index < 0) return
    enqueue(list[index - 1], 'adjacent')
    enqueue(list[index + 1], 'adjacent')
  }, [bookId, enqueue, hoverEnabled, selectedEntryId])

  // The idle sweep. Scoped to the open book by construction: it only ever reads
  // `entriesRef`, which holds the entries of `bookId`, and the cancellation
  // effect above aborts the queue the moment `bookId` changes. It never walks
  // the library.
  useEffect(() => {
    if (!sweepEnabled) return
    if (!bookId || !model) return
    // No resolvable tokenizer means every "exact" count would really be
    // `length / 4`. Do not pretend.
    if (availability.status !== 'available') return
    if (typeof window === 'undefined') return

    const scheduler = getTokenCountScheduler()
    let cancelled = false
    let handle: number | null = null

    const step = () => {
      handle = null
      if (cancelled) return
      const currentModel = modelRef.current
      // One enqueue per idle callback, matching the one-dispatch-per-callback
      // pacing below. Enqueueing all 500 up front would be no cheaper and would
      // make the queue harder to reason about after an abort.
      let enqueued = false
      for (const entry of entriesRef.current) {
        const text = entry.content
        if (!text.trim()) continue
        const key = entryTokenCacheKey(entry, currentModel, text)
        // Non-promoting: a whole-book sweep must not be able to evict the handful
        // of entries the user is actually working in.
        if (hasTokenCountByKey(key)) continue
        if (scheduler.has(key)) continue
        void scheduler.request({ key, text, model: currentModel, priority: 'sweep' })
        enqueued = true
        break
      }
      const dispatched = scheduler.pumpSweep()
      const idle = !enqueued && !dispatched
        && scheduler.queueLength === 0 && scheduler.inFlightCount === 0
      // Stop re-arming once the book is fully counted; the effect re-runs when
      // the entry count changes, which is how a newly created entry gets picked
      // up.
      if (idle) return
      handle = idleCallback(step)
    }

    handle = idleCallback(step)
    return () => {
      cancelled = true
      if (handle != null) cancelIdleCallback(handle)
    }
  }, [availability.status, bookId, entries.length, model, sweepEnabled])

  /**
   * The pointer path was the second half of the regression: a `find` over 554
   * entries plus *two* full-content hashes (`hasTokenCount`, then `tokenCacheKey`
   * on the same string) for every row the cursor crossed, at pointer-event rate.
   * It is now one map lookup and one memoised key.
   *
   * This is also the cache's designated recency signal. Promotion moved off the
   * render path (which must be pure) and onto this one, which is where the policy
   * was aimed all along: "the entries a user keeps scrolling past are the ones
   * worth keeping". `touchTokenCount` reports presence, so the promotion and the
   * already-counted check are a single map traversal.
   */
  const handleEntryPointerEnter = useCallback((entryId: string) => {
    if (!hoverEnabled) return
    const entry = entryIndexRef.current.get(entryId)
    if (!entry) return
    const currentModel = modelRef.current
    const text = entry.content
    if (!text.trim()) return
    const key = entryTokenCacheKey(entry, currentModel, text)
    if (touchTokenCount(key)) return
    getTokenCountScheduler().scheduleDwell(
      { key, text, model: currentModel, priority: 'interactive' },
      hoverDelayMs,
    )
  }, [hoverDelayMs, hoverEnabled])

  const handleEntryPointerLeave = useCallback((entryId: string) => {
    const entry = entryIndexRef.current.get(entryId)
    if (!entry) return
    getTokenCountScheduler().cancelDwell(entryTokenCacheKey(entry, modelRef.current, entry.content))
  }, [])

  return { resolveTokenCount, handleEntryPointerEnter, handleEntryPointerLeave, availability }
}
