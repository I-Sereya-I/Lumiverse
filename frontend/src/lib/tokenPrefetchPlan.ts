/**
 * Decision logic for counting the entry the user is actually looking at.
 *
 * The background pipeline is deliberately slow: the sweep releases one item per
 * `requestIdleCallback`, parks for `DEFAULT_ACTIVITY_PAUSE_MS` after a keystroke,
 * stops while the tab is hidden, and never exceeds two in-flight requests
 * (`lib/tokenCountScheduler`). That pacing is correct — it is what stops a
 * 554-entry pass from competing with typing — and nothing here changes it.
 *
 * What was wrong is that the **selected** entry was paced by the same machinery.
 * Its count was issued only by the entry editor's own timer, `tokenCountDelayMs`
 * after the editor mounted, so the one number the user opened the entry to see
 * arrived a full second after the rows did, and then still had to win a slot from
 * whatever the sweep had queued. The selected entry is interactive work: it should
 * ride the commit the entries fetch resolves into, not a debounce meant for typing.
 *
 * Two decisions live here, and they are separate on purpose:
 *
 * - {@link planSelectionPrefetch} — what the *list* side should ask for when the
 *   selection changes or the entries land. Owns the dedupe.
 * - {@link shouldCountOpenEntryImmediately} — whether the *editor* side may skip
 *   its debounce for this render. A fresh open is not typing.
 *
 * Both are pure: React-free, store-free, DOM-free, every collaborator injected, so
 * "does a validated stored count suppress the request?" is a unit test rather than
 * something you have to boot a renderer to find out. This repo has no DOM test
 * environment, which is exactly why this is not inline in a component.
 *
 * **Nothing here counts anything or writes anything.** It returns a description of
 * a request; the caller hands that to the shared scheduler.
 */

import { readStoredTokenCount } from './storedTokenCount'
import type { TokenCountRequest } from './tokenCountScheduler'

/** The shape of a world-book entry this module actually reads. */
export interface PrefetchEntryLike {
  content: string
  extensions?: Record<string, unknown> | null
}

/**
 * Why no request was issued. Every one of these is a *good* outcome — the number
 * is already available, or asking would be wrong — and they are distinct so a test
 * can tell "suppressed because the persisted count is trustworthy" apart from
 * "suppressed because we already asked".
 */
export type SelectionPrefetchSkip =
  /** Nothing selected, or the entries fetch has not landed yet. */
  | 'no-selection'
  /** This (model, entry) open has already been planned once. */
  | 'already-planned'
  /** Empty or whitespace-only content: there is nothing to count. */
  | 'empty-content'
  /** A persisted count that `lib/storedTokenCount` certified against this model and this text. */
  | 'stored-exact'
  /** The session cache already holds an answer for this exact key. */
  | 'already-counted'

export interface SelectionPrefetchPlan {
  /** Hand this straight to `TokenCountScheduler#request`, or `null` to do nothing. */
  request: TokenCountRequest | null
  /**
   * How the request relates to work the scheduler already holds.
   *
   * `promote` means this key is already queued or in flight — usually as a `sweep`
   * item. The request is still issued, because `TokenCountScheduler#request`
   * de-duplicates by key and *promotes* a queued item into the higher band rather
   * than dispatching a second time. Skipping instead would leave the entry the
   * user is looking at stuck behind the idle sweep, which is the whole bug. So the
   * same entry is never counted twice, and never counted late.
   */
  dedupe: 'new' | 'promote' | null
  /** Set exactly when `request` is `null`. */
  skip: SelectionPrefetchSkip | null
  /**
   * The token the caller should remember so the next run reports
   * `already-planned`. `null` means nothing was consumed — in particular when the
   * entries have not arrived yet, so the plan re-arms once they do.
   */
  planKey: string | null
}

export interface SelectionPrefetchInput {
  entryId: string | null
  /** `null`/`undefined` when the id is not (yet) in the loaded list. */
  entry: PrefetchEntryLike | null | undefined
  model: string | null
  /** The `planKey` of the previous plan, or `null` on the first run. */
  plannedFor: string | null
}

