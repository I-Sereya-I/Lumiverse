import { describe, expect, test } from 'bun:test'
import { resizeSurfaceRect, type DragMode } from '../frontend/src/hooks/usePersistentRect'
import { DEFAULT_PORTRAIT_DOCK_SETTINGS } from '../frontend/src/lib/uiProductivityDefaults'
import { createFloatingAvatarSlice } from '../frontend/src/store/slices/floating-avatar'
import type { AppStore, SurfaceRectPrefs } from '../frontend/src/types/store'

const portraitDockSource = await Bun.file(
  new URL('../frontend/src/components/chat/PortraitDock.tsx', import.meta.url),
).text()
const portraitDockStyles = await Bun.file(
  new URL('../frontend/src/components/chat/PortraitDock.module.css', import.meta.url),
).text()
const contextMenuSource = await Bun.file(
  new URL('../frontend/src/components/shared/ContextMenu.tsx', import.meta.url),
).text()

const bounds = {
  minWidth: 80,
  minHeight: 80,
  maxWidth: 800,
  maxHeight: 800,
}

const startRect: SurfaceRectPrefs = {
  x: 200,
  y: 160,
  width: 320,
  height: 240,
}

describe('portrait dock resizing', () => {
  const expectations: Array<[Exclude<DragMode, 'move'>, Partial<SurfaceRectPrefs>]> = [
    ['n', { y: 140, height: 260 }],
    ['ne', { y: 140, width: 340, height: 260 }],
    ['e', { width: 340 }],
    ['se', { width: 340, height: 260 }],
    ['s', { height: 260 }],
    ['sw', { x: 180, width: 340, height: 260 }],
    ['w', { x: 180, width: 340 }],
    ['nw', { x: 180, y: 140, width: 340, height: 260 }],
  ]

  for (const [direction, expected] of expectations) {
    test(`resizes from ${direction}`, () => {
      const dx = direction.includes('w') ? -20 : direction.includes('e') ? 20 : 0
      const dy = direction.includes('n') ? -20 : direction.includes('s') ? 20 : 0
      const result = resizeSurfaceRect(startRect, direction, dx, dy, bounds)
      expect(result).toMatchObject(expected)
    })
  }

  test('keeps the natural ratio when aspect locking is enabled', () => {
    const result = resizeSurfaceRect(startRect, 'e', 80, 0, bounds, true, 4 / 3)

    expect(result.width / result.height).toBeCloseTo(4 / 3, 5)
    expect(result.y + result.height / 2).toBeCloseTo(startRect.y + startRect.height / 2, 5)
  })

  test('allows width and height to change independently when unlocked', () => {
    const result = resizeSurfaceRect(startRect, 'e', 80, 0, bounds, false, 4 / 3)

    expect(result.width).toBe(400)
    expect(result.height).toBe(240)
  })
})

describe('portrait dock persistence', () => {
  test('does not treat a remembered custom size at the default position as untouched', () => {
    expect(portraitDockSource).toContain('export function isDefaultPortraitRect')
    expect(portraitDockSource).toContain('rect.width === defaultRect.width')
    expect(portraitDockSource).toContain('rect.height === defaultRect.height')
    expect(portraitDockSource).toContain('const usesUntouchedDefaultRect = isDefaultPortraitRect(floatingAvatar)')
    expect(portraitDockSource).toContain('&& isDefaultPortraitRect(settings.rect)')
  })

  test('stores the last portrait and restores the remembered rectangle on open', () => {
    let state = {
      portraitDockSettings: {
        ...DEFAULT_PORTRAIT_DOCK_SETTINGS,
        lastPortrait: { imageUrl: '/old.png', displayName: 'Old' },
        rect: { x: 48, y: 32, width: 410, height: 560 },
      },
      setSetting: (key: string, value: unknown) => {
        state = { ...state, [key]: value }
      },
    } as unknown as AppStore

    const set = (patch: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
    }
    const slice = createFloatingAvatarSlice(set as never, (() => state) as never, {} as never)
    state = { ...state, ...slice }

    state.openFloatingAvatar('/new.png', 'New')

    expect(state.floatingAvatar).toMatchObject({
      imageUrl: '/new.png',
      displayName: 'New',
      x: 48,
      y: 32,
      width: 410,
      height: 560,
    })
    expect(state.portraitDockSettings.open).toBe(true)
    expect(state.portraitDockSettings.lastPortrait).toEqual({
      imageUrl: '/new.png',
      displayName: 'New',
    })
  })

  test('marks the dock closed without forgetting the last portrait', () => {
    let state = {
      portraitDockSettings: {
        ...DEFAULT_PORTRAIT_DOCK_SETTINGS,
        open: true,
        lastPortrait: { imageUrl: '/last.png', displayName: 'Last' },
      },
      floatingAvatar: {
        imageUrl: '/last.png',
        displayName: 'Last',
        x: 0,
        y: 0,
        width: 320,
        height: 480,
      },
      setSetting: (key: string, value: unknown) => {
        state = { ...state, [key]: value }
      },
    } as unknown as AppStore

    const set = (patch: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
    }
    const slice = createFloatingAvatarSlice(set as never, (() => state) as never, {} as never)
    state = { ...state, ...slice }

    state.closeFloatingAvatar()

    expect(state.floatingAvatar).toBeNull()
    expect(state.portraitDockSettings.open).toBe(false)
    expect(state.portraitDockSettings.lastPortrait).toEqual({
      imageUrl: '/last.png',
      displayName: 'Last',
    })
  })
})

