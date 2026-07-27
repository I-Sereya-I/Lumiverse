import { describe, expect, test } from 'bun:test'
import {
  compensateRotatedAnchor,
  isUnrotated,
  resizeCentreShift,
  rotatedAnchorShift,
  toLocalDelta,
  type RotatedResizeHandle,
} from '../frontend/src/lib/rotatedRectMath'
import { resizeSurfaceRect } from '../frontend/src/hooks/usePersistentRect'
import type { SurfaceRectPrefs } from '../frontend/src/types/store'

/**
 * This repo has no DOM test environment, so component coverage is source-text assertion —
 * useless for geometry. `lib/rotatedRectMath.ts` exists precisely so the rotated-resize maths
 * can be tested for real, and this file is that test.
 */

const EPS = 1e-9
const near = (value: number, expected: number, what = '') =>
  expect(`${what}${Math.abs(value - expected) < EPS ? 'ok' : `${value} != ${expected}`}`).toBe(`${what}ok`)

/** Every handle, so no direction can be fixed at another's expense. */
const HANDLES: RotatedResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

/** 0, both signed right angles, the half turn, both signed diagonals, and a non-axis angle. */
const ANGLES = [0, 90, -90, 180, 45, -45, 37]

const BOUNDS = { minWidth: 20, minHeight: 20, maxWidth: 900, maxHeight: 900 }
const START: SurfaceRectPrefs = { x: 300, y: 200, width: 200, height: 120 }

/**
 * Independent oracle: where CSS actually draws a point of the layout box.
 *
 * `transform: rotate(θ)` with `transform-origin: center` maps `p` to `c + R(θ)·(p − c)`.
 * Written out longhand from the transform's definition rather than reusing anything in
 * `rotatedRectMath.ts`, so a sign error there cannot cancel itself out here.
 */
function renderPoint(rect: SurfaceRectPrefs, fx: number, fy: number, deg: number) {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const px = rect.x + fx * rect.width
  const py = rect.y + fy * rect.height
  const theta = (deg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return {
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  }
}

/**
 * The rect fractions of the edge/corner a handle drags, and of the opposite one the resize is
 * supposed to leave visually anchored.
 */
const GEOMETRY: Record<RotatedResizeHandle, { drag: [number, number]; anchor: [number, number] }> = {
  e: { drag: [1, 0.5], anchor: [0, 0.5] },
  w: { drag: [0, 0.5], anchor: [1, 0.5] },
  s: { drag: [0.5, 1], anchor: [0.5, 0] },
  n: { drag: [0.5, 0], anchor: [0.5, 1] },
  se: { drag: [1, 1], anchor: [0, 0] },
  sw: { drag: [0, 1], anchor: [1, 0] },
  ne: { drag: [1, 0], anchor: [0, 1] },
  nw: { drag: [0, 0], anchor: [1, 1] },
}

/** The local-axis delta a handle can actually consume (it ignores its non-owned axis). */
function localDeltaFor(handle: RotatedResizeHandle) {
  return {
    dx: handle.includes('e') ? 40 : handle.includes('w') ? -40 : 0,
    dy: handle.includes('s') ? 30 : handle.includes('n') ? -30 : 0,
  }
}

/** Exactly the pipeline `usePersistentRect.updateFromPointer` runs on a resize drag. */
function dragResize(
  startRect: SurfaceRectPrefs,
  handle: RotatedResizeHandle,
  screenDx: number,
  screenDy: number,
  rotationDeg: number,
  preserveAspectRatio = false,
  aspectRatio?: number,
): SurfaceRectPrefs {
  const { dx, dy } = toLocalDelta(screenDx, screenDy, rotationDeg)
  return compensateRotatedAnchor(
    startRect,
    resizeSurfaceRect(startRect, handle, dx, dy, BOUNDS, preserveAspectRatio, aspectRatio),
    handle,
    rotationDeg,
  )
}

describe('isUnrotated', () => {
  test('full turns and zero are unrotated', () => {
    for (const deg of [0, -0, 360, -360, 720]) expect(isUnrotated(deg)).toBe(true)
  })

  test('every angle the slider can actually produce off-zero is rotated', () => {
    for (const deg of [1, -1, 45, -45, 90, -90, 179, 180, -180, 37.5]) {
      expect(isUnrotated(deg)).toBe(false)
    }
  })

  test('a corrupted persisted angle degrades to unrotated instead of producing NaN', () => {
    for (const deg of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isUnrotated(deg)).toBe(true)
      expect(toLocalDelta(11, -7, deg)).toEqual({ dx: 11, dy: -7 })
      expect(rotatedAnchorShift(START, { width: 400, height: 120 }, 'e', deg)).toEqual({ dx: 0, dy: 0 })
    }
  })
})

