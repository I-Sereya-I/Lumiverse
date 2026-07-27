import { describe, expect, test, beforeEach } from 'bun:test'
import { createEntryTokenKeyMemo, entryTokenCacheKey } from '../frontend/src/lib/entryTokenKey'
import {
  buildEntryIndexMap,
  planEntryReveal,
  revealPlanLatches,
} from '../frontend/src/lib/entryReveal'
import {
  DEFAULT_ENTRY_ROW_DENSITY,
  ENTRY_ROW_GAP,
  ENTRY_ROW_MIN_HEIGHT,
  entryRowPitch,
  normalizeFontScale,
  normalizeRowDensity,
} from '../frontend/src/lib/lorebookRowMetrics'
import {
  clearTokenCountCache,
  hasTokenCountByKey,
  peekTokenCountByKey,
  setTokenCount,
  tokenCacheKey,
  tokenCacheSize,
  touchTokenCount,
  TOKEN_CACHE_MAX_ENTRIES,
} from '../frontend/src/lib/tokenCountCache'

/**
 * The lorebook editor got measurably slower to open in round 3. The cause was not
 * a new feature, it was three O(content) operations moved onto the render path:
 * the Tokens cell hashed every entry's full text once per row per render, the
 * hover handler hashed the same text twice more per row the pointer crossed, and
 * nothing was memoised so a single background count re-rendered 554 rows.
 *
 * These assertions pin the shape of the fix. There is no DOM test environment in
 * this repo, so the component-level guarantees are asserted against source text —
 * the same convention `tests/lorebook-editor.test.ts` uses.
 */

const entryTableSource = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/EntryTable.tsx', import.meta.url),
).text()
const tokenCountsHookSource = await Bun.file(
  new URL('../frontend/src/hooks/useTokenCounts.ts', import.meta.url),
).text()

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('entry token key memo', () => {
  test('hashes a stable entry exactly once, however many times it is rendered', () => {
    const memo = createEntryTokenKeyMemo()
    const entry = { content: 'a'.repeat(2_000) }
    const first = memo(entry, 'gpt-4', entry.content)
    for (let i = 0; i < 500; i += 1) memo(entry, 'gpt-4', entry.content)
    expect(memo.hashCount()).toBe(1)
    expect(memo(entry, 'gpt-4', entry.content)).toBe(first)
  })

  test('agrees with the unmemoised key it stands in for', () => {
    const memo = createEntryTokenKeyMemo()
    const entry = { content: 'Aurelia keeps the ledger of the drowned city.' }
    expect(memo(entry, 'gpt-4', entry.content)).toBe(tokenCacheKey('gpt-4', entry.content))
    expect(memo({ content: '' }, null, '')).toBe(tokenCacheKey(null, ''))
  })

  test('a rebuilt entry object is a miss — which is how an edit invalidates', () => {
    // `commitEntries` in the workspace is strictly immutable (`{ ...entry, ...updates }`),
    // so object identity changes exactly when the content might have. That is the
    // whole correctness argument for keying on the object.
    const memo = createEntryTokenKeyMemo()
    const before = { content: 'draft' }
    const after = { ...before, content: 'draft edited' }
    expect(memo(before, 'm', before.content)).not.toBe(memo(after, 'm', after.content))
    expect(memo.hashCount()).toBe(2)
  })

  test('re-hashes when the model changes, so a profile switch is a natural miss', () => {
    const memo = createEntryTokenKeyMemo()
    const entry = { content: 'shared' }
    expect(memo(entry, 'gpt-4', entry.content)).not.toBe(memo(entry, 'claude', entry.content))
    expect(memo.hashCount()).toBe(2)
  })

  test('an undefined model and a null model are the same memo slot', () => {
    const memo = createEntryTokenKeyMemo()
    const entry = { content: 'shared' }
    memo(entry, null, entry.content)
    memo(entry, undefined, entry.content)
    expect(memo.hashCount()).toBe(1)
  })

  test('a retained object whose content was mutated in place still fails safe', () => {
    // Belt and braces: React state never does this, but a length re-check costs
    // one comparison and turns a silently stale count into a miss.
    const memo = createEntryTokenKeyMemo()
    const entry = { content: 'short' }
    const first = memo(entry, 'm', entry.content)
    entry.content = 'much longer content'
    expect(memo(entry, 'm', entry.content)).not.toBe(first)
  })

  test('the shared instance is a memo, not a passthrough', () => {
    const entry = { content: 'process-wide' }
    const a = entryTokenCacheKey(entry, 'm', entry.content)
    const b = entryTokenCacheKey(entry, 'm', entry.content)
    expect(a).toBe(b)
  })
})

