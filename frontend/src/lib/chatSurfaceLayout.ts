/**
 * Dock-mode predicates for the chat column's two surface hosts.
 *
 * React-free, store-free and DOM-free, with its own narrow input types instead
 * of an `@/types/store` import, so it unit-tests headlessly and does not depend
 * on the settings-shape work.
 *
 * `ChatView` maps the results onto `data-dock-mode` attributes; the stylesheets
 * switch layout off those. Keeping the decision here means it is stated once,
 * is testable, and cannot drift between the markup and the CSS.
 */

/** The quick toolbar variant that wants an in-flow strip at the top of the chat. */
export const CHAT_TOP_DOCK_STRIP_VARIANT = 'v2-settings-adjacent'

/** The lore indicator variant that wants its own row above the composer. */
export const CHAT_LORE_DOCK_STRIP_VARIANT = 'v4-bottom-strip'

export type ChatTopDockMode = 'floating' | 'strip'
export type ChatLoreDockMode = 'strip' | 'off'

export interface ChatTopDockInput {
  enabled: boolean
  variant: string
  /** Number of buttons the toolbar will actually render. */
  actionCount: number
}

export interface ChatLoreDockInput {
  enabled: boolean
  variant: string
}

/**
 * `'strip'` puts `.chatToolbar` into the column flow so the V2 cards reserve
 * their own row instead of covering the first message; `'floating'` keeps
 * today's absolutely-positioned top-right cluster.
 *
 * `actionCount > 0` is load-bearing: a toolbar with no visible actions renders
 * `null`, and a strip would then reserve an empty ~54px row. An unknown
 * persisted variant falls through to `'floating'` — the no-crash guard, and the
 * same "anything that is not V2 is free-positioned" rule the component uses.
 */
export function chatTopDockMode(t: ChatTopDockInput): ChatTopDockMode {
  if (!t.enabled) return 'floating'
  if (t.variant !== CHAT_TOP_DOCK_STRIP_VARIANT) return 'floating'
  return t.actionCount > 0 ? 'strip' : 'floating'
}

export interface DockActionSizeInput {
  /** The V2 icon-size slider, in layout px. */
  iconSize: number
  density: string
}

/**
 * Edge length of the dock's own action buttons (the half-editor launcher and the
 * select-messages toggle) while the V2 strip is up.
 *
 * Those two buttons are `ChatView`'s children, not the toolbar's, so they cannot
 * read `--quick-toolbar-icon-size` — it is set inline on the `<nav>` far below
 * them. Without this they stayed 28px circles beside a row of cards that track
 * the icon-size slider, which is what made the row read as two unrelated groups.
 *
 * The `+20` / `+8` padding mirrors `.cardStripSettings` and its compact override
 * in `QuickToolbar.module.css`, so these buttons come out exactly as tall as the
 * gear they sit next to. Computed here rather than duplicated as a `calc()` in
 * `ChatView.module.css` so there is one number to change, and so it is testable
 * without a DOM.
 *
 * An unknown density falls through to comfortable — the same "unrecognised
 * variant takes the roomier default" rule the dock-mode helpers above use.
 */
export function dockActionControlSize(input: DockActionSizeInput): number {
  const icon = Number.isFinite(input.iconSize) && input.iconSize > 0 ? input.iconSize : 28
  return icon + (input.density === 'compact' ? 8 : 20)
}

/**
 * `'strip'` mounts the lore dock above the composer for the V4 bottom strip;
 * every other variant (including an unknown one) renders its own floating root
 * and needs no dock. The indicator itself stays mounted either way — only the
 * wrapper is conditional.
 */
export function chatLoreDockMode(l: ChatLoreDockInput): ChatLoreDockMode {
  if (!l.enabled) return 'off'
  return l.variant === CHAT_LORE_DOCK_STRIP_VARIANT ? 'strip' : 'off'
}