describe('toLocalDelta', () => {
  test('0 and full turns return the delta bit-identically', () => {
    for (const deg of [0, 360, -360]) {
      for (const [dx, dy] of [[37, -14], [0, 0], [-1.5, 2048.25]]) {
        const local = toLocalDelta(dx, dy, deg)
        expect(Object.is(local.dx, dx)).toBe(true)
        expect(Object.is(local.dy, dy)).toBe(true)
      }
    }
  })

  test('90 degrees maps a downward screen drag onto the local +x axis', () => {
    // THE reported bug: `rotate(90deg)` draws local +x pointing down the screen, so the east
    // handle sits along the bottom edge. Dragging it down must become a pure width change.
    const local = toLocalDelta(0, 100, 90)
    near(local.dx, 100, 'dx ')
    near(local.dy, 0, 'dy ')
  })

  test('-90 degrees maps an upward screen drag onto the local +x axis', () => {
    const local = toLocalDelta(0, -100, -90)
    near(local.dx, 100, 'dx ')
    near(local.dy, 0, 'dy ')
  })

  test('180 degrees inverts both axes', () => {
    const local = toLocalDelta(100, -40, 180)
    near(local.dx, -100, 'dx ')
    near(local.dy, 40, 'dy ')
  })

  test('45 and -45 split a single-axis drag evenly, with opposite cross-axis signs', () => {
    const half = 100 / Math.SQRT2
    const plus = toLocalDelta(100, 0, 45)
    near(plus.dx, half, 'dx+ ')
    near(plus.dy, -half, 'dy+ ')
    const minus = toLocalDelta(100, 0, -45)
    near(minus.dx, half, 'dx- ')
    near(minus.dy, half, 'dy- ')
  })

  test('a non-axis angle matches the transpose of the CSS rotation matrix', () => {
    const theta = (37 * Math.PI) / 180
    const local = toLocalDelta(80, -25, 37)
    near(local.dx, 80 * Math.cos(theta) + -25 * Math.sin(theta), 'dx ')
    near(local.dy, -80 * Math.sin(theta) + -25 * Math.cos(theta), 'dy ')
  })

  test('length is preserved — a rotation cannot scale the drag', () => {
    for (const deg of ANGLES) {
      const local = toLocalDelta(63, -29, deg)
      near(Math.hypot(local.dx, local.dy), Math.hypot(63, -29), `${deg} `)
    }
  })

  test('unrotating then rotating by the negated angle round-trips the delta', () => {
    for (const deg of ANGLES) {
      for (const [dx, dy] of [[120, 0], [0, -75], [33, 91], [-14.5, -2.25]]) {
        const local = toLocalDelta(dx, dy, deg)
        // Negating the angle is the inverse transform, i.e. R(θ) itself.
        const back = toLocalDelta(local.dx, local.dy, -deg)
        near(back.dx, dx, `${deg} dx `)
        near(back.dy, dy, `${deg} dy `)
      }
    }
  })
})

describe('resizeCentreShift', () => {
  test('the centre moves half the size change, towards the dragged edge', () => {
    const grown = { width: 300, height: 200 }
    expect(resizeCentreShift(START, grown, 'e')).toEqual({ dx: 50, dy: 0 })
    expect(resizeCentreShift(START, grown, 'w')).toEqual({ dx: -50, dy: 0 })
    expect(resizeCentreShift(START, grown, 's')).toEqual({ dx: 0, dy: 40 })
    expect(resizeCentreShift(START, grown, 'n')).toEqual({ dx: 0, dy: -40 })
    expect(resizeCentreShift(START, grown, 'se')).toEqual({ dx: 50, dy: 40 })
    expect(resizeCentreShift(START, grown, 'nw')).toEqual({ dx: -50, dy: -40 })
  })

  test('an axis the handle does not own contributes nothing even if that extent changed', () => {
    // The aspect-ratio path re-centres the non-driven axis on the start rect, so its centre
    // does not move however much the extent did. `hx`/`hy` of 0 is the matching answer.
    expect(resizeCentreShift(START, { width: 200, height: 400 }, 'e')).toEqual({ dx: 0, dy: 0 })
    expect(resizeCentreShift(START, { width: 400, height: 120 }, 's')).toEqual({ dx: 0, dy: 0 })
  })
})

describe('rotatedAnchorShift', () => {
  test('is exactly zero when unrotated, for every handle', () => {
    for (const handle of HANDLES) {
      const shift = rotatedAnchorShift(START, { width: 400, height: 300 }, handle, 0)
      expect(Object.is(shift.dx, 0)).toBe(true)
      expect(Object.is(shift.dy, 0)).toBe(true)
    }
  })

  test('at 180 degrees the shift is the full negated size change', () => {
    // u = (dw/2, 0); R(180)·u = (-dw/2, 0); t = R·u - u = (-dw, 0).
    const shift = rotatedAnchorShift(START, { width: 300, height: 120 }, 'e', 180)
    near(shift.dx, -100, 'dx ')
    near(shift.dy, 0, 'dy ')
  })

  test('at 90 degrees the shift rotates the centre displacement a quarter turn', () => {
    // u = (50, 0); R(90)·u = (0, 50); t = (-50, 50).
    const shift = rotatedAnchorShift(START, { width: 300, height: 120 }, 'e', 90)
    near(shift.dx, -50, 'dx ')
    near(shift.dy, 50, 'dy ')
  })
})

