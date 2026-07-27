import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import {
  CUSTOMIZER_GAP,
  CUSTOMIZER_VIEWPORT_MARGIN,
  CUSTOMIZER_WIDTH,
  placeCustomizer,
} from '../frontend/src/lib/quickToolbarPlacement'
import { DEFAULT_QUICK_TOOLBAR_SETTINGS } from '../frontend/src/lib/uiProductivityDefaults'

/** Mirrors DESIGN_DEFAULT_IDS in useQuickToolbarActions (which imports the store). */
const DESIGN_DEFAULT_IDS = ['profile', 'connections', 'council', 'lorebook', 'presets', 'settings']

const toolbarSource = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/QuickToolbar.tsx', import.meta.url),
).text()
const toolbarStyles = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/QuickToolbar.module.css', import.meta.url),
).text()
const modalSource = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/QuickToolbarCustomizeModal.tsx', import.meta.url),
).text()
const modalStyles = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/QuickToolbarCustomizeModal.module.css', import.meta.url),
).text()
const contextSource = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/useQuickToolbarContext.ts', import.meta.url),
).text()
const actionsSource = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/useQuickToolbarActions.ts', import.meta.url),
).text()
const themeVariables = await Bun.file(
  new URL('../frontend/src/theme/variables.css', import.meta.url),
).text()
const uiSliceSource = await Bun.file(
  new URL('../frontend/src/store/slices/ui.ts', import.meta.url),
).text()

/**
 * Declarations of the rule whose selector is exactly `selector`, comments
 * stripped — so a comment explaining why a property is wrong cannot satisfy an
 * assertion looking for that property.
 */
function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'ms'))?.[1] ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Every rule in `css` whose selector list mentions `needle`. Comments are
 * stripped from the *selector* too, so a rule documented by a comment that names
 * some other selector is not mistaken for that selector's own rule.
 */
function rulesMentioning(css: string, needle: string): { selector: string; body: string }[] {
  // Comments go first: one of them quotes a declaration block, braces included,
  // which would otherwise parse as a rule of its own.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...source.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim(), body: match[2].trim() }))
    .filter((rule) => rule.selector.includes(needle))
}

const viewport = { width: 1_280, height: 800 }

