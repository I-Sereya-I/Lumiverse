import { describe, expect, test } from 'bun:test'
import {
  AUTO_TOOLBAR_SIZE,
  TOOLBAR_MAX,
  TOOLBAR_RECT_VERSION,
  TOOLBAR_SNAP_THRESHOLD,
  isAutoRect,
  migrateToolbarRect,
  repairToolbarRects,
  resolveToolbarRect,
  selectToolbarRect,
  snapRectToViewportEdge,
  toolbarRectBounds,
  withToolbarPosition,
  withToolbarRect,
  type SurfaceRect,
  type ToolbarRectPrefs,
} from '../frontend/src/lib/quickToolbarGeometry'
import {
  isSurfaceActive,
  resolveToolbarIntent,
  type ToolbarIntent,
  type ToolbarSurface,
  type ToolbarUiState,
} from '../frontend/src/lib/quickToolbarToggle'
import { chatLoreDockMode, chatTopDockMode } from '../frontend/src/lib/chatSurfaceLayout'

const hookSource = await Bun.file(
  new URL('../frontend/src/hooks/usePersistentRect.ts', import.meta.url),
).text()
const defaultsSource = await Bun.file(
  new URL('../frontend/src/lib/uiProductivityDefaults.ts', import.meta.url),
).text()
const settingsSliceSource = await Bun.file(
  new URL('../frontend/src/store/slices/settings.ts', import.meta.url),
).text()

/** Whitespace-insensitive source probe, so reformatting the hook is not a failure. */
const hookText = hookSource.replace(/\s+/g, ' ')

/** The shipped default rect — a box for a nav that never rendered anywhere near it. */
const LEGACY_DEFAULT_RECT: SurfaceRect = { x: 328, y: 18, width: 368, height: 54 }

/** A plausible measurement of the default 7-button horizontal toolbar. */
const NATURAL: { width: number; height: number } = { width: 214, height: 46 }

/**
 * `clampSurfaceRect`'s ordering, reproduced from `usePersistentRect.ts:36-42`
 * with the viewport passed in. Used to prove `toolbarRectBounds` cannot make it
 * return a box narrower than the toolbar's own content.
 */
function clampWith(
  rect: SurfaceRect,
  bounds: { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number },
  vw: number,
  vh: number,
): SurfaceRect {
  const maxWidth = Math.min(bounds.maxWidth, vw)
  const maxHeight = Math.min(bounds.maxHeight, vh)
  const width = Math.min(Math.max(rect.width, bounds.minWidth), maxWidth)
  const height = Math.min(Math.max(rect.height, bounds.minHeight), maxHeight)
  const x = Math.min(Math.max(rect.x, 0), Math.max(0, vw - width))
  const y = Math.min(Math.max(rect.y, 0), Math.max(0, vh - height))
  return { x, y, width, height }
}

