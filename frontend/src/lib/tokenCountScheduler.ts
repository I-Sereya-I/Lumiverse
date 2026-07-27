/**
 * Priority queue and concurrency governor for background token counting.
 *
 * React-free, store-free, DOM-free, with an injected clock, injected timers and
 * an injected `count(text, signal, model)` so the whole thing unit-tests
 * headlessly — this repo has no jsdom and no React test renderer.
 *
 * **This module must never write to the server.** Background counts reach the UI
 * through `lib/tokenCountCache` and its subscription, never through the entry
 * object, so a whole-book sweep produces zero `PUT /world-books/:id/entries/:id`,
 * zero `revision = revision + 1`, zero `touchWorldBook` and zero
 * `WORLD_BOOK_ENTRY_CHANGED` emits. There is a grep in
 * `tests/lorebook-editor.test.ts` that holds this file to it.
 *
 * (If a future round wants *durable* all-entry counts, the right backend
 * addition is not a batch tokenizer endpoint — it is a world-books route that
 * writes `extensions._lumiverse_token_count*` **without** bumping `revision`.
 * The revision bump, not the round-trip, is the blocker. Not built here.)
 */

/**
 * Dispatch bands, highest first.
 *
 * `interactive` is a count the user is or is about to be looking at — a hover
 * that survived its dwell, or the open entry. `adjacent` is the row above and
 * below the selection, which is how arrow-key navigation gets covered. `sweep`
 * is the opt-in whole-book pass and only ever moves on an idle callback.
 */
export type TokenCountPriority = 'interactive' | 'adjacent' | 'sweep'

const BANDS: TokenCountPriority[] = ['interactive', 'adjacent', 'sweep']

export interface TokenCountRequest {
  /** Cache key — see `lib/tokenCountCache#tokenCacheKey`. Identity for dedupe. */
  key: string
  text: string
  model: string | null
  priority: TokenCountPriority
}

export interface TokenCountOutcome {
  key: string
  /**
   * The counted text, echoed back so the result sink can key the cache and
   * compute a heuristic fallback without holding the request object. This is the
   * same string reference the caller passed in — never a copy.
   */
  text: string
  model: string | null
  /**
   * The exact count, or `null` when no tokenizer matched the model. `null` is
   * not an error: `countForModel` returns it whenever no pattern matches, and
   * the caller is expected to fall back to the heuristic *without* persisting.
   */
  count: number | null
  /** `true` when the request was cancelled before it produced an answer. */
  aborted: boolean
  /** Set when the underlying counter threw for a reason other than abort. */
  error?: unknown
}

export type TokenCounter = (
  text: string,
  signal: AbortSignal,
  model: string | null,
) => Promise<number | null>

/**
 * `number` is in the union so a fake-timer harness can hand back plain ids; the
 * default implementation still uses the platform timer.
 */
export type TimerHandle = ReturnType<typeof setTimeout> | number

export interface TokenCountSchedulerDeps {
  count: TokenCounter
  /** Injected for tests; defaults to `Date.now`. */
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
  /**
   * Called once per completed, non-aborted request of the current generation.
   * The React layer wires this to the shared cache; the scheduler itself has no
   * opinion about where answers are stored.
   */
  onResult?: (outcome: TokenCountOutcome) => void
  /**
   * Hard ceiling on in-flight requests. Two, not more: the backend counts
   * **synchronously on the Bun event loop** (`countForModel` -> `countWithTokenizer`
   * -> `instance.count(text)`), so extra concurrency buys no throughput — it only
   * queues work in front of the interactive request the user is waiting on.
   */
  maxConcurrent?: number
  /** How long after a keystroke the sweep stays parked. */
  activityPauseMs?: number
}

interface QueueItem {
  key: string
  text: string
  model: string | null
  priority: TokenCountPriority
  waiters: ((outcome: TokenCountOutcome) => void)[]
}

export const DEFAULT_MAX_CONCURRENT = 2
export const DEFAULT_ACTIVITY_PAUSE_MS = 500