describe('portrait dock presentation', () => {
  test('places docked portraits at the bottom edge by default', () => {
    expect(portraitDockSource).toContain('availableHeight - height - VIEWPORT_PAD')
    // Was `currentViewport.innerHeight`. `placePortraitRect` now takes a layout-px
    // `{ width, height }` box instead of a rendered-px `Window`, so the y it derives is in
    // the same space as the rect it returns. The assertion is otherwise unchanged: the
    // bottom-edge placement still has to flow through `getPortraitBottomY`.
    expect(portraitDockSource).toContain('const y = getPortraitBottomY(size.height, currentViewport.height)')
    expect(portraitDockSource).toContain('const currentViewport = viewport ?? viewportBox()')
    expect(portraitDockSource).toContain('usesUntouchedDefaultPosition')
  })

  test('fills independently resized frames without empty image bands', () => {
    expect(portraitDockStyles).toContain('object-fit: cover')
    expect(portraitDockStyles).toContain('object-position: center bottom')
    expect(portraitDockStyles).not.toContain('object-fit: contain')
  })

  test('keeps docked portraits bottom anchored while allowing vertical drag offsets', () => {
    expect(portraitDockStyles).toMatch(/\.dockedDock\s*\{[^}]*align-self:\s*flex-end;/s)
    expect(portraitDockStyles).toMatch(/\.dockedDock\s*\{[^}]*z-index:\s*30;/s)
    expect(portraitDockStyles).toMatch(/\.dockedDock\s*\{[^}]*transform:\s*translateY\(var\(--portrait-dock-offset-y,\s*0\)\);/s)
    expect(portraitDockSource).toContain("'--portrait-dock-offset-y': `${dockedOffsetY}px`")
  })

  test('reclaims unused side gutter instead of shifting the chat column', () => {
    expect(portraitDockSource).toContain('const CHAT_GAP = -20')
    expect(portraitDockSource).toContain('export function getPortraitLayoutReclaim')
    expect(portraitDockSource).toContain('const naturalGutter = Math.max(0, (bodyWidth - contentWidth) / 2)')
    expect(portraitDockSource).toContain('2 * (portraitWidth + CHAT_GAP - naturalGutter)')
    expect(portraitDockSource).toContain('{ marginRight: -layoutReclaim }')
    expect(portraitDockSource).toContain('{ marginLeft: -layoutReclaim }')
  })

  test('remeasures layout reclaim when a restored dock mounts after reload', () => {
    expect(portraitDockSource).toContain('const [dockElement, setDockElement] = useState<HTMLElement | null>(null)')
    expect(portraitDockSource).toContain('ref={setDockElement}')
    expect(portraitDockSource).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*\}, \[dockElement, isFloating, mobile, panel\.rect\.width, settings\.dockSide\]\)/)
    expect(portraitDockSource).not.toContain('const dockElement = dockRef.current')
  })

  test('hides stale portraits and synchronizes the image when the active chat changes', () => {
    expect(portraitDockSource).toContain('const previousChatIdRef = useRef<string | null>(null)')
    expect(portraitDockSource).toContain('previousChatIdRef.current !== activeChatId')
    expect(portraitDockSource).toContain('updateFloatingAvatar({ imageUrl, displayName: character.name })')
    expect(portraitDockSource).toContain("setSetting('portraitDockSettings'")
    expect(portraitDockSource).toContain('setChatPortraitAvailable(false)')
    expect(portraitDockSource).toContain('|| !activeChatId')
    expect(portraitDockSource).toContain('|| !activeCharacterId')
  })

  test('offers a visible hover control to toggle floating mode', () => {
    expect(portraitDockSource).toContain('Float portrait over chat and dialogs')
    expect(portraitDockSource).toContain("setDockSide(isFloating ? settings.defaultDockSide : 'floating')")
    expect(portraitDockSource).toContain('<PictureInPicture2')
  })

  test('shows corner resize affordances on hover', () => {
    expect(portraitDockStyles).toMatch(/\.resizeNE::after,/)
    expect(portraitDockStyles).toMatch(/\.dock:hover \.resizeSE::after,/)
  })

  test('isolates floating pointer events while keeping the dock interactive above modals', () => {
    expect(portraitDockSource).toContain('createPortal(<div className={styles.floatingLayer}>{dock}</div>, document.body)')
    expect(portraitDockStyles).toMatch(/\.floatingLayer\s*\{[^}]*z-index:\s*10900;/s)
    expect(portraitDockStyles).toMatch(/\.floatingLayer\s*\{[^}]*pointer-events:\s*none;/s)
    expect(portraitDockStyles).toMatch(/\.floatingDock\s*\{[^}]*pointer-events:\s*auto;/s)
  })

  test('does not apply saved floating offsets to side-docked layout', () => {
    expect(portraitDockSource).not.toContain('marginTop: Math.max(0, panel.rect.y)')
  })
})