describe('compensateRotatedAnchor', () => {
  test('returns the very same object when unrotated — not merely an equal one', () => {
    const resized: SurfaceRectPrefs = { x: 300, y: 200, width: 240, height: 120 }
    for (const handle of HANDLES) {
      expect(compensateRotatedAnchor(START, resized, handle, 0)).toBe(resized)
    }
  })

  test('leaves the extents alone and only translates', () => {
    for (const deg of ANGLES) {
      for (const handle of HANDLES) {
        const resized: SurfaceRectPrefs = { x: 300, y: 200, width: 260, height: 190 }
        const fixed = compensateRotatedAnchor(START, resized, handle, deg)
        expect(fixed.width).toBe(resized.width)
        expect(fixed.height).toBe(resized.height)
      }
    }
  })
})

describe('a rotated resize keeps the rendered geometry honest', () => {
  for (const deg of ANGLES) {
    for (const handle of HANDLES) {
      test(`${handle} handle at ${deg}deg: the untouched edge does not move on screen`, () => {
        const local = localDeltaFor(handle)
        // Drive the drag from the *screen* delta the user would actually produce: the local
        // delta seen through the same rotation CSS applies.
        const screen = toLocalDelta(local.dx, local.dy, -deg)
        const result = dragResize(START, handle, screen.dx, screen.dy, deg)

        const [ax, ay] = GEOMETRY[handle].anchor
        const before = renderPoint(START, ax, ay, deg)
        const after = renderPoint(result, ax, ay, deg)
        near(after.x, before.x, `${handle}@${deg} anchor x `)
        near(after.y, before.y, `${handle}@${deg} anchor y `)
      })

      test(`${handle} handle at ${deg}deg: the dragged edge follows the pointer`, () => {
        const local = localDeltaFor(handle)
        const screen = toLocalDelta(local.dx, local.dy, -deg)
        const result = dragResize(START, handle, screen.dx, screen.dy, deg)

        const [dx0, dy0] = GEOMETRY[handle].drag
        const before = renderPoint(START, dx0, dy0, deg)
        const after = renderPoint(result, dx0, dy0, deg)
        near(after.x - before.x, screen.dx, `${handle}@${deg} drag x `)
        near(after.y - before.y, screen.dy, `${handle}@${deg} drag y `)
      })
    }
  }

  test('the headline bug: at 90deg the east handle widens on a downward drag', () => {
    // Before the fix this consumed only `dx`, so a pure-`dy` drag did nothing at all.
    const result = dragResize(START, 'e', 0, 100, 90)
    near(result.width, 300, 'width ')
    near(result.height, 120, 'height ')
  })

  test('at 90deg dragging the east handle sideways — the old working axis — now does nothing', () => {
    const result = dragResize(START, 'e', 100, 0, 90)
    near(result.width, 200, 'width ')
  })

  test('rotating the delta without compensating the anchor would strand the box', () => {
    // Guards the "fixing one defect is worse than fixing neither" hazard: this is the
    // uncompensated result, and it is 50/50 px away from the compensated one.
    const { dx, dy } = toLocalDelta(0, 100, 90)
    const uncompensated = resizeSurfaceRect(START, 'e', dx, dy, BOUNDS)
    const compensated = dragResize(START, 'e', 0, 100, 90)
    near(uncompensated.x, 300, 'raw x ')
    near(uncompensated.y, 200, 'raw y ')
    near(compensated.x, 250, 'fixed x ')
    near(compensated.y, 250, 'fixed y ')
  })
})

describe('0 degrees is bit-identical to the pre-rotation behaviour', () => {
  // The regression guard for every non-rotated consumer: PortraitDock, ResizablePanelFrame,
  // ConnectionsPicker, WorldBookEditorModal, LorebookHalfScreenEditor. None passes an angle,
  // so all of them take this path on every single resize drag.
  const identical = (actual: SurfaceRectPrefs, expected: SurfaceRectPrefs, label: string) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(`${label}.${key}=${Object.is(actual[key], expected[key])}`).toBe(`${label}.${key}=true`)
    }
  }

  test('every handle, every drag direction, matches resizeSurfaceRect exactly', () => {
    for (const handle of HANDLES) {
      for (const [dx, dy] of [[40, 30], [-40, -30], [0, 0], [-17.5, 91.25], [5_000, 5_000]]) {
        identical(
          dragResize(START, handle, dx, dy, 0),
          resizeSurfaceRect(START, handle, dx, dy, BOUNDS),
          `${handle}(${dx},${dy})`,
        )
      }
    }
  })

  test('the aspect-ratio-locked path is equally untouched', () => {
    for (const handle of HANDLES) {
      identical(
        dragResize(START, handle, 80, 20, 0, true, 4 / 3),
        resizeSurfaceRect(START, handle, 80, 20, BOUNDS, true, 4 / 3),
        `aspect-${handle}`,
      )
    }
  })

  test('and so is a full turn, which the slider cannot reach but a migration could', () => {
    for (const handle of HANDLES) {
      identical(
        dragResize(START, handle, 40, 30, 360),
        resizeSurfaceRect(START, handle, 40, 30, BOUNDS),
        `360-${handle}`,
      )
    }
  })
})