describe('token cache render-phase purity', () => {
  beforeEach(() => {
    clearTokenCountCache()
  })

  test('peekTokenCountByKey reads without reordering — safe during render', () => {
    for (let i = 0; i < TOKEN_CACHE_MAX_ENTRIES; i += 1) {
      setTokenCount('m', `entry-${i}`, { count: i, approximate: false, model: 'm' })
    }
    // Peeking the oldest record must NOT rescue it: a render is not a user signal
    // and StrictMode's double invoke would otherwise make eviction order depend on
    // render count.
    expect(peekTokenCountByKey(tokenCacheKey('m', 'entry-0'))?.count).toBe(0)
    setTokenCount('m', 'overflow', { count: -1, approximate: false, model: 'm' })
    expect(tokenCacheSize()).toBe(TOKEN_CACHE_MAX_ENTRIES)
    expect(peekTokenCountByKey(tokenCacheKey('m', 'entry-0'))).toBeNull()
  })

  test('touchTokenCount is the explicit non-render promotion, and reports presence', () => {
    for (let i = 0; i < TOKEN_CACHE_MAX_ENTRIES; i += 1) {
      setTokenCount('m', `entry-${i}`, { count: i, approximate: false, model: 'm' })
    }
    expect(touchTokenCount(tokenCacheKey('m', 'entry-0'))).toBe(true)
    expect(touchTokenCount(tokenCacheKey('m', 'never counted'))).toBe(false)
    setTokenCount('m', 'overflow', { count: -1, approximate: false, model: 'm' })
    expect(peekTokenCountByKey(tokenCacheKey('m', 'entry-0'))?.count).toBe(0)
    expect(peekTokenCountByKey(tokenCacheKey('m', 'entry-1'))).toBeNull()
  })

  test('hasTokenCountByKey does not promote either — the sweep must not evict live entries', () => {
    for (let i = 0; i < TOKEN_CACHE_MAX_ENTRIES; i += 1) {
      setTokenCount('m', `entry-${i}`, { count: i, approximate: false, model: 'm' })
    }
    expect(hasTokenCountByKey(tokenCacheKey('m', 'entry-0'))).toBe(true)
    setTokenCount('m', 'overflow', { count: -1, approximate: false, model: 'm' })
    expect(hasTokenCountByKey(tokenCacheKey('m', 'entry-0'))).toBe(false)
  })
})