describe('quick toolbar auto sentinel', () => {
  test('a non-positive extent on either axis means auto', () => {
    expect(isAutoRect({ x: 0, y: 0, width: 0, height: 0 })).toBe(true)
    expect(isAutoRect({ x: 0, y: 0, width: 300, height: 0 })).toBe(true)
    expect(isAutoRect({ x: 0, y: 0, width: 0, height: 54 })).toBe(true)
    expect(isAutoRect({ x: 0, y: 0, width: -1, height: -1 })).toBe(true)
  })

  test('an explicit positive rect is pinned, not auto', () => {
    expect(isAutoRect(LEGACY_DEFAULT_RECT)).toBe(false)
    expect(isAutoRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(false)
  })

  test('a corrupted extent counts as auto rather than reaching CSS as NaN', () => {
    expect(isAutoRect({ x: 0, y: 0, width: Number.NaN, height: 54 })).toBe(true)
    expect(isAutoRect({ x: 0, y: 0, width: 368, height: Number.POSITIVE_INFINITY })).toBe(true)
  })

  test('migrate → isAutoRect → resolve round-trips back to the measured size', () => {
    const migrated = migrateToolbarRect(LEGACY_DEFAULT_RECT)
    expect(isAutoRect(migrated)).toBe(true)
    expect(resolveToolbarRect(migrated, NATURAL)).toEqual({
      x: 328,
      y: 18,
      width: NATURAL.width,
      height: NATURAL.height,
    })
  })
})

describe('resolveToolbarRect', () => {
  test('substitutes the measured natural size on both auto axes', () => {
    const resolved = resolveToolbarRect({ x: 40, y: 12, width: 0, height: 0 }, NATURAL)
    expect(resolved).toEqual({ x: 40, y: 12, width: 214, height: 46 })
  })

  test('decides each axis independently, so a half-pinned rect keeps its pinned axis', () => {
    expect(resolveToolbarRect({ x: 0, y: 0, width: 480, height: 0 }, NATURAL)).toEqual({
      x: 0, y: 0, width: 480, height: 46,
    })
    expect(resolveToolbarRect({ x: 0, y: 0, width: 0, height: 300 }, NATURAL)).toEqual({
      x: 0, y: 0, width: 214, height: 300,
    })
  })

  test('passes an explicit rect through untouched', () => {
    const pinned: SurfaceRect = { x: 900, y: 400, width: 512, height: 96 }
    expect(resolveToolbarRect(pinned, NATURAL)).toEqual(pinned)
  })

  test('an auto rect tracks a new measurement; a pinned rect ignores it', () => {
    const auto: SurfaceRect = { x: 8, y: 8, width: 0, height: 0 }
    const bigger = { width: 640, height: 92 }
    expect(resolveToolbarRect(auto, NATURAL).width).toBe(214)
    expect(resolveToolbarRect(auto, bigger).width).toBe(640)
    expect(resolveToolbarRect({ ...auto, width: 300, height: 60 }, bigger).width).toBe(300)
  })
})

describe('toolbarRectBounds', () => {
  test('min is the measured natural size and max is TOOLBAR_MAX', () => {
    expect(toolbarRectBounds(NATURAL)).toEqual({
      minWidth: 214,
      minHeight: 46,
      maxWidth: TOOLBAR_MAX.width,
      maxHeight: TOOLBAR_MAX.height,
    })
    expect(TOOLBAR_MAX).toEqual({ width: 920, height: 640 })
  })

  test('is never inverted, even when the measurement exceeds TOOLBAR_MAX', () => {
    for (const natural of [
      { width: 2_000, height: 2_000 },
      { width: 1_400, height: 20 },
      { width: 20, height: 900 },
      { width: TOOLBAR_MAX.width + 1, height: TOOLBAR_MAX.height + 1 },
    ]) {
      const bounds = toolbarRectBounds(natural)
      expect(bounds.maxWidth).toBeGreaterThanOrEqual(bounds.minWidth)
      expect(bounds.maxHeight).toBeGreaterThanOrEqual(bounds.minHeight)
      expect(bounds.maxWidth).toBeGreaterThanOrEqual(natural.width)
      expect(bounds.maxHeight).toBeGreaterThanOrEqual(natural.height)
    }
  })

  test('degenerate measurements collapse to a zero floor rather than a negative one', () => {
    const bounds = toolbarRectBounds({ width: Number.NaN, height: -12 })
    expect(bounds.minWidth).toBe(0)
    expect(bounds.minHeight).toBe(0)
    expect(bounds.maxWidth).toBe(TOOLBAR_MAX.width)
    expect(bounds.maxHeight).toBe(TOOLBAR_MAX.height)
  })

  test('an oversized toolbar survives clampSurfaceRect instead of being crushed to the max', () => {
    // With an inverted clamp, `Math.min(Math.max(w, min), max)` returns `max` —
    // a box narrower than the buttons it holds. This is the hazard at
    // usePersistentRect.ts:38.
    const natural = { width: 1_500, height: 700 }
    const bounds = toolbarRectBounds(natural)
    const resolved = resolveToolbarRect({ x: 0, y: 0, width: 0, height: 0 }, natural)
    const clamped = clampWith(resolved, bounds, 2_560, 1_440)
    expect(clamped.width).toBe(1_500)
    expect(clamped.height).toBe(700)
  })
})

describe('migrateToolbarRect', () => {
  test('converts the shipped default box to the auto sentinel, keeping x/y', () => {
    expect(migrateToolbarRect(LEGACY_DEFAULT_RECT)).toEqual({ x: 328, y: 18, width: 0, height: 0 })
  })

  test('a user-dragged position survives the migration', () => {
    expect(migrateToolbarRect({ x: 900, y: 412, width: 368, height: 54 })).toEqual({
      x: 900, y: 412, width: 0, height: 0,
    })
  })

  test('is idempotent, so re-running the migration is a no-op', () => {
    const once = migrateToolbarRect(LEGACY_DEFAULT_RECT)
    expect(migrateToolbarRect(once)).toEqual(once)
  })
})

/*
 * Per-orientation size memory.
 *
 * The numbers below are the reproduction: 11 buttons, icon size 21, scale 0.77.
 * A horizontal toolbar measures 560x46 and a vertical one 74x500. With a single
 * shared rect a pinned horizontal 560x46 came back as 560x500 after a flip —
 * `clampSurfaceRect` raises the new orientation's main axis to its measured
 * minimum (46 → 500, correct) but never lowers the stale cross axis (560, wrong).
 */
const HORIZONTAL_NATURAL = { width: 560, height: 46 }
const VERTICAL_NATURAL = { width: 74, height: 500 }

/** Everything auto — what a fresh install, or a just-repaired row, looks like. */
const AUTO_PREFS: ToolbarRectPrefs = {
  rect: { x: 328, y: 18, width: 0, height: 0 },
  verticalSize: { width: 0, height: 0 },
}

/** The user dragged the horizontal toolbar's handles to exactly its content. */
const PINNED_HORIZONTAL: ToolbarRectPrefs = {
  rect: { x: 328, y: 18, width: 560, height: 46 },
  verticalSize: { width: 0, height: 0 },
}

/** The whole read path for one orientation: select → resolve → clamp. */
function render(
  prefs: ToolbarRectPrefs,
  orientation: 'horizontal' | 'vertical',
  natural: { width: number; height: number },
): SurfaceRect {
  const resolved = resolveToolbarRect(selectToolbarRect(prefs, orientation), natural)
  return clampWith(resolved, toolbarRectBounds(natural), 2_560, 1_440)
}

describe('per-orientation size memory', () => {
  test('a pinned horizontal width does not leak into the vertical toolbar', () => {
    expect(render(PINNED_HORIZONTAL, 'horizontal', HORIZONTAL_NATURAL))
      .toEqual({ x: 328, y: 18, width: 560, height: 46 })
    // The bug rendered { width: 560, height: 500 } here. 500 was always right —
    // it is the vertical natural, correctly enforced as a floor. 560 was not.
    expect(render(PINNED_HORIZONTAL, 'vertical', VERTICAL_NATURAL))
      .toEqual({ x: 328, y: 18, width: 74, height: 500 })
  })

  test('the single shared rect is what produced the 560x500 box', () => {
    // The old read path, reproduced: one rect for both orientations.
    const shared = PINNED_HORIZONTAL.rect
    const before = clampWith(
      resolveToolbarRect(shared, VERTICAL_NATURAL),
      toolbarRectBounds(VERTICAL_NATURAL),
      2_560,
      1_440,
    )
    expect(before).toEqual({ x: 328, y: 18, width: 560, height: 500 })
    expect(render(PINNED_HORIZONTAL, 'vertical', VERTICAL_NATURAL).width).toBe(74)
  })

  test('flip → resize → flip back leaves the horizontal size intact', () => {
    const vertical = withToolbarRect(PINNED_HORIZONTAL, 'vertical', {
      x: 328, y: 18, width: 120, height: 420,
    })
    const after: ToolbarRectPrefs = { ...PINNED_HORIZONTAL, ...vertical }
    expect(render(after, 'vertical', VERTICAL_NATURAL))
      .toEqual({ x: 328, y: 18, width: 120, height: 500 })
    expect(render(after, 'horizontal', HORIZONTAL_NATURAL))
      .toEqual({ x: 328, y: 18, width: 560, height: 46 })
  })

  test('resizing one orientation never writes the other one', () => {
    // The vertical write leaves `verticalSize` off the patch's counterpart and
    // vice versa, so the untouched orientation keeps even its auto sentinel.
    const horizontal = withToolbarRect(AUTO_PREFS, 'horizontal', {
      x: 10, y: 20, width: 700, height: 60,
    })
    expect(horizontal.verticalSize).toBeUndefined()
    expect(horizontal.rect).toEqual({ x: 10, y: 20, width: 700, height: 60 })

    const vertical = withToolbarRect(PINNED_HORIZONTAL, 'vertical', {
      x: 10, y: 20, width: 90, height: 300,
    })
    expect(vertical.verticalSize).toEqual({ width: 90, height: 300 })
    // Only the position moved on the horizontal box.
    expect(vertical.rect).toEqual({ x: 10, y: 20, width: 560, height: 46 })
  })

  test('x/y are shared, so a flip never teleports the toolbar', () => {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const selected = selectToolbarRect(PINNED_HORIZONTAL, orientation)
      expect({ x: selected.x, y: selected.y }).toEqual({ x: 328, y: 18 })
    }
    // A vertical resize commits the shared position through `rect`, and the
    // horizontal read sees it immediately.
    const moved: ToolbarRectPrefs = {
      ...PINNED_HORIZONTAL,
      ...withToolbarRect(PINNED_HORIZONTAL, 'vertical', { x: 900, y: 412, width: 90, height: 300 }),
    }
    expect(selectToolbarRect(moved, 'horizontal')).toEqual({ x: 900, y: 412, width: 560, height: 46 })
    expect(selectToolbarRect(moved, 'vertical')).toEqual({ x: 900, y: 412, width: 90, height: 300 })
  })

  test('a move drag pins nothing, in either orientation', () => {
    const pinnedBoth: ToolbarRectPrefs = {
      rect: { x: 328, y: 18, width: 0, height: 0 },
      verticalSize: { width: 90, height: 300 },
    }
    const patch = withToolbarPosition(pinnedBoth, { x: 44, y: 66 })
    expect(patch.rect).toEqual({ x: 44, y: 66, width: 0, height: 0 })
    expect(patch.verticalSize).toBeUndefined()
    // Auto-fit survives the move: the horizontal axis is still measured.
    const after: ToolbarRectPrefs = { ...pinnedBoth, ...patch }
    expect(render(after, 'horizontal', HORIZONTAL_NATURAL))
      .toEqual({ x: 44, y: 66, width: 560, height: 46 })
  })

  test('the auto sentinel still means auto, per orientation', () => {
    expect(isAutoRect(selectToolbarRect(AUTO_PREFS, 'horizontal'))).toBe(true)
    expect(isAutoRect(selectToolbarRect(AUTO_PREFS, 'vertical'))).toBe(true)
    // Half-pinned across orientations: horizontal explicit, vertical auto.
    expect(isAutoRect(selectToolbarRect(PINNED_HORIZONTAL, 'horizontal'))).toBe(false)
    expect(isAutoRect(selectToolbarRect(PINNED_HORIZONTAL, 'vertical'))).toBe(true)
    expect(render(AUTO_PREFS, 'vertical', VERTICAL_NATURAL))
      .toEqual({ x: 328, y: 18, width: 74, height: 500 })
    // A corrupted or absent `verticalSize` reads as auto rather than as NaN.
    const corrupt = { rect: AUTO_PREFS.rect, verticalSize: undefined } as unknown as ToolbarRectPrefs
    expect(selectToolbarRect(corrupt, 'vertical')).toEqual({ x: 328, y: 18, width: 0, height: 0 })
  })

  test('an unknown orientation string reads as horizontal, never as nothing', () => {
    const selected = selectToolbarRect(PINNED_HORIZONTAL, 'sideways' as 'horizontal')
    expect(selected).toEqual({ x: 328, y: 18, width: 560, height: 46 })
  })
})

