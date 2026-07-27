import { describe, expect, test } from 'bun:test'
import {
  clampSurfaceRect,
  compensateRotatedAnchor,
  resizeSurfaceRect,
  toLayoutBox,
  toLayoutPixels,
  toLocalDelta,
  viewportBox,
} from '../frontend/src/hooks/usePersistentRect'
import type { SurfaceRectPrefs } from '../frontend/src/types/store'

const hookSource = await Bun.file(
  new URL('../frontend/src/hooks/usePersistentRect.ts', import.meta.url),
).text()
const resetStyles = await Bun.file(
  new URL('../frontend/src/theme/reset.css', import.meta.url),
).text()
const appStyles = await Bun.file(
  new URL('../frontend/src/App.module.css', import.meta.url),
).text()

describe('toLayoutPixels', () => {
  test('is an exact no-op at scale 1', () => {
    for (const value of [0, 1, 24, 368, 1_920, -17, 0.5, 1_234.567]) {
      expect(toLayoutPixels(value, 1)).toBe(value)
    }
  })

  test('divides rendered pixels by the zoom factor', () => {
    // `body > * { zoom: S }` renders a layout box of `viewport / S`, so a device-pixel
    // viewport number is too large by exactly S.
    expect(toLayoutPixels(1_920, 2)).toBe(960)
    expect(toLayoutPixels(1_000, 1.25)).toBe(800)
    expect(toLayoutPixels(600, 0.8)).toBe(750)
  })

  test('converts pointer deltas by the same factor, preserving sign', () => {
    expect(toLayoutPixels(50, 2)).toBe(25)
    expect(toLayoutPixels(-50, 2)).toBe(-25)
  })

  test('falls back to the raw value for a nonsensical scale', () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(toLayoutPixels(400, scale)).toBe(400)
    }
  })
})

