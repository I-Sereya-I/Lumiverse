import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
// Pure geometry: no DOM, no store, no other module. The "keep this hook free of `lib/`" rule
// below is about the *ui-scale read* — a DOM/feature dependency this generic hook must not
// acquire. Dependency-free maths is the same category as the `@/types/store` import above it,
// and it lives in `lib/` because this repo has no DOM test environment, so the only way to
// get real behavioural coverage of the rotation transform is a pure module.
import {
  compensateRotatedAnchor,
  toLocalDelta,
  type RotatedResizeHandle,
} from '@/lib/rotatedRectMath'
import type { SurfaceRectPrefs } from '@/types/store'

export {
  compensateRotatedAnchor,
  isUnrotated,
  resizeCentreShift,
  rotatedAnchorShift,
  toLocalDelta,
} from '@/lib/rotatedRectMath'

export interface RectBounds {
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
}

export interface UsePersistentRectOptions {
  rect: SurfaceRectPrefs
  bounds: RectBounds
  onCommit: (rect: SurfaceRectPrefs) => void
  snapToEdge?: boolean
  preserveAspectRatio?: boolean
  aspectRatio?: number
  /**
   * Degrees of CSS `rotate()` the consumer applies to the same box, with
   * `transform-origin: center`. Optional and defaulting to `0`, which is an exact no-op —
   * consumers that do not rotate (`PortraitDock`, `ResizablePanelFrame` and everything
   * downstream of it) need no change and are provably unaffected.
   */
  rotationDeg?: number
}

export type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface DragState {
  mode: DragMode
  startX: number
  startY: number
  startRect: SurfaceRectPrefs
}

/**
 * Reads the `body > * { zoom: var(--lumiverse-ui-scale, 1) }` factor from `theme/reset.css`.
 *
 * Deliberately inlined, and it stays that way. This hook is generic infrastructure shared by
 * the portrait dock, the quick toolbar and the lorebook editor, so it must not take a
 * dependency on any feature module — nor, by the same argument, on `lib/` at all. `lib/uiScale.ts`
 * now exists and is the single implementation for everyone else (`lib/quickToolbarPlacement.ts`
 * re-exports it); this copy is an intentional exception, and `tests/persistent-rect.test.ts`
 * asserts the hook declares its own. Do not "deduplicate" it.
 */
function readUiScale(): number {
  if (typeof document === 'undefined') return 1
  return parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lumiverse-ui-scale'),
  ) || 1
}

/**
 * Converts a rendered/client pixel measurement into the zoom layer's own layout units.
 *
 * Every consumer of this hook renders inside the `body > *` zoom layer, and the rect it
 * produces is written back as inline `px` (`--panel-x/-y/-width/-height`,
 * `left`/`top`/`width`/`height`) which the browser then multiplies by that zoom. `#root` and
 * `.app` already compensate the other way — `calc(100% / var(--lumiverse-ui-scale))`,
 * `App.module.css:14` — so the layout box those elements live in is `viewport / scale` wide.
 * `documentElement.clientWidth` / `window.innerWidth` and `PointerEvent.clientX/Y` are all
 * measured in *rendered* pixels, i.e. too large by exactly `scale`, and must be divided before
 * they are compared against or added to a rect value.
 *
 * A scale of 1 divides by 1 and is therefore an exact no-op on the previous arithmetic.
 */
export function toLayoutPixels(clientPx: number, scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? clientPx / scale : clientPx
}

/**
 * Converts a rendered/client-pixel box (typically a `getBoundingClientRect()` result) into
 * the zoom layer's layout units.
 *
 * Exists so consumers can normalise a measured element without importing a second ui-scale
 * reader: `readUiScale` is deliberately private (see above), and a component that mixed this
 * module's units with `lib/uiScale.ts`'s would be one refactor away from drifting again.
 */
export function toLayoutBox<T extends { width: number; height: number }>(
  box: T,
): { width: number; height: number } {
  const scale = readUiScale()
  return { width: toLayoutPixels(box.width, scale), height: toLayoutPixels(box.height, scale) }
}

const FALLBACK_VIEWPORT = { width: 1920, height: 1080 }