describe('the hook never hashes on the render path it can avoid', () => {
  test('the stored exact count is checked before the cache probe, not after', () => {
    // The probe costs an FNV pass over the whole entry; the stored value costs a
    // property read. Reversed, this was 2.31ms per render on the largest real
    // book against 0.024ms for the `length / 4` it replaced.
    const body = tokenCountsHookSource.slice(
      tokenCountsHookSource.indexOf('const resolveTokenCount ='),
      tokenCountsHookSource.indexOf('const enqueue ='),
    )
    // The persisted count now lives behind `lib/storedTokenCount`, which also
    // validates it against the model and the content length — it used to be
    // trusted blind on both counts. The performance contract is unchanged and is
    // what this test exists for: property reads before the O(content) FNV probe.
    // Asserted on the call, not on the `_lumiverse_token_count` literal, which
    // now survives in the hook only as prose in a comment.
    expect(body).toContain('readStoredTokenCount(')
    expect(body.indexOf('readStoredTokenCount(')).toBeLessThan(body.indexOf('entryTokenCacheKey('))
  })

  test('the render path is a pure read — the promoting getter is gone from the hook', () => {
    expect(tokenCountsHookSource).toContain('peekTokenCountByKey(')
    expect(stripComments(tokenCountsHookSource)).not.toContain('getTokenCount(')
  })

  test('every key in the hook comes from the memo, never from a raw hash', () => {
    // `tokenCacheKey` is the O(content) hash. One memoised call site per path:
    // resolve, enqueue, sweep, pointer-enter, pointer-leave.
    expect(stripComments(tokenCountsHookSource)).not.toContain('tokenCacheKey(')
    expect((tokenCountsHookSource.match(/entryTokenCacheKey\(/g) ?? [])).toHaveLength(5)
  })

  test('the pointer handlers index by id instead of scanning the book', () => {
    expect(tokenCountsHookSource).toContain('entryIndexRef.current.get(entryId)')
    expect(stripComments(tokenCountsHookSource)).not.toContain('entriesRef.current.find(')
  })

  test('pointer-enter promotes and probes in one traversal', () => {
    expect(tokenCountsHookSource).toContain('if (touchTokenCount(key)) return')
  })
})

describe('the entry table does not repaint every row for one number', () => {
  test('rows are memoised', () => {
    expect(entryTableSource).toContain('const EntryRow = memo(function EntryRow(')
  })

  test('the row receives the count as primitives, not a fresh object per render', () => {
    // A `ResolvedTokenCount` prop would allocate a new identity every render and
    // defeat the memo for every row on every cache write.
    expect(entryTableSource).toContain('tokenValue={tokens.value}')
    expect(entryTableSource).toContain('tokenExact={tokens.exact}')
  })

  test('the row callbacks are re-stabilised locally, so the memo actually holds', () => {
    // The workspace hands some of these down freshly allocated on every render
    // (`toggleEntrySelection` has no `useCallback` there), and this component does
    // not own that file.
    expect(entryTableSource).toContain('const stableActions = useMemo(')
    expect(entryTableSource).toContain('setSelectedEntryId={stableActions.setSelectedEntryId}')
    expect(entryTableSource).toContain('toggleEntrySelection={stableActions.toggleEntrySelection}')
    expect(entryTableSource).toContain('saveEntry={stableActions.saveEntry}')
    expect(entryTableSource).toContain('onEntryPointerEnter={stableActions.onEntryPointerEnter}')
    expect(entryTableSource).toContain('onEntryPointerLeave={stableActions.onEntryPointerLeave}')
  })

  test('selection membership is a set lookup, not a linear includes per row', () => {
    expect(entryTableSource).toContain('const selectedIdSet = useMemo(() => new Set(selectedIds)')
    expect(entryTableSource).toContain('selectedIdSet.has(entry.id)')
    expect(stripComments(entryTableSource)).not.toContain('selectedIds.includes(')
  })

  test('a dropped Tokens column costs nothing to resolve', () => {
    expect(entryTableSource).toContain('tokensVisible ? resolveTokenCount(entry) : NO_TOKENS')
  })

  test('the no-resolver fallback validates the stored count instead of trusting it', () => {
    // `getTokenEstimate` had the same two bugs the hook did, independently: it
    // read `_lumiverse_token_count` and its `_approximate` flag and nothing else,
    // so a count recorded for another model, or for text that has since been
    // edited, rendered as exact — no `~`.
    expect(entryTableSource).toContain('readStoredTokenCount(entry.extensions, entry.content, null)')
    expect(stripComments(entryTableSource)).not.toContain('_lumiverse_token_count_approximate')
    // The heuristic tier stays exactly where it was.
    expect(entryTableSource).toContain('estimateTokens(entry.content)')
  })

  test('the ResizeObserver is coalesced to one measurement per frame and cancelled', () => {
    // The callback forces a style flush (`readUiScale`) then a layout
    // (`getBoundingClientRect`). Unthrottled, a splitter drag ran it several times
    // a frame.
    expect(entryTableSource).toContain('requestAnimationFrame(')
    expect(entryTableSource).toContain('cancelAnimationFrame(frame)')
    expect(entryTableSource).toContain('observer.disconnect()')
  })

  test('a width change that resolves to the same columns does not re-render', () => {
    expect(entryTableSource).toContain('columnSignature(current) === columnSignature(next)')
  })
})

describe('the entry table renders a window, not the whole book', () => {
  test('the row list is virtualized', () => {
    // 25.0 DOM elements per row x 554 rows = 13,852 elements, measured at
    // 317-409ms of React mount plus style and layout in production React against
    // 14.5ms for 30 rows. It is the only O(entries) item on the open path.
    expect(entryTableSource).toContain("from '@tanstack/react-virtual'")
    expect(entryTableSource).toContain('const virtualizer = useVirtualizer(')
    expect(entryTableSource).toContain('virtualizer.getVirtualItems().map(')
    expect(entryTableSource).toContain('virtualizer.getTotalSize()')
    expect(stripComments(entryTableSource)).not.toContain('filteredEntries.map(')
  })

  test('rows are keyed by entry id, so a filter or a sort cannot reuse the wrong DOM', () => {
    expect(entryTableSource).toContain('getItemKey: (index) => filteredEntries[index]?.id ?? index')
  })

  test('the library measurers are used unchanged', () => {
    // This version of `@tanstack/virtual-core` contains no `getBoundingClientRect`
    // at all: it measures with `offsetWidth`/`offsetHeight` and scrolls with
    // `scrollTop`/`scrollTo({ top })`, all layout px, which is the space
    // `body > * { zoom }` leaves alone. Four other lists in this app ship on the
    // defaults un-drifted. Overriding one measurer and not the other would be
    // less internally consistent, not more.
    expect(entryTableSource).toContain('ref={virtualizer.measureElement}')
    expect(stripComments(entryTableSource)).not.toContain('measureElement:')
    expect(stripComments(entryTableSource)).not.toContain('observeElementRect')
  })

  test('the scroll margin is measured against a box that changes when it changes', () => {
    // The header is NOT the only thing above the rows: the loading, empty-book
    // and hidden-selection lines are siblings too, and on the first commit
    // `loading` is false with `entries` still `[]`, so the empty-state div is
    // mounted when the layout effect first runs. A header-only ResizeObserver
    // never sees it unmount and the wrong margin latches for the session.
    expect(entryTableSource).toContain('styles.entryTableLead')
    expect(entryTableSource).toContain('observer.observe(lead)')
    expect(entryTableSource).toContain('spacer.offsetTop')
    // ...and the spacer is never gated on `!loading`, or a slow load leaves the
    // ref null and the margin stuck at 0 forever.
    expect(entryTableSource).toContain('ref={spacerRef}')
    expect(entryTableSource).toContain('count: loading ? 0 : filteredEntries.length')
    expect(entryTableSource).toContain('scrollMargin: scrollMargin ?? 0')
    expect(entryTableSource).toContain('virtualRow.start - (scrollMargin ?? 0)')
  })

  test('a density or font-scale change invalidates the measured heights', () => {
    // `getMeasurements` drops `itemSizeCache` only when the list is disabled or
    // its lane count changes — handing it a new `estimateSize` does not. Without
    // this, switching "Entry row density" leaves every already-measured row at
    // its old height and the list gains overlaps and gaps.
    expect(entryTableSource).toContain('virtualizer.measure()')
    expect(entryTableSource).toMatch(
      /virtualizer\.measure\(\)\s*\}, \[rowMetrics\.density, rowMetrics\.fontScale, virtualizer\]\)/,
    )
    // Read reactively, not once on mount — both can change at runtime.
    expect(entryTableSource).toContain('new MutationObserver(')
    expect(entryTableSource).toContain("attributeFilter: ['data-density']")
    expect(entryTableSource).toContain("getPropertyValue('--lumiverse-font-scale')")
  })
})