describe('the portrait dock speaks layout pixels', () => {
  // `body > * { zoom: var(--lumiverse-ui-scale, 1) }` (`theme/reset.css`) means
  // `window.innerWidth` and `getBoundingClientRect()` are *rendered* px, while every
  // `left/top/width/height` this component writes is resolved pre-zoom. Mixing them drifts by
  // exactly the ui scale: at 2.0 the dock was fitted to a box twice the viewport, its bottom
  // anchor landed hundreds of px below the screen, and `dockSide` mis-persisted as 'left' for
  // a portrait genuinely on the right.
  //
  // There is no DOM test environment here, so the arithmetic itself cannot be executed; what
  // *can* be pinned — and is the whole bug — is that no raw viewport read survives at all.

  test('no raw device-pixel viewport read survives anywhere in the dock', () => {
    expect(portraitDockSource).not.toContain('window.innerWidth')
    expect(portraitDockSource).not.toContain('window.innerHeight')
    expect(portraitDockSource).not.toContain('innerWidth')
    expect(portraitDockSource).not.toContain('innerHeight')
  })

  test('all five sites route through the shared scale-aware box', () => {
    // getViewportBounds, getPortraitBottomY, placePortraitRect, the dock-side flip, and
    // updateLayoutReclaim (which uses toLayoutBox on a gBCR rather than the viewport).
    expect(portraitDockSource).toMatch(/from '@\/hooks\/usePersistentRect'/)
    expect(portraitDockSource.match(/viewportBox\(\)/g)?.length).toBe(4)
    expect(portraitDockSource.match(/toLayoutBox\(/g)?.length).toBe(1)
  })

  test('getViewportBounds builds its RectBounds in clampSurfaceRect`s space', () => {
    const bodyStart = portraitDockSource.indexOf('function getViewportBounds')
    const body = portraitDockSource.slice(bodyStart, portraitDockSource.indexOf('\n}\n', bodyStart))
    expect(body).toContain('const { width: vw, height: vh } = viewportBox()')
    expect(body).toContain('Math.min(settings.minWidth, vw - VIEWPORT_PAD * 2)')
    expect(body).toContain('Math.min(settings.maxWidth, vw - VIEWPORT_PAD * 2)')
    expect(body).toContain('Math.min(settings.minHeight, vh - VIEWPORT_PAD * 2)')
    expect(body).toContain('Math.min(settings.maxHeight, vh - VIEWPORT_PAD * 2)')
  })

  test('the bottom anchor no longer derives a layout y from a rendered height', () => {
    expect(portraitDockSource).toContain('const availableHeight = viewportHeight ?? viewportBox().height')
  })

  test('the dock-side flip compares two numbers in the same space', () => {
    expect(portraitDockSource).toContain('next.x + next.width / 2 < viewportBox().width / 2')
  })

  test('the layout-reclaim measurement is converted before it meets computed styles', () => {
    // getPortraitLayoutReclaim subtracts bodyWidth, the computed max-width and the portrait
    // width from one another; the first was the only one in rendered px.
    expect(portraitDockSource)
      .toContain('const bodyWidth = toLayoutBox(bodyElement.getBoundingClientRect()).width')
    expect(portraitDockSource).not.toMatch(/const bodyWidth = bodyElement\.getBoundingClientRect\(\)\.width/)
  })

  test('placePortraitRect can no longer be handed a Window by mistake', () => {
    expect(portraitDockSource).not.toContain("Pick<Window, 'innerWidth' | 'innerHeight'>")
    expect(portraitDockSource).toContain('viewport?: { width: number; height: number },')
  })

  test('the context-menu position is deliberately left in raw viewport pixels', () => {
    // NOT a mixed read. `ContextMenu.tsx` documents that it takes raw viewport px and divides
    // by the ui scale itself when it writes `style={{ top, left }}`. Converting here would
    // double-divide and put the menu at scale^-2 of the click point.
    expect(portraitDockSource).toContain('setContextMenu({ x: event.clientX, y: event.clientY })')
    expect(contextMenuSource).toContain('style={{ top: position.y / uiScale, left: position.x / uiScale }}')
  })
})
