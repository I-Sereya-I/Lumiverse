import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ResizablePanelFrame } from '@/components/shared/ResizablePanelFrame'
import PostImportWorldBookModal from '@/components/shared/PostImportWorldBookModal'
import ImportWorldBookModal, { type WorldBookImportResult } from './ImportWorldBookModal'
import LorebookEditorWorkspace from '@/components/world-book-editor/LorebookEditorWorkspace'
import {
  centerEditorRect,
  clampEditorRectToViewport,
  DEFAULT_MIN_EDITOR_PANE_WIDTH,
  FULL_EDITOR_MIN,
} from '@/lib/lorebookEditorGeometry'
import { readUiScale } from '@/lib/uiScale'
import { useStore } from '@/store'
import type { WorldBook } from '@/types/api'
import styles from './WorldBookEditorModal.module.css'

export { centerEditorRect, clampEditorRectToViewport }

export default function WorldBookEditorModal() {
  const closeModal = useStore((state) => state.closeModal)
  const modalProps = useStore((state) => state.modalProps)
  const settings = useStore((state) => state.lorebookEditorSettings)
  const setSetting = useStore((state) => state.setSetting)
  const [showImport, setShowImport] = useState(false)
  const [postImportBook, setPostImportBook] = useState<WorldBook | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const backdropPointerDownRef = useRef<EventTarget | null>(null)

  // `clientWidth`/`clientHeight` are *device* px, but the frame this feeds renders
  // inside the `body > * { zoom: var(--lumiverse-ui-scale) }` layer (`theme/reset.css`)
  // and is sized from `--panel-*` in that layer's own layout px. At UI scale != 1 the
  // undivided numbers made the modal's maximum — and its centring — wrong by exactly
  // the scale factor: the full editor's version of "it covers everything".
  //
  // `usePersistentRect` already divides internally, so the frame's runtime clamping
  // and drag arithmetic are correct without this. `centerEditorRect` and the `bounds`
  // below run *outside* the hook, which is why the division has to be repeated here.
  const viewportRect = useMemo(() => {
    const scale = readUiScale() || 1
    return {
      x: 0,
      y: 0,
      width: Math.max(1, Math.floor((document.documentElement.clientWidth || window.innerWidth) / scale)),
      height: Math.max(1, Math.floor((document.documentElement.clientHeight || window.innerHeight) / scale)),
    }
  }, [fullscreen])
  // Centred on open, from the remembered dimensions. Recomputing this from
  // `settings.fullRect` on every commit re-centred the panel mid-drag, so
  // resizing from the left or top edge made it jump across the screen.
  const [centeredFullRect, setCenteredFullRect] = useState(
    () => centerEditorRect(clampEditorRectToViewport(settings.fullRect, viewportRect), viewportRect),
  )

  useEffect(() => {
    if (fullscreen) return
    setCenteredFullRect(centerEditorRect(
      clampEditorRectToViewport(useStore.getState().lorebookEditorSettings.fullRect, viewportRect),
      viewportRect,
    ))
  }, [fullscreen, viewportRect])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [closeModal])

  const handleImport = (result: WorldBookImportResult) => {
    setShowImport(false)
    setPostImportBook(result.world_book)
    closeModal()
    queueMicrotask(() => {
      useStore.getState().openModal('worldBookEditor', {
        bookId: result.world_book.id,
      })
    })
  }

  const editor = (
    <>
      <div
        className={styles.backdrop}
        onPointerDown={(event) => {
          backdropPointerDownRef.current = event.target === event.currentTarget ? event.currentTarget : null
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && backdropPointerDownRef.current === event.currentTarget) closeModal()
        }}
      >
        <ResizablePanelFrame
          rect={fullscreen ? viewportRect : centeredFullRect}
          bounds={{
            // The floor is the larger of the editor's own minimum and the width the
            // user has declared its panes need (`minEditorPaneWidth`), so the full
            // editor cannot be dragged into a state where its content is unusable —
            // the same number that governs the half editor's clamp.
            minWidth: Math.min(
              Math.max(
                FULL_EDITOR_MIN.width,
                settings.minEditorPaneWidth ?? DEFAULT_MIN_EDITOR_PANE_WIDTH,
              ),
              viewportRect.width,
            ),
            minHeight: Math.min(FULL_EDITOR_MIN.height, viewportRect.height),
            maxWidth: viewportRect.width,
            maxHeight: viewportRect.height,
          }}
          onCommit={(fullRect) => {
            if (!fullscreen) {
              setCenteredFullRect(fullRect)
              setSetting('lorebookEditorSettings', {
                ...useStore.getState().lorebookEditorSettings,
                fullRect,
              })
            }
          }}
          showHeader={false}
          resizable={!fullscreen}
          aria-label="World Book Editor"
          className={`${styles.modal} ${fullscreen ? styles.fullscreen : ''}`}
        >
          <LorebookEditorWorkspace
            variant="full"
            initialBookId={(modalProps.bookId as string | undefined) ?? null}
            initialEntryId={(modalProps.entryId as string | undefined) ?? null}
            onClose={closeModal}
            onImportRequest={() => setShowImport(true)}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((current) => !current)}
          />
        </ResizablePanelFrame>
      </div>

      {showImport && (
        <ImportWorldBookModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {postImportBook && (
        <PostImportWorldBookModal
          book={postImportBook}
          onClose={() => setPostImportBook(null)}
        />
      )}
    </>
  )

  return createPortal(editor, document.body)
}