describe('the rectVersion repair', () => {
  const DEFAULTS: ToolbarRectPrefs = {
    rect: { x: 328, y: 18, width: 0, height: 0 },
    verticalSize: { width: 0, height: 0 },
  }
  /** A row a resize drag flattened under the shared-rect bug. */
  const STORED_V2 = {
    variant: 'v1-free',
    rectVersion: 2,
    rect: { x: 900, y: 412, width: 560, height: 500 },
    verticalSize: { width: 0, height: 0 },
  }

  test('version 3 re-autos both orientations while keeping x/y', () => {
    const repaired = repairToolbarRects(STORED_V2, DEFAULTS)
    expect(repaired.rectVersion).toBe(3)
    expect(TOOLBAR_RECT_VERSION).toBe(3)
    expect(repaired.rect).toEqual({ x: 900, y: 412, width: 0, height: 0 })
    expect(repaired.verticalSize).toEqual(AUTO_TOOLBAR_SIZE)
    // Untouched fields survive.
    expect(repaired.variant).toBe('v1-free')
    // …and the repaired row auto-fits again in both orientations.
    const prefs: ToolbarRectPrefs = { rect: repaired.rect, verticalSize: repaired.verticalSize }
    expect(render(prefs, 'horizontal', HORIZONTAL_NATURAL).width).toBe(560)
    expect(render(prefs, 'vertical', VERTICAL_NATURAL).width).toBe(74)
  })

  test('it fires once: an already-current row comes back by identity', () => {
    const current = repairToolbarRects(STORED_V2, DEFAULTS)
    // Identity, not equality — `loadSettings` writes only when `next !== qt`.
    expect(repairToolbarRects(current, DEFAULTS)).toBe(current)
  })

  test('it is idempotent in value as well as identity', () => {
    const once = repairToolbarRects(STORED_V2, DEFAULTS)
    expect(repairToolbarRects({ ...once }, DEFAULTS)).toEqual(once)
    // A version-1 row (the older migration's input) lands in the same place.
    const fromV1 = repairToolbarRects(
      { ...STORED_V2, rectVersion: 1, rect: { x: 900, y: 412, width: 368, height: 54 } },
      DEFAULTS,
    )
    expect(fromV1).toEqual(once)
  })

  test('a row missing `rect` entirely falls back to the default position', () => {
    const repaired = repairToolbarRects({ rectVersion: 2 }, DEFAULTS)
    expect(repaired.rect).toEqual({ x: 328, y: 18, width: 0, height: 0 })
  })

  test('a first-time visitor is never written to', () => {
    // Two independent guards. The slice only enters the migration when the user
    // has a stored row at all…
    expect(settingsSliceSource).toContain('if (patch.quickToolbarSettings) {')
    expect(settingsSliceSource).toContain('repairToolbarRects(next, DEFAULT_QUICK_TOOLBAR_SETTINGS)')
    expect(settingsSliceSource).toContain('if (next !== qt) {')
    // …and the in-memory default is deliberately behind the current version, so
    // `mergeStoredSetting`'s backfill cannot mark a legacy row as migrated.
    const block = defaultsSource.slice(
      defaultsSource.indexOf('DEFAULT_QUICK_TOOLBAR_SETTINGS'),
      defaultsSource.indexOf('DEFAULT_CONNECTIONS_PICKER_SETTINGS'),
    )
    expect(block).toContain('rectVersion: 1')
    expect(block).toContain('verticalSize: { width: 0, height: 0 }')
    expect(1).toBeLessThan(TOOLBAR_RECT_VERSION)
  })
})