export class TokenCountScheduler {
  private readonly count: TokenCounter
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle
  private readonly clearTimer: (handle: TimerHandle) => void
  private readonly onResult?: (outcome: TokenCountOutcome) => void
  private readonly maxConcurrent: number
  private readonly activityPauseMs: number

  private readonly queues: Record<TokenCountPriority, QueueItem[]> = {
    interactive: [],
    adjacent: [],
    sweep: [],
  }
  private readonly queued = new Map<string, QueueItem>()
  private readonly inFlight = new Map<string, { item: QueueItem; promise: Promise<TokenCountOutcome> }>()
  private readonly dwellTimers = new Map<string, TimerHandle>()

  private controller = new AbortController()
  /** Bumped by {@link abortAll} so a late result from a cancelled run is dropped. */
  private generation = 0
  private lastActivityAt = Number.NEGATIVE_INFINITY
  private paused = false

  constructor(deps: TokenCountSchedulerDeps) {
    this.count = deps.count
    this.now = deps.now ?? (() => Date.now())
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.onResult = deps.onResult
    this.maxConcurrent = deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    this.activityPauseMs = deps.activityPauseMs ?? DEFAULT_ACTIVITY_PAUSE_MS
  }

  // ---- Introspection (also what the tests assert on) ----

  get inFlightCount(): number {
    return this.inFlight.size
  }

  get queueLength(): number {
    return BANDS.reduce((total, band) => total + this.queues[band].length, 0)
  }

  /** Queued or in flight — used by the sweep so it never enqueues the same key twice. */
  has(key: string): boolean {
    return this.queued.has(key) || this.inFlight.has(key)
  }

  get isPaused(): boolean {
    return this.paused
  }

  // ---- Enqueue ----

  /**
   * Enqueue a count, returning the outcome.
   *
   * De-duplicated by key: a key already in flight returns the *same* promise, and
   * a key already queued attaches another waiter and is promoted if the new
   * request is more urgent. Hover-then-click therefore issues one request, not
   * two.
   */
  request(request: TokenCountRequest): Promise<TokenCountOutcome> {
    const existingFlight = this.inFlight.get(request.key)
    if (existingFlight) return existingFlight.promise

    const existingQueued = this.queued.get(request.key)
    if (existingQueued) {
      if (BANDS.indexOf(request.priority) < BANDS.indexOf(existingQueued.priority)) {
        this.removeFromBand(existingQueued)
        existingQueued.priority = request.priority
        this.queues[request.priority].push(existingQueued)
      }
      const promise = new Promise<TokenCountOutcome>((resolve) => existingQueued.waiters.push(resolve))
      // A sweep item the user has just hovered is now interactive and must not
      // wait for the next idle callback.
      if (existingQueued.priority !== 'sweep') this.pump()
      return promise
    }

    const item: QueueItem = {
      key: request.key,
      text: request.text,
      model: request.model,
      priority: request.priority,
      waiters: [],
    }
    const promise = new Promise<TokenCountOutcome>((resolve) => item.waiters.push(resolve))
    this.queued.set(item.key, item)
    this.queues[item.priority].push(item)
    // Sweep work is never dispatched here — only `pumpSweep` releases it, which
    // is what keeps a 500-entry pass from competing with the UI.
    if (item.priority !== 'sweep') this.pump()
    return promise
  }

  /**
   * Hover intent: run `request` only if the pointer stays put for `delayMs`.
   *
   * The dwell lives here rather than in the component so "a hover cancelled
   * before the dwell issues no request" is testable with a fake timer. 220ms sits
   * below the ~250-400ms a user takes to travel and click, so the request is
   * usually already in flight when the click lands.
   */
  scheduleDwell(request: TokenCountRequest, delayMs: number): void {
    this.cancelDwell(request.key)
    if (delayMs <= 0) {
      void this.request(request)
      return
    }
    const handle = this.setTimer(() => {
      this.dwellTimers.delete(request.key)
      void this.request(request)
    }, delayMs)
    this.dwellTimers.set(request.key, handle)
  }

