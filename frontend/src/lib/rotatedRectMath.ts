/**
 * Geometry for resizing a box that its consumer draws through a CSS
 * `transform: rotate(θ)` with `transform-origin: center`.
 *
 * Pure arithmetic only — no DOM, no store, no React, no other module. It lives here rather
 * than inside `hooks/usePersistentRect.ts` because this repo has **no DOM test environment**:
 * component and hook coverage is source-text assertion, which proves nothing about maths.
 * Everything below is exercised behaviourally by `tests/rotated-rect-math.test.ts`.
 *
 * ## Coordinate convention
 *
 * Screen axes: `x` grows right, `y` grows **down** (CSS/`PointerEvent` convention).
 * CSS `rotate(θ)` maps a point `p` of the untransformed ("layout") box to
 *
 *     render(p) = c + R(θ)·(p − c),   R(θ) = ⎡cos θ  −sin θ⎤
 *                                            ⎣sin θ   cos θ⎦
 *
 * where `c` is the layout box's centre (that is what `transform-origin: center` means).
 * Sanity check at θ = 90°: `R·(1, 0) = (0, 1)` — the box's own +x axis is drawn pointing
 * *down* the screen, i.e. the "east" handle is rendered along the bottom edge. That is
 * exactly the reported symptom.
 */

/** The eight resize handles. Structurally identical to `Exclude<DragMode, 'move'>`. */
export type RotatedResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface RectLike {
  x: number
  y: number
  width: number
  height: number
}

export interface Vec2 {
  dx: number
  dy: number
}

/**
 * True when the consumer applies no rotation at all, so every function here must return its
 * input **bit-identically**. This is the regression guard for every non-rotated consumer
 * (`PortraitDock`, `ResizablePanelFrame`, `ConnectionsPicker`, the lorebook editors): they
 * never pass an angle, so they take this branch and never touch a trig function.
 *
 * A non-finite angle counts as unrotated — a corrupted persisted setting must not be able to
 * turn a resize into `NaN`.
 */
export function isUnrotated(rotationDeg: number): boolean {
  return !Number.isFinite(rotationDeg) || rotationDeg % 360 === 0
}

/** `R(θ)` applied to a screen-space vector. Internal to the two exported transforms. */
function rotate(dx: number, dy: number, theta: number): Vec2 {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos }
}

/**
 * Screen-axis pointer delta → the element's own (pre-transform) axes.
 *
 * A resize handle is labelled in *element-local* terms — `'e'` means "grow the width" — but a
 * `PointerEvent` delta is in screen axes. Under `rotate(θ)` the two disagree by exactly θ,
 * which is why dragging the east handle of a 90°-rotated toolbar in the direction it visibly
 * points changed nothing at all: the handler consumed only `dx`, and that drag is pure `dy`.
 *
 * We want the local delta whose *rendered* image is the observed screen delta:
 *
 *     R(θ)·local = screen   ⟹   local = R(−θ)·screen = Rᵀ(θ)·screen
 *
 *     dxLocal =  dx·cos θ + dy·sin θ
 *     dyLocal = −dx·sin θ + dy·cos θ
 *
 * At θ = 90° a downward drag `(0, 100)` becomes `(100, 0)` — the east handle widens the box,
 * and the box's rendered east edge (drawn along the bottom) follows the cursor down.
 */
export function toLocalDelta(dx: number, dy: number, rotationDeg: number): Vec2 {
  if (isUnrotated(rotationDeg)) return { dx, dy }
  const theta = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return { dx: dx * cos + dy * sin, dy: -dx * sin + dy * cos }
}

