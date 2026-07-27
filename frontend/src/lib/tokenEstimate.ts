/**
 * Tier 0 of the lorebook token pipeline: the free, synchronous heuristic.
 *
 * Kept free of React, the store and the DOM so it unit-tests without a renderer,
 * like the other `lib/` modules the lorebook editor depends on.
 *
 * The value this produces is **never persisted**. It used to be: three branches
 * in `WorldBookEntryEditor` wrote a pure `length / 4` guess back to the server,
 * which bumped `revision` to record something the client already knew. The
 * exactness gate now lives inside `persistTokenCount`, so an estimate stays on
 * the client and is rendered with a leading `~`.
 */

/**
 * Characters per token, matching the backend's `approximate` tokenizer default
 * (`loadApproximate` in `src/services/tokenizer.service.ts` uses
 * `config.charsPerToken || 4`). Sharing the constant means the estimate the list
 * shows and the number an approximate tokenizer would return do not disagree.
 */
export const ESTIMATE_CHARS_PER_TOKEN = 4

/**
 * Estimate a token count from text length alone.
 *
 * Monotonic in length and `0` for the empty string, so a list sorted or scanned
 * by this column behaves sensibly, and so replacing the four inlined
 * `Math.ceil(content.length / 4)` expressions is a pure refactor — no cell
 * changes value the moment this module lands.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / ESTIMATE_CHARS_PER_TOKEN)
}
