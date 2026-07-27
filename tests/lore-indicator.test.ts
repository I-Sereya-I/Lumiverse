import { describe, expect, test } from 'bun:test'
import type { ActivatedWorldInfoEntry } from '../frontend/src/types/api'
import {
  buildLoreScanText,
  clampLoreFloatingPosition,
  clampLoreRect,
  findTriggeringSentence,
  formatCompactNumber,
  getActivationContext,
  getExactTriggerPhrase,
  getFloatingPanelPosition,
  getLastScannedSentence,
  matchesKeybind,
  searchLoreEntries,
  splitSentences,
} from '../frontend/src/components/lore-indicator/utils'
import { DEFAULT_LORE_INDICATOR_SETTINGS } from '../frontend/src/lib/uiProductivityDefaults'
import {
  layoutViewportSize,
  toLayoutDelta,
  toLayoutSize,
} from '../frontend/src/lib/zoomLayerGeometry'

const panelSource = await Bun.file(
  new URL('../frontend/src/components/lore-indicator/LoreIndicatorPanel.tsx', import.meta.url),
).text()
const indicatorSource = await Bun.file(
  new URL('../frontend/src/components/lore-indicator/LoreIndicator.tsx', import.meta.url),
).text()
const indicatorStyles = await Bun.file(
  new URL('../frontend/src/components/lore-indicator/LoreIndicator.module.css', import.meta.url),
).text()