/**
 * The viewport in the zoom layer's own units.
 *
 * Exported because every consumer that computes its *own* bounds — `PortraitDock`'s
 * `getViewportBounds`, `getPortraitBottomY`, `placePortraitRect`, its dock-side flip — has to
 * agree with `clampSurfaceRect`/`resizeSurfaceRect` about the space those bounds are in, and
 * a second hand-rolled `window.innerWidth` read is exactly how the two drifted apart.
 *
 * This is *not* the `readUiScale` copy the comment above protects: it is already scale-aware,
 * exporting it deduplicates nothing, and it moves no DOM read out of this module.
 */
export const viewportBox = (): { width: number; height: number } => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK_VIEWPORT
  const scale = readUiScale()
  return {
    width: toLayoutPixels(Math.max(document.documentElement.clientWidth, window.innerWidth || 0), scale),
    height: toLayoutPixels(Math.max(document.documentElement.clientHeight, window.innerHeight || 0), scale),
  }
}

export function clampSurfaceRect(rect: SurfaceRectPrefs, bounds: RectBounds): SurfaceRectPrefs {
  const { width: vw, height: vh } = viewportBox()
  const maxWidth = Math.min(bounds.maxWidth ?? vw, vw)
  const maxHeight = Math.min(bounds.maxHeight ?? vh, vh)
  const width = Math.min(Math.max(rect.width, bounds.minWidth), maxWidth)
  const height = Math.min(Math.max(rect.height, bounds.minHeight), maxHeight)
  const x = Math.min(Math.max(rect.x, 0), Math.max(0, vw - width))
  const y = Math.min(Math.max(rect.y, 0), Math.max(0, vh - height))
  return { x, y, width, height }
}

export function resizeSurfaceRect(
  startRect: SurfaceRectPrefs,
  mode: Exclude<DragMode, 'move'>,
  dx: number,
  dy: number,
  bounds: RectBounds,
  preserveAspectRatio = false,
  aspectRatio = startRect.width / Math.max(1, startRect.height),
): SurfaceRectPrefs {
  const next = { ...startRect }

  if (mode.includes('e')) next.width += dx
  if (mode.includes('s')) next.height += dy
  if (mode.includes('w')) {
    next.x += dx
    next.width -= dx
  }
  if (mode.includes('n')) {
    next.y += dy
    next.height -= dy
  }

  if (!preserveAspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    const { width: vw, height: vh } = viewportBox()
    const right = startRect.x + startRect.width
    const bottom = startRect.y + startRect.height
    const maxWidth = Math.min(
      bounds.maxWidth ?? vw,
      mode.includes('w') ? right : vw - startRect.x,
    )
    const maxHeight = Math.min(
      bounds.maxHeight ?? vh,
      mode.includes('n') ? bottom : vh - startRect.y,
    )
    next.width = Math.min(Math.max(next.width, Math.min(bounds.minWidth, maxWidth)), maxWidth)
    next.height = Math.min(Math.max(next.height, Math.min(bounds.minHeight, maxHeight)), maxHeight)
    next.x = mode.includes('w') ? right - next.width : startRect.x
    next.y = mode.includes('n') ? bottom - next.height : startRect.y
    return next
  }

  const right = startRect.x + startRect.width
  const bottom = startRect.y + startRect.height
  const horizontalOnly = mode === 'e' || mode === 'w'
  const verticalOnly = mode === 'n' || mode === 's'
  const widthDriven = horizontalOnly || (!verticalOnly && Math.abs(dx) >= Math.abs(dy * aspectRatio))

  if (widthDriven) {
    next.height = next.width / aspectRatio
  } else {
    next.width = next.height * aspectRatio
  }

  if (mode.includes('w')) next.x = right - next.width
  else if (verticalOnly) next.x = startRect.x + (startRect.width - next.width) / 2

  if (mode.includes('n')) next.y = bottom - next.height
  else if (horizontalOnly) next.y = startRect.y + (startRect.height - next.height) / 2

  return clampSurfaceRect(next, bounds)
}

