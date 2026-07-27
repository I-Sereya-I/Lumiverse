/**
 * Validation for the token count persisted on a world-book entry.
 *
 * An entry can carry a count in `extensions`, written by the entry editor:
 *
 * ```
 * _lumiverse_token_count              the number
 * _lumiverse_token_count_approximate  false when it came from a real tokenizer
 * _lumiverse_token_count_model        the model it was counted for
 * _lumiverse_token_count_len          content.length at the moment it was counted
 * ```
 *
 * The read path used to trust the first two keys alone, which produced two
 * separate wrong-but-confident numbers:
 *
 * 1. **Nothing invalidates the count when the content changes.** The entry save
 *    path writes `content` and never touches `extensions`, so an edited entry
 *    keeps the count of the text it no longer holds.
 * 2. **The recorded model was written and never compared.** The in-memory cache
 *    keys on the model, the stored tier did not, so switching profiles kept
 *    showing the previous model's number.
 *
 * Both rendered without the `~` marker, i.e. as exact. This module is the gate:
 * a stored count is only reported as exact when it can be shown to describe
 * *this* text under *this* model. When it cannot, the value is still returned —
 * it is a better guess than `length / 4` — but with `exact: false`, so it
 * renders `~`. It is never dropped silently and never shown as exact.
 *
 * ## What `_len` does and does not catch — read this before trusting it
 *
 * `content.length` is a **weak discriminator**. It catches every edit that adds
 * or removes characters, which is the overwhelming majority of real edits, and
 * it fails safe (a mismatch demotes to `~`; it can never invent an exact
 * number). It does **not** catch an edit that preserves the character count: a
 * typo fix, a swapped word of equal length, changed punctuation, a
 * search-and-replace of same-length tokens, or an import that rewrites the body
 * to the same size. Those still render a stale count as exact.
 *
 * So bug 1 above is **narrowed here, not eliminated.** Do not describe it as
 * fixed.
 *
 * ## Why not a content hash
 *
 * A hash of the content would close bug 1 completely. It is rejected on **cost**,
 * not on any structural constraint: hashing full entry content once per row per
 * render measured **2.31 ms of blocking work per render pass** on the real
 * 554-entry / 1.24 MB book (see `lib/entryTokenKey.ts`), which is exactly the
 * regression the render path was restructured to remove. This validator runs
 * ahead of the memoised FNV probe precisely so that the cheap authoritative
 * answer costs property reads instead of a pass over the text; paying for a hash
 * here would give back the whole saving.
 *
 * (A source-order assertion in `tests/lorebook-entry-perf.test.ts` has been
 * cited as forbidding a hash. It does not — it is a grep over source order and a
 * hash-based validator placed textually first would satisfy it unchanged. The
 * reason is the measurement above.)
 *
 * ## Why not `revision` / `updated_at`
 *
 * `WorldBookEntry` carries both, and either would be a precise discriminator —
 * except that the write that persists the count goes through the entry update
 * path, which **bumps `revision` and `updated_at` as it lands**. The stored
 * "revision this count describes" would therefore be one behind the entry from
 * the instant it was written, and every count would read as stale. They are
 * unusable without a server route that writes the count without bumping them,
 * which does not exist.
 *
 * ## Why `lib/entryTokenKey.ts` is not a precedent for this
 *
 * That module also compares `content.length`, but it is sound for a different
 * reason: it is a `WeakMap` keyed on the entry **object**, and object identity
 * changes exactly when the content might have. The length check there is
 * belt-and-braces against in-place mutation of a retained object. A value read
 * back out of the database has no identity backstop — length is the only check
 * there is. The two are not the same trade.
 *
 * React-free, store-free, DOM-free.
 */

/** Extension key holding the persisted count. */
export const STORED_TOKEN_COUNT_KEY = '_lumiverse_token_count'
/** Extension key set when the persisted count came from `length / 4`, not a tokenizer. */
export const STORED_TOKEN_COUNT_APPROXIMATE_KEY = '_lumiverse_token_count_approximate'
/** Extension key holding the model the persisted count was produced for. */
export const STORED_TOKEN_COUNT_MODEL_KEY = '_lumiverse_token_count_model'
/** Extension key holding `content.length` at the moment the count was produced. */
export const STORED_TOKEN_COUNT_LENGTH_KEY = '_lumiverse_token_count_len'

export interface StoredTokenCount {
  value: number
  /** `false` renders a leading `~`. */
  exact: boolean
}

/**
 * `Number()` is too permissive for a value that decides whether a number is
 * shown as authoritative: it turns `null`, `''`, `[]` and `false` into `0` and
 * `true` into `1`. Only a finite number, or a non-blank string that parses to
 * one (JSON round-trips have been seen to stringify), counts as a stored value.
 */
function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * The persisted count for an entry, or `null` when there is none to report.
 *
 * `exact` requires **all** of:
 * - a finite stored value;
 * - `_lumiverse_token_count_approximate` falsy;
 * - `_lumiverse_token_count_model` equal to `model` (both normalised, so absent
 *   and `null` are the same thing);
 * - `_lumiverse_token_count_len` present, finite, and equal to `content.length`.
 *
 * A record written before `_len` existed therefore demotes to `~` rather than
 * being trusted — it is genuinely unverifiable — and is re-earned the next time
 * the entry is counted.
 */
export function readStoredTokenCount(
  extensions: Record<string, unknown> | null | undefined,
  content: string,
  model: string | null,
): StoredTokenCount | null {
  if (!extensions) return null
  const value = toFiniteNumber(extensions[STORED_TOKEN_COUNT_KEY])
  if (value === null) return null

  if (extensions[STORED_TOKEN_COUNT_APPROXIMATE_KEY]) return { value, exact: false }

  const storedModel = extensions[STORED_TOKEN_COUNT_MODEL_KEY]
  const normalizedStoredModel = typeof storedModel === 'string' ? storedModel : null
  if (normalizedStoredModel !== (model ?? null)) return { value, exact: false }

  const storedLength = toFiniteNumber(extensions[STORED_TOKEN_COUNT_LENGTH_KEY])
  if (storedLength === null || storedLength !== content.length) return { value, exact: false }

  return { value, exact: true }
}
