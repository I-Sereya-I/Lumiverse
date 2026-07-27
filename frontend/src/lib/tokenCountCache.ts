/**
 * Shared, session-lifetime token-count cache for the lorebook editors.
 *
 * React-free, store-free and DOM-free: a **module-level singleton**, which is
 * the whole point. The cache it replaces was a `useRef(new Map())` inside
 * `WorldBookEntryEditor`, so it died on every editor remount, on the half <-> full
 * switch, and on the per-entry remount key in `LorebookEditorWorkspace`. A
 * background prefetch is only worth issuing if the answer is still there when the
 * user actually opens the entry.
 *
 * **Not in the zustand store, deliberately.** Every write would touch a store
 * that sits next to the persisted-settings machinery and would re-render every
 * subscriber. `subscribe` / `getVersion` here feed `useSyncExternalStore`.
 *
 * Note what that subscription does and does not buy: the hook is called once, in
 * `LorebookEditorWorkspace`, so a write re-renders the whole workspace, not "just
 * the list". What keeps a completed count cheap is that `EntryTable`'s rows are
 * `React.memo`'d on their resolved token value, so the re-render reconciles one
 * row's DOM rather than all of them.
 *
 * **Not persisted** to localStorage/IndexedDB this round.
 */

/** What a completed count knows about itself. ~24 bytes per record. */
export interface TokenCountRecord {
  count: number
  /** `true` when the number came from the `length / 4` heuristic, not a tokenizer. */
  approximate: boolean
  /** The model the count is valid for; `null` when no model was resolvable. */
  model: string | null
}

/**
 * LRU bound. 2000 records is roughly four large books and ~50KB of values — the
 * keys are fixed-length, so the total is bounded regardless of entry size.
 */
export const TOKEN_CACHE_MAX_ENTRIES = 2000

/**
 * FNV-1a, 32-bit, returned as lowercase hex.
 *
 * Hashing rather than keying on the raw text is *the* memory requirement of this
 * feature. The predecessor key was `` `${model}:${content}` ``, which held a full
 * second copy of every counted entry's text — a 500-entry book at 2KB an entry is
 * about a megabyte of duplicated strings, and the sweep would have counted every
 * entry in the book.
 */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    // hash * 16777619 in 32-bit arithmetic, without overflowing to a double.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Cache key for a (model, content) pair.
 *
 * The length is in the key alongside the hash: a false hit then requires both a
 * 32-bit collision *and* an exact length match, which is a far smaller target
 * than a bare hash. The model is in the key so switching profiles is a natural
 * miss rather than a stale exact number attributed to the wrong tokenizer.
 */
export function tokenCacheKey(model: string | null | undefined, content: string): string {
  return `${model ?? 'approx'}:${content.length}:${fnv1a32(content)}`
}

const cache = new Map<string, TokenCountRecord>()
const listeners = new Set<() => void>()
let version = 0

/**
 * Monotonic counter for `useSyncExternalStore`. Bumped once per successful
 * {@link setTokenCount}, so a completed background count re-renders the list and
 * nothing else.
 */
export function getTokenCountVersion(): number {
  return version
}

export function subscribeTokenCounts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Read a record, promoting it to most-recently-used.
 *
 * Eviction is least-recently-**read**, not least-recently-written: the entries a
 * user keeps scrolling past are the ones worth keeping, and a full-book sweep
 * must not be able to evict the handful of entries they are actually working in.
 *
 * **Never call this from a React render.** The `delete`/`set` below is a
 * module-level mutation, and React's render phase must be pure — under
 * StrictMode it runs twice, and the eviction order would then depend on how many
 * times a component happened to re-render. The entry table used to call this once
 * per row per render; it now uses {@link peekTokenCountByKey} and the recency bump
 * happens on the pointer-enter path, which is a real user signal and is exactly
 * the "entries the user keeps scrolling past" the policy is written for.
 */
export function getTokenCount(model: string | null | undefined, content: string): TokenCountRecord | null {
  const key = tokenCacheKey(model, content)
  const record = cache.get(key)
  if (!record) return null
  // Re-insert to move to the end of the Map's insertion order.
  cache.delete(key)
  cache.set(key, record)
  return record
}

/**
 * Pure read by pre-computed key. No promotion, no mutation, safe during render.
 *
 * Takes the key rather than the content because the caller that needs this — the
 * Tokens cell — already holds a memoised key (`lib/entryTokenKey`) and must not
 * re-hash the whole entry to look it up.
 */
export function peekTokenCountByKey(key: string): TokenCountRecord | null {
  return cache.get(key) ?? null
}

/** Non-promoting read, for callers that only want to know whether work is pending. */
export function hasTokenCount(model: string | null | undefined, content: string): boolean {
  return cache.has(tokenCacheKey(model, content))
}

/** {@link hasTokenCount} for callers that already hold the key. */
export function hasTokenCountByKey(key: string): boolean {
  return cache.has(key)
}

/**
 * Explicit least-recently-used promotion, for call sites that are *not* renders.
 *
 * Returns whether the key was present, so a caller that was going to probe with
 * {@link hasTokenCountByKey} anyway pays for one map traversal instead of two.
 */
export function touchTokenCount(key: string): boolean {
  const record = cache.get(key)
  if (!record) return false
  cache.delete(key)
  cache.set(key, record)
  return true
}

export function setTokenCount(
  model: string | null | undefined,
  content: string,
  record: TokenCountRecord,
): void {
  const key = tokenCacheKey(model, content)
  cache.delete(key)
  cache.set(key, record)
  while (cache.size > TOKEN_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
  version += 1
  for (const listener of listeners) listener()
}

/** Diagnostics and tests only. */
export function tokenCacheSize(): number {
  return cache.size
}

/**
 * Diagnostics and tests only. Exposed so the memory requirement can be asserted
 * directly — no stored key may contain the counted text.
 */
export function tokenCacheKeys(): string[] {
  return [...cache.keys()]
}

/**
 * Drops every record. Not called by the prefetch pipeline: aborting background
 * work clears the *queue* and keeps the cache, because the answers already paid
 * for stay correct. Present for tests and for a future "forget counts" action.
 */
export function clearTokenCountCache(): void {
  cache.clear()
  version += 1
  for (const listener of listeners) listener()
}