describe('snapRectToViewportEdge', () => {
  const viewportWidth = 1_280

  test('a right-edge snap lands flush at viewportWidth - width', () => {
    const rect: SurfaceRect = { x: 1_060, y: 20, width: NATURAL.width, height: NATURAL.height }
    const snapped = snapRectToViewportEdge(rect, viewportWidth, TOOLBAR_SNAP_THRESHOLD)
    expect(snapped.x).toBe(viewportWidth - NATURAL.width)
    expect(snapped.x + snapped.width).toBe(viewportWidth)
    // Only x moves.
    expect({ y: snapped.y, width: snapped.width, height: snapped.height })
      .toEqual({ y: 20, width: NATURAL.width, height: NATURAL.height })
  })

  test('a left-edge snap lands flush at 0', () => {
    const snapped = snapRectToViewportEdge({ x: 9, y: 20, width: 214, height: 46 }, viewportWidth, 24)
    expect(snapped.x).toBe(0)
  })

  test('a rect away from both edges is left alone', () => {
    const rect: SurfaceRect = { x: 400, y: 20, width: 214, height: 46 }
    expect(snapRectToViewportEdge(rect, viewportWidth, 24)).toEqual(rect)
  })

  test('an exact tie snaps left, matching the hook`s `left <= right`', () => {
    const width = 214
    const x = (viewportWidth - width) / 2
    // Force a tie inside the threshold by shrinking the viewport around the rect.
    const tightViewport = width + 2 * 10
    expect(snapRectToViewportEdge({ x: 10, y: 0, width, height: 46 }, tightViewport, 24).x).toBe(0)
    // A centred rect in a wide viewport is outside the threshold entirely.
    expect(snapRectToViewportEdge({ x, y: 0, width, height: 46 }, viewportWidth, 24).x).toBe(x)
  })

  test('never produces a negative x when the toolbar is wider than the viewport', () => {
    const snapped = snapRectToViewportEdge({ x: 5, y: 0, width: 900, height: 46 }, 600, 24)
    expect(snapped.x).toBeGreaterThanOrEqual(0)
  })

  test('mirrors the formula still present in usePersistentRect', () => {
    // If the hook's snap is edited, these probes fail here — the point of
    // re-deriving the formula in a module the hook does not import. The
    // viewport identifier is matched loosely so making the hook's viewport read
    // scale-aware (a separate, expected change) is not a false failure.
    expect(hookText).toMatch(/const left = clamped\.x/)
    expect(hookText).toMatch(/const right = \w+ - \(clamped\.x \+ clamped\.width\)/)
    expect(hookText).toMatch(/Math\.min\(left, right\) <= 24/)
    expect(hookText).toMatch(/x: left <= right \? 0 : Math\.max\(0, \w+ - clamped\.width\)/)
    expect(TOOLBAR_SNAP_THRESHOLD).toBe(24)
  })
})

