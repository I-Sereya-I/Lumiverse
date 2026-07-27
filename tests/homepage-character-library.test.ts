import { describe, expect, test } from 'bun:test'
import {
  TAG_COLOR_SLOTS,
  getTagColor,
  getTagColorIndex,
  getTagColorVar,
} from '../frontend/src/lib/tagColors'

const componentSource = await Bun.file(
  new URL('../frontend/src/components/landing/HomepageCharacterLibrary.tsx', import.meta.url),
).text()
const componentStyles = await Bun.file(
  new URL('../frontend/src/components/landing/HomepageCharacterLibrary.module.css', import.meta.url),
).text()
const hookSource = await Bun.file(
  new URL('../frontend/src/hooks/useHomepageCharacterLibrary.ts', import.meta.url),
).text()
const tagColorsSource = await Bun.file(
  new URL('../frontend/src/lib/tagColors.ts', import.meta.url),
).text()
const themeVariables = await Bun.file(
  new URL('../frontend/src/theme/variables.css', import.meta.url),
).text()
const cssReferenceSource = await Bun.file(
  new URL('../frontend/src/components/modals/ComponentCssReference.tsx', import.meta.url),
).text()

/** Strip comments so a token named in prose is not mistaken for a real read. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const liveStyles = stripComments(componentStyles)
/** Doc comments here spell out `var(--lumiverse-tag-N)` as prose; strip them too. */
const liveTagColors = stripComments(tagColorsSource)

/** Every `--lumiverse-*` name the theme actually defines. */
const definedTokens = new Set(
  [...themeVariables.matchAll(/(--lumiverse-[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]),
)

/**
 * Every `--lumiverse-*` name this component reads — with OR without a fallback.
 *
 * `tests/quick-toolbar.test.ts` only collects BARE reads, which is why the five phantom
 * tokens below survived so long: each carried `var(--phantom, #slate)`, so the lint walked
 * straight past while the literal did all the painting.
 */
function readTokens(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/var\(\s*(--lumiverse-[a-zA-Z0-9-]+)\s*[,)]/g)].map((match) => match[1]),
  )
}

/** The five that were referenced everywhere and defined nowhere. */
const FORMERLY_PHANTOM = [
  '--lumiverse-border-subtle',
  '--lumiverse-surface',
  '--lumiverse-surface-raised',
  '--lumiverse-input-bg',
  '--lumiverse-primary-soft',
] as const

