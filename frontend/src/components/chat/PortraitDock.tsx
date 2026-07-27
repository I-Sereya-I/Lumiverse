import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LockKeyhole,
  Maximize2,
  Minimize2,
  PanelRight,
  PictureInPicture2,
  Pin,
  PinOff,
  Ratio,
  X,
} from 'lucide-react'
import ContextMenu, { type ContextMenuEntry, type ContextMenuPos } from '@/components/shared/ContextMenu'
import {
  clampSurfaceRect,
  toLayoutBox,
  usePersistentRect,
  viewportBox,
  type DragMode,
  type RectBounds,
} from '@/hooks/usePersistentRect'
import { imagesApi } from '@/api/images'
import { getCharacterAvatarUrl } from '@/lib/avatarUrls'
import { DEFAULT_PORTRAIT_DOCK_SETTINGS } from '@/lib/uiProductivityDefaults'
import { useStore } from '@/store'
import type { PortraitDockSettings, SurfaceRectPrefs } from '@/types/store'
import styles from './PortraitDock.module.css'

const VIEWPORT_PAD = 12
const CHAT_GAP = -20
const DEFAULT_RATIO = 1
const SMALLER_SCALE = 0.72
const RESIZE_DIRECTIONS: Array<Exclude<DragMode, 'move'>> = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

interface ImageNaturalSize {
  width: number
  height: number
}

type FitMode = 'available' | 'natural' | 'smaller'

interface PortraitDockProps {
  mobile?: boolean
}

function getViewportBounds(settings: PortraitDockSettings): RectBounds {
  if (typeof window === 'undefined') {
    return {
      minWidth: settings.minWidth,
      minHeight: settings.minHeight,
      maxWidth: settings.maxWidth,
      maxHeight: settings.maxHeight,
    }
  }

  // Layout units, the space `clampSurfaceRect` and `resizeSurfaceRect` work in. Under
  // `body > * { zoom: var(--lumiverse-ui-scale) }` (`theme/reset.css`) the raw window
  // viewport is reported in *rendered* px — too large by exactly the ui scale — so feeding
  // it in as a bound let the dock be fitted to a box larger than the viewport it lives in.
  const { width: vw, height: vh } = viewportBox()
  return {
    minWidth: Math.min(settings.minWidth, vw - VIEWPORT_PAD * 2),
    minHeight: Math.min(settings.minHeight, vh - VIEWPORT_PAD * 2),
    maxWidth: Math.max(settings.minWidth, Math.min(settings.maxWidth, vw - VIEWPORT_PAD * 2)),
    maxHeight: Math.max(settings.minHeight, Math.min(settings.maxHeight, vh - VIEWPORT_PAD * 2)),
  }
}

export function resolvePortraitRatio(naturalSize: ImageNaturalSize | null) {
  if (!naturalSize || naturalSize.height <= 0) return DEFAULT_RATIO
  const ratio = naturalSize.width / naturalSize.height
  return Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_RATIO
}

export function fitPortraitSize(
  ratio: number,
  bounds: RectBounds,
  mode: FitMode,
  naturalSize: ImageNaturalSize | null,
): Pick<SurfaceRectPrefs, 'width' | 'height'> {
  const targetWidth = mode === 'natural' && naturalSize ? naturalSize.width : bounds.maxWidth
  const targetHeight = mode === 'natural' && naturalSize ? naturalSize.height : bounds.maxHeight
  let width = Math.min(bounds.maxWidth ?? targetWidth, targetWidth)
  let height = Math.round(width / ratio)

  if (height > Math.min(bounds.maxHeight ?? targetHeight, targetHeight)) {
    height = Math.min(bounds.maxHeight ?? targetHeight, targetHeight)
    width = Math.round(height * ratio)
  }

  if (mode === 'smaller') {
    width = Math.round(width * SMALLER_SCALE)
    height = Math.round(height * SMALLER_SCALE)
  }

  const minScale = Math.max(bounds.minWidth / Math.max(1, width), bounds.minHeight / Math.max(1, height), 1)
  width = Math.round(width * minScale)
  height = Math.round(height * minScale)

  const maxScale = Math.min(
    (bounds.maxWidth ?? width) / Math.max(1, width),
    (bounds.maxHeight ?? height) / Math.max(1, height),
    1,
  )
  width = Math.round(width * maxScale)
  height = Math.round(height * maxScale)

  return {
    width: Math.max(bounds.minWidth, Math.min(bounds.maxWidth ?? width, width)),
    height: Math.max(bounds.minHeight, Math.min(bounds.maxHeight ?? height, height)),
  }
}