const UI_IDLE: ToolbarUiState = {
  drawerOpen: false,
  drawerTab: null,
  settingsModalOpen: false,
  settingsActiveView: 'display',
}

interface ToggleCase {
  name: string
  surface: ToolbarSurface
  ui: ToolbarUiState
  intent: ToolbarIntent
}

const TOGGLE_TABLE: ToggleCase[] = [
  {
    name: 'drawer closed → open',
    surface: { kind: 'drawer', tabId: 'lorebook' },
    ui: UI_IDLE,
    intent: { type: 'open-drawer', tabId: 'lorebook' },
  },
  {
    name: 'drawer open on the same tab → close',
    surface: { kind: 'drawer', tabId: 'lorebook' },
    ui: { ...UI_IDLE, drawerOpen: true, drawerTab: 'lorebook' },
    intent: { type: 'close-drawer' },
  },
  {
    name: 'drawer open on a different tab → switch, never close',
    surface: { kind: 'drawer', tabId: 'lorebook' },
    ui: { ...UI_IDLE, drawerOpen: true, drawerTab: 'presets' },
    intent: { type: 'open-drawer', tabId: 'lorebook' },
  },
  {
    name: 'drawer open with no remembered tab → open',
    surface: { kind: 'drawer', tabId: 'lorebook' },
    ui: { ...UI_IDLE, drawerOpen: true, drawerTab: null },
    intent: { type: 'open-drawer', tabId: 'lorebook' },
  },
  {
    name: 'drawer closed but still remembering the tab → open',
    surface: { kind: 'drawer', tabId: 'lorebook' },
    ui: { ...UI_IDLE, drawerOpen: false, drawerTab: 'lorebook' },
    intent: { type: 'open-drawer', tabId: 'lorebook' },
  },
  {
    name: 'settings closed → open',
    surface: { kind: 'settings', view: 'productivity' },
    ui: UI_IDLE,
    intent: { type: 'open-settings', view: 'productivity' },
  },
  {
    name: 'settings open on the same view → close',
    surface: { kind: 'settings', view: 'productivity' },
    ui: { ...UI_IDLE, settingsModalOpen: true, settingsActiveView: 'productivity' },
    intent: { type: 'close-settings' },
  },
  {
    name: 'settings open on a different view → switch, never close',
    surface: { kind: 'settings', view: 'productivity' },
    ui: { ...UI_IDLE, settingsModalOpen: true, settingsActiveView: 'display' },
    intent: { type: 'open-settings', view: 'productivity' },
  },
  {
    name: 'command with nothing open → run',
    surface: { kind: 'command' },
    ui: UI_IDLE,
    intent: { type: 'run-command' },
  },
  {
    name: 'command with the drawer open → run',
    surface: { kind: 'command' },
    ui: { ...UI_IDLE, drawerOpen: true, drawerTab: 'lorebook' },
    intent: { type: 'run-command' },
  },
  {
    name: 'command with settings open → run',
    surface: { kind: 'command' },
    ui: { ...UI_IDLE, settingsModalOpen: true, settingsActiveView: 'productivity' },
    intent: { type: 'run-command' },
  },
  {
    name: 'command with both surfaces open → run',
    surface: { kind: 'command' },
    ui: { drawerOpen: true, drawerTab: 'lorebook', settingsModalOpen: true, settingsActiveView: 'productivity' },
    intent: { type: 'run-command' },
  },
]

