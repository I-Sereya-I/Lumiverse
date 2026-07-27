/**
 * The one place that reads the app-wide UI zoom factor.
 *
 * `theme/reset.css` applies `body > * { zoom: var(--lumiverse-ui-scale, 1) }`, so
 * every surface renders inside a zoom layer. Anything measured with
 * `getBoundingClientRect()`, `PointerEvent.clientX/Y`,
 * `document.documentElement.clientWidth` or `window.innerWidth` comes back in
 * *rendered* pixels — larger than the layout pixels the stylesheet and any
 * persisted `px` value are expressed in, by exactly this factor. Comparing the
 * two spaces without dividing is what produced the popover drift in round 1 and
 * the "the editor covers everything" report in round 2.
 *
 * This module is deliberately neutral: it has no store, React or feature
 * dependency, so a lorebook file does not have to import a quick-toolbar module
 * to ask a question about the document. `lib/quickToolbarPlacement.ts` now
 * re-exports `readUiScale` from here rather than declaring its own copy, so this
 * is the single implementation for `lib/` and component code.
 *
 * `hooks/usePersistentRect.ts` keeps a private copy by design — a generic shared
 * hook must not take a `lib/` dependency, and `tests/persistent-rect.test.ts`
 * pins that. Do not collapse it onto this module.
 */

/** Reads the `body > *` zoom factor that client-pixel measurements must be divided by. */
export function readUiScale(): number {
  if (typeof document === 'undefined') return 1
  return parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lumiverse-ui-scale'),
  ) || 1
}

/**
 * Converts a rendered/client pixel measurement into the zoom layer's layout units.
 *
 * A scale of 1 divides by 1 and is therefore an exact no-op.
 */
export function toLayoutPixels(clientPx: number, scale: number = readUiScale()): number {
  return Number.isFinite(scale) && scale > 0 ? clientPx / scale : clientPx
}
