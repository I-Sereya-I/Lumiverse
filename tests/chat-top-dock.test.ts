import { describe, expect, test } from 'bun:test'
import { dockActionControlSize } from '../frontend/src/lib/chatSurfaceLayout'

const chatStyles = await Bun.file('frontend/src/components/chat/ChatView.module.css').text()
const chatSource = await Bun.file('frontend/src/components/chat/ChatView.tsx').text()
const toolbarStyles = await Bun.file(
  'frontend/src/components/quick-toolbar/QuickToolbar.module.css',
).text()
const toolbarSource = await Bun.file(
  'frontend/src/components/quick-toolbar/QuickToolbar.tsx',
).text()

/**
 * Declarations of the first rule whose selector matches exactly.
 *
 * Anchored to the start of a line: unanchored, `.cardStripSettings` also matches
 * inside `.cardStrip[data-density='compact'] .cardStripSettings`, which sits
 * ~110 lines EARLIER in the stylesheet and would silently return the compact
 * override's declarations instead of the base rule's.
 */
function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'ms'))?.[1] ?? ''
}

describe('the dock action buttons size with the cards they sit beside', () => {
  test('comfortable matches .cardStripSettings, compact matches its override', () => {
    // These two are ChatView's children, so they cannot read the toolbar's inline
    // `--quick-toolbar-icon-size`. The number is computed instead, and has to come
    // out identical to the gear's `calc(icon + 20px)` / compact `calc(icon + 8px)`.
    expect(dockActionControlSize({ iconSize: 28, density: 'comfortable' })).toBe(48)
    expect(dockActionControlSize({ iconSize: 28, density: 'compact' })).toBe(36)
    expect(dockActionControlSize({ iconSize: 21, density: 'comfortable' })).toBe(41)
    expect(dockActionControlSize({ iconSize: 21, density: 'compact' })).toBe(29)

    // The formulas this mirrors. If either moves, this test is the tripwire.
    expect(declarations(toolbarStyles, '.cardStripSettings'))
      .toContain('calc(var(--quick-toolbar-icon-size, 28px) + 20px)')
    expect(toolbarStyles)
      .toContain("[data-density='compact'] .cardStripSettings")
    expect(toolbarStyles).toContain('calc(var(--quick-toolbar-icon-size, 28px) + 8px)')
  })

  test('an unusable icon size falls back rather than collapsing the button', () => {
    // A 0/NaN slider value would otherwise produce a 20px-tall button, or `NaNpx`
    // — which drops the declaration and silently reverts to the 28px circle.
    expect(dockActionControlSize({ iconSize: 0, density: 'comfortable' })).toBe(48)
    expect(dockActionControlSize({ iconSize: -4, density: 'comfortable' })).toBe(48)
    expect(dockActionControlSize({ iconSize: Number.NaN, density: 'compact' })).toBe(36)
  })

  test('an unknown density takes the roomier default', () => {
    // Same rule the dock-mode helpers use for an unrecognised variant.
    expect(dockActionControlSize({ iconSize: 28, density: 'spacious' })).toBe(48)
    expect(dockActionControlSize({ iconSize: 28, density: '' })).toBe(48)
  })
})

