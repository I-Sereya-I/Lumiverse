import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_LAYOUT_VIEWPORT,
  layoutElementSize,
  layoutViewportSize,
  toLayoutDelta,
  toLayoutSize,
} from '../frontend/src/lib/zoomLayerGeometry'

/**
 * The numbers below are not invented. They were measured in headless Chrome 150 against a
 * standalone page that reproduces `body > * { zoom: var(--lumiverse-ui-scale, 1) }` from
 * `frontend/src/theme/reset.css:187-191`, at a 1904 x 985 viewport, for each scale:
 *
 *   scale | window.innerWidth | layout viewport | `width: 72px` -> gBCR().width
 *   0.8   | 1904              | 2380            | 57.594
 *   1.0   | 1904              | 1904            | 72
 *   1.3   | 1904              | 1465            | 93.594
 *   1.6   | 1904              | 1190            | 115.188
 *
 * `offsetWidth` read 72 at every one of those scales, and an inline `left: 100px` painted at
 * 80 / 100 / 130 / 160 device px — for an element nested under `#root` and for one portalled
 * straight to `document.body` alike.
 */
const SCALES = [0.8, 1.0, 1.3, 1.6] as const

/** What Chrome actually reported from `getBoundingClientRect()` on a `72 x 32` CSS box. */
const MEASURED_TRIGGER_RECT: Record<number, { width: number; height: number }> = {
  0.8: { width: 57.594, height: 25.594 },
  1.0: { width: 72, height: 32 },
  1.3: { width: 93.594, height: 41.594 },
  1.6: { width: 115.188, height: 51.188 },
}

const VIEW = { innerWidth: 1904, innerHeight: 985 }

describe('zoom layer geometry', () => {
  test('scale 1 is an exact no-op on every conversion', () => {
    expect(toLayoutSize({ width: 340, height: 430 }, 1)).toEqual({ width: 340, height: 430 })
    expect(toLayoutDelta(400, -250, 1)).toEqual({ x: 400, y: -250 })
    expect(layoutViewportSize(DEFAULT_LAYOUT_VIEWPORT, 1, VIEW)).toEqual({ width: 1904, height: 985 })
  })

  test('the layout viewport is the rendered viewport divided by the scale', () => {
    expect(layoutViewportSize(DEFAULT_LAYOUT_VIEWPORT, 0.8, VIEW)).toEqual({ width: 2380, height: 1231.25 })
    expect(layoutViewportSize(DEFAULT_LAYOUT_VIEWPORT, 1.6, VIEW)).toEqual({ width: 1190, height: 615.625 })
    // Chrome rounds `offsetWidth` to an integer; the helper keeps the fraction.
    expect(layoutViewportSize(DEFAULT_LAYOUT_VIEWPORT, 1.3, VIEW).width).toBeCloseTo(1464.615, 3)
  })

  test('dividing getBoundingClientRect by the scale reproduces offsetWidth', () => {
    // This is the whole justification for standardising on layout px: the two DOM APIs the
    // indicator used to mix are related by exactly this division. The residual (~0.008px) is
    // Chrome's 1/64px LayoutUnit quantisation of the *rendered* box, not conversion error.
    for (const scale of SCALES) {
      const layout = toLayoutSize(MEASURED_TRIGGER_RECT[scale], scale)
      expect(layout.width).toBeCloseTo(72, 1)
      expect(layout.height).toBeCloseTo(32, 1)
    }
  })

  test('a pointer delta converts so the surface tracks the cursor at any scale', () => {
    // Cursor travels 400 rendered px. The surface must move 400 rendered px, which means
    // writing 400/scale layout px.
    for (const scale of SCALES) {
      const delta = toLayoutDelta(400, 0, scale)
      expect(delta.x * scale).toBeCloseTo(400, 6)
    }
    // The pre-fix behaviour, for the record: a raw delta moved the pill 640 rendered px at 1.6.
    expect(400 * 1.6).toBe(640)
  })

  test('element measurement falls back rather than throwing when the ref is empty', () => {
    const fallback = { width: 72, height: 32 }
    expect(layoutElementSize(null, fallback, 1.6)).toEqual(fallback)
    expect(layoutElementSize(undefined, fallback, 1.6)).toEqual(fallback)
    expect(layoutElementSize(
      { getBoundingClientRect: () => MEASURED_TRIGGER_RECT[1.6] },
      fallback,
      1.6,
    ).width).toBeCloseTo(72, 1)
  })

  test('a missing or nonsensical scale degrades to no conversion instead of NaN/Infinity', () => {
    expect(toLayoutSize({ width: 100, height: 50 }, Number.NaN)).toEqual({ width: 100, height: 50 })
    expect(toLayoutSize({ width: 100, height: 50 }, 0)).toEqual({ width: 100, height: 50 })
    expect(toLayoutDelta(10, 10, -2)).toEqual({ x: 10, y: 10 })
  })

  test('there is no window to measure under SSR, so the caller-supplied fallback wins', () => {
    // `typeof window === 'undefined'` here, which is exactly the SSR/test path.
    expect(layoutViewportSize()).toEqual(DEFAULT_LAYOUT_VIEWPORT)
    expect(layoutViewportSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 })
  })
})