function anchor(left: number, top: number, width: number, height: number) {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** The distance the caret is allowed to travel along the popover's anchored edge. */
function caretTrack(
  placement: { side: string; maxHeight: number },
  renderedWidth = CUSTOMIZER_WIDTH,
): number {
  return placement.side === 'below' || placement.side === 'above' ? renderedWidth : placement.maxHeight
}

describe('quick toolbar customizer placement', () => {
  test('sits flush under a horizontal toolbar rather than beside its rectangle', () => {
    const placement = placeCustomizer(anchor(400, 60, 260, 54), false, viewport)
    // Only the caret gap separates them — the popover used to be offset by half
    // the difference between the persisted rect width and the visible toolbar.
    expect(placement.top).toBe(60 + 54 + CUSTOMIZER_GAP)
    expect(placement.side).toBe('below')
    // Centred on the toolbar.
    expect(placement.left).toBe(400 + 130 - CUSTOMIZER_WIDTH / 2)
    expect(placement.caret).toBeGreaterThanOrEqual(14)
    expect(placement.caret).toBeLessThanOrEqual(CUSTOMIZER_WIDTH - 14)
  })

  test('flips above when there is no room below', () => {
    const placement = placeCustomizer(anchor(400, 700, 260, 54), false, viewport)
    expect(placement.side).toBe('above')
    expect(placement.top).toBeGreaterThanOrEqual(10)
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(700)
  })

  test('sits beside a vertical toolbar and flips when the edge is close', () => {
    const right = placeCustomizer(anchor(200, 120, 56, 320), true, viewport)
    expect(right.side).toBe('right')
    expect(right.left).toBe(200 + 56 + CUSTOMIZER_GAP)

    const left = placeCustomizer(anchor(1_180, 120, 56, 320), true, viewport)
    expect(left.side).toBe('left')
    expect(left.left).toBe(1_180 - CUSTOMIZER_GAP - CUSTOMIZER_WIDTH)
  })

  test('never places the popover outside the viewport', () => {
    for (const candidate of [
      placeCustomizer(anchor(-40, -20, 260, 54), false, viewport),
      placeCustomizer(anchor(1_260, 10, 260, 54), false, viewport),
      placeCustomizer(anchor(1_260, 780, 56, 320), true, viewport),
    ]) {
      expect(candidate.left).toBeGreaterThanOrEqual(10)
      expect(candidate.left + CUSTOMIZER_WIDTH).toBeLessThanOrEqual(viewport.width)
      expect(candidate.top).toBeGreaterThanOrEqual(10)
      // The bottom used to be free to run off-screen, taking the reset button with
      // it, because maxHeight was floored independently of top.
      expect(candidate.top + candidate.maxHeight).toBeLessThanOrEqual(viewport.height)
    }
  })

  test('keeps the bottom on-screen on a viewport too short for the minimum height', () => {
    // 420px tall leaves 173px above and below a toolbar at y=190, so neither side
    // can hold MIN_CUSTOMIZER_HEIGHT. The floor used to push the popover's bottom
    // past the viewport with no way to scroll it back; it now overlaps the toolbar.
    const shortViewport = { width: 1_200, height: 420 }
    const placement = placeCustomizer(anchor(400, 190, 260, 40), false, shortViewport)
    expect(placement.top).toBeGreaterThanOrEqual(10)
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(shortViewport.height)
    expect(placement.left).toBeGreaterThanOrEqual(10)
    expect(placement.left + CUSTOMIZER_WIDTH).toBeLessThanOrEqual(shortViewport.width)
  })

  test('respects the viewport margin at every height, in both branches', () => {
    // The 220px MIN_CUSTOMIZER_HEIGHT used to be an unconditional floor, so on any
    // viewport under 240px tall `maxHeight` outgrew the space `top` had left and the
    // popover's bottom — reset button included — ran past the fold unreachably.
    // Both branches now give up the floor before the fold.
    const margin = CUSTOMIZER_VIEWPORT_MARGIN
    let checked = 0
    let belowTheOldFloor = 0
    for (let height = 100; height <= 800; height += 10) {
      const shortViewport = { width: 1_200, height }
      for (const top of [-40, 0, 12, Math.round(height / 2), height - 40, height + 30]) {
        for (const vertical of [false, true]) {
          const placement = placeCustomizer(
            anchor(400, top, vertical ? 56 : 260, vertical ? 320 : 40),
            vertical,
            shortViewport,
          )
          expect(placement.top).toBeGreaterThanOrEqual(margin)
          expect(placement.maxHeight).toBeGreaterThanOrEqual(0)
          expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(height - margin)
          expect(placement.left).toBeGreaterThanOrEqual(margin)
          expect(placement.left + CUSTOMIZER_WIDTH).toBeLessThanOrEqual(shortViewport.width - margin)
          checked += 1
          if (height < 240) belowTheOldFloor += 1
        }
      }
    }
    // Guard the loop itself: the regression only shows up under 240px.
    expect(checked).toBe(71 * 6 * 2)
    expect(belowTheOldFloor).toBeGreaterThan(0)
  })

  test('keeps the caret inside the popover box on whichever edge it sits', () => {
    // The caret is an offset *along* the anchored edge: horizontal for below/above,
    // vertical for right/left. Unclamped it detached from the box as soon as the
    // top/left clamp pushed the popover away from the toolbar's centre.
    for (let height = 100; height <= 800; height += 25) {
      const shortViewport = { width: 1_280, height }
      for (const renderedWidth of [CUSTOMIZER_WIDTH, CUSTOMIZER_WIDTH * 1.25]) {
        for (const top of [-40, 0, 30, Math.round(height / 2), height - 60, height + 30]) {
          for (const left of [-40, 0, 200, 640, 1_240, 1_400]) {
            for (const vertical of [false, true]) {
              const placement = placeCustomizer(
                anchor(left, top, vertical ? 56 : 260, vertical ? 320 : 40),
                vertical,
                shortViewport,
                renderedWidth,
              )
              const along = caretTrack(placement, renderedWidth)
              if (along < 28) {
                // Degenerate box: there is no room for two 14px insets, so the caret
                // pins to the near edge rather than reporting a negative offset.
                expect(placement.caret).toBe(14)
              } else {
                expect(placement.caret).toBeGreaterThanOrEqual(14)
                expect(placement.caret).toBeLessThanOrEqual(along - 14)
              }
            }
          }
        }
      }
    }
  })

  test('clamps against the rendered width when the ui-scale zoom widens the popover', () => {
    // `body > *` carries `zoom: var(--lumiverse-ui-scale)`, so the popover's rendered
    // box is wider than CUSTOMIZER_WIDTH. Clamping against the unscaled width let the
    // right edge overflow at zoom levels above 1.
    const renderedWidth = CUSTOMIZER_WIDTH * 1.25
    for (const candidate of [
      placeCustomizer(anchor(1_200, 100, 260, 54), false, viewport, renderedWidth),
      placeCustomizer(anchor(-40, 100, 260, 54), false, viewport, renderedWidth),
      placeCustomizer(anchor(1_180, 120, 56, 320), true, viewport, renderedWidth),
    ]) {
      expect(candidate.left).toBeGreaterThanOrEqual(10)
      expect(candidate.left + renderedWidth).toBeLessThanOrEqual(viewport.width)
      expect(candidate.top + candidate.maxHeight).toBeLessThanOrEqual(viewport.height)
      expect(candidate.caret).toBeGreaterThanOrEqual(14)
      // For below/above the caret is a horizontal offset, so it must stay inside the
      // wider rendered box rather than the unscaled one.
      if (candidate.side === 'below' || candidate.side === 'above') {
        expect(candidate.caret).toBeLessThanOrEqual(renderedWidth - 14)
      }
    }

    // Default parameter: omitting renderedWidth behaves exactly as before.
    expect(placeCustomizer(anchor(400, 60, 260, 54), false, viewport))
      .toEqual(placeCustomizer(anchor(400, 60, 260, 54), false, viewport, CUSTOMIZER_WIDTH))
  })
})

describe('quick toolbar variants', () => {
  test('renders the popover against the measured toolbar, not the toolbar root', () => {
    expect(toolbarSource).toContain('toolbarRef.current?.getBoundingClientRect()')
    expect(toolbarSource).toContain('createPortal(')
    expect(toolbarStyles).toMatch(/\.customizer\s*\{[^}]*position:\s*fixed;/s)
    expect(toolbarStyles).not.toMatch(/\.customizer\s*\{[^}]*left:\s*100%;/s)
    // Caret for every flip direction.
    for (const side of ['below', 'above', 'right', 'left']) {
      expect(toolbarStyles).toContain(`.customizer[data-side="${side}"]::before`)
    }
  })

  test('divides the placement by the body zoom layer before writing inline offsets', () => {
    // `body > *` carries `zoom: var(--lumiverse-ui-scale)`. getBoundingClientRect
    // reports rendered pixels, but inline left/top on a portaled child of that layer
    // are resolved pre-zoom, so the popover drifted further the more the user zoomed.
    expect(toolbarSource).toMatch(/import \{[^}]*\breadUiScale\b[^}]*\} from '@\/lib\/quickToolbarPlacement'/s)
    expect(toolbarSource).toContain('const uiScale = readUiScale()')
    // Placement happens in rendered space, so the width it clamps against is scaled too.
    expect(toolbarSource).toContain('CUSTOMIZER_WIDTH * uiScale')

    const measureBody = toolbarSource.match(
      /const measure = useCallback\(\(\) => \{([\s\S]*?)\r?\n  \}, \[vertical\]\)/,
    )?.[1] ?? ''
    expect(measureBody).not.toBe('')
    // Every offset crosses the zoom boundary exactly once — a second division would
    // collapse the popover towards the origin.
    for (const conversion of [
      'left: rendered.left / uiScale',
      'top: rendered.top / uiScale',
      'const maxHeight = rendered.maxHeight / uiScale',
    ]) {
      expect(measureBody.split(conversion)).toHaveLength(2)
    }
    // left, top, maxHeight, caret — and nothing else.
    expect(measureBody.match(/\/ uiScale/g)).toHaveLength(4)
    // maxHeight is converted into a local and passed through, so the caret clamp can
    // reuse the layout-space value instead of re-deriving it.
    expect(measureBody).toMatch(/\r?\n {6}maxHeight,\r?\n/)
  })

  test('re-clamps the caret after converting out of the zoom layer', () => {
    // Dividing the caret by a uiScale above 1 shrank the 14px inset below the
    // popover's 14px border-radius, so the arrow emerged from the rounded corner.
    // The inset is a design unit, so it is re-applied in layout space — against
    // CUSTOMIZER_WIDTH for below/above and the converted maxHeight for right/left.
    expect(toolbarSource).toContain(
      "const along = rendered.side === 'below' || rendered.side === 'above' ? CUSTOMIZER_WIDTH : maxHeight",
    )
    expect(toolbarSource).toContain(
      'caret: Math.max(14, Math.min(rendered.caret / uiScale, Math.max(14, along - 14)))',
    )
    // Sanity-check the maths the component performs, at a zoom the naive division
    // would break: a rendered caret near the right edge must stay 14px inside.
    const uiScale = 1.5
    const rendered = placeCustomizer(
      anchor(1_180, 100, 260, 54),
      false,
      viewport,
      CUSTOMIZER_WIDTH * uiScale,
    )
    const converted = Math.max(
      14,
      Math.min(rendered.caret / uiScale, Math.max(14, CUSTOMIZER_WIDTH - 14)),
    )
    expect(converted).toBeGreaterThanOrEqual(14)
    expect(converted).toBeLessThanOrEqual(CUSTOMIZER_WIDTH - 14)
  })

  test('falls back on custom properties the theme engine never defines', () => {
    // Historical note, kept because the fallback is still the right shape:
    // `--lumiverse-text-secondary` used to be defined nowhere, so reading it bare
    // dropped the declaration and left the customize-modal section headings
    // uncoloured. It is now aliased to `--lumiverse-text-muted` in variables.css,
    // so the bare form would work — but the two-arg form is what survives someone
    // removing the alias, and it resolves identically today.
    expect(modalStyles).toMatch(
      /\.sectionTitle\s*\{[^}]*color:\s*var\(--lumiverse-text-secondary,\s*var\(--lumiverse-text-muted\)\);/s,
    )
    // And no other token is read bare unless the theme actually defines it.
    const defined = new Set(
      [...themeVariables.matchAll(/(--lumiverse-[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]),
    )
    const bare = new Set(
      [...`${modalStyles}\n${toolbarStyles}`.matchAll(/var\(\s*(--lumiverse-[a-zA-Z0-9-]+)\s*\)/g)]
        .map((match) => match[1]),
    )
    expect([...bare].filter((token) => !defined.has(token))).toEqual([])
    expect(bare.size).toBeGreaterThan(0)
  })

  test('resetting V2 leaves the V1/V3 label preference alone', () => {
    const resetSource = actionsSource.slice(actionsSource.indexOf('const resetCurrentVariant'))
    const branches = resetSource.split(/\r?\n\s*return\r?\n/)
    expect(branches).toHaveLength(2)
    const [v2Branch, iconVariantBranch] = branches

    expect(v2Branch).toContain("settings.variant === 'v2-settings-adjacent'")
    expect(v2Branch).toContain('v2LabelVisible: defaults.v2LabelVisible')
    // V2 has its own flag and never renders `labelVisible`, so writing it here
    // silently wiped the icon-only variants' preference from the V2 reset button.
    expect(v2Branch).not.toContain('labelVisible: defaults.labelVisible')
    // The icon-only branch still resets it.
    expect(iconVariantBranch).toContain('labelVisible: defaults.labelVisible')
  })

  test('re-measures the popover when the toolbar itself changes size', () => {
    // Icon size, label size and "show labels" resize the nav without touching any
    // value in the layout-effect dependency list, so the box is observed directly.
    expect(toolbarSource).toContain('const node = toolbarRef.current')
    expect(toolbarSource).toContain('new ResizeObserver(measure)')
    expect(toolbarSource).toContain('observer.observe(node)')
    expect(toolbarSource).toContain('observer?.disconnect()')
    expect(toolbarSource).toMatch(/if \(!customizing\) return\s*\r?\n\s*const node = toolbarRef\.current/)
  })

  test('scrolls the popover body so the caret is never clipped away', () => {
    // Comments are stripped so the rule that *explains* why `overflow: auto` is wrong
    // cannot satisfy the assertion that looks for it.
    const declarations = (selector: string) =>
      (toolbarStyles.match(new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, 'ms'))?.[1] ?? '')
        .replace(/\/\*[\s\S]*?\*\//g, '')

    const customizerRule = declarations('.customizer')
    expect(customizerRule).toContain('z-index: var(--z-quick-toolbar-popover, 10014)')
    expect(customizerRule).toContain('position: fixed')
    // `::before` (the caret) sits outside the padding box, so a scroll container here
    // would clip it entirely. The scroller is the inner wrapper instead.
    expect(customizerRule).toContain('overflow: visible')
    expect(customizerRule).not.toMatch(/overflow(-x|-y)?:\s*(auto|scroll|hidden|clip)/)

    const bodyRule = declarations('.customizerBody')
    expect(bodyRule).toContain('overflow: auto')
    expect(bodyRule).toContain('min-height: 0')
    expect(toolbarSource).toContain('<div className={styles.customizerBody}>')
  })

  test('opens the full modal from the popover and on narrow viewports', () => {
    expect(toolbarSource).toContain('const MODAL_ONLY_WIDTH = 760')
    expect(toolbarSource).toContain('setModalOpen(true)')
    expect(toolbarSource).toContain('<QuickToolbarCustomizeModal onClose={() => setModalOpen(false)} />')
    expect(modalSource).toContain('<ModalShell')
    expect(modalSource).toContain('verticalListSortingStrategy')
    expect(modalSource).toContain('Toggle.Switch')
  })

  test('V2 renders settings-adjacent context cards', () => {
    expect(toolbarSource).toContain('styles.cardStrip')
    expect(toolbarSource).toContain('styles.cardTitle')
    expect(toolbarSource).toContain('styles.cardValue')
    expect(toolbarSource).toContain('cardContext[action.id]')
    expect(toolbarStyles).toContain('.cardIcon')
    // V2 shares the icon selection with the other variants, as the confirmed
    // design requires, rather than keeping a second card list in sync.
    expect(DEFAULT_QUICK_TOOLBAR_SETTINGS.visibleTabIds).toEqual(DESIGN_DEFAULT_IDS)
    expect(DEFAULT_QUICK_TOOLBAR_SETTINGS.iconOrder).toEqual(DESIGN_DEFAULT_IDS)
    expect(contextSource).toContain('lorebook: loreLabel')
    expect(contextSource).toContain('context.connections = connectionName')
  })

  test('V2 labels default on through their own flag', () => {
    // V2 renders context cards whose heading *is* the label, so inheriting the
    // icon-only variants' `labelVisible: false` shipped V2 with unnamed cards.
    expect(DEFAULT_QUICK_TOOLBAR_SETTINGS.labelVisible).toBe(false)
    expect(DEFAULT_QUICK_TOOLBAR_SETTINGS.v2LabelVisible).toBe(true)
    expect(toolbarSource).toContain('const labelVisible = anchored ? settings.v2LabelVisible !== false : settings.labelVisible')
    expect(toolbarSource).toContain('{ v2LabelVisible: event.target.checked }')
    expect(toolbarSource).toContain('{ labelVisible: event.target.checked }')
  })

  test('free positioning keeps working resize handles', () => {
    expect(toolbarSource).toContain('const RESIZE_HANDLE_CLASS')
    expect(toolbarSource).toContain('RESIZE_HANDLE_CLASS[handle]')
    expect(toolbarSource).not.toContain('styles[`resize_')
    for (const handle of ['resizeN', 'resizeS', 'resizeE', 'resizeW', 'resizeNe', 'resizeNw', 'resizeSe', 'resizeSw']) {
      expect(toolbarSource).toContain(handle)
    }
    // Hovering the toolbar surfaces the handles, as in the confirmed design.
    expect(toolbarStyles).toContain('.rootFree:hover .resizeHandle::after')
  })
})

describe('QT-1 — only two variants survive', () => {
  test('v3-adaptive is gone from the components, and survives only where it must', () => {
    const root = new URL('../frontend/src/', import.meta.url)
    const offenders: string[] = []
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
        if (entry.isDirectory()) {
          walk(child)
          continue
        }
        if (!/\.(ts|tsx|css)$/.test(entry.name)) continue
        if (!readFileSync(child, 'utf8').includes('v3-adaptive')) continue
        offenders.push(child.href.slice(root.href.length))
      }
    }
    walk(root)
    // The migration has to name the dead value to rewrite it, and the type
    // documents why it went — everything else, component code included, is free
    // of it. Note the brief asked for "nowhere under frontend/src"; that is not
    // achievable while the migration still has to recognise old rows.
    expect(offenders.sort()).toEqual(['store/slices/settings.ts', 'types/store.ts'])
    expect(toolbarSource).not.toContain('v3-adaptive')
    expect(toolbarStyles).not.toContain('toolbarAdaptive')
  })

  test('an unknown persisted variant renders as the free toolbar, styled', () => {
    // `freePosition = !anchored` rather than an enumeration of `v1-free`: an
    // imported or hand-edited row must not render an unstyled — or invisible —
    // toolbar. A-M4: `toolbarFree` therefore keys off `freePosition`, not the
    // literal variant.
    expect(toolbarSource).toContain("const anchored = settings.variant === 'v2-settings-adjacent'")
    expect(toolbarSource).toContain('const freePosition = !anchored')
    expect(toolbarSource).toContain('freePosition && styles.toolbarFree')
    // The hover accent ring — the one V3 rule worth keeping — moved onto V1.
    expect(toolbarStyles).toContain('.rootFree:hover .toolbarFree')
    expect(toolbarStyles).toContain('.rootFree:focus-within .toolbarFree')
  })

  test('the single mount site needs no mount prop', () => {
    expect(toolbarSource).toContain('export function QuickToolbar() {')
    expect(toolbarSource).not.toContain('mount')
    expect(toolbarSource).not.toContain('QuickToolbarProps')
  })
})