/**
 * Space-agnostic: exact in whatever units it is handed. `height` is a layout-px rect extent,
 * so the implicit viewport has to be the scale-aware, layout-px one rather than the raw
 * window height. Its SSR fallback is 1080, matching the literal this used to carry.
 */
export function getPortraitBottomY(height: number, viewportHeight?: number) {
  const availableHeight = viewportHeight ?? viewportBox().height
  return Math.max(VIEWPORT_PAD, availableHeight - height - VIEWPORT_PAD)
}

export function placePortraitRect(
  size: Pick<SurfaceRectPrefs, 'width' | 'height'>,
  side: 'left' | 'right',
  // A layout-px box rather than a `Window`, so a caller cannot accidentally hand this the
  // rendered-px `window` and get an x that is off-screen by the ui scale.
  viewport?: { width: number; height: number },
): SurfaceRectPrefs {
  if (!viewport && typeof window === 'undefined') return { x: 0, y: 0, ...size }
  const currentViewport = viewport ?? viewportBox()
  const x = side === 'left'
    ? VIEWPORT_PAD
    : Math.max(VIEWPORT_PAD, currentViewport.width - size.width - VIEWPORT_PAD)
  const y = getPortraitBottomY(size.height, currentViewport.height)
  return { x, y, ...size }
}

export function isDefaultPortraitRect(rect: SurfaceRectPrefs) {
  const defaultRect = DEFAULT_PORTRAIT_DOCK_SETTINGS.rect
  return rect.x === defaultRect.x
    && rect.y === defaultRect.y
    && rect.width === defaultRect.width
    && rect.height === defaultRect.height
}

export function getPortraitLayoutReclaim(
  bodyWidth: number,
  chatContentWidth: number,
  portraitWidth: number,
) {
  const contentWidth = Math.min(bodyWidth, chatContentWidth)
  const naturalGutter = Math.max(0, (bodyWidth - contentWidth) / 2)
  const reservedWidth = Math.min(
    portraitWidth,
    Math.max(0, 2 * (portraitWidth + CHAT_GAP - naturalGutter)),
  )
  return Math.max(0, portraitWidth - reservedWidth)
}

