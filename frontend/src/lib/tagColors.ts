/**
 * Deterministic per-tag colour.
 *
 * The hash → slot mapping is the feature: a given tag keeps the same colour across
 * every card, every list and every session. The hash function and the 12-slot modulo
 * below are therefore frozen — changing either reshuffles every tag in the UI.
 *
 * What is NOT frozen is the colour itself. Slots used to hold literal `rgba()` triples,
 * which meant tag colour was computed in JS, injected inline, and so outranked any
 * stylesheet the user wrote in the Custom CSS panel. Slots now resolve to the theme
 * tokens `--lumiverse-tag-1 … --lumiverse-tag-12`, which are raw comma-separated RGB
 * triples (e.g. `--lumiverse-tag-1: 147, 112, 219;`) so consumers can compose their own
 * alpha: `rgba(var(--lumiverse-tag-1), 0.72)`.
 *
 * Prefer `getTagColorVar()` and let CSS paint. `getTagColor()` exists for call sites that
 * still build inline styles; its values are token references, so the theme can move them.
 */

export const TAG_COLOR_SLOTS = 12

export interface TagColor {
  bg: string
  text: string
  border: string
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const indexCache = new Map<string, number>()

/** 0-based slot for `tag`. Stable forever — see the note above. */
export function getTagColorIndex(tag: string): number {
  const cached = indexCache.get(tag)
  if (cached !== undefined) return cached
  const index = hashString(tag) % TAG_COLOR_SLOTS
  indexCache.set(tag, index)
  return index
}

/**
 * `var(--lumiverse-tag-N)` — a raw `R, G, B` triple, not a colour.
 * Wrap it: `rgba(var(--lumiverse-tag-4), 0.15)` or `rgb(var(--lumiverse-tag-4))`.
 */
export function getTagColorVar(tag: string): string {
  return `var(--lumiverse-tag-${getTagColorIndex(tag) + 1})`
}

const cache = new Map<string, TagColor>()

export function getTagColor(tag: string): TagColor {
  const cached = cache.get(tag)
  if (cached) return cached
  const rgb = getTagColorVar(tag)
  const color: TagColor = {
    bg: `rgba(${rgb}, 0.15)`,
    text: `color-mix(in srgb, rgb(${rgb}) 70%, var(--lumiverse-text))`,
    border: `rgba(${rgb}, 0.3)`,
  }
  cache.set(tag, color)
  return color
}