describe('lorebook row metrics', () => {
  test('at font scale 1 the estimate is exactly the CSS constant plus the gap', () => {
    // This is the assertion that catches someone editing `.entryRow { min-height }`
    // without editing the module.
    expect(entryRowPitch('compact', 1)).toBe(ENTRY_ROW_MIN_HEIGHT.compact + ENTRY_ROW_GAP)
    expect(entryRowPitch('balanced', 1)).toBe(ENTRY_ROW_MIN_HEIGHT.balanced + ENTRY_ROW_GAP)
    expect(entryRowPitch('spacious', 1)).toBe(ENTRY_ROW_MIN_HEIGHT.spacious + ENTRY_ROW_GAP)
  })

  test('monotonic in density', () => {
    expect(entryRowPitch('compact')).toBeLessThan(entryRowPitch('balanced'))
    expect(entryRowPitch('balanced')).toBeLessThan(entryRowPitch('spacious'))
  })

  test('monotonic in font scale, because the row content outgrows the min-height', () => {
    expect(entryRowPitch('compact', 1.15)).toBeGreaterThan(entryRowPitch('compact', 1))
    expect(entryRowPitch('compact', 1.5)).toBeGreaterThan(entryRowPitch('compact', 1.15))
    expect(entryRowPitch('spacious', 2)).toBeGreaterThan(entryRowPitch('spacious', 1))
  })

  test('a non-finite or non-positive font scale falls back to 1, never to NaN', () => {
    // A NaN estimate makes `getTotalSize()` NaN and the whole list disappears.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -2]) {
      expect(entryRowPitch('compact', bad)).toBe(entryRowPitch('compact', 1))
    }
    expect(normalizeFontScale('1.15')).toBeCloseTo(1.15)
    expect(normalizeFontScale('')).toBe(1)
    expect(normalizeFontScale(null)).toBe(1)
    expect(normalizeFontScale('not a number')).toBe(1)
  })

  test('an unknown data-density attribute degrades to the shipped default', () => {
    expect(normalizeRowDensity('balanced')).toBe('balanced')
    expect(normalizeRowDensity('large')).toBe(DEFAULT_ENTRY_ROW_DENSITY)
    expect(normalizeRowDensity(null)).toBe(DEFAULT_ENTRY_ROW_DENSITY)
    expect(normalizeRowDensity(undefined)).toBe(DEFAULT_ENTRY_ROW_DENSITY)
  })
})