export default function PortraitDock({ mobile = false }: PortraitDockProps) {
  const floatingAvatar = useStore((s) => s.floatingAvatar)
  const settings = useStore((s) => s.portraitDockSettings)
  const activeChatId = useStore((s) => s.activeChatId)
  const activeCharacterId = useStore((s) => s.activeCharacterId)
  const activeChatAvatarId = useStore((s) => s.activeChatAvatarId)
  const characters = useStore((s) => s.characters)
  const updateFloatingAvatar = useStore((s) => s.updateFloatingAvatar)
  const closeFloatingAvatar = useStore((s) => s.closeFloatingAvatar)
  const setSetting = useStore((s) => s.setSetting)
  const [naturalSize, setNaturalSize] = useState<ImageNaturalSize | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null)
  const [layoutReclaim, setLayoutReclaim] = useState(0)
  const [chatPortraitAvailable, setChatPortraitAvailable] = useState(true)
  const [dockElement, setDockElement] = useState<HTMLElement | null>(null)
  const initializedImageRef = useRef<string | null>(null)
  const previousChatIdRef = useRef<string | null>(null)
  const autoSyncedChatIdRef = useRef<string | null>(null)

  const bounds = useMemo(() => getViewportBounds(settings), [settings])
  const ratio = resolvePortraitRatio(naturalSize)
  const isFloating = settings.dockSide === 'floating'

  const commitRect = useCallback((next: SurfaceRectPrefs) => {
    if (!floatingAvatar) return
    updateFloatingAvatar(next)
    if (!settings.rememberSizePosition) return

    let dockSide = settings.dockSide
    if (!mobile && dockSide !== 'floating' && typeof window !== 'undefined') {
      // `next` is layout px; the raw window width is not. Comparing them mis-persisted
      // `dockSide` at any ui scale above 1, so a right-docked portrait jumped left on reload.
      dockSide = next.x + next.width / 2 < viewportBox().width / 2 ? 'left' : 'right'
    }
    setSetting('portraitDockSettings', { ...settings, rect: next, dockSide })
  }, [floatingAvatar, mobile, setSetting, settings, updateFloatingAvatar])

  const sourceRect = useMemo(() => (
    floatingAvatar
      ? {
          x: Math.max(0, floatingAvatar.x),
          y: Math.max(0, floatingAvatar.y),
          width: floatingAvatar.width,
          height: floatingAvatar.height,
        }
      : settings.rect
  ), [floatingAvatar, settings.rect])
  const panel = usePersistentRect({
    rect: sourceRect,
    bounds,
    onCommit: commitRect,
    snapToEdge: settings.snapToEdge,
    preserveAspectRatio: settings.aspectRatioLocked,
    aspectRatio: ratio,
  })

  const updateSettings = useCallback((partial: Partial<PortraitDockSettings>) => {
    setSetting('portraitDockSettings', { ...settings, ...partial })
  }, [setSetting, settings])

  const applyFit = useCallback((mode: FitMode) => {
    if (!floatingAvatar) return
    const size = fitPortraitSize(ratio, bounds, mode, naturalSize)
    const nextRect = {
      ...panel.rect,
      ...size,
      ...(!isFloating && !mobile
        ? { y: getPortraitBottomY(size.height) }
        : {}),
    }
    panel.setRect(clampSurfaceRect(nextRect, bounds))
    setContextMenu(null)
  }, [bounds, floatingAvatar, isFloating, mobile, naturalSize, panel, ratio])

  const setDockSide = useCallback((dockSide: PortraitDockSettings['dockSide']) => {
    const side = dockSide === 'floating' ? settings.defaultDockSide : dockSide
    const rect = placePortraitRect(panel.rect, side)
    updateSettings({ dockSide, rect })
    updateFloatingAvatar(rect)
    setContextMenu(null)
  }, [panel.rect, settings.defaultDockSide, updateFloatingAvatar, updateSettings])

  const resetCurrentLayout = useCallback(() => {
    const side = settings.defaultDockSide
    const rect = placePortraitRect(DEFAULT_PORTRAIT_DOCK_SETTINGS.rect, side)
    updateSettings({
      rect,
      dockSide: side,
      pinned: DEFAULT_PORTRAIT_DOCK_SETTINGS.pinned,
      aspectRatioLocked: settings.defaultAspectRatioLock,
    })
    updateFloatingAvatar(rect)
    setContextMenu(null)
  }, [settings.defaultAspectRatioLock, settings.defaultDockSide, updateFloatingAvatar, updateSettings])

  const resetAllSettings = useCallback(() => {
    closeFloatingAvatar()
    setSetting('portraitDockSettings', { ...DEFAULT_PORTRAIT_DOCK_SETTINGS })
    setContextMenu(null)
  }, [closeFloatingAvatar, setSetting])

  const startMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    if ((event.target as HTMLElement).closest('button')) return
    panel.startDrag('move', event)
  }, [panel])

  useEffect(() => {
    if (!floatingAvatar?.imageUrl) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const nextNaturalSize = { width: img.naturalWidth, height: img.naturalHeight }
      setNaturalSize(nextNaturalSize)
      if (initializedImageRef.current === floatingAvatar.imageUrl) return
      initializedImageRef.current = floatingAvatar.imageUrl
      const usesUntouchedDefaultRect = isDefaultPortraitRect(floatingAvatar)
        && isDefaultPortraitRect(settings.rect)
      if (floatingAvatar.x >= 0 && floatingAvatar.y >= 0 && !usesUntouchedDefaultRect) return
      const nextRatio = resolvePortraitRatio(nextNaturalSize)
      const size = fitPortraitSize(
        nextRatio,
        bounds,
        settings.openAtOriginalSize ? 'natural' : 'available',
        nextNaturalSize,
      )
      panel.setRect(clampSurfaceRect(placePortraitRect(size, settings.defaultDockSide), bounds))
    }
    img.src = floatingAvatar.imageUrl
    return () => {
      cancelled = true
    }
  }, [bounds, floatingAvatar, panel, settings.defaultDockSide, settings.openAtOriginalSize])

  useEffect(() => {
    if (!activeChatId || !activeCharacterId) {
      previousChatIdRef.current = activeChatId
      autoSyncedChatIdRef.current = null
      setChatPortraitAvailable(false)
      return
    }

    const chatChanged = previousChatIdRef.current !== activeChatId
    const ownsCurrentPortrait = autoSyncedChatIdRef.current === activeChatId

    const character = characters.find((entry) => entry.id === activeCharacterId)
    if (!character) return

    const alternateAvatars = character.extensions?.alternate_avatars as Array<{
      image_id: string
      original_image_id?: string
    }> | undefined
    const alternateAvatar = activeChatAvatarId
      ? alternateAvatars?.find((entry) => entry.image_id === activeChatAvatarId)
      : null
    const originalImageId = alternateAvatar?.original_image_id
      ?? (typeof character.extensions?.original_image_id === 'string'
        ? character.extensions.original_image_id
        : null)
    const imageUrl = activeChatAvatarId
      ? imagesApi.url(alternateAvatar?.original_image_id ?? activeChatAvatarId)
      : originalImageId
        ? imagesApi.url(originalImageId)
        : getCharacterAvatarUrl(character)

    previousChatIdRef.current = activeChatId
    autoSyncedChatIdRef.current = activeChatId
    if (imageUrl) {
      setChatPortraitAvailable(true)
      if (
        chatChanged
        || !ownsCurrentPortrait
        || floatingAvatar?.imageUrl !== imageUrl
        || floatingAvatar?.displayName !== character.name
      ) {
        updateFloatingAvatar({ imageUrl, displayName: character.name })
      }
      if (
        settings.lastPortrait?.imageUrl !== imageUrl
        || settings.lastPortrait?.displayName !== character.name
        || !settings.open
      ) {
        setSetting('portraitDockSettings', {
          ...settings,
          open: true,
          lastPortrait: { imageUrl, displayName: character.name },
        })
      }
    } else {
      setChatPortraitAvailable(false)
    }
  }, [
    activeCharacterId,
    activeChatAvatarId,
    activeChatId,
    characters,
    floatingAvatar?.displayName,
    floatingAvatar?.imageUrl,
    setSetting,
    settings,
    updateFloatingAvatar,
  ])

  useEffect(() => {
    if (!floatingAvatar) return
    const handleResize = () => {
      const nextBounds = getViewportBounds(settings)
      panel.setRect(clampSurfaceRect(panel.rect, nextBounds))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [floatingAvatar, panel, settings])

  useLayoutEffect(() => {
    if (!dockElement || mobile || isFloating) {
      setLayoutReclaim(0)
      return
    }

    const bodyElement = dockElement.parentElement
    if (!bodyElement?.hasAttribute('data-chat-constrained')) {
      setLayoutReclaim(0)
      return
    }

    const chatColumn = Array.from(bodyElement.children).find((element) => {
      if (element === dockElement || !(element instanceof HTMLElement)) return false
      return Number.parseFloat(window.getComputedStyle(element).flexGrow) > 0
    })
    const chatContent = chatColumn?.lastElementChild
    if (!(chatContent instanceof HTMLElement)) {
      setLayoutReclaim(0)
      return
    }

    const updateLayoutReclaim = () => {
      // `getBoundingClientRect()` is rendered px, but `getComputedStyle().maxWidth` and
      // `panel.rect.width` are layout px. `getPortraitLayoutReclaim` subtracts all three from
      // one another, so an unconverted body width produced a negative margin hundreds of
      // pixels too large and pulled the chat column under the portrait.
      const bodyWidth = toLayoutBox(bodyElement.getBoundingClientRect()).width
      const chatMaxWidth = Number.parseFloat(window.getComputedStyle(chatContent).maxWidth)
      const nextReclaim = Number.isFinite(chatMaxWidth)
        ? Math.round(getPortraitLayoutReclaim(bodyWidth, chatMaxWidth, panel.rect.width))
        : 0
      setLayoutReclaim((current) => current === nextReclaim ? current : nextReclaim)
    }

    updateLayoutReclaim()
    const resizeObserver = new ResizeObserver(updateLayoutReclaim)
    resizeObserver.observe(bodyElement)
    resizeObserver.observe(chatContent)
    return () => resizeObserver.disconnect()
  }, [dockElement, isFloating, mobile, panel.rect.width, settings.dockSide])

  const contextMenuItems = useMemo<ContextMenuEntry[]>(() => [
    { key: 'natural', label: 'Restore original size', onClick: () => applyFit('natural') },
    { key: 'fit', label: 'Fit to available space', onClick: () => applyFit('available') },
    {
      key: 'aspect',
      label: settings.aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio',
      active: settings.aspectRatioLocked,
      onClick: () => {
        updateSettings({ aspectRatioLocked: !settings.aspectRatioLocked })
        setContextMenu(null)
      },
    },
    { key: 'layout-divider', type: 'divider' },
    { key: 'reset-position', label: 'Reset position', onClick: resetCurrentLayout },
    { key: 'dock-left', label: 'Dock left', active: settings.dockSide === 'left', onClick: () => setDockSide('left') },
    { key: 'dock-right', label: 'Dock right', active: settings.dockSide === 'right', onClick: () => setDockSide('right') },
    { key: 'float', label: 'Float / undock', active: settings.dockSide === 'floating', onClick: () => setDockSide('floating') },
    { key: 'preferences-divider', type: 'divider' },
    {
      key: 'pin',
      label: settings.pinned ? 'Unpin portrait' : 'Pin portrait',
      active: settings.pinned,
      onClick: () => {
        updateSettings({ pinned: !settings.pinned })
        setContextMenu(null)
      },
    },
    {
      key: 'hover-controls',
      label: settings.hoverControls ? 'Hide hover controls' : 'Show hover controls',
      active: settings.hoverControls,
      onClick: () => {
        updateSettings({ hoverControls: !settings.hoverControls })
        setContextMenu(null)
      },
    },
    { key: 'close-divider', type: 'divider' },
    { key: 'close', label: 'Close portrait', onClick: closeFloatingAvatar },
    { key: 'reset-all', label: 'Reset Portrait Dock settings', danger: true, onClick: resetAllSettings },
  ], [
    applyFit,
    closeFloatingAvatar,
    resetAllSettings,
    resetCurrentLayout,
    setDockSide,
    settings.aspectRatioLocked,
    settings.dockSide,
    settings.hoverControls,
    settings.pinned,
    updateSettings,
  ])

  if (
    !settings.enabled
    || !floatingAvatar
    || !activeChatId
    || !activeCharacterId
    || !chatPortraitAvailable
    || previousChatIdRef.current !== activeChatId
  ) return null

  const usesUntouchedDefaultPosition = panel.rect.x === DEFAULT_PORTRAIT_DOCK_SETTINGS.rect.x
    && panel.rect.y === DEFAULT_PORTRAIT_DOCK_SETTINGS.rect.y
    && settings.rect.x === DEFAULT_PORTRAIT_DOCK_SETTINGS.rect.x
    && settings.rect.y === DEFAULT_PORTRAIT_DOCK_SETTINGS.rect.y
  const dockedOffsetY = usesUntouchedDefaultPosition
    ? 0
    : panel.rect.y - getPortraitBottomY(panel.rect.height)
  const dockStyle: CSSProperties & {
    '--portrait-dock-ratio': number
    '--portrait-dock-offset-y'?: string
  } = {
    width: panel.rect.width,
    height: panel.rect.height,
    '--portrait-dock-ratio': ratio,
    ...(!isFloating && !mobile
      ? {
          '--portrait-dock-offset-y': `${dockedOffsetY}px`,
          ...(settings.dockSide === 'left'
            ? { marginRight: -layoutReclaim }
            : { marginLeft: -layoutReclaim }),
        }
      : {}),
    ...((isFloating || mobile)
      ? { left: panel.rect.x, top: panel.rect.y }
      : {}),
  }

  const dock = (
    <aside
      ref={setDockElement}
      className={[
        styles.dock,
        mobile ? styles.mobileDock : isFloating ? styles.floatingDock : styles.dockedDock,
      ].join(' ')}
      style={dockStyle}
      aria-label={`${floatingAvatar.displayName} portrait dock`}
      onPointerDown={startMove}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <img src={floatingAvatar.imageUrl} alt="" className={styles.image} draggable={false} />
      {settings.hoverControls && (
        <div className={styles.controls} role="toolbar" aria-label="Portrait dock controls">
          <button
            type="button"
            onClick={() => updateSettings({ pinned: !settings.pinned })}
            title={settings.pinned ? 'Unpin portrait' : 'Pin portrait'}
            aria-label={settings.pinned ? 'Unpin portrait' : 'Pin portrait'}
          >
            {settings.pinned
              ? <Pin size={settings.hoverControlSize} aria-hidden="true" />
              : <PinOff size={settings.hoverControlSize} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ aspectRatioLocked: !settings.aspectRatioLocked })}
            title={settings.aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            aria-label={settings.aspectRatioLocked ? 'Unlock portrait aspect ratio' : 'Lock portrait aspect ratio'}
          >
            {settings.aspectRatioLocked
              ? <LockKeyhole size={settings.hoverControlSize} aria-hidden="true" />
              : <Ratio size={settings.hoverControlSize} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => setDockSide(isFloating ? settings.defaultDockSide : 'floating')}
            title={isFloating ? `Dock portrait ${settings.defaultDockSide}` : 'Float portrait over chat and dialogs'}
            aria-label={isFloating ? `Dock portrait ${settings.defaultDockSide}` : 'Float portrait over chat and dialogs'}
          >
            {isFloating
              ? <PanelRight size={settings.hoverControlSize} aria-hidden="true" />
              : <PictureInPicture2 size={settings.hoverControlSize} aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => applyFit('smaller')} title="Fit smaller" aria-label="Fit portrait smaller">
            <Minimize2 size={settings.hoverControlSize} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => applyFit('natural')} title="Original size" aria-label="Show portrait at original size">
            <span aria-hidden="true">1x</span>
          </button>
          <button type="button" onClick={() => applyFit('available')} title="Fit available" aria-label="Fit portrait to available space">
            <Maximize2 size={settings.hoverControlSize} aria-hidden="true" />
          </button>
          <button type="button" onClick={closeFloatingAvatar} title="Close portrait dock" aria-label="Close portrait dock">
            <X size={settings.hoverControlSize} aria-hidden="true" />
          </button>
        </div>
      )}
      {RESIZE_DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          className={`${styles.resizeHandle} ${styles[`resize${direction.toUpperCase()}`]}`}
          aria-label={`Resize portrait dock ${direction}`}
          onPointerDown={(event) => {
            event.stopPropagation()
            panel.startDrag(direction, event)
          }}
        />
      ))}
    </aside>
  )

  return (
    <>
      {isFloating && !mobile && typeof document !== 'undefined'
        ? createPortal(<div className={styles.floatingLayer}>{dock}</div>, document.body)
        : dock}
      <ContextMenu position={contextMenu} items={contextMenuItems} onClose={() => setContextMenu(null)} />
    </>
  )
}