/**
 * The layout centre's displacement caused by a resize that pins the opposite (untouched)
 * edge in layout space — which is precisely what `resizeSurfaceRect` does.
 *
 *   - `'e'` pins the left edge, so the centre moves right by `dw/2`.
 *   - `'w'` pins the right edge, so the centre moves left by `dw/2`.
 *   - `'s'` pins the top edge → `+dh/2`; `'n'` pins the bottom edge → `−dh/2`.
 *   - An axis with no handle letter contributes `0`, which is also the correct answer for the
 *     aspect-ratio-locked path: it re-centres the *non-driven* axis on the start rect
 *     (`usePersistentRect.ts` `resizeSurfaceRect`), leaving that centre coordinate unmoved.
 *
 * Deliberately derived from the size change and the handle rather than from
 * `resized`'s actual centre: any *extra* translation the caller applied (viewport clamping)
 * is a genuine layout-space correction and must pass through uncompensated.
 */
export function resizeCentreShift(
  startRect: Pick<RectLike, 'width' | 'height'>,
  resized: Pick<RectLike, 'width' | 'height'>,
  handle: RotatedResizeHandle,
): Vec2 {
  const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  return {
    dx: (hx * (resized.width - startRect.width)) / 2,
    dy: (hy * (resized.height - startRect.height)) / 2,
  }
}

/**
 * The layout translation that holds the *rendered* anchor edge still while a rotated box is
 * resized.
 *
 * `resizeSurfaceRect` pins the opposite edge in **layout** space, but `transform-origin:
 * center` re-centres the rendered box on the new layout centre, so at θ ≠ 0 the edge the user
 * is *not* dragging visibly slides. Let `u` be the layout centre's displacement
 * (`resizeCentreShift`) and `a` any point that the resize leaves fixed in layout coordinates
 * (for `'e'`: the left edge; for `'ne'`: the bottom-left corner; and so on — one always
 * exists). Then the rendered anchor drifts by
 *
 *     render₁(a) − render₀(a) = (c₁ + R(a − c₁)) − (c₀ + R(a − c₀))
 *                             = (c₁ − c₀) − R(c₁ − c₀)
 *                             = u − R·u
 *
 * — note this is independent of *which* fixed point `a` is. Translating the layout rect by
 *
 *     t = R(θ)·u − u
 *
 * cancels it exactly. Equivalently: the new layout centre becomes `c₀ + R·u`, i.e. the box
 * grows along its own *rendered* axis instead of the screen axis.
 *
 * θ = 0 ⟹ `R = I` ⟹ `t = 0`: an exact no-op for every consumer that does not rotate.
 */
export function rotatedAnchorShift(
  startRect: Pick<RectLike, 'width' | 'height'>,
  resized: Pick<RectLike, 'width' | 'height'>,
  handle: RotatedResizeHandle,
  rotationDeg: number,
): Vec2 {
  if (isUnrotated(rotationDeg)) return { dx: 0, dy: 0 }
  const u = resizeCentreShift(startRect, resized, handle)
  const rotated = rotate(u.dx, u.dy, (rotationDeg * Math.PI) / 180)
  return { dx: rotated.dx - u.dx, dy: rotated.dy - u.dy }
}

/**
 * `rotatedAnchorShift` applied to a resized rect. Returns `resized` unchanged (same field
 * values, so `toEqual` and per-field `Object.is` both hold) whenever the box is unrotated.
 *
 * Runs *after* `resizeSurfaceRect`'s own min/max clamping and is deliberately not re-clamped,
 * so it cannot fight it. Known residual, pre-existing and out of scope: `clampSurfaceRect`
 * bounds the axis-aligned *layout* box rather than the rotated bounding box, so a rotated box
 * can still overhang the viewport at a corner.
 */
export function compensateRotatedAnchor<T extends RectLike>(
  startRect: Pick<RectLike, 'width' | 'height'>,
  resized: T,
  handle: RotatedResizeHandle,
  rotationDeg: number,
): T {
  if (isUnrotated(rotationDeg)) return resized
  const t = rotatedAnchorShift(startRect, resized, handle, rotationDeg)
  return { ...resized, x: resized.x + t.dx, y: resized.y + t.dy }
}