describe('scale-aware viewport read', () => {
  test('the viewport read divides by the ui scale', () => {
    expect(hookSource).toContain('--lumiverse-ui-scale')
    expect(hookSource).toMatch(
      /toLayoutPixels\(\s*Math\.max\(document\.documentElement\.clientWidth, window\.innerWidth \|\| 0\), scale\)/,
    )
    expect(hookSource).toMatch(
      /toLayoutPixels\(\s*Math\.max\(document\.documentElement\.clientHeight, window\.innerHeight \|\| 0\), scale\)/,
    )
  })

  test('every viewport consumer goes through the shared box', () => {
    // clamp, resize, and the snapToEdge branch in `commit` must agree on the space.
    expect(hookSource.match(/viewportBox\(\)/g)?.length).toBe(3)
    expect(hookSource).not.toContain('typeof window === \'undefined\' ? 1920')
  })

  test('the shared box is exported so consumers cannot roll their own viewport read', () => {
    // `PortraitDock` computes its own `RectBounds`; if it reads `window.innerWidth` directly
    // it hands `clampSurfaceRect` a bound in the wrong space. Exporting the already
    // scale-aware box is the fix — and it deduplicates nothing, so the private `readUiScale`
    // below is untouched by it.
    expect(hookSource).toMatch(/^export const viewportBox = \(\)/m)
    expect(hookSource).toMatch(/^export function toLayoutBox</m)
    // Still private, still declared here, still not re-exported from anywhere.
    expect(hookSource).toMatch(/^function readUiScale\(\): number \{/m)
    expect(hookSource).not.toMatch(/export function readUiScale/)
    expect(hookSource).not.toMatch(/^export \{[^}]*readUiScale/ms)
  })

  test('viewportBox and toLayoutBox are exact at the SSR fallback', () => {
    // bun test has no `document`, so `readUiScale()` short-circuits to 1 and the box takes
    // the 1920x1080 fallback — the same numbers every other case in this file is pinned to.
    expect(viewportBox()).toEqual({ width: 1_920, height: 1_080 })
    expect(toLayoutBox({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 })
    // A DOMRect carries x/y/top/left too; only the extents come back.
    expect(toLayoutBox({ x: 10, y: 20, width: 300, height: 150 }))
      .toEqual({ width: 300, height: 150 })
  })

  test('pointer deltas are converted into the same space as the rect', () => {
    expect(hookSource).toContain('toLayoutPixels(event.clientX - drag.startX, scale)')
    expect(hookSource).toContain('toLayoutPixels(event.clientY - drag.startY, scale)')
  })

  test('the scale read is SSR-guarded', () => {
    expect(hookSource).toContain('if (typeof document === \'undefined\') return 1')
  })

  test('does not couple the shared hook to the quick toolbar', () => {
    // The scale read is inlined; importing it from either module would couple this shared
    // hook to the quick toolbar or to a file another job owns.
    expect(hookSource).not.toMatch(/^import .*quickToolbarPlacement/m)
    expect(hookSource).not.toMatch(/^import .*uiScale/m)
    expect(hookSource).toContain('function readUiScale()')
  })

  test('the correction direction matches the stylesheets it compensates for', () => {
    expect(resetStyles).toMatch(/body > \*\s*\{\s*zoom: var\(--lumiverse-ui-scale, 1\);/)
    expect(appStyles).toContain('width: calc(100vw / var(--lumiverse-ui-scale, 1))')
  })
})

describe('scale 1 is byte-identical to the previous arithmetic', () => {
  // bun test has no DOM, so `viewportBox()` takes the 1920x1080 fallback and the scale is 1 —
  // exactly the pre-change code path. These values are the ones pinned by
  // tests/portrait-dock.test.ts against the original implementation.
  const startRect: SurfaceRectPrefs = { x: 200, y: 160, width: 320, height: 240 }
  const bounds = { minWidth: 80, minHeight: 80, maxWidth: 800, maxHeight: 800 }

  test('clampSurfaceRect still clamps against the unscaled fallback viewport', () => {
    expect(clampSurfaceRect({ x: 5_000, y: 5_000, width: 400, height: 300 }, bounds))
      .toEqual({ x: 1_520, y: 780, width: 400, height: 300 })
    expect(clampSurfaceRect({ x: -50, y: -50, width: 10, height: 10 }, bounds))
      .toEqual({ x: 0, y: 0, width: 80, height: 80 })
  })

  test('resizeSurfaceRect is unchanged for every handle', () => {
    expect(resizeSurfaceRect(startRect, 'e', 40, 0, bounds))
      .toEqual({ x: 200, y: 160, width: 360, height: 240 })
    expect(resizeSurfaceRect(startRect, 'w', -40, 0, bounds))
      .toEqual({ x: 160, y: 160, width: 360, height: 240 })
    expect(resizeSurfaceRect(startRect, 'n', 0, -20, bounds))
      .toEqual({ x: 200, y: 140, width: 320, height: 260 })
    expect(resizeSurfaceRect(startRect, 's', 0, 20, bounds))
      .toEqual({ x: 200, y: 160, width: 320, height: 260 })
    expect(resizeSurfaceRect(startRect, 'se', 40, 20, bounds))
      .toEqual({ x: 200, y: 160, width: 360, height: 260 })
    expect(resizeSurfaceRect(startRect, 'nw', -40, -20, bounds))
      .toEqual({ x: 160, y: 140, width: 360, height: 260 })
  })

  test('the aspect-ratio path is unchanged', () => {
    // An east drag is horizontal-only, so the height change is re-centred on the start rect.
    expect(resizeSurfaceRect(startRect, 'e', 80, 0, bounds, true, 2))
      .toEqual({ x: 200, y: 180, width: 400, height: 200 })
  })
})

describe('the rotation option is additive and defaults to a no-op', () => {
  // `QuickToolbar` applies `transform: rotate()` to the same box the hook sizes; nobody else
  // does. The option therefore has to be optional, with today's behaviour as the default, or
  // `PortraitDock`/`ResizablePanelFrame` (and everything downstream) would need edits.
  test('the option is declared optional with a zero default', () => {
    expect(hookSource).toMatch(/^\s*rotationDeg\?: number$/m)
    expect(hookSource).toMatch(/^\s*rotationDeg = 0,$/m)
  })

  test('the angle rides the config ref, so mid-drag changes are picked up', () => {
    expect(hookSource).toMatch(/configRef = useRef\(\{[^}]*rotationDeg \}\)/)
    expect(hookSource).toMatch(/rotationDeg: currentRotation,/)
  })

  test('move drags are deliberately left in screen axes', () => {
    // Rotation is about the box's own centre, so translating the layout box translates the
    // rendered box identically. Converting a move would break rotated and unrotated alike.
    const moveBranch = hookSource.slice(
      hookSource.indexOf("if (drag.mode === 'move')"),
      hookSource.indexOf('} else {', hookSource.indexOf("if (drag.mode === 'move')")),
    )
    expect(moveBranch).toContain('next.x += screenDx')
    expect(moveBranch).toContain('next.y += screenDy')
    expect(moveBranch).not.toContain('toLocalDelta')
  })

  test('the resize branch applies both halves of the fix, in order', () => {
    const resizeBranch = hookSource.slice(hookSource.indexOf('} else {'))
    const local = resizeBranch.indexOf('toLocalDelta(screenDx, screenDy, currentRotation)')
    const anchor = resizeBranch.indexOf('compensateRotatedAnchor(')
    expect(local).toBeGreaterThan(-1)
    expect(anchor).toBeGreaterThan(-1)
    // Rotating the delta without compensating the anchor makes the box crawl away from the
    // cursor — strictly worse than the bug. Neither may ship without the other.
    expect(anchor).toBeGreaterThan(local)
    expect(resizeBranch).toMatch(/compensateRotatedAnchor\(\s*drag\.startRect,\s*resizeSurfaceRect\(/)
  })

  test('the trigonometry lives in a pure module, not in this DOM-bound hook', () => {
    // There is no DOM test environment here, so maths inside the hook could only ever be
    // covered by source-text assertions. `tests/rotated-rect-math.test.ts` tests the real thing.
    expect(hookSource).toContain("from '@/lib/rotatedRectMath'")
    expect(hookSource).not.toContain('Math.cos')
    expect(hookSource).not.toContain('Math.sin')
    expect(hookSource).not.toContain('Math.PI')
  })

  test('the transforms are re-exported, so the hook stays the single import site', () => {
    expect(toLocalDelta(0, 100, 90).dx).toBeCloseTo(100, 9)
    expect(compensateRotatedAnchor(
      { width: 200, height: 60 },
      { x: 100, y: 100, width: 300, height: 60 },
      'e',
      180,
    )).toEqual({ x: 0, y: 100, width: 300, height: 60 })
  })

  test('an unrotated resize is byte-identical to calling resizeSurfaceRect alone', () => {
    const startRect: SurfaceRectPrefs = { x: 200, y: 160, width: 320, height: 240 }
    const bounds = { minWidth: 80, minHeight: 80, maxWidth: 800, maxHeight: 800 }
    for (const mode of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const) {
      const raw = resizeSurfaceRect(startRect, mode, 40, 20, bounds)
      const delta = toLocalDelta(40, 20, 0)
      const through = compensateRotatedAnchor(
        startRect,
        resizeSurfaceRect(startRect, mode, delta.dx, delta.dy, bounds),
        mode,
        0,
      )
      expect(through).toEqual(raw)
    }
  })
})