describe('entry reveal planning', () => {
  const filtered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const index = buildEntryIndexMap(filtered)
  const plan = (
    selected: string | null,
    revealed: string | null,
    known: string[] = ['a', 'b', 'c', 'hidden'],
  ) => planEntryReveal(
    selected,
    revealed,
    (id) => index.get(id),
    (id) => known.includes(id),
  )

  test('builds an id index instead of scanning the book per reveal', () => {
    expect(buildEntryIndexMap(filtered).get('c')).toBe(2)
    expect(buildEntryIndexMap([]).size).toBe(0)
  })

  test('no selection clears the latch', () => {
    expect(plan(null, 'b')).toEqual({ kind: 'clear' })
  })

  test('a listed entry yields its index', () => {
    expect(plan('b', null)).toEqual({ kind: 'reveal', index: 1 })
  })

  test('the same id twice is a no-op', () => {
    expect(plan('b', 'b')).toEqual({ kind: 'skip' })
  })

  test('a selection that changes after a reveal re-plans', () => {
    expect(plan('c', 'b')).toEqual({ kind: 'reveal', index: 2 })
  })

  test('an unknown id is pending and MUST NOT be latched', () => {
    // The regression this exists for: the list arrives one commit after the
    // selection on open. Latching here consumes the reveal and "open onto entry
    // #500" silently never happens for the rest of the session.
    const pending = plan('later', null, [])
    expect(pending).toEqual({ kind: 'pending' })
    expect(revealPlanLatches(pending)).toBe(false)
  })

  test('an entry filtered out of the list is reported, not silently skipped', () => {
    const hidden = plan('hidden', null)
    expect(hidden).toEqual({ kind: 'filteredOut' })
    // Not latched: clearing the filter has to be able to complete the reveal.
    expect(revealPlanLatches(hidden)).toBe(false)
  })

  test('filtering an already-revealed entry out still reports it', () => {
    expect(plan('hidden', 'hidden')).toEqual({ kind: 'filteredOut' })
  })

  test('an indexOf-shaped -1 is treated as unknown, never scrolled to', () => {
    expect(planEntryReveal('x', null, () => -1, () => false)).toEqual({ kind: 'pending' })
    expect(planEntryReveal('x', null, () => -1, () => true)).toEqual({ kind: 'filteredOut' })
  })
})

