/**
 * Landing page: the Characters / Chats tab split, and the CSS-system connection.
 *
 * The repo has no DOM test environment, so this file works the way
 * `tests/homepage-character-library.test.ts` does — real decision logic lives in a
 * pure module (`frontend/src/lib/landingPageTabs.ts`) and is unit-tested directly,
 * while the wiring that can only be expressed as markup or CSS is asserted against
 * the source text.
 */

import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_LANDING_PAGE_TAB,
  LANDING_PAGE_TABS,
  getAvailableLandingPageTabs,
  isLandingPageTab,
  landingPageTabId,
  landingPageTabPanelId,
  normalizeLandingPageTab,
  resolveTabArrowKey,
} from '../frontend/src/lib/landingPageTabs'

const componentSource = await Bun.file(
  new URL('../frontend/src/components/landing/LandingPage.tsx', import.meta.url),
).text()
const componentStyles = await Bun.file(
  new URL('../frontend/src/components/landing/LandingPage.module.css', import.meta.url),
).text()
const storeTypes = await Bun.file(
  new URL('../frontend/src/types/store.ts', import.meta.url),
).text()
const settingsSlice = await Bun.file(
  new URL('../frontend/src/store/slices/settings.ts', import.meta.url),
).text()
const themeVariables = await Bun.file(
  new URL('../frontend/src/theme/variables.css', import.meta.url),
).text()
const themeEngine = await Bun.file(
  new URL('../frontend/src/theme/engine.ts', import.meta.url),
).text()
const cssReferenceSource = await Bun.file(
  new URL('../frontend/src/components/modals/ComponentCssReference.tsx', import.meta.url),
).text()

/** Strip comments so a token or rule named in prose is not mistaken for a real one. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const liveStyles = stripComments(componentStyles)

/**
 * Every `--lumiverse-*` name that actually resolves at runtime: the static
 * `:root` block plus the names `theme/engine.ts` writes inline on
 * documentElement (which is where `--lumiverse-primary-contrast` comes from).
 */
