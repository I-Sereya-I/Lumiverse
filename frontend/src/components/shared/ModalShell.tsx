import {
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type CSSProperties,
  type ComponentPropsWithoutRef,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import styles from './ModalShell.module.css'
import clsx from 'clsx'

interface ModalShellOwnProps {
  isOpen: boolean
  onClose: () => void
  maxWidth?: string | number
  maxHeight?: string | number
  zIndex?: number
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Extra DOM attributes forwarded verbatim onto the surface element — the box
 * that actually paints `background` / `border` / `box-shadow` (`.modal`).
 *
 * This is what makes `data-component="…"` work for `ModalShell` consumers: the
 * app's Custom-CSS panel tells users to write `[data-component="X"] { … }`, and
 * before this existed the closed prop list swallowed the attribute, so every
 * modal was unselectable. `aria-*`, `id`, `title` and friends ride along too.
 *
 * `keyof ModalShellOwnProps` is omitted so `className` / `style` / `children`
 * cannot arrive twice down two different paths. `role` and `aria-modal` are
 * omitted because the shell owns them — see the spread order in the JSX below,
 * where `{...rest}` comes FIRST and every shell-owned attribute after it, so a
 * caller can never clobber the class name or the dialog semantics.
 *
 * The `motion` handlers are omitted because `motion.div` re-declares them with
 * its own (incompatible) signatures; forwarding React's versions would not
 * type-check and would be silently overridden by the animation props anyway.
 */
type ModalShellDOMProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  | keyof ModalShellOwnProps
  | 'role'
  | 'aria-modal'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
>

export type ModalShellProps = ModalShellOwnProps & ModalShellDOMProps

export function ModalShell({
  isOpen,
  onClose,
  maxWidth = 560,
  maxHeight = '85vh',
  zIndex = 10002,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
  className,
  style,
  ...rest
}: ModalShellProps) {
  const backdropPointerDownRef = useRef<EventTarget | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose, closeOnEscape])

  const handleBackdropPointerDown = useCallback((e: React.PointerEvent) => {
    backdropPointerDownRef.current = e.target === e.currentTarget ? e.currentTarget : null
  }, [])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (
        closeOnBackdrop
        && e.target === e.currentTarget
        && backdropPointerDownRef.current === e.currentTarget
      ) {
        onClose()
      }
    },
    [onClose, closeOnBackdrop],
  )

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={handleBackdropPointerDown}
          onClick={handleBackdropClick}
          style={{ zIndex }}
        >
          <motion.div
            /* `{...rest}` FIRST: everything below it is shell-owned and must win.
               `className` is merged (not replaced) via clsx, so a caller's class
               stacks on top of `.modal` instead of erasing the surface styles. */
            {...rest}
            className={clsx(styles.modal, className)}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ maxWidth, maxHeight, ...style }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