export function usePersistentRect({
  rect,
  bounds,
  onCommit,
  snapToEdge = false,
  preserveAspectRatio = false,
  aspectRatio,
  rotationDeg = 0,
}: UsePersistentRectOptions) {
  const [draftRect, setDraftRect] = useState(() => clampSurfaceRect(rect, bounds))
  const dragRef = useRef<DragState | null>(null)
  const latestRectRef = useRef(draftRect)
  const configRef = useRef({ bounds, onCommit, snapToEdge, preserveAspectRatio, aspectRatio, rotationDeg })
  configRef.current = { bounds, onCommit, snapToEdge, preserveAspectRatio, aspectRatio, rotationDeg }

  useEffect(() => {
    latestRectRef.current = draftRect
  }, [draftRect])

  useEffect(() => {
    if (dragRef.current) return
    const clamped = clampSurfaceRect(rect, bounds)
    latestRectRef.current = clamped
    setDraftRect(clamped)
  }, [bounds.maxHeight, bounds.maxWidth, bounds.minHeight, bounds.minWidth, rect])

  const commit = useCallback((next: SurfaceRectPrefs) => {
    const { bounds: currentBounds, onCommit: currentOnCommit, snapToEdge: currentSnapToEdge } = configRef.current
    let clamped = clampSurfaceRect(next, currentBounds)
    if (currentSnapToEdge && typeof window !== 'undefined') {
      const vw = viewportBox().width
      const left = clamped.x
      const right = vw - (clamped.x + clamped.width)
      if (Math.min(left, right) <= 24) {
        clamped = { ...clamped, x: left <= right ? 0 : Math.max(0, vw - clamped.width) }
      }
    }
    latestRectRef.current = clamped
    setDraftRect(clamped)
    currentOnCommit(clamped)
  }, [])

  const updateFromPointer = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const {
      bounds: currentBounds,
      preserveAspectRatio: currentPreserveAspectRatio,
      aspectRatio: currentAspectRatio,
      rotationDeg: currentRotation,
    } = configRef.current
    // `clientX/Y` are rendered/client pixels, the same space `getBoundingClientRect()` reports
    // in — but `drag.startRect` is in the zoom layer's layout units. Without this division the
    // handle travels `scale`x the cursor and appears to lag it.
    const scale = readUiScale()
    const screenDx = toLayoutPixels(event.clientX - drag.startX, scale)
    const screenDy = toLayoutPixels(event.clientY - drag.startY, scale)
    const next = { ...drag.startRect }

    if (drag.mode === 'move') {
      // A `move` is rotation-invariant: rotation is about the box's own centre, so
      // translating the layout box by `d` translates the *rendered* box by exactly `d`
      // (`render(p + d) = (c + d) + R((p + d) − (c + d)) = render(p) + d`). Deliberately
      // left in screen axes — converting here would break unrotated and rotated alike.
      next.x += screenDx
      next.y += screenDy
    } else {
      // Handles are labelled in element-local terms but the pointer moves in screen axes;
      // under `rotate(θ)` those disagree by θ. See `lib/rotatedRectMath.ts`.
      const handle = drag.mode as RotatedResizeHandle
      const { dx, dy } = toLocalDelta(screenDx, screenDy, currentRotation)
      const resized = compensateRotatedAnchor(
        drag.startRect,
        resizeSurfaceRect(
          drag.startRect,
          drag.mode,
          dx,
          dy,
          currentBounds,
          currentPreserveAspectRatio,
          currentAspectRatio,
        ),
        handle,
        currentRotation,
      )
      latestRectRef.current = resized
      setDraftRect(resized)
      return
    }

    const clamped = clampSurfaceRect(next, currentBounds)
    latestRectRef.current = clamped
    setDraftRect(clamped)
  }, [])

  const stopDrag = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    window.removeEventListener('pointermove', updateFromPointer)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
    commit(latestRectRef.current)
  }, [commit, updateFromPointer])

  const startDrag = useCallback((mode: DragMode, event: ReactPointerEvent) => {
    event.preventDefault()
    if (dragRef.current) stopDrag()
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: latestRectRef.current,
    }
    window.addEventListener('pointermove', updateFromPointer)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }, [stopDrag, updateFromPointer])

  useEffect(() => {
    const keepInViewport = () => {
      if (dragRef.current) return
      const { bounds: currentBounds, onCommit: currentOnCommit } = configRef.current
      const clamped = clampSurfaceRect(latestRectRef.current, currentBounds)
      if (
        clamped.x === latestRectRef.current.x
        && clamped.y === latestRectRef.current.y
        && clamped.width === latestRectRef.current.width
        && clamped.height === latestRectRef.current.height
      ) return
      latestRectRef.current = clamped
      setDraftRect(clamped)
      currentOnCommit(clamped)
    }
    window.addEventListener('resize', keepInViewport)
    return () => {
      window.removeEventListener('resize', keepInViewport)
      window.removeEventListener('pointermove', updateFromPointer)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [stopDrag, updateFromPointer])

  return useMemo(() => ({ rect: draftRect, setRect: commit, startDrag }), [commit, draftRect, startDrag])
}