describe('QT-2 — the rect is the toolbar', () => {
  test('.rootFree consumes all four rect variables as its own box', () => {
    const rule = declarations(toolbarStyles, '.rootFree')
    expect(rule).toContain('position: fixed')
    for (const [property, variable] of [
      ['left', '--quick-toolbar-x'],
      ['top', '--quick-toolbar-y'],
      ['width', '--quick-toolbar-width'],
      ['height', '--quick-toolbar-height'],
    ]) {
      expect(rule).toMatch(new RegExp(`${property}:\\s*var\\(${variable}`))
    }
    // …and the component publishes every one of them.
    for (const variable of [
      '--quick-toolbar-x',
      '--quick-toolbar-y',
      '--quick-toolbar-width',
      '--quick-toolbar-height',
      '--quick-toolbar-natural-width',
      '--quick-toolbar-natural-height',
    ]) {
      expect(toolbarSource).toContain(`'${variable}'`)
    }
    // The old shape wrote the rect as inline width/height on a `fit-content`
    // flex box and centred the nav in it, which is why dragging a handle moved
    // the toolbar instead of resizing it.
    expect(rule).not.toContain('justify-content: center')
    expect(rule).not.toContain('min-width: fit-content')
    expect(rule).not.toContain('min-height: fit-content')
  })

  test('the nav fills the rect instead of sizing itself', () => {
    const filler = rulesMentioning(toolbarStyles, '.toolbar')
      .find((rule) => /width:\s*100%/.test(rule.body) && /height:\s*100%/.test(rule.body))
    expect(filler?.selector).toBe('.rootFree .toolbar')
    // The hand-rolled vertical min-height formula is superseded by the measured
    // natural size.
    expect(declarations(toolbarStyles, '.toolbarVertical')).not.toContain('min-height')
  })

  test('scale is a content multiplier, not a transform', () => {
    const rule = declarations(toolbarStyles, '.toolbar')
    // A transform does not affect layout, so rect, rendered box and handle
    // positions could never agree while this was here.
    expect(rule).not.toContain('transform: scale(')
    expect(rule).toContain('var(--quick-toolbar-scale, 1)')
    // Rotation moved onto the root so the grip and the eight handles rotate with
    // the toolbar rather than detaching from it.
    expect(rule).not.toContain('rotate(var(--quick-toolbar-rotation')
    expect(declarations(toolbarStyles, '.rootFree')).toContain('rotate(var(--quick-toolbar-rotation, 0deg))')
  })

  test('every glyph is a React prop, so every glyph gets the scaled size', () => {
    // A-B5: only the *boxes* read `--quick-toolbar-icon-size`; the icons are
    // props. Dropping the transform without this would have frozen `scale` for
    // every glyph in the toolbar.
    expect(toolbarSource).toContain('const renderedIconSize = Math.round(iconSize * scale)')
    expect(toolbarSource).toContain("'--quick-toolbar-icon-size': `${renderedIconSize}px`")
    expect(toolbarSource).not.toMatch(/<(Icon|MoreHorizontal|SlidersHorizontal) size=\{iconSize\}/)
    for (const call of [
      '<Icon size={renderedIconSize} aria-hidden="true" />',
      '<Icon size={renderedIconSize} strokeWidth={1.75} aria-hidden="true" />',
      '<MoreHorizontal size={renderedIconSize} aria-hidden="true" />',
      '<SlidersHorizontal size={renderedIconSize} aria-hidden="true" />',
      '<GripVertical size={gripGlyph} />',
      '<GripHorizontal size={gripGlyph} />',
      'size={chevronGlyph}',
    ]) {
      expect(toolbarSource).toContain(call)
    }
    // V2 never scaled (`.toolbarAnchored { transform: none }`) and must not start.
    expect(toolbarSource).toContain('const rawScale = anchored ? 1 : settings.scale')
    // The sliders keep editing the *base* size — that is the value the user owns.
    expect(toolbarSource).toContain('value={iconSize}')
  })

  test('the natural size is measured, never computed', () => {
    // A-B4: `iconSize + 14` is `.item`'s min-width, `.itemLabel` is text up to
    // 88px, and border-box plus a 1px border costs 2px per axis — no formula can
    // land within 2.5x of a labelled toolbar.
    expect(toolbarSource).toContain("root.setAttribute('data-measuring', 'true')")
    expect(toolbarSource).toContain('node.getBoundingClientRect()')
    expect(toolbarSource).toContain("root.removeAttribute('data-measuring')")
    // getBoundingClientRect reports rendered pixels; the rect is in layout units.
    expect(toolbarSource).toContain('const uiScale = readUiScale()')
    expect(toolbarSource).toMatch(/box\.width \/ uiScale/)
    const probe = declarations(toolbarStyles, ".rootFree[data-measuring='true'] .toolbar")
    expect(probe).toContain('width: max-content')
    expect(probe).toContain('height: max-content')
  })

  test('the resolved rect and the bounds are memoised on scalars only', () => {
    // A-B2: `usePersistentRect`'s re-clamp effect lists `rect` by object
    // identity, so a freshly built object per render loops
    // render → effect → setDraftRect → render without bound.
    expect(toolbarSource).toMatch(/const resolvedRect = useMemo\(/)
    expect(toolbarSource).toMatch(/const bounds = useMemo\(/)
    // Both stored boxes *and* the orientation: the resolved rect is now
    // per-orientation, so a flip that did not re-run this memo would keep
    // rendering the other orientation's extents.
    expect(toolbarSource).toContain(
      '[settings.rect.x, settings.rect.y, settings.rect.width, settings.rect.height, settings.verticalSize.width, settings.verticalSize.height, orientation, naturalWidth, naturalHeight]',
    )
    expect(toolbarSource).toContain('[naturalWidth, naturalHeight]')
    // Both go into the hook by reference, never inline.
    expect(toolbarSource).toMatch(/usePersistentRect\(\{\s*\r?\n\s*rect: resolvedRect,\s*\r?\n\s*bounds,/)
    // The hard-coded floor is gone: a vertical toolbar can now shrink to about
    // icon width instead of being pinned at 180.
    expect(toolbarSource).not.toContain('minWidth: 180')
    expect(toolbarSource).toMatch(/import \{[^}]*\btoolbarRectBounds\b[^}]*\} from '@\/lib\/quickToolbarGeometry'/s)
    expect(toolbarSource).toContain('toolbarRectBounds({ width: naturalWidth, height: naturalHeight })')
    // The rect reaching the hook is selected per orientation before it is
    // resolved against the measurement — one shared rect is what made a flip
    // render the union of both orientations' boxes.
    expect(toolbarSource).toContain('selectToolbarRect(settings, orientation)')
    expect(toolbarSource).not.toContain('resolveToolbarRect(settings.rect,')
  })

  test('auto-fit survives a window resize', () => {
    // A-S6: the hook commits on every window resize (`keepInViewport`), which
    // would silently pin an auto rect to whatever size it happened to have.
    expect(toolbarSource).toContain("const pinsSize = mode !== null && mode !== 'move'")
    // Both branches go through the pure writers, which is what keeps the
    // *other* orientation's extents — auto sentinel included — out of the patch.
    expect(toolbarSource).toContain('? withToolbarRect(persisted, orientation, next)')
    expect(toolbarSource).toContain(': withToolbarPosition(persisted, next))')
    // The whole settings row, not just `.rect`: the writers need both boxes.
    expect(toolbarSource).toContain('const persisted = useStore.getState().quickToolbarSettings')
    expect(toolbarSource).not.toContain('useStore.getState().quickToolbarSettings.rect')
    // The mode is recorded by the component's own wrapper around startDrag, so a
    // commit can tell a drag apart from a viewport clamp.
    expect(toolbarSource).toContain('dragModeRef.current = mode')
    expect(toolbarSource).toContain('persistentRect.startDrag(mode, event)')
    expect(toolbarSource).toContain("beginDrag('move', event)")
    expect(toolbarSource).toContain('beginDrag(handle, event)')
  })

  test('the handles — and their blue dots — are gated on the new setting', () => {
    expect(toolbarSource).toContain(
      'freePosition && settings.resizeHandlesEnabled !== false && RESIZE_HANDLES.map(',
    )
    // The dots are `::after` on `.resizeHandle`, so not rendering the handles
    // removes them too.
    expect(toolbarStyles).toContain('.rootFree:hover .resizeHandle::after')
    // Exposed next to "Snap to edge" in the popover, and in the full modal.
    expect(toolbarSource).toContain('{ resizeHandlesEnabled: event.target.checked }')
    expect(modalSource).toContain('onChange={(resizeHandlesEnabled) => updateSettings({ resizeHandlesEnabled })}')
    // The grip is deliberately not gated — turning the handles off must not
    // strand the toolbar where it sits.
    expect(toolbarSource).toMatch(/className=\{clsx\(styles\.dragHandle, vertical && styles\.dragHandleVertical\)\}/)
  })
})

describe('QT-3 — the grip never covers a button', () => {
  test('a vertical toolbar moves the grip to its left edge', () => {
    expect(toolbarStyles).toContain('.dragHandleVertical')
    const rule = declarations(toolbarStyles, '.dragHandleVertical')
    expect(rule).toContain('left: -15px')
    expect(rule).toContain('top: 50%')
    expect(rule).toContain('translateY(-50%)')
    // Selected from the existing orientation flag, with the matching glyph.
    expect(toolbarSource).toContain('vertical && styles.dragHandleVertical')
    expect(toolbarSource).toContain('{vertical ? <GripVertical size={gripGlyph} /> : <GripHorizontal size={gripGlyph} />}')
  })

  test('the grip outranks the resize handles', () => {
    const zIndex = (selector: string) => Number(
      /z-index:\s*(-?\d+)/.exec(declarations(toolbarStyles, selector))?.[1] ?? Number.NaN,
    )
    // `.resize_n` (top: -4px, z-index: 3) used to steal the grip's lower ~7px in
    // both orientations.
    expect(zIndex('.dragHandle')).toBeGreaterThan(zIndex('.resizeHandle'))
    expect(zIndex('.resizeHandle')).toBe(3)
  })

  test('no resize band reaches outside the toolbar box', () => {
    const bands = rulesMentioning(toolbarStyles, '.resize_')
    expect(bands.length).toBeGreaterThan(4)
    for (const band of bands) {
      // Negative offsets are what put the handles in the grip's territory. The
      // toolbar carries 8px of padding, so an 8px band inside the edge covers no
      // button either.
      expect(band.body).not.toMatch(/(top|bottom|left|right):\s*-/)
    }
  })
})

describe('QT-4 — buttons toggle, and stay reachable', () => {
  test('the toolbar resolves an intent instead of always opening', () => {
    expect(actionsSource).toMatch(
      /import \{[^}]*\bresolveToolbarIntent\b[^}]*\} from '@\/lib\/quickToolbarToggle'/s,
    )
    expect(actionsSource).toContain('closeDrawer()')
    expect(actionsSource).toContain('closeSettings()')
    expect(actionsSource).toContain('const intent = resolveToolbarIntent(surface, readUi())')
    // Read at click time through getState(), the same idiom `updateSettings`
    // uses, so the catalog memo does not rebuild every action when a drawer opens.
    expect(actionsSource).toContain('const state = useStore.getState()')
    // Commands and extension input actions re-run; they have no surface to close.
    expect(actionsSource).toContain("surface: { kind: 'command' }")
  })

  test('the shared store actions stay open-only', () => {
    // The negative guard for the 20+ non-toolbar callers — websocket commands,
    // deep links, extension requests — that all mean "make visible".
    expect(uiSliceSource).toMatch(/openDrawer:[\s\S]{0,120}drawerOpen: true,/)
    expect(uiSliceSource).toContain('openSettings: (view = \'display\') =>')
    expect(uiSliceSource).toMatch(/set\(\{ settingsModalOpen: true, settingsActiveView: view \}\)/)
    // No conditional crept into either one.
    expect(uiSliceSource).not.toMatch(/drawerOpen: !/)
    expect(uiSliceSource).not.toMatch(/settingsModalOpen: !state/)
  })

  test('only closable surfaces advertise a pressed state', () => {
    // A card that shows a chevron is exactly a card that closes when pressed
    // again; a command shows neither.
    expect(toolbarSource).toContain("const closable = action.surface.kind !== 'command'")
    expect(toolbarSource).toContain('const active = closable && isSurfaceActive(action.surface, uiState)')
    for (const [, guard] of [...toolbarSource.matchAll(/aria-pressed=\{([^}]*)\}/g)]) {
      expect(guard).toBe('closable ? active : undefined')
    }
    expect(toolbarSource.match(/aria-pressed=/g)).toHaveLength(2)
    expect(toolbarSource).toContain('{closable && (')
    expect(toolbarStyles).toContain('.card[aria-pressed="true"]')
    expect(toolbarStyles).toContain('.cardChevronOpen')
  })

  test('one Settings button, not two', () => {
    // A-S4: the catalog dedupes on `id`, and `settings` vs
    // `settings:productivity` are different keys — so both could be visible,
    // each closing the other's modal.
    expect(actionsSource).toContain("const root = resolved.find((action) => action.id === 'settings')")
    expect(actionsSource).toContain("action.id !== 'settings' && action.surface.kind === 'settings' && action.surface.view === rootView")
  })

  test('the free toolbar is portaled out of the chat toolbar stacking context', () => {
    // `.chatToolbar` is z-index 8 and creates a stacking context, so at any
    // z-index the toolbar was buried under the SettingsModal it opened — and
    // could not be pressed again to close it. 10005 clears SettingsModal (10001)
    // and ModalShell (10002).
    expect(toolbarSource).toContain('if (!freePosition) return tree')
    expect(toolbarSource).toContain('return createPortal(tree, document.body)')
    expect(declarations(toolbarStyles, '.rootFree'))
      .toContain('z-index: var(--z-quick-toolbar-floating, 10005)')
    expect(themeVariables).toContain('--z-quick-toolbar-floating: 10005')
  })

  test('but yields to a modal that owns the screen, without burying itself', () => {
    // 10005 clears SettingsModal, which is what lets the toolbar be pressed again
    // to CLOSE the settings it opened. The cost: `WorldBookEditorModal`'s backdrop
    // is the same literal 10001, so no renumbering can separate the two cases and
    // the toolbar floated over the full lorebook editor. The seam is that the
    // store keeps them in different fields — `openSettings` never writes
    // `activeModal` — so keying on `activeModal` hides the toolbar over the full
    // editor while leaving the settings round-trip intact.
    expect(toolbarSource).toContain('if (activeModal && !restoredOverModal)')

    // Scoped to `freePosition`. V2 is in-flow in the chat dock and publishes
    // `--lcs-top-dock-height`; returning null for it would collapse that variable
    // and reflow the chat column on every modal open and close.
    const guard = toolbarSource.indexOf('if (activeModal && !restoredOverModal)')
    expect(toolbarSource.indexOf('if (!freePosition) return tree')).toBeLessThan(guard)

    // The escape hatch is opt-in, so the default path cannot strand the user with
    // no way back to the toolbar.
    expect(toolbarSource).toContain('settings.modalRestoreHandle === true')

    // The round-2 trap this must never re-create: an unrendered modal name would
    // set `activeModal` with nothing on screen, hiding the toolbar permanently.
    expect(toolbarSource).not.toContain("openModal('settings')")
  })
})

describe('QT-6 — the V2 cards fit', () => {
  test('the strip scrolls before cards shrink — reversed deliberately', () => {
    // This assertion used to pin `flex: 0 1 auto`, i.e. shrink cards to avoid a
    // scroll. That is the direct cause of the reported "the cards all look the
    // same": flex distributes the *deficit* proportionally, so past the row width
    // every card converges on the same size and the strip loses all hierarchy.
    // Cards now hold their intrinsic width and the strip scrolls, which is what
    // the `mask-image` below has always been there to announce.
    const card = declarations(toolbarStyles, '.card')
    expect(card).toContain('flex: 0 0 auto')
    expect(card).not.toContain('flex: 0 1 auto')
    expect(card).toContain('min-width: calc(var(--quick-toolbar-icon-size, 28px) + 24px)')
    const strip = declarations(toolbarStyles, '.cardStrip')
    expect(strip).toContain('max-width: 100%')
    expect(strip).not.toContain('1040px')
    expect(strip).toContain('flex-wrap: nowrap')
    expect(strip).toContain('mask-image')
  })
})
