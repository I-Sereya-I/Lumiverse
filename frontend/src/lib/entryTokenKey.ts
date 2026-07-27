/**
 * Per-entry memo for the token-cache key.
 *
 * `tokenCacheKey` runs FNV-1a over the *entire* entry content. That is the right
 * shape for the cache (see `tokenCountCache`: the key must not hold a second copy
 * of the text), but it is O(len) and the entry table calls it once per row per
 * render. Measured on the real 554-entry / 1.24 MB book that is **2.31 ms of
 * blocking hashing per render pass**, against 0.024 ms for the `length / 4`
 * property read the Tokens column used before the cache existed — 97x. With five
 * or six render passes on open, that is the whole "the lorebook got laggy"
 * regression.
 *
 * The fix is not a cheaper hash, it is hashing *once per entry per edit* instead
 * of once per entry per render.
 *
 * **Why a `WeakMap` on the entry object rather than a `Map` on `entry.id`.**
 * `LorebookEditorWorkspace.commitEntries` is strictly immutable — `saveEntry`
 * rebuilds the changed entry with `{ ...entry, ...updates }` and `loadEntries`
 * replaces the array wholesale — so *object identity changes exactly when the
 * content might have*. Keying on the object therefore cannot go stale, needs no
 * revision field, and needs no eviction: entries dropped from React state are
 * collected with their memo record. An id-keyed `Map` would have to be
 * invalidated by hand and would leak one record per entry ever seen this session.
 *
 * `model` and `content.length` are still re-checked on every hit. They are two
 * comparisons, they make an in-place mutation of a retained object fail safe
 * rather than silently serve a stale count, and they mean a profile switch is a
 * natural miss.
 *
 * React-free, store-free, DOM-free, and the hasher is injectable so a test can
 * count how many full passes were actually paid for.
 */

import { tokenCacheKey } from './tokenCountCache'

export type TokenKeyHasher = (model: string | null | undefined, content: string) => string

interface MemoRecord {
  model: string | null
  length: number
  key: string
}

export interface EntryTokenKeyMemo {
  /**
   * The cache key for `content` under `model`, hashing only when this exact
   * `entry` object has not already been hashed for the same model and length.
   */
  (entry: object, model: string | null | undefined, content: string): string
  /** Diagnostics and tests only: how many full content hashes have been paid for. */
  hashCount(): number
  /** Tests only. */
  reset(): void
}

export function createEntryTokenKeyMemo(hash: TokenKeyHasher = tokenCacheKey): EntryTokenKeyMemo {
  let memo = new WeakMap<object, MemoRecord>()
  let hashes = 0

  const resolve = ((entry: object, model: string | null | undefined, content: string): string => {
    const normalizedModel = model ?? null
    const cached = memo.get(entry)
    if (cached && cached.model === normalizedModel && cached.length === content.length) return cached.key
    hashes += 1
    const key = hash(model, content)
    memo.set(entry, { model: normalizedModel, length: content.length, key })
    return key
  }) as EntryTokenKeyMemo

  resolve.hashCount = () => hashes
  resolve.reset = () => {
    memo = new WeakMap()
    hashes = 0
  }
  return resolve
}

/**
 * The process-wide memo, shared for the same reason the cache and the scheduler
 * are singletons: the render path, the hover prefetch and the idle sweep all ask
 * for the same entry's key, and they are three different call sites.
 */
export const entryTokenCacheKey = createEntryTokenKeyMemo()