describe('click-to-open, table half', () => {
  test('reveals the selected row: mounted rows natively, virtualized rows by index', () => {
    expect(entryTableSource).toContain('data-entry-id={entry.id}')
    expect(entryTableSource).toContain("scrollIntoView({ block: 'nearest' })")
    expect(entryTableSource).toContain('regionRef.current?.querySelector')
    // Tier 2. A virtualized-away row has no DOM node, so `querySelector` returns
    // null for exactly the entries that most need scrolling to and the round-3
    // feature would die silently. The native path is kept as tier 1 — it is the
    // only one provably immune to `body > * { zoom }` and it is cheaper whenever
    // the row is mounted.
    expect(entryTableSource).toContain('virtualizer.scrollToIndex(plan.index,')
    // The same alignment in both tiers, or the same click scrolls differently
    // depending on whether the row fell inside the overscan window. `align: 'auto'`
    // is virtual-core's spelling of `block: 'nearest'`: `getOffsetForIndex`
    // returns the current offset unchanged unless the row is past an edge.
    expect(entryTableSource).toContain("{ align: 'auto' }")
    expect(stripComments(entryTableSource)).not.toContain("align: 'center'")
    expect(stripComments(entryTableSource)).not.toContain("align: 'start'")
    // Never latch when the index is unknown, and never scroll by index before
    // `scrollMargin` is measured — the offsets are relative to it.
    expect(entryTableSource).toContain("if (plan.kind !== 'reveal') return")
    expect(entryTableSource).toContain('if (scrollMargin === null) return')
    // A selection the active filter excludes is surfaced instead of doing nothing.
    expect(entryTableSource).toContain("setSelectionHiddenByFilter(plan.kind === 'filteredOut')")
    expect(entryTableSource).toContain('styles.entrySelectionNotice')
  })

  test('never converts the scroll through the ui scale', () => {
    // `body > * { zoom: var(--lumiverse-ui-scale) }` (`theme/reset.css`) makes
    // `getBoundingClientRect()` rendered px — but native `scrollIntoView` computes
    // its delta in the element's own layout space and never crosses that boundary.
    // Dividing by `readUiScale()` here would BE the bug. The only permitted
    // `readUiScale` in this file is the width measurement, which really does read
    // a client rect.
    expect((stripComments(entryTableSource).match(/readUiScale\(\)/g) ?? [])).toHaveLength(1)
    const revealStart = entryTableSource.indexOf('const revealedEntryId')
    expect(revealStart).toBeGreaterThan(0)
    const reveal = stripComments(
      entryTableSource.slice(revealStart, entryTableSource.indexOf('styles.entryTableRegion', revealStart)),
    )
    expect(reveal).not.toContain('readUiScale')
    expect(reveal).not.toContain('getBoundingClientRect')
    expect(reveal).not.toContain('scrollTop')
  })

  test('re-selecting the already-revealed entry is a no-op', () => {
    expect(entryTableSource).toContain('if (revealedEntryId.current === selectedEntryId) return')
  })
})
