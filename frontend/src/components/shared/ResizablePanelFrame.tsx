import type { CSSProperties, ReactNode } from 'react'
import { usePersistentRect, type RectBounds } from '@/hooks/usePersistentRect'
import type { SurfaceRectPrefs } from '@/types/store'
import styles from './ResizablePanelFrame.module.css'

interface ResizablePanelFrameProps {
  rect: SurfaceRectPrefs
  bounds: RectBounds
  onCommit: (rect: SurfaceRectPrefs) => void
  title?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  className?: string
  snapToEdge?: boolean
  showHeader?: boolean
  resizable?: boolean
  'aria-label'?: string
}

const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

/**
 * CSS Modules run with `localsConvention: 'camelCaseOnly'`, so `.handle_n`
 * is only exported as `handleN`. Looking the class up by its source name
 * silently yields `undefined` and leaves every handle at 0x0.
 */
const handleClass: Record<(typeof handles)[number], string> = {
  n: styles.handleN,
  s: styles.handleS,
  e: styles.handleE,
  w: styles.handleW,
  ne: styles.handleNe,
  nw: styles.handleNw,
  se: styles.handleSe,
  sw: styles.handleSw,
}

export function ResizablePanelFrame({
  rect,
  bounds,
  onCommit,
  title,
  toolbar,
  children,
  className,
  snapToEdge,
  showHeader = true,
  resizable = true,
  'aria-label': ariaLabel,
}: ResizablePanelFrameProps) {
  const persistentRect = usePersistentRect({ rect, bounds, onCommit, snapToEdge })
  const frameStyle = {
    '--panel-x': `${persistentRect.rect.x}px`,
    '--panel-y': `${persistentRect.rect.y}px`,
    '--panel-width': `${persistentRect.rect.width}px`,
    '--panel-height': `${persistentRect.rect.height}px`,
  } as CSSProperties

  return (
    <section
      className={[styles.frame, className].filter(Boolean).join(' ')}
      style={frameStyle}
      aria-label={ariaLabel}
    >
      {showHeader && (
        <div className={styles.header} onPointerDown={(event) => persistentRect.startDrag('move', event)}>
          <div className={styles.title}>{title}</div>
          <div className={styles.toolbar} onPointerDown={(event) => event.stopPropagation()}>{toolbar}</div>
        </div>
      )}
      <div className={styles.body}>{children}</div>
      {resizable && handles.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`${styles.handle} ${handleClass[handle]}`}
          aria-label={`Resize ${handle}`}
          onPointerDown={(event) => persistentRect.startDrag(handle, event)}
        />
      ))}
    </section>
  )
}