  cancelDwell(key: string): void {
    const handle = this.dwellTimers.get(key)
    if (handle === undefined) return
    this.clearTimer(handle)
    this.dwellTimers.delete(key)
  }

  // ---- Pacing ----

  /** Records a content keystroke; parks the sweep for `activityPauseMs`. */
  noteUserActivity(): void {
    this.lastActivityAt = this.now()
  }

  /**
   * `visibilitychange -> hidden` pauses the sweep. It deliberately does **not**
   * abort an interactive request: the user may be tabbing back in a second.
   */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (!paused) this.pump()
  }

  /**
   * Release at most **one** sweep request. Driven from `requestIdleCallback`.
   *
   * Returns whether anything was dispatched, so the caller can stop re-arming.
   */
  pumpSweep(): boolean {
    // Interactive and adjacent work always gets first refusal on the budget.
    this.pump()
    if (this.paused) return false
    if (this.now() - this.lastActivityAt < this.activityPauseMs) return false
    // Suppressed entirely while foreground work is outstanding.
    if (this.hasForegroundWork()) return false
    if (this.inFlight.size >= this.maxConcurrent) return false
    const item = this.queues.sweep.shift()
    if (!item) return false
    this.dispatch(item)
    return true
  }

  // ---- Cancellation ----

  /**
   * Cancel everything: aborts in-flight requests, clears the queue, drops pending
   * hover dwells. **Leaves the cache untouched** — answers already paid for stay
   * correct, and a book the user comes back to is instant.
   *
   * Called on `selectedBookId` change, editor close/unmount and profile/model
   * change. Waiters resolve with `aborted: true` rather than rejecting, so no
   * caller has to defend against an unhandled rejection.
   */
  abortAll(): void {
    this.generation += 1
    for (const handle of this.dwellTimers.values()) this.clearTimer(handle)
    this.dwellTimers.clear()

    for (const band of BANDS) {
      const items = this.queues[band]
      this.queues[band] = []
      for (const item of items) this.settle(item, { key: item.key, text: item.text, model: item.model, count: null, aborted: true })
    }
    this.queued.clear()

    for (const { item } of this.inFlight.values()) {
      this.settle(item, { key: item.key, text: item.text, model: item.model, count: null, aborted: true })
    }
    this.inFlight.clear()

    this.controller.abort()
    this.controller = new AbortController()
  }

  // ---- Internals ----

  private hasForegroundWork(): boolean {
    if (this.queues.interactive.length > 0 || this.queues.adjacent.length > 0) return true
    for (const { item } of this.inFlight.values()) {
      if (item.priority !== 'sweep') return true
    }
    return false
  }

  private removeFromBand(item: QueueItem): void {
    const band = this.queues[item.priority]
    const index = band.indexOf(item)
    if (index >= 0) band.splice(index, 1)
  }

  /** Drain the foreground bands up to the concurrency ceiling. */
  private pump(): void {
    while (this.inFlight.size < this.maxConcurrent) {
      const item = this.queues.interactive.shift() ?? this.queues.adjacent.shift()
      if (!item) return
      this.dispatch(item)
    }
  }

  private dispatch(item: QueueItem): void {
    this.queued.delete(item.key)
    const generation = this.generation
    const signal = this.controller.signal
    const promise = this.count(item.text, signal, item.model)
      .then((count): TokenCountOutcome => ({ key: item.key, text: item.text, model: item.model, count, aborted: false }))
      .catch((error): TokenCountOutcome => ({
        key: item.key,
        text: item.text,
        model: item.model,
        count: null,
        aborted: signal.aborted,
        error: signal.aborted ? undefined : error,
      }))
      .then((outcome) => {
        if (generation !== this.generation) return outcome
        this.inFlight.delete(item.key)
        if (!outcome.aborted) this.onResult?.(outcome)
        this.settle(item, outcome)
        this.pump()
        return outcome
      })
    this.inFlight.set(item.key, { item, promise })
  }

  private settle(item: QueueItem, outcome: TokenCountOutcome): void {
    const waiters = item.waiters
    item.waiters = []
    for (const waiter of waiters) waiter(outcome)
  }
}