describe('homepage character library — theme connection', () => {
  test('every theme token it reads is actually defined', () => {
    const read = readTokens(`${liveStyles}\n${liveTagColors}`)
    expect([...read].filter((token) => !definedTokens.has(token)).sort()).toEqual([])
    expect(read.size).toBeGreaterThan(0)
  })

  test('the five formerly-phantom tokens are read bare, with no slate fallback', () => {
    for (const token of FORMERLY_PHANTOM) {
      expect(definedTokens.has(token)).toBe(true)
      // Read at least once...
      expect(liveStyles).toContain(`var(${token})`)
      // ...and never with a fallback. A fallback here re-disconnects the surface: the
      // token would resolve, but any theme change would be masked by the literal.
      expect(liveStyles).not.toMatch(
        new RegExp(`var\\(\\s*${token}\\s*,`),
      )
    }
  })

  test('no Tailwind-slate literals survive anywhere in the stylesheet', () => {
    // The whole reason the homepage looked like a different product: slate 148,163,184 /
    // 15,23,42 / #111827 / violet #8b5cf6 inside a purple 147,112,219 app.
    expect(liveStyles).not.toMatch(/148,\s*163,\s*184/)
    expect(liveStyles).not.toMatch(/15,\s*23,\s*42/)
    expect(liveStyles).not.toMatch(/226,\s*232,\s*240/)
    expect(liveStyles.toLowerCase()).not.toContain('#111827')
    expect(liveStyles.toLowerCase()).not.toContain('#f8fafc')
    expect(liveStyles.toLowerCase()).not.toContain('#8b5cf6')
    expect(liveStyles.toLowerCase()).not.toContain('#0b0f17')
  })

  test('the accent glow follows the accent token', () => {
    // Was a hard-coded violet, so picking a teal accent left this panel violet.
    expect(liveStyles).toMatch(
      /radial-gradient\([^;]*color-mix\(in srgb, var\(--lumiverse-primary\) 13%, transparent\)/,
    )
  })

  test('the root section emits the selector the Custom CSS panel documents', () => {
    // ComponentCssReference tells users to write [data-component="<ExportedName>"].
    expect(cssReferenceSource).toContain('[data-component="${componentName}"]')
    expect(componentSource).toContain('data-component="HomepageCharacterLibrary"')
    expect(componentSource).toContain('export function HomepageCharacterLibrary()')
  })
})

describe('homepage character library — user settings are honoured', () => {
  test('every font-size scales with the font-size setting', () => {
    const sizes = [...liveStyles.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1])
    expect(sizes.length).toBeGreaterThan(0)
    // `.tag` used to be the single exception, so tag text ignored the setting entirely
    // while the card name beside it grew.
    expect(sizes.filter((value) => !value.includes('var(--lumiverse-font-scale'))).toEqual([])
  })

  test('the tag row and compact footer budgets scale too, so chips cannot clip', () => {
    expect(liveStyles).toContain(
      'max-height: calc(var(--character-tags-max-height, 20px) * var(--lumiverse-font-scale, 1))',
    )
    expect(liveStyles).toContain(
      'max-height: calc(var(--character-footer-max-height, 68px) * var(--lumiverse-font-scale, 1))',
    )
  })

  test('no radius is hard-coded, because engine.ts rescales the radius tokens', () => {
    const radii = [...liveStyles.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1].trim())
    expect(radii.length).toBeGreaterThan(0)
    for (const radius of radii) {
      // `999px` and `0` are the only literals: there is no pill token, and the compact
      // footer resets an inherited radius.
      if (radius === '999px' || radius === '0') continue
      expect(radius).toContain('var(--lumiverse-radius')
    }
  })

  test('the pinned preview sits on the documented stacking ladder', () => {
    // `z-index: 30` put a position:fixed panel under the drawer, every modal, the portrait
    // dock and context menus.
    expect(liveStyles).not.toMatch(/z-index:\s*30\s*;/)
    expect(liveStyles).toContain('z-index: var(--z-homepage-preview-panel, 9990)')
    // 10012 is asserted forbidden by tests/lore-indicator.test.ts.
    expect(liveStyles).not.toContain('10012')
  })
})