/** Bodies of every rule whose selector list mentions `selector`. */
function cssRuleBodies(source: string, selector: string): string[] {
  const bodies: string[] = []
  const rule = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  // Comments carry commas and would otherwise be parsed as part of a selector list.
  source = source.replace(/\/\*[\s\S]*?\*\//g, '')
  while ((match = rule.exec(source)) !== null) {
    const targets = match[1].split(',').map((part) => part.trim())
    if (targets.some((part) => part === selector || part.startsWith(`${selector} `) || part.startsWith(`${selector}:`))) {
      bodies.push(match[2])
    }
  }
  return bodies
}

/** The V4 strip's own source, so portal assertions cannot be satisfied by V2/V5 code. */
const v4StripSource = indicatorSource.slice(
  indicatorSource.indexOf('function V4Strip('),
  indicatorSource.indexOf('function LoreIndicatorConfig('),
)

/** Everything before the V4 strip: the two variants that still position themselves in JS. */
const floatingSource = indicatorSource.slice(0, indicatorSource.indexOf('function V4Strip('))

const entry: ActivatedWorldInfoEntry = {
  id: 'entry-1',
  comment: 'Captain of the Accord',
  keys: ['accord', 'captain'],
  source: 'vector',
  activationType: 'vector',
  score: 0.83,
  bookId: 'book-1',
  bookName: 'LumiBooks - The Accord',
  activationOrder: 0,
  firstTriggeredForBook: true,
  estimatedTokens: 1_900,
  priority: 85,
  position: 18,
  depth: 0,
  preventRecursion: true,
}

describe('Lore Indicator helpers', () => {
  test('formats compact counts without a token suffix', () => {
    expect(formatCompactNumber(890)).toBe('890')
    expect(formatCompactNumber(5_600)).toBe('5.6k')
    expect(formatCompactNumber(5_600)).not.toContain('token')
  })

  test('matches configurable keyboard shortcuts exactly', () => {
    const event = {
      key: 'L',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent
    expect(matchesKeybind(event, 'Ctrl+Shift+L')).toBe(true)
    expect(matchesKeybind(event, 'Ctrl+L')).toBe(false)
    expect(matchesKeybind(event, '')).toBe(false)
  })

  test('uses only trace data for the exact trigger phrase', () => {
    expect(getExactTriggerPhrase({ ...entry, activationType: 'keyword', source: 'keyword' })).toBeNull()
    expect(getExactTriggerPhrase({
      ...entry,
      activationType: 'keyword',
      source: 'keyword',
      triggerPhrase: 'the exact accord phrase',
    })).toBe('the exact accord phrase')
  })

  test('normalizes all available activation context without fabricating missing values', () => {
    const traced: ActivatedWorldInfoEntry = {
      ...entry,
      activationType: 'keyword',
      source: 'keyword',
      triggerPhrase: 'the exact accord phrase',
      matchedPrimaryKeys: ['accord'],
      matchedSecondaryKeys: ['captain'],
      matchedBecause: 'Primary and secondary keys matched the message.',
      matchedContentPreview: 'QV serves as Captain of the Accord.',
      whyActivated: 'The current message referenced Accord command authority.',
      triggeringSentence: 'The captain invoked the Accord.',
    }
    expect(getActivationContext(traced)).toEqual({
      exactTriggerPhrase: 'the exact accord phrase',
      matchedPrimaryKeys: ['accord'],
      matchedSecondaryKeys: ['captain'],
      configuredPrimaryKeys: ['accord', 'captain'],
      matchedBecause: 'Primary and secondary keys matched the message.',
      matchedContentPreview: 'QV serves as Captain of the Accord.',
      whyActivated: 'The current message referenced Accord command authority.',
      triggeringExcerpt: 'The captain invoked the Accord.',
    })
    expect(getActivationContext(entry).triggeringExcerpt).toBeNull()
  })

  test('searches names, books, types, triggers, and activation evidence', () => {
    const traced = {
      ...entry,
      triggerPhrase: 'the exact accord phrase',
      matchedBecause: 'semantic authority match',
      triggeringSentence: 'The captain issued an order.',
    }
    for (const query of ['captain', 'lumibooks', 'vector', 'exact accord', 'authority', 'issued an order', '0.83']) {
      expect(searchLoreEntries([traced], query)).toEqual([traced])
    }
    expect(searchLoreEntries([traced], 'missing')).toEqual([])
  })

  test('clamps floating controls and their panels inside the viewport', () => {
    expect(clampLoreFloatingPosition(
      { x: 900, y: 700 },
      { width: 72, height: 32 },
      { width: 1024, height: 768 },
    )).toEqual({ x: 900, y: 700 })

    expect(getFloatingPanelPosition(
      { x: 900, y: 700 },
      { width: 72, height: 32 },
      { width: 340, height: 430 },
      { width: 1024, height: 768 },
    )).toEqual({ x: 672, y: 262 })
  })

  test('clamps persisted command palette position and size to the viewport', () => {
    expect(clampLoreRect(
      { x: 900, y: 700, width: 1_200, height: 900 },
      { width: 1_024, height: 768 },
    )).toEqual({
      x: 16,
      y: 16,
      width: 992,
      height: 736,
    })

    expect(clampLoreRect(
      { x: -80, y: -40, width: 300, height: 200 },
      { width: 1_024, height: 768 },
    )).toEqual({
      x: 16,
      y: 16,
      width: 560,
      height: 360,
    })
  })
})

describe('triggering sentence extraction', () => {
  const message = [
    'She stepped into the hall without a word.',
    'The captain invoked the Accord before anyone could object!',
    'Nobody moved.',
  ].join(' ')

  test('splits scanned text into sentences, keeping quoted dialogue intact', () => {
    expect(splitSentences(message)).toEqual([
      'She stepped into the hall without a word.',
      'The captain invoked the Accord before anyone could object!',
      'Nobody moved.',
    ])
    expect(splitSentences('"That was a lot to waste," she said. Then silence.')).toEqual([
      '"That was a lot to waste," she said.',
      'Then silence.',
    ])
    expect(splitSentences('first line\nsecond line')).toEqual(['first line', 'second line'])
  })

  test('returns only the sentence the key appeared in', () => {
    expect(findTriggeringSentence(message, ['accord'])).toEqual({
      sentence: 'The captain invoked the Accord before anyone could object!',
      phrase: 'accord',
    })
    expect(findTriggeringSentence(message, ['captain'])?.sentence)
      .toBe('The captain invoked the Accord before anyone could object!')
    expect(findTriggeringSentence(message, ['dragon'])).toBeNull()
    expect(findTriggeringSentence('', ['accord'])).toBeNull()
    expect(findTriggeringSentence(message, [])).toBeNull()
  })

  test('matches whole words so a key cannot fire on a substring', () => {
    expect(findTriggeringSentence('They discorded loudly.', ['cord'])).toBeNull()
    expect(findTriggeringSentence('The cord snapped.', ['cord'])?.phrase).toBe('cord')
  })

  test('derives the trigger sentence for keyword entries instead of the whole message', () => {
    const keywordEntry: ActivatedWorldInfoEntry = {
      ...entry,
      activationType: 'keyword',
      source: 'keyword',
      keys: ['accord'],
    }
    const context = getActivationContext(keywordEntry, message)
    expect(context.triggeringExcerpt).toBe('The captain invoked the Accord before anyone could object!')
    expect(context.triggeringExcerpt).not.toContain('Nobody moved')
    expect(context.exactTriggerPhrase).toBe('accord')
    expect(context.matchedPrimaryKeys).toEqual(['accord'])

    // No configured key present in the scanned text: report nothing rather than
    // falling back to the entire generation query.
    expect(getActivationContext({ ...keywordEntry, keys: ['dragon'] }, message).triggeringExcerpt).toBeNull()
    // Constant entries never derive a sentence.
    expect(getActivationContext({ ...keywordEntry, activationType: 'constant' }, message).triggeringExcerpt).toBeNull()
  })

  test('reported trace data still wins over the derived sentence', () => {
    const context = getActivationContext({
      ...entry,
      activationType: 'keyword',
      source: 'keyword',
      keys: ['accord'],
      triggeringSentence: 'Server-provided excerpt.',
    }, message)
    expect(context.triggeringExcerpt).toBe('Server-provided excerpt.')
  })

  test('falls back to the closing scanned sentence for semantic hits', () => {
    expect(getLastScannedSentence(message)).toBe('Nobody moved.')
    expect(getLastScannedSentence('')).toBeNull()
  })

  test('the scan corpus excludes the reply that activation produced', () => {
    // `activatedWorldInfo` is emitted while the prompt is assembled, so by the time
    // the panel renders the chat already holds the reply. Scanning it would let a key
    // match text that was never scanned and be reported as the trigger.
    const scan = buildLoreScanText('the query preview', [
      { content: 'user asks about the Accord', is_user: true },
      { content: 'an earlier reply', is_user: false },
      { content: 'the last thing the user typed', is_user: true },
      { content: 'the reply activation produced', is_user: false },
    ])
    expect(scan).not.toContain('the reply activation produced')
    // Only the *trailing* run is dropped — history the scan did see stays.
    expect(scan).toContain('an earlier reply')
    // The last user message is exactly what triggered the scan, so it must be there.
    expect(scan).toContain('the last thing the user typed')
    // queryPreview leads the corpus.
    expect(scan.startsWith('the query preview')).toBe(true)
    expect(scan.split('\n')).toEqual([
      'the query preview',
      'user asks about the Accord',
      'an earlier reply',
      'the last thing the user typed',
    ])
  })

  test('drops every trailing reply in a group chat, not just the last one', () => {
    const scan = buildLoreScanText('the query preview', [
      { content: 'user asks about the Accord', is_user: true },
      { content: 'Aria answers', is_user: false },
      { content: 'Brenn answers', is_user: false },
      { content: 'Cass answers', is_user: false },
    ])
    for (const reply of ['Aria answers', 'Brenn answers', 'Cass answers']) {
      expect(scan).not.toContain(reply)
    }
    expect(scan).toBe('the query preview\nuser asks about the Accord')
  })

  test('drops nothing when the history already ends on a user message', () => {
    const scan = buildLoreScanText('the query preview', [
      { content: 'an earlier reply', is_user: false },
      { content: 'the last thing the user typed', is_user: true },
    ])
    expect(scan).toBe('the query preview\nan earlier reply\nthe last thing the user typed')
  })

  test('keeps the corpus to the configured history depth', () => {
    const messages = [
      { content: 'oldest', is_user: true },
      { content: 'older', is_user: false },
      { content: 'newer', is_user: true },
      { content: 'newest', is_user: true },
      { content: 'pending reply', is_user: false },
    ]
    expect(buildLoreScanText('preview', messages, 2)).toBe('preview\nnewer\nnewest')
    expect(buildLoreScanText('preview', messages, 10)).toBe('preview\noldest\nolder\nnewer\nnewest')
    // Empty and missing inputs degrade to the preview alone rather than throwing.
    expect(buildLoreScanText('preview', [])).toBe('preview')
    expect(buildLoreScanText(null, [{ content: 'only reply', is_user: false }])).toBe('')
  })

  test('the panel derives context from the scan text rather than printing queryPreview', () => {
    expect(panelSource).toContain('export function useLoreScanText()')
    expect(panelSource).toContain('getActivationContext(entry, scanText)')
    expect(panelSource).toContain('<dt>Triggering sentence</dt>')
    expect(panelSource).not.toContain('generationContext')
    expect(panelSource).not.toContain('stats?.queryPreview}')
  })
})

describe('Lore Indicator V4 and V5 presentation', () => {
  test('defaults expose the new V4 grouping and V5 hint settings', () => {
    expect(DEFAULT_LORE_INDICATOR_SETTINGS.v4GroupBy).toBe('lorebook')
    expect(DEFAULT_LORE_INDICATOR_SETTINGS.v4BookPreviewCount).toBe(4)
    expect(DEFAULT_LORE_INDICATOR_SETTINGS.v5ShowShortcutHints).toBe(true)
  })

  test('V4 renders in place and can reach the full lorebook view', () => {
    expect(indicatorSource).toContain('onOpenFullView')
    expect(indicatorSource).toContain("groupBy={settings.v4GroupBy ?? 'lorebook'}")
    expect(indicatorSource).toContain('previewCount={settings.v4BookPreviewCount ?? 4}')
  })

  test('the indicator never re-mounts itself into the chat composer', () => {
    // The strip used to portal into `[data-spindle-mount="chat_toolbar"]`'s first child —
    // an extension mount point it was squatting on. When the lookup missed it returned
    // null and the indicator silently vanished. It is now a plain child of its host dock.
    expect(indicatorSource).not.toContain('data-spindle-mount')
    expect(indicatorSource).not.toContain('MutationObserver')
    expect(indicatorSource).not.toContain('composerTarget')
    // The V4 path portals nothing; V2/V5 keep their own portals, so this is scoped.
    expect(v4StripSource).not.toContain('createPortal')
    expect(v4StripSource).not.toContain('document.body')
    // No JS popover positioning: nothing crosses the `body > * { zoom }` boundary.
    expect(v4StripSource).not.toContain('window.innerHeight')
    expect(v4StripSource).not.toContain('getBoundingClientRect')
  })

  test('V4 popovers open upward inside the strip root rather than over the composer', () => {
    const popover = cssRuleBodies(indicatorStyles, '.v4PanelPopover').join('\n')
    const config = cssRuleBodies(indicatorStyles, '.v4ConfigPopover').join('\n')
    for (const body of [popover, config]) {
      expect(body).toContain('position: absolute')
      expect(body).toContain('bottom: 100%')
      expect(body).toContain('left: 0')
      expect(body).toContain('right: 0')
      expect(body).toContain('max-height: min(560px, calc(100vh - 180px))')
      expect(body).toContain('flex-direction: column')
    }
    // A fixed height fought the popover's own max-height; the panel must scroll instead.
    expect(popover).not.toMatch(/(?:^|[^-\w])height\s*:/m)
    // The dock owns the app-level stacking claim; the popovers only beat their sibling.
    expect(popover).not.toContain('z-index: 10012')
    expect(popover).toContain('z-index: 1')
  })

  test('the V4 root fills its dock so the panel spans the chat column', () => {
    // `.composerRoot` was `display: inline-flex`, i.e. shrink-to-fit — `left: 0; right: 0`
    // would have resolved to the strip's own width, a ~200px sliver.
    const root = cssRuleBodies(indicatorStyles, '.composerRoot').join('\n')
    expect(root).toContain('display: flex')
    expect(root).not.toContain('inline-flex')
    expect(root).toContain('width: 100%')
    expect(root).toContain('min-width: 0')
    expect(root).toContain('position: relative')
  })

  test('the indicator stays mounted for every enabled variant', () => {
    // Only the ChatView-side dock wrapper is conditional. `v2-compact` is the default
    // variant and renders its own fixed floating root, so an early `return null` outside
    // the `settings.enabled` guard would make the indicator vanish for most users.
    const returnsNull = [...indicatorSource.matchAll(/return null/g)]
    expect(returnsNull).toHaveLength(1)
    expect(indicatorSource).toContain('if (!settings.enabled) return null')
  })

  test('a single click selects in the drawer but activates from the V4 strip', () => {
    // In the drawer's Activated Lore tab a click should reveal the entry's detail;
    // navigating away on the first click made the panel impossible to read.
    expect(panelSource).toContain('activateOnClick?: boolean')
    expect(panelSource).toContain('activateOnClick = false')
    expect(panelSource).toContain('onClick={() => activateOnClick ? navigate(entry) : setSelectedId(entry.id)}')
    // Double click still navigates in both modes.
    expect(panelSource).toContain('onDoubleClick={() => navigate(entry)}')
    // The V4 strip's popover is transient, so there it opts into navigate-on-click.
    expect(indicatorSource).toMatch(/<LoreIndicatorPanel\s+mode="expanded"\s+activateOnClick/)
  })

  test('V4 groups collapse to a "+N more" affordance', () => {
    expect(panelSource).toContain('const hidden = groupEntries.length - shown.length')
    expect(panelSource).toContain('+ {hidden} more')
  })

  test('V5 exposes type filters, activation detail, and keyboard navigation', () => {
    expect(panelSource).toContain('aria-label="Filter by activation type"')
    expect(panelSource).toContain("if (event.key === 'ArrowDown' || event.key === 'ArrowUp')")
    expect(panelSource).toContain("if (event.key === 'Enter' && selected)")
    expect(panelSource).toContain('styles.paletteFooter')
  })
})

/** Source with comments removed, so prose about an API cannot satisfy or break a guard. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\S\n]*\/\/.*$/gm, '')
}

describe('V2 and V5 speak the zoom layer’s coordinate space', () => {
  const floatingCode = code(floatingSource)

  test('the file uses the shared geometry helpers instead of a private scale parser', () => {
    expect(indicatorSource).toContain("from '@/lib/zoomLayerGeometry'")
    // A fourth hand-rolled copy of the scale read is how these spaces drifted apart before.
    expect(indicatorSource).not.toContain("getPropertyValue('--lumiverse-ui-scale')")
  })

  test('no rendered-pixel API survives at a V2/V5 positioning call site', () => {
    for (const api of [
      'window.innerWidth',
      'window.innerHeight',
      'getBoundingClientRect',
      'offsetWidth',
      'offsetHeight',
    ]) {
      expect(floatingCode).not.toContain(api)
    }
    expect(floatingCode).toContain('layoutViewportSize()')
    expect(floatingCode).toContain('layoutElementSize(floatingRef.current, FLOATING_FALLBACK_SIZE)')
  })

  test('the trigger is measured in one space at all three of its call sites', () => {
    // `:238` used to read `offsetWidth` (layout px) while `:108` and `:147` read
    // `getBoundingClientRect()` (rendered px) off the *same* element, so the file disagreed
    // with itself at every scale except 1.
    expect(floatingCode.match(/layoutElementSize\(floatingRef\.current, FLOATING_FALLBACK_SIZE\)/g))
      .toHaveLength(3)
    expect(floatingCode).toContain('const FLOATING_FALLBACK_SIZE = { width: 72, height: 32 }')
  })

  test('every pointer delta is converted before it reaches a position or a rect', () => {
    // V2 drag, V5 drag, V5 resize.
    expect(floatingCode.match(/toLayoutDelta\(/g)).toHaveLength(3)
    // The three shipped bugs, expressed literally. None may come back.
    expect(floatingCode).not.toMatch(/[+\-]\s*moveEvent\.client[XY]/)
    expect(floatingCode).not.toMatch(/startRect\.(?:x|y|width|height)\s*\+\s*moveEvent/)
    expect(floatingCode).not.toMatch(/positionStart\.[xy]\s*\+\s*delta[XY]/)
  })

  test('the V4 strip is still free of all of it', () => {
    expect(v4StripSource).not.toContain('toLayoutDelta')
    expect(v4StripSource).not.toContain('layoutViewportSize')
    expect(v4StripSource).not.toContain('getBoundingClientRect')
  })

  test('the pure clamps stay unit-agnostic, so the fix cannot be pushed down into them', () => {
    // They clamp in whatever units they are handed. Same shape, two spaces, both correct.
    expect(clampLoreFloatingPosition({ x: 5_000, y: 0 }, { width: 72, height: 32 }, { width: 1_536, height: 864 }))
      .toEqual({ x: 1_452, y: 12 })
    expect(clampLoreFloatingPosition({ x: 5_000, y: 0 }, { width: 90, height: 40 }, { width: 1_920, height: 1_080 }))
      .toEqual({ x: 1_818, y: 12 })
    expect(clampLoreRect({ x: 0, y: 0, width: 9_999, height: 9_999 }, { width: 1_190, height: 615.625 }))
      .toEqual({ x: 16, y: 16, width: 1_158, height: 583.625 })
  })
})

/**
 * End-to-end placement, checked against numbers measured in headless Chrome 150 on a standalone
 * page reproducing `body > * { zoom: var(--lumiverse-ui-scale, 1) }` at a 1904 x 985 viewport.
 * Reasoning about this without measuring is how the previous round shipped a wrong mechanism.
 */
describe('measured V2/V5 placement across UI scales', () => {
  const RENDERED = { innerWidth: 1904, innerHeight: 985 }
  const TRIGGER = { width: 72, height: 32 }
  const MARGIN = 12

  const cases = [
    // `rect` is what Chrome's getBoundingClientRect() returned for the 72x32 trigger.
    { scale: 0.8, rect: { width: 57.594, height: 25.594 }, oldRight: 1525.109, newRight: 1894.391, oldDragTravel: 320, oldResizeGrowth: 160, columns: 9 },
    { scale: 1.0, rect: { width: 72, height: 32 }, oldRight: 1892, newRight: 1892, oldDragTravel: 400, oldResizeGrowth: 200, columns: 7 },
    { scale: 1.3, rect: { width: 93.594, height: 41.594 }, oldRight: 2431.516, newRight: 1888.391, oldDragTravel: 520, oldResizeGrowth: 260, columns: 6 },
    { scale: 1.6, rect: { width: 115.188, height: 51.188 }, oldRight: 2958.078, newRight: 1884.797, oldDragTravel: 640, oldResizeGrowth: 320, columns: 4 },
  ]

  /** Chrome paints a layout-px offset at `layoutX * scale` device px (measured, all four scales). */
  const renderedRight = (layoutX: number, scale: number) => (layoutX + TRIGGER.width) * scale

  test('the shipped code parks the pill hundreds of pixels off-screen', () => {
    for (const { scale, rect, oldRight } of cases) {
      const parked = clampLoreFloatingPosition(
        { x: 99_999, y: 99_999 },
        rect, // rendered px, as the old `getBoundingClientRect()` call site passed them
        { width: RENDERED.innerWidth, height: RENDERED.innerHeight }, // rendered px too
        MARGIN,
      )
      expect(renderedRight(parked.x, scale)).toBeCloseTo(oldRight, 0)
    }
    // Above 1 the pill hangs off the right edge and the resize handler re-clamps it to the same
    // wrong bound, so it is unrecoverable. Below 1 it cannot reach the edge at all.
    expect(cases[3].oldRight - RENDERED.innerWidth).toBeGreaterThan(1_000)
    expect(cases[2].oldRight - RENDERED.innerWidth).toBeGreaterThan(500)
    expect(RENDERED.innerWidth - cases[0].oldRight).toBeGreaterThan(370)
  })

  test('the fixed code lands the pill exactly one 12px layout margin inside the edge', () => {
    for (const { scale, rect, newRight } of cases) {
      const parked = clampLoreFloatingPosition(
        { x: 99_999, y: 99_999 },
        toLayoutSize(rect, scale),
        layoutViewportSize(undefined, scale, RENDERED),
        MARGIN,
      )
      const right = renderedRight(parked.x, scale)
      expect(right).toBeCloseTo(newRight, 0)
      expect(RENDERED.innerWidth - right).toBeCloseTo(MARGIN * scale, 0)
    }
  })

  test('a 400px cursor drag moves the surface 400px, at every scale', () => {
    for (const { scale, oldDragTravel } of cases) {
      expect(toLayoutDelta(400, 0, scale).x * scale).toBeCloseTo(400, 6)
      // What the raw delta did instead: the pill outran the cursor and detached from it.
      expect(400 * scale).toBeCloseTo(oldDragTravel, 6)
    }
  })

  test('a 200px V5 resize drag grows the palette 200px, at every scale', () => {
    for (const { scale, oldResizeGrowth } of cases) {
      const grown = 960 + toLayoutDelta(200, 0, scale).x
      expect((grown - 960) * scale).toBeCloseTo(200, 6)
      expect(200 * scale).toBeCloseTo(oldResizeGrowth, 6)
    }
  })

  test('the popover column count follows the layout viewport rather than the screen', () => {
    for (const { scale, columns } of cases) {
      const viewport = layoutViewportSize(undefined, scale, RENDERED)
      expect(Math.max(1, Math.floor((viewport.width - 24) / 240))).toBe(columns)
      // The old maths read the rendered viewport and so returned 7 whatever the user chose.
      expect(Math.max(1, Math.floor((RENDERED.innerWidth - 24) / 240))).toBe(7)
    }
  })
})