describe('the strip is one centred group, not a toolbar plus two strays', () => {
  test('the toolbar slot no longer stretches across the chat column', () => {
    // `flex: 1 1 auto` here is the whole reported asymmetry: it grew the toolbar
    // to the full column width and pinned the two dock buttons to the far right.
    const slot = declarations(chatStyles, ".chatToolbar[data-dock-mode='strip'] .topDockToolbarSlot")
    expect(slot).toContain('flex: 0 1 auto')
    expect(slot).not.toContain('flex: 1 1 auto')

    const slotChildren = declarations(
      chatStyles,
      ".chatToolbar[data-dock-mode='strip'] .topDockToolbarSlot > *",
    )
    expect(slotChildren).toContain('flex: 0 1 auto')
    expect(slotChildren).not.toContain('flex: 1 1 auto')
  })

  test('the row centres and keeps the card rhythm', () => {
    const strip = declarations(chatStyles, ".chatToolbar[data-dock-mode='strip']")
    expect(strip).toContain('justify-content: center')
    expect(strip).not.toContain('justify-content: flex-start')
    // 6px is `.cardStrip`'s own gap — the buttons must continue that rhythm.
    expect(strip).toContain('gap: 6px')
    expect(declarations(toolbarStyles, '.cardStrip')).toContain('gap: 6px')
  })

  test('floating mode is left byte-identical via display: contents', () => {
    // Both wrappers must disappear from the box tree outside strip mode, or the
    // absolutely-positioned top-right cluster gains two stray flex containers.
    expect(declarations(chatStyles, '.topDockToolbarSlot')).toContain('display: contents')
    expect(declarations(chatStyles, '.topDockActions')).toContain('display: contents')
    expect(chatSource).toContain('<div className={styles.topDockActions}>{children}</div>')
  })

  test('the CSS variables are only published in strip mode', () => {
    // Publishing them unconditionally would resize the floating cluster's buttons
    // too, where there are no cards to match and 28px is correct.
    expect(chatSource).toContain("const strip = mode === 'strip'")
    expect(chatSource).toContain('--lcs-dock-control-size')
    expect(chatSource).toContain('--lcs-dock-icon-size')
    expect(chatSource).toMatch(/style=\{strip\s*\r?\n?\s*\?/)
    expect(chatSource).toContain(': undefined}')
  })
})

describe('the dock buttons read as card siblings', () => {
  test('they take the card box, radius and border rungs', () => {
    const btn = declarations(chatStyles, ".chatToolbar[data-dock-mode='strip'] .toolbarBtn")
    expect(btn).toContain('width: var(--lcs-dock-control-size, 48px)')
    expect(btn).toContain('height: var(--lcs-dock-control-size, 48px)')
    // A 999px pill beside square-ish cards is the tell that they are foreign.
    expect(btn).toContain('border-radius: var(--lumiverse-radius-md)')
    expect(btn).not.toContain('border-radius: 999px')
    expect(btn).toContain('--lumiverse-border-hover')
    expect(btn).toContain('--lumiverse-surface-raised')
    // The base rule dims them to 0.72; cards are not dimmed.
    expect(btn).toContain('opacity: 1')
  })

  test('the base 28px circle survives for floating mode', () => {
    const base = declarations(chatStyles, '.toolbarBtn')
    expect(base).toContain('width: 28px')
    expect(base).toContain('border-radius: 999px')
    expect(base).toContain('opacity: 0.72')
  })

  test('the icons scale with the slider instead of staying at size={14}', () => {
    // lucide `size` writes width/height ATTRIBUTES, which CSS outranks — so this
    // works without touching the JSX. If someone "fixes" it in JSX instead, the
    // two sources will fight.
    expect(chatSource).toContain('<BookOpen size={14} />')
    const icon = declarations(chatStyles, ".chatToolbar[data-dock-mode='strip'] .toolbarBtn svg")
    expect(icon).toContain('width: var(--lcs-dock-icon-size, 21px)')
    expect(icon).toContain('height: var(--lcs-dock-icon-size, 21px)')
  })

  test('the select-mode active state is restated at strip specificity', () => {
    // `.toolbarBtnActive` is (0,1,0) and earlier in the file than the (0,2,0)
    // strip rule, so without this the toggle loses its on-state in strip mode.
    const active = declarations(chatStyles, ".chatToolbar[data-dock-mode='strip'] .toolbarBtnActive")
    expect(active).toContain('--lumiverse-primary-050')
    expect(active).toContain('--lumiverse-primary-015')
  })

  test('every colour is a theme token, never a literal', () => {
    const stripBlock = chatStyles.slice(chatStyles.indexOf(".chatToolbar[data-dock-mode='strip'] .toolbarBtn"))
    expect(stripBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(stripBlock).not.toMatch(/rgba?\(\s*\d/)
  })
})

describe('the anchored dock row is one evenly-gapped rank of free-standing boxes', () => {
  test('the anchored toolbar is a bare rail, not a bordered container', () => {
    // The reported asymmetry: a bordered, padded container wrapped only the cards
    // and the gear, so its own chrome was added to the gap on the dock-button side
    // and every control could not sit on one rhythm. Anchored mode unsets all of
    // it — the controls carry their own borders.
    const anchoredRail = declarations(toolbarStyles, '.toolbarAnchored')
    expect(anchoredRail).toContain('padding: 0')
    expect(anchoredRail).toContain('border: 0')
    expect(anchoredRail).toContain('background: transparent')
    expect(anchoredRail).toContain('box-shadow: none')
    expect(anchoredRail).toContain('backdrop-filter: none')

    // Source order is the whole mechanism: both rules are (0,1,0) and land on the
    // same element, so the unset only wins by sitting later in the sheet.
    expect(toolbarStyles.indexOf('.toolbar {')).toBeLessThan(toolbarStyles.indexOf('.toolbarAnchored {'))
  })

  test('the floating surface KEEPS its border, background and shadow', () => {
    // A free-floating toolbar sits over arbitrary chat content; without its own
    // surface it is unreadable. The unset must never reach it.
    const surface = declarations(toolbarStyles, '.toolbar')
    expect(surface).toContain('border: 1px solid var(--lumiverse-border')
    expect(surface).toContain('background: color-mix(')
    expect(surface).toContain('box-shadow:')
    expect(surface).toContain('backdrop-filter: blur(')

    // `.toolbarAnchored` is applied on the anchored branch and nowhere else, and
    // the free branch is the one that takes `.toolbarFree`.
    expect(toolbarSource).toContain('clsx(styles.toolbar, styles.toolbarAnchored, styles.cardStrip)')
    expect(toolbarSource.match(/styles\.toolbarAnchored/g)).toHaveLength(1)
    expect(toolbarSource).toContain('freePosition && styles.toolbarFree')
  })

  test('one 6px gap runs the whole row, and nothing adds to it', () => {
    // cards ↔ cards ↔ gear ↔ launcher ↔ select-mode: four sources, one number.
    expect(declarations(toolbarStyles, '.cardStrip')).toContain('gap: 6px')
    expect(declarations(chatStyles, ".chatToolbar[data-dock-mode='strip']")).toContain('gap: 6px')
    expect(declarations(chatStyles, ".chatToolbar[data-dock-mode='strip'] .topDockActions"))
      .toContain('gap: 6px')

    // The two former offenders. `padding-inline: 12px` on the strip reserved the
    // mask ramp and sat between the gear and the first dock button (12 + 6 = 18px
    // against 6px between cards) while shifting the visible row 6px off centre;
    // the gear's 2px margin made the card→gear gap 8px.
    const strip = declarations(toolbarStyles, '.cardStrip')
    expect(strip).not.toMatch(/^\s*padding/m)
    // `^\s*margin` and not `toContain`: both rules carry a comment naming the
    // declaration they dropped, and a comment is not a declaration.
    expect(declarations(toolbarStyles, '.cardStripSettings')).not.toMatch(/^\s*margin/m)

    // No padding anywhere on the rail either — that is also what keeps the row's
    // height exactly what the tallest control asks for.
    expect(declarations(toolbarStyles, '.toolbarAnchored')).toContain('padding: 0')
  })

  test('the strip fades only where content is actually scrolled out', () => {
    // Was an unconditional `mask-image`, which is why 12px of padding had to be
    // reserved for it. Now: no mask while everything fits, and a ramp on the side
    // that has something hidden behind it.
    expect(declarations(toolbarStyles, '.cardStrip')).toContain('mask-image: none')
    expect(toolbarStyles).toContain(".cardStrip[data-overflow='start']")
    expect(toolbarStyles).toContain(".cardStrip[data-overflow='end']")
    expect(toolbarStyles).toContain(".cardStrip[data-overflow='both']")
    expect(toolbarStyles).not.toContain(".cardStrip[data-overflow='none']")

    expect(toolbarSource).toContain('data-overflow={stripOverflow}')
    // Layout px on both sides of the comparison: `body > * { zoom }` means a
    // `getBoundingClientRect()` reading here would be in a different unit.
    expect(toolbarSource).toContain('node.scrollLeft + node.clientWidth < node.scrollWidth - 1')
    expect(toolbarSource).not.toMatch(/stripOverflow[\s\S]{0,400}getBoundingClientRect/)
  })
})