describe('quick toolbar toggle truth table', () => {
  for (const testCase of TOGGLE_TABLE) {
    test(testCase.name, () => {
      expect(resolveToolbarIntent(testCase.surface, testCase.ui)).toEqual(testCase.intent)
    })
  }

  test('isSurfaceActive is true exactly when the intent is a close', () => {
    const surfaces: ToolbarSurface[] = [
      { kind: 'drawer', tabId: 'lorebook' },
      { kind: 'drawer', tabId: 'presets' },
      { kind: 'settings', view: 'productivity' },
      { kind: 'settings', view: 'display' },
      { kind: 'command' },
    ]
    const uiStates: ToolbarUiState[] = [
      UI_IDLE,
      { ...UI_IDLE, drawerOpen: true, drawerTab: 'lorebook' },
      { ...UI_IDLE, drawerOpen: true, drawerTab: 'presets' },
      { ...UI_IDLE, settingsModalOpen: true, settingsActiveView: 'productivity' },
      { drawerOpen: true, drawerTab: 'lorebook', settingsModalOpen: true, settingsActiveView: 'display' },
    ]
    for (const surface of surfaces) {
      for (const ui of uiStates) {
        const intent = resolveToolbarIntent(surface, ui)
        const closes = intent.type === 'close-drawer' || intent.type === 'close-settings'
        expect(isSurfaceActive(surface, ui)).toBe(closes)
      }
    }
  })

  test('a command is never active, so it never renders a pressed affordance', () => {
    for (const ui of TOGGLE_TABLE.map((c) => c.ui)) {
      expect(isSurfaceActive({ kind: 'command' }, ui)).toBe(false)
    }
  })
})