describe('homepage character library — tag colours', () => {
  test('the hash to slot mapping is unchanged', () => {
    // Frozen: a given tag must keep the colour it has today. These indices were captured
    // from the pre-token implementation.
    expect(TAG_COLOR_SLOTS).toBe(12)
    const expected: Record<string, number> = {
      fantasy: 2,
      romance: 3,
      'sci-fi': 9,
      adventure: 0,
      horror: 2,
      comedy: 11,
      '': 0,
    }
    for (const [tag, index] of Object.entries(expected)) {
      expect(getTagColorIndex(tag)).toBe(index)
    }
  })

  test('slots resolve to tokens, never to literal colours', () => {
    expect(getTagColorVar('fantasy')).toBe('var(--lumiverse-tag-3)')
    const color = getTagColor('fantasy')
    expect(color.bg).toBe('rgba(var(--lumiverse-tag-3), 0.15)')
    expect(color.border).toBe('rgba(var(--lumiverse-tag-3), 0.3)')
    expect(color.text).toContain('var(--lumiverse-tag-3)')
    // No `rgba(<number>` and no hex anywhere in the module.
    expect(liveTagColors).not.toMatch(/rgba\(\s*\d/)
    expect(liveTagColors).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  test('all twelve slots are defined by the theme as raw RGB triples', () => {
    for (let slot = 1; slot <= TAG_COLOR_SLOTS; slot++) {
      const match = themeVariables.match(
        new RegExp(`--lumiverse-tag-${slot}\\s*:\\s*([^;]+);`),
      )
      expect(match).not.toBeNull()
      // Consumers compose their own alpha: `rgba(var(--lumiverse-tag-N), 0.72)`. A packed
      // `rgb(...)` or hex value would make that impossible.
      expect(match?.[1].trim()).toMatch(/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/)
    }
  })

  test('the component hands CSS a variable, not a painted colour', () => {
    // A JS-computed inline `background` outranks every override a user can write in the
    // Custom CSS panel, which defeats the point of registering the component at all.
    expect(componentSource).toContain("'--tag-rgb': getTagColorVar(tag)")
    expect(componentSource).not.toContain('withRgbaAlpha')
    expect(componentSource).not.toMatch(/background:\s*color\.bg/)
    expect(componentSource).not.toContain("color: '#fff'")
    // ...and the stylesheet does the painting.
    expect(liveStyles).toContain('background: rgba(var(--tag-rgb), 0.15)')
    expect(liveStyles).toContain('background: rgba(var(--tag-rgb), 0.72)')
  })
})

describe('homepage character library — render cost', () => {
  test('search is debounced before it reaches the fetch effect', () => {
    // Every keystroke used to abort the in-flight request, issue a new one, and rebuild
    // ~900 <option> nodes on resolution.
    expect(hookSource).toContain('HOMEPAGE_SEARCH_DEBOUNCE_MS')
    expect(hookSource).toContain('setDebouncedSearch(search)')
    const fetchDeps = hookSource.slice(
      hookSource.indexOf('return () => controller.abort()'),
    )
    expect(fetchDeps).toContain('debouncedSearch')
    expect(hookSource).toContain('search: debouncedSearch.trim() || undefined')
  })

  test('panel resize commits to the store once, on pointer-up', () => {
    // `setSetting` on every pointermove invalidated the store 60-120x/second and queued a
    // debounced server write each time.
    const resize = componentSource.slice(
      componentSource.indexOf('const beginResize'),
      componentSource.indexOf('const commitImageHeight'),
    )
    expect(resize).toContain('requestAnimationFrame')
    expect(resize).toContain('setLivePanelWidth')
    expect(resize.indexOf('setPanelWidth(latest)')).toBeGreaterThan(resize.indexOf('const onUp'))
    expect(resize).not.toMatch(/onMove\s*=\s*\(moveEvent: PointerEvent\) => setPanelWidth/)
  })

  test('the option list and the card list are memoised', () => {
    expect(componentSource).toContain('const tagOptions = useMemo(')
    expect(componentSource).toContain('const cards = useMemo(')
    expect(componentSource).toContain('const LibraryCard = memo(')
  })

  test('the hook exposes stable callbacks', () => {
    // Each setter used to close over `settings`, so all of them changed identity on every
    // store write — which would have made the memoisation above worthless.
    expect(hookSource).toContain('const settingsRef = useRef(settings)')
    expect(hookSource).toContain('}, [updateSettings])')
    expect(hookSource).not.toMatch(/}, \[setSetting, settings\]\)/)
  })

  test('the dead --character-tag-lines write is gone', () => {
    // Written on every render; read by no stylesheet in the repo.
    expect(componentSource).not.toContain('--character-tag-lines')
  })
})

describe('homepage character library — shared primitives', () => {
  test('buttons come from the shared Button', () => {
    expect(componentSource).toContain("from '@/components/shared/FormComponents'")
    expect(componentSource).toContain('variant="primary"')
    expect(componentSource).toContain('variant="ghost"')
    expect((componentSource.match(/variant="secondary"/g) ?? []).length).toBe(2)
    // The bespoke button chrome these replaced must not linger in the stylesheet.
    expect(liveStyles).not.toContain('.sortDirection')
    for (const cls of ['.settingsBtn', '.editBtn', '.openChatBtn']) {
      const rule = liveStyles.slice(liveStyles.indexOf(`${cls} {`))
      const body = rule.slice(0, rule.indexOf('}'))
      expect(body).not.toContain('border:')
      expect(body).not.toContain('background:')
      expect(body).not.toContain('padding:')
    }
  })

  test('the filter row is announced to screen readers', () => {
    expect(componentSource).toContain('role="group" aria-label="Character filter"')
    expect(componentSource).toContain('aria-pressed={filter === item}')
  })

  test('the search box carries the icon idiom the rest of the app uses', () => {
    expect(componentSource).toContain('className={styles.searchField}')
    expect(componentSource).toContain('<Search size={14}')
    expect(componentSource).toContain('aria-label="Search characters"')
  })
})