const definedTokens = new Set([
  ...[...stripComments(themeVariables).matchAll(/(--lumiverse-[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]),
  ...[...themeEngine.matchAll(/vars\['(--lumiverse-[a-zA-Z0-9-]+)'\]/g)].map((m) => m[1]),
])

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — the tab model (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe('landingPageTabs — the tab model', () => {
  test('there are exactly two tabs and Characters is the default', () => {
    expect([...LANDING_PAGE_TABS]).toEqual(['characters', 'chats'])
    expect(DEFAULT_LANDING_PAGE_TAB).toBe('characters')
    // The default must not be the tab that costs a network round trip.
    expect(DEFAULT_LANDING_PAGE_TAB).not.toBe('chats')
  })

  test('isLandingPageTab accepts only the two ids', () => {
    expect(isLandingPageTab('characters')).toBe(true)
    expect(isLandingPageTab('chats')).toBe(true)
    for (const value of ['Chats', 'chat', '', 'recent', null, undefined, 0, 1, {}, ['chats']]) {
      expect(isLandingPageTab(value)).toBe(false)
    }
  })

  test('normalizeLandingPageTab survives anything a settings row can hand back', () => {
    // A brand-new key means the stored row simply has no value; older builds or a
    // hand-edited DB can put anything at all there.
    expect(normalizeLandingPageTab(undefined)).toBe('characters')
    expect(normalizeLandingPageTab(null)).toBe('characters')
    expect(normalizeLandingPageTab('')).toBe('characters')
    expect(normalizeLandingPageTab('CHATS')).toBe('characters')
    expect(normalizeLandingPageTab('favourites')).toBe('characters')
    expect(normalizeLandingPageTab(7)).toBe('characters')
    // ...and never rewrites a value that is already valid.
    expect(normalizeLandingPageTab('chats')).toBe('chats')
    expect(normalizeLandingPageTab('characters')).toBe('characters')
  })

  test('the ARIA ids are distinct and stable per tab', () => {
    const ids = LANDING_PAGE_TABS.flatMap((tab) => [landingPageTabId(tab), landingPageTabPanelId(tab)])
    // aria-controls / aria-labelledby only wire up if no two ids collide.
    expect(new Set(ids).size).toBe(ids.length)
    expect(landingPageTabId('chats')).toBe('landing-tab-chats')
    expect(landingPageTabPanelId('chats')).toBe('landing-tabpanel-chats')
    expect(landingPageTabId('characters')).not.toBe(landingPageTabPanelId('characters'))
  })

  test('Left/Right wrap around the tablist', () => {
    expect(resolveTabArrowKey('ArrowRight', 'characters')).toBe('chats')
    expect(resolveTabArrowKey('ArrowRight', 'chats')).toBe('characters')
    expect(resolveTabArrowKey('ArrowLeft', 'chats')).toBe('characters')
    // The wrap in the negative direction is the one an index-1 implementation
    // gets wrong: -1 % 2 is -1 in JS, not 1.
    expect(resolveTabArrowKey('ArrowLeft', 'characters')).toBe('chats')
  })

  test('Home and End jump to the ends regardless of where focus is', () => {
    for (const tab of LANDING_PAGE_TABS) {
      expect(resolveTabArrowKey('Home', tab)).toBe('characters')
      expect(resolveTabArrowKey('End', tab)).toBe('chats')
    }
  })

  test('keys the tablist does not own resolve to null so the caller leaves them alone', () => {
    // Returning a tab here would mean preventDefault() on Tab, Enter, typing, etc.
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'a', 'ArrowUp', 'ArrowDown', 'PageUp']) {
      expect(resolveTabArrowKey(key, 'characters')).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Part 1b — a tab with nothing behind it is not offered
// ─────────────────────────────────────────────────────────────────────────────

const LIBRARY_ON = { characterLibraryEnabled: true }
const LIBRARY_OFF = { characterLibraryEnabled: false }

describe('landingPageTabs — availability', () => {
  test('the Characters tab tracks the character-library switch', () => {
    // HomepageCharacterLibrary returns null when `enabled` is false, so a
    // Characters tab in that state opens a completely blank panel.
    expect([...getAvailableLandingPageTabs(LIBRARY_ON)]).toEqual(['characters', 'chats'])
    expect([...getAvailableLandingPageTabs(LIBRARY_OFF)]).toEqual(['chats'])
  })

  test('availability never empties out and never reorders', () => {
    for (const availability of [LIBRARY_ON, LIBRARY_OFF]) {
      const tabs = getAvailableLandingPageTabs(availability)
      // Chats always renders something (list, empty state or error), so every
      // caller may treat the result as a non-empty list.
      expect(tabs.length).toBeGreaterThan(0)
      expect(tabs).toContain('chats')
      // A subsequence of the canonical order — the strip must not resequence.
      expect([...tabs]).toEqual(LANDING_PAGE_TABS.filter((tab) => tabs.includes(tab)))
    }
  })

  test('a stored tab that is no longer available cannot strand the user', () => {
    const available = getAvailableLandingPageTabs(LIBRARY_OFF)
    // The one that matters: 'characters' is both valid *and* the default, so a
    // membership-blind normaliser hands back a tab with no button and no panel.
    expect(normalizeLandingPageTab('characters', available)).toBe('chats')
    expect(normalizeLandingPageTab(DEFAULT_LANDING_PAGE_TAB, available)).toBe('chats')
    expect(normalizeLandingPageTab('chats', available)).toBe('chats')
    for (const value of [undefined, null, '', 'CHATS', 'favourites', 7]) {
      expect(normalizeLandingPageTab(value, available)).toBe('chats')
    }
  })

  test('with everything available the default still wins, and valid values are untouched', () => {
    const available = getAvailableLandingPageTabs(LIBRARY_ON)
    expect(normalizeLandingPageTab(undefined, available)).toBe('characters')
    expect(normalizeLandingPageTab('chats', available)).toBe('chats')
    expect(normalizeLandingPageTab('characters', available)).toBe('characters')
    // Omitting the argument stays equivalent to "everything is available".
    expect(normalizeLandingPageTab('characters')).toBe(normalizeLandingPageTab('characters', available))
  })

  test('an empty availability list degrades to the full set instead of undefined', () => {
    // Defensive only — nothing produces this today, but returning undefined here
    // would put `undefined` straight into a DOM id.
    expect(normalizeLandingPageTab('chats', [])).toBe('chats')
    expect(normalizeLandingPageTab(undefined, [])).toBe(DEFAULT_LANDING_PAGE_TAB)
    expect(resolveTabArrowKey('ArrowLeft', 'characters', [])).toBe('chats')
  })
})

describe('landingPageTabs — roving focus over a shrunken tablist', () => {
  const soloChats = getAvailableLandingPageTabs(LIBRARY_OFF)

  test('arrows never resolve to a tab that has no button', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      // The negative-modulo trap at length 1: (0 - 1) % 1 is -0 in JS only after
      // the `+ length` correction; without it `tabs[-1]` is undefined.
      expect(resolveTabArrowKey(key, 'chats', soloChats)).toBe('chats')
      // ...and it must survive a `current` that is itself no longer available.
      expect(resolveTabArrowKey(key, 'characters', soloChats)).toBe('chats')
    }
  })

  test('a resolved key is still consumed when there is nowhere to move', () => {
    // Non-null means the component preventDefaults — correct, the tablist owns
    // the arrow keys whether or not focus actually changes.
    expect(resolveTabArrowKey('ArrowRight', 'chats', soloChats)).not.toBeNull()
    // Keys it does not own stay unowned regardless of the tab set.
    for (const key of ['Tab', 'Enter', ' ', 'ArrowUp', 'PageUp']) {
      expect(resolveTabArrowKey(key, 'chats', soloChats)).toBeNull()
    }
  })

  test('the full set is unaffected by the new argument', () => {
    const both = getAvailableLandingPageTabs(LIBRARY_ON)
    expect(resolveTabArrowKey('ArrowLeft', 'characters', both)).toBe('chats')
    expect(resolveTabArrowKey('ArrowRight', 'chats', both)).toBe('characters')
    expect(resolveTabArrowKey('Home', 'chats', both)).toBe('characters')
    expect(resolveTabArrowKey('End', 'characters', both)).toBe('chats')
  })

  test('Home/End address the ends of the available list, not of LANDING_PAGE_TABS', () => {
    expect(resolveTabArrowKey('Home', 'chats', soloChats)).not.toBe('characters')
    expect(resolveTabArrowKey('End', 'chats', soloChats)).toBe(soloChats[soloChats.length - 1])
    expect(resolveTabArrowKey('Home', 'chats', soloChats)).toBe(soloChats[0])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — the persisted setting
// ─────────────────────────────────────────────────────────────────────────────

describe('landing page — the active tab is persisted', () => {
  test('the key is typed on the settings slice', () => {
    expect(storeTypes).toContain("landingPageActiveTab: 'characters' | 'chats'")
  })

  test('the slice ships a default, so mergeStoredSetting backfills it without a migration', () => {
    // mergeStoredSetting starts from the in-memory default and overlays the stored
    // row, so a key that has never been written simply keeps the default.
    expect(settingsSlice).toContain('landingPageActiveTab: DEFAULT_LANDING_PAGE_TAB')
    expect(settingsSlice).toContain("from '@/lib/landingPageTabs'")
  })

  test('the key is in DATA_KEYS, so setSetting persists it to the server', () => {
    const dataKeys = settingsSlice.slice(
      settingsSlice.indexOf('const DATA_KEYS'),
      settingsSlice.indexOf('// ── Debounced batch persistence'),
    )
    expect(dataKeys).toContain("'landingPageActiveTab'")
    // Its sibling is the proof the mechanism is the existing one, not a new one.
    expect(dataKeys).toContain("'landingPageLayoutMode'")
  })

  test('the component reads the store key and writes it back through setSetting', () => {
    expect(componentSource).toContain(
      'normalizeLandingPageTab(useStore((s) => s.landingPageActiveTab), availableTabs)',
    )
    expect(componentSource).toContain("setSetting('landingPageActiveTab', tab)")
  })

  test('the stored value is never rewritten when a tab goes away', () => {
    // Normalising at read time is the whole mechanism: disabling the library
    // must not clobber a stored 'characters', or re-enabling it would silently
    // drop the user back on Chats.
    expect(componentSource).not.toContain("setSetting('landingPageActiveTab', activeTab)")
    expect(componentSource).not.toMatch(/setSetting\('landingPageActiveTab', '/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — the markup
// ─────────────────────────────────────────────────────────────────────────────

describe('landing page — the tab strip is a real tablist', () => {
  test('the roles and the aria wiring are present', () => {
    expect(componentSource).toContain('role="tablist"')
    expect(componentSource).toContain('role="tab"')
    expect(componentSource).toContain('role="tabpanel"')
    expect(componentSource).toContain('aria-selected={selected}')
    expect(componentSource).toContain('aria-controls={landingPageTabPanelId(tab)}')
    expect(componentSource).toContain('id={landingPageTabId(tab)}')
    // Both panels point back at their own tab.
    expect(componentSource).toContain("aria-labelledby={landingPageTabId('characters')}")
    expect(componentSource).toContain("aria-labelledby={landingPageTabId('chats')}")
    expect(componentSource).toContain('aria-label="Landing sections"')
  })

  test('focus roves — only the selected tab is tabbable, arrows move it', () => {
    expect(componentSource).toContain('tabIndex={selected ? 0 : -1}')
    expect(componentSource).toContain('onKeyDown={handleTabKeyDown}')
    expect(componentSource).toContain('resolveTabArrowKey(event.key, activeTab, availableTabs)')
    // A resolved key must both move selection and move DOM focus, or the next
    // arrow press is evaluated against a button that no longer has focus.
    expect(componentSource).toContain('tabRefs.current[next]?.focus()')
    expect(componentSource).toContain('event.preventDefault()')
  })

  test('the tab buttons are styled with the repo clsx idiom, not a new shared component', () => {
    expect(componentSource).toContain('clsx(styles.tabBtn, selected && styles.tabBtnActive)')
    expect(liveStyles).toContain('.tabBtn {')
    expect(liveStyles).toContain('.tabBtnActive {')
    // Roving focus makes the focus ring the only affordance on the inactive tab.
    expect(liveStyles).toContain('.tabBtn:focus-visible {')
  })

  test('only the active panel renders, and the library moved into the Characters one', () => {
    expect(componentSource).toContain("activeTab === 'characters' ? (")
    expect(componentSource).toContain('<HomepageCharacterLibrary />')
    // The library and the chat list are no longer stacked in the same <main>.
    expect(componentSource).not.toMatch(/<HomepageCharacterLibrary \/>\s*<AnimatePresence/)
  })
})

describe('landing page — the Characters tab is never a blank panel', () => {
  test('the tab set is derived from the library switch, not hard-coded', () => {
    expect(componentSource).toContain('useStore((s) => s.homepageCharacterLibrarySettings.enabled)')
    expect(componentSource).toContain('getAvailableLandingPageTabs({ characterLibraryEnabled })')
    // The strip iterates what is available; iterating the full set is exactly
    // the bug — it would re-offer Characters with nothing behind it.
    expect(componentSource).toContain('{availableTabs.map((tab) => {')
    expect(componentSource).not.toContain('LANDING_PAGE_TABS.map(')
    // Memoised: a fresh array every render would re-run the keydown callback and
    // the normalisation for nothing.
    expect(componentSource).toContain('[characterLibraryEnabled]')
  })

  test('the missing tab is explained, and the fix is one click away', () => {
    expect(componentSource).toContain('{!characterLibraryEnabled && (')
    expect(componentSource).toContain('Character library hidden')
    // The library's own affordance opens the same settings view — reused, not
    // reinvented (see useHomepageCharacterLibrary's openSettings).
    expect(componentSource).toContain("openSettingsModal('productivity')")
    expect(componentSource).toContain('useStore((s) => s.openSettings)')
    expect(componentSource).toContain('onClick={handleOpenLibrarySettings}')
  })

  test('the affordance is a shared Button and sits outside the tablist', () => {
    expect(componentSource).toContain("import { Button } from '@/components/shared/FormComponents'")
    expect(componentSource).toContain('className={styles.restoreLibraryBtn}')
    // role="tablist" may only own role="tab" children, so the tablist element
    // has to have closed before the button appears.
    const tablistToButton = componentSource.slice(
      componentSource.indexOf('role="tablist"'),
      componentSource.indexOf('styles.restoreLibraryBtn'),
    )
    expect(tablistToButton).toContain('</div>')
    expect(tablistToButton.length).toBeGreaterThan(0)
  })

  test('the row wrapper is styled, and the strip keeps its own rules', () => {
    expect(componentSource).toContain('className={styles.tabsRow}')
    expect(liveStyles).toContain('.tabsRow {')
    expect(liveStyles).toContain('.restoreLibraryBtn {')
    // The spacing below the strip moved to the row, so the button cannot end up
    // 20px above the panel while the tabs sit flush.
    const row = liveStyles.slice(liveStyles.indexOf('.tabsRow {'), liveStyles.indexOf('.tabs {'))
    expect(row).toContain('margin-bottom')
    expect(row).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    // The affordance is themed like everything else on this page.
    const affordance = liveStyles.slice(liveStyles.indexOf('.restoreLibraryBtn {'))
    expect(affordance.slice(0, affordance.indexOf('}'))).toContain('var(--lumiverse-font-scale')
    expect(affordance.slice(0, affordance.indexOf('}'))).toContain('var(--lumiverse-text-muted)')
  })
})

describe('landing page — the chats tab keeps everything it had', () => {
  test('the fetch is gated until the Chats tab has been opened, and the gate latches', () => {
    expect(componentSource).toContain('if (!settingsLoaded || !chatsTabOpened) return')
    expect(componentSource).toContain("useState(activeTab === 'chats')")
    expect(componentSource).toContain("if (activeTab === 'chats') setChatsTabOpened(true)")
    // Never cleared: switching back to Characters must not re-arm the gate, or the
    // next visit refetches and discards the pages already loaded.
    expect(componentSource).not.toContain('setChatsTabOpened(false)')
    // Flipping the latch has to re-run the fetch effect.
    expect(componentSource).toContain('}, [landingPageChatsDisplayed, settingsLoaded, chatsTabOpened])')
  })

  test('the bootstrap preload, the offset pager and the delete paths are untouched', () => {
    expect(componentSource).toContain('useStore.getState().landingRecentChats')
    expect(componentSource).toContain('useStore.getState().setLandingRecentChats(null)')
    expect(componentSource).toContain('chatsApi.listRecentGrouped({ limit: landingPageChatsDisplayed })')
    expect(componentSource).toContain('offset: items.length,')
    expect(componentSource).toContain('chatsApi.deleteCharacterChats(item.character_id)')
    expect(componentSource).toContain('chatsApi.deleteTemporary()')
    expect(componentSource).toContain('EventType.CHAT_DELETED')
  })

  test('the infinite-scroll observer still exists and cannot fire against a hidden panel', () => {
    expect(componentSource).toContain('new IntersectionObserver(')
    expect(componentSource).toContain("rootMargin: '200px'")
    expect(componentSource).toContain('observer.observe(sentinel)')
    expect(componentSource).toContain('return () => observer.disconnect()')
    // The sentinel only exists inside the chats panel; the guard plus the dep is
    // what disconnects the observer when that panel unmounts.
    expect(componentSource).toContain("if (activeTab !== 'chats') return")
    expect(componentSource).toContain('}, [activeTab, items.length, total, loading, loadMore])')
  })

  test('both landing layout modes still drive the chat list', () => {
    expect(componentSource).toContain('useStore((s) => s.landingPageLayoutMode)')
    expect(componentSource).toContain("landingPageLayoutMode === 'compact' ? styles.compactList : styles.gridCards")
    expect(componentSource).toContain('<ChatListItem')
    expect(componentSource).toContain('<ChatCard')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — the CSS system connection
// ─────────────────────────────────────────────────────────────────────────────

describe('landing page — the Custom CSS panel can reach it', () => {
  test('the root emits the selector the Custom CSS panel documents', () => {
    // cssModuleRegistry derives [data-component="LandingPage"] from the filename;
    // without the attribute that selector matched nothing at all.
    expect(cssReferenceSource).toContain('[data-component="${componentName}"]')
    expect(componentSource).toContain('data-component="LandingPage"')
    expect(componentSource).toContain('export default function LandingPage()')
  })

  test('the meaningful inner regions get their own stable hooks', () => {
    for (const region of [
      'LandingPageHeader',
      'LandingPageMain',
      'LandingPageTabs',
      'LandingPageCharacters',
      'LandingPageChats',
      'LandingPageFooter',
    ]) {
      expect(componentSource).toContain(`data-component="${region}"`)
    }
  })
})

describe('landing page — the stylesheet obeys the theme rules', () => {
  test('every theme token it reads is actually defined', () => {
    const read = new Set(
      [...liveStyles.matchAll(/var\(\s*(--lumiverse-[a-zA-Z0-9-]+)\s*[,)]/g)].map((m) => m[1]),
    )
    expect([...read].filter((token) => !definedTokens.has(token)).sort()).toEqual([])
    expect(read.size).toBeGreaterThan(0)
  })

  test('no --lumiverse token is read with a fallback except the two scale multipliers', () => {
    // `var(--lumiverse-x, <literal>)` is the phantom-token pattern: the literal
    // paints and the theme engine cannot touch the surface. The scale multipliers
    // are the documented exception — numeric, defined, and used repo-wide.
    const SCALE_TOKENS = new Set(['--lumiverse-font-scale', '--lumiverse-ui-scale'])
    const withFallback = [...liveStyles.matchAll(/var\(\s*(--lumiverse-[a-zA-Z0-9-]+)\s*,\s*([^,)]*)/g)]
    for (const [, token, fallback] of withFallback) {
      expect(SCALE_TOKENS.has(token)).toBe(true)
      expect(fallback.trim()).toBe('1')
    }
    // The two that were live before this round.
    expect(liveStyles).toContain('color: var(--lumiverse-primary-contrast);')
    expect(liveStyles).toContain('background: var(--lumiverse-bg-elevated);')
  })

  test('no colour literals paint a themeable surface', () => {
    // The delete button's chrome was a frozen near-black, so a light theme kept a
    // black pill on a white card.
    expect(liveStyles).not.toMatch(/rgba\(\s*10,\s*10,\s*14/)
    expect(liveStyles).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    // The Tailwind-slate family the homepage sweep bans.
    expect(liveStyles).not.toMatch(/148,\s*163,\s*184/)
    expect(liveStyles).not.toMatch(/15,\s*23,\s*42/)
    expect(liveStyles).not.toMatch(/226,\s*232,\s*240/)
    expect(liveStyles).toContain('color-mix(in srgb, var(--lumiverse-bg-deep) 72%, transparent)')
  })

  test('no radius is hard-coded, because engine.ts rescales the radius tokens', () => {
    const radii = [...liveStyles.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(radii.length).toBeGreaterThan(0)
    for (const radius of radii) {
      // `999px` (pill) and `50%` (the ambient glow circles) are shape declarations,
      // not radii — there is no token for either.
      if (radius === '999px' || radius === '50%') continue
      expect(radius).toContain('var(--lumiverse-radius')
    }
    // The ones that were literal before this round.
    expect(liveStyles).not.toMatch(/border-radius:\s*1[0-9]px/)
    expect(liveStyles).not.toMatch(/border-radius:\s*[2-9]px/)
  })

  test('every font-size scales with the font-size setting', () => {
    const sizes = [...liveStyles.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1])
    expect(sizes.length).toBeGreaterThan(0)
    expect(sizes.filter((value) => !value.includes('var(--lumiverse-font-scale'))).toEqual([])
  })

  test('the new tab strip is themed, not literal', () => {
    const strip = liveStyles.slice(liveStyles.indexOf('.tabs {'), liveStyles.indexOf('.tabPanel {'))
    expect(strip).toContain('var(--lumiverse-radius')
    expect(strip).toContain('var(--lumiverse-font-scale')
    expect(strip).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(strip).not.toMatch(/rgba\(\s*\d/)
  })
})
