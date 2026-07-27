/**
 * Coordinate conversion for surfaces that position themselves with JavaScript inside the
 * app-wide UI zoom layer.
 *
 * `theme/reset.css:187-191` applies `body > * { zoom: var(--lumiverse-ui-scale, 1) }`, which
 * splits every measurement in the app into two spaces:
 *
 *   **rendered px** — `window.innerWidth`/`innerHeight`, `getBoundingClientRect()`,
 *                     `PointerEvent.clientX/clientY`. Unaffected by the zoom, i.e. real screen
 *                     pixels.
 *   **layout px**   — `offsetWidth`/`offsetHeight`, and every `left`/`top`/`width`/`height`
 *                     written into an inline `style` on an element inside the layer. The engine
 *                     multiplies these by the scale on paint.
 *
 * Measured in headless Chrome 150 at scale 0.8 / 1.0 / 1.3 / 1.6 on a 1904 x 985 viewport:
 *
 *   | scale | innerWidth | layout viewport | `width: 72px` -> gBCR | -> offsetWidth |
 *   |-------|------------|-----------------|-----------------------|----------------|
 *   | 0.8   | 1904       | 2380            | 57.594                | 72             |
 *   | 1.0   | 1904       | 1904            | 72                    | 72             |
 *   | 1.3   | 1904       | 1465            | 93.594                | 72             |
 *   | 1.6   | 1904       | 1190            | 115.188               | 72             |
 *
 * so `layoutViewportSize()` is `innerWidth / scale` and `gBCR().width / scale === offsetWidth`
 * exactly. `left: 100px` painted at 80 / 100 / 130 / 160 device px, confirming that written
 * offsets are layout px — for elements nested under `#root` *and* for elements portalled
 * straight to `document.body` (each is its own `body > *` zoom layer, and both behave the same).
 *
 * `lib/uiScale.ts` owns the scale read itself; this module is the geometry on top of it, so a
 * component never has to remember which way to divide. Everything here is a division: at scale
 * 1 every function is an exact no-op.
 */

import { readUiScale, toLayoutPixels } from './uiScale'

export interface LayoutSize {
  width: number
  height: number
}

export interface LayoutDelta {
  x: number
  y: number
}

/** Used when there is no `window` to measure — SSR and unit tests. */
export const DEFAULT_LAYOUT_VIEWPORT: LayoutSize = { width: 1440, height: 900 }

/** A DOM node, narrowed to the one method this module needs, so it is trivially fakeable. */
export interface MeasurableElement {
  getBoundingClientRect(): { width: number; height: number }
}

/** Converts a rendered-pixel box (a `DOMRect`, typically) into layout pixels. */
export function toLayoutSize(size: LayoutSize, scale: number = readUiScale()): LayoutSize {
  return {
    width: toLayoutPixels(size.width, scale),
    height: toLayoutPixels(size.height, scale),
  }
}

/**
 * Converts a pointer delta into layout pixels.
 *
 * Pointer coordinates are rendered px, so adding a raw `clientX` delta to a layout-px position
 * makes the surface travel `scale` times as far as the cursor and slide out from under it.
 */
export function toLayoutDelta(
  clientDx: number,
  clientDy: number,
  scale: number = readUiScale(),
): LayoutDelta {
  return {
    x: toLayoutPixels(clientDx, scale),
    y: toLayoutPixels(clientDy, scale),
  }
}

/**
 * The viewport in the zoom layer's own units — the space a clamp must run in if the surface
 * being clamped is positioned with an inline `style`.
 */
export function layoutViewportSize(
  fallback: LayoutSize = DEFAULT_LAYOUT_VIEWPORT,
  scale: number = readUiScale(),
  view: { innerWidth: number; innerHeight: number } | undefined =
    typeof window === 'undefined' ? undefined : window,
): LayoutSize {
  if (!view) return fallback
  return toLayoutSize({ width: view.innerWidth, height: view.innerHeight }, scale)
}

/**
 * An element's own size in layout pixels.
 *
 * Equivalent to reading `offsetWidth`/`offsetHeight`, and preferred over them because it takes
 * the same `null` fallback as every other measurement here and cannot be mistaken for a
 * rendered-px read by the next person to touch the call site.
 */
export function layoutElementSize(
  node: MeasurableElement | null | undefined,
  fallback: LayoutSize,
  scale: number = readUiScale(),
): LayoutSize {
  if (!node) return fallback
  return toLayoutSize(node.getBoundingClientRect(), scale)
}