describe('chat surface dock modes', () => {
  test('the top dock becomes a strip only for an enabled V2 with actions', () => {
    expect(chatTopDockMode({ enabled: true, variant: 'v2-settings-adjacent', actionCount: 6 })).toBe('strip')
    expect(chatTopDockMode({ enabled: true, variant: 'v2-settings-adjacent', actionCount: 1 })).toBe('strip')
  })

  test('a zero-action V2 stays floating so no empty row is reserved', () => {
    expect(chatTopDockMode({ enabled: true, variant: 'v2-settings-adjacent', actionCount: 0 })).toBe('floating')
  })

  test('V1 and a disabled toolbar stay floating', () => {
    expect(chatTopDockMode({ enabled: true, variant: 'v1-free', actionCount: 6 })).toBe('floating')
    expect(chatTopDockMode({ enabled: false, variant: 'v2-settings-adjacent', actionCount: 6 })).toBe('floating')
  })

  test('an unknown persisted variant falls back to floating rather than crashing', () => {
    for (const variant of ['v3-adaptive', '', 'totally-made-up']) {
      expect(chatTopDockMode({ enabled: true, variant, actionCount: 6 })).toBe('floating')
    }
  })

  test('the lore dock is a strip only for the enabled V4 bottom strip', () => {
    expect(chatLoreDockMode({ enabled: true, variant: 'v4-bottom-strip' })).toBe('strip')
    expect(chatLoreDockMode({ enabled: false, variant: 'v4-bottom-strip' })).toBe('off')
  })

  test('every other lore variant, known or unknown, keeps the dock off', () => {
    for (const variant of ['v2-compact', 'v5-command-palette', 'v1-free', '']) {
      expect(chatLoreDockMode({ enabled: true, variant })).toBe('off')
    }
  })
})