export interface SelectionPrefetchDeps {
  /** Memoised `(entry, model, content) -> cache key`; see `lib/entryTokenKey`. */
  resolveKey: (entry: object, model: string | null, content: string) => string
  /** Non-promoting probe of the session cache. */
  hasCachedCount: (key: string) => boolean
  /** Whether the scheduler already holds this key, queued or in flight. */
  isScheduled: (key: string) => boolean
}

/**
 * Dedupe token for one (model, entry) open.
 *
 * The model is in it so a profile switch re-arms the prefetch: the cache key
 * changes with the model, so the old answer no longer applies. The book id is not,
 * because entry ids are already unique across books.
 */
export function selectionPlanKey(model: string | null, entryId: string): string {
  return `${model ?? 'approx'}|${entryId}`
}

/**
 * What to count for the current selection, if anything.
 *
 * Order matters and is a cost order: the free checks first, the property reads of
 * `readStoredTokenCount` next, and only then `resolveKey`, which is O(content) on
 * its first call for an entry object.
 *
 * `already-planned` is checked before content, so typing in the open entry cannot
 * re-issue a prefetch on every keystroke — deciding when an *edited* entry is
 * recounted is `tokenCountMode`'s job, not this one's.
 */
export function planSelectionPrefetch(
  input: SelectionPrefetchInput,
  deps: SelectionPrefetchDeps,
): SelectionPrefetchPlan {
  const { entryId, entry, model, plannedFor } = input
  if (!entryId || !entry) return { request: null, dedupe: null, skip: 'no-selection', planKey: null }

  const planKey = selectionPlanKey(model, entryId)
  if (planKey === plannedFor) return { request: null, dedupe: null, skip: 'already-planned', planKey }

  const text = entry.content
  if (!text.trim()) return { request: null, dedupe: null, skip: 'empty-content', planKey }

  // The persisted count, but only when it can be shown to describe *this* text
  // under *this* model. `readStoredTokenCount` demotes anything it cannot certify
  // to `exact: false`, and a demoted count is not an answer — it renders `~` — so
  // it does not suppress the request.
  if (readStoredTokenCount(entry.extensions, text, model)?.exact) {
    return { request: null, dedupe: null, skip: 'stored-exact', planKey }
  }

  const key = deps.resolveKey(entry, model, text)
  if (deps.hasCachedCount(key)) return { request: null, dedupe: null, skip: 'already-counted', planKey }

  return {
    request: { key, text, model, priority: 'interactive' },
    dedupe: deps.isScheduled(key) ? 'promote' : 'new',
    skip: null,
    planKey,
  }
}

export interface OpenEntryCountInput {
  mode: 'live' | 'delayed' | 'manual'
  entryId: string
  /** The editor's local draft. */
  content: string
  /** `entry.content` — what the draft is compared against to tell an open from an edit. */
  savedContent: string
  /** The entry id this already fired for, so it fires once per open. */
  prefetchedEntryId: string | null
}

/**
 * Whether the open entry may be counted straight away, skipping `tokenCountDelayMs`.
 *
 * The delay exists to debounce *typing* — it stops a count going out (and, in
 * `delayed` mode, being written back) for every intermediate state of an edit. A
 * freshly opened entry has no edit to debounce, so waiting for it buys nothing and
 * costs the user the entire delay before a number appears.
 *
 * `content !== savedContent` is the discriminator: equal means the draft is still
 * the entry as stored, i.e. an open. Once the user has typed, this returns `false`
 * and the debounced path owns the entry again.
 *
 * `manual` is honoured: "never counts automatically" has to mean never.
 */
export function shouldCountOpenEntryImmediately(input: OpenEntryCountInput): boolean {
  const { mode, entryId, content, savedContent, prefetchedEntryId } = input
  if (mode === 'manual') return false
  if (prefetchedEntryId === entryId) return false
  if (!content.trim()) return false
  return content === savedContent
}
