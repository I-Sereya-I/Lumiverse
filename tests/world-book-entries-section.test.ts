import { describe, expect, test } from 'bun:test'

// The chat World Book panel's entry list is an accordion: clicking a row mounts
// the shared entry editor directly underneath it. It had no test coverage at
// all, so the two fixes below are pinned against the source text. There is no
// DOM environment in this suite — these are source assertions, not renders.
const entriesSectionSource = await Bun.file(
  new URL('../frontend/src/components/shared/WorldBookEntriesSection.tsx', import.meta.url),
).text()
// The reveal copies the shape of this hook: set the state, wait one frame for
// the target to re-render, then hand off to native scrollIntoView.
const editKeyboardSource = await Bun.file(
  new URL('../frontend/src/hooks/useEditKeyboard.ts', import.meta.url),
).text()

function effectBody(source: string, dependency: string): string {
  const marker = `}, [${dependency}])`
  const end = source.indexOf(marker)
  if (end < 0) throw new Error(`no effect found with dependency list [${dependency}]`)
  const start = source.lastIndexOf('useEffect(() => {', end)
  if (start < 0) throw new Error(`no useEffect opening found before [${dependency}]`)
  return source.slice(start, end)
}

describe('world book entries accordion — reveal on open', () => {
  test('scrolls the opened entry into view one frame after the editor mounts', () => {
    const reveal = effectBody(entriesSectionSource, 'selectedEntryId')
    expect(reveal).toContain('requestAnimationFrame(')
    expect(reveal).toContain("scrollIntoView({ behavior: 'smooth', block: 'center' })")
    // Matches the house idiom rather than inventing a second one.
    expect(editKeyboardSource).toContain('requestAnimationFrame(')
    expect(editKeyboardSource).toContain("scrollIntoView({ behavior: 'smooth', block: 'center' })")
  })

  test('does not scroll when the entry is collapsed', () => {
    // Clicking the open entry toggles selectedEntryId back to null. Scrolling to
    // a row the user just closed is disorienting, so the effect bails first.
    const reveal = effectBody(entriesSectionSource, 'selectedEntryId')
    expect(reveal).toContain('if (!selectedEntryId) return')
    // The toggle-closed behaviour itself is advertised by the Expand/Collapse
    // button and the row context menu, so it must survive.
    expect(entriesSectionSource).toContain(
      'onToggleExpand={() => setSelectedEntryId((current) => (current === entry.id ? null : entry.id))}',
    )
  })

  test('scopes the reveal query to this list and cancels a superseded frame', () => {
    const reveal = effectBody(entriesSectionSource, 'selectedEntryId')
    // The lorebook editor table renders its own data-entry-id rows and can be
    // mounted at the same time, so a bare document.querySelector could match it.
    expect(reveal).toContain('entryListRef.current')
    expect(reveal).toContain('[data-entry-id="${entryId}"]')
    expect(reveal).toContain('cancelAnimationFrame(frame)')
    expect(entriesSectionSource).toContain('<div ref={entryListRef} className={styles.entryList}>')
    // The attribute sits on the sortable wrapper, so the reveal target's box
    // includes the inline editor, not just the collapsed header row.
    expect(entriesSectionSource).toContain('data-entry-id={entry.id}')
  })

  test('never converts scroll positions through the UI-scale layer', () => {
    // body > * carries zoom: var(--lumiverse-ui-scale), but native
    // scrollIntoView resolves inside the element's own layout space. Dividing by
    // readUiScale() here would introduce the drift it is meant to remove.
    expect(entriesSectionSource).not.toContain("from '@/lib/uiScale'")
    // The only mention left is the comment that explains why it is absent.
    expect(entriesSectionSource.match(/readUiScale/g) ?? []).toHaveLength(1)
    // No manual scroll arithmetic either — the reveal hands the whole job to
    // the browser, which is what keeps the zoom question from arising.
    expect(entriesSectionSource).not.toContain('.scrollTop')
    expect(entriesSectionSource).not.toContain('.offsetTop')
    expect(entriesSectionSource).not.toContain('.clientHeight')
  })
})

describe('world book entries accordion — view prefs must not collapse the editor', () => {
  test('reads the persisted prefs by primitive field, not by store object', () => {
    // useStore hands back a fresh worldBookEntryViewPrefs object on every
    // settings write and again on loadSettings hydration, so an object
    // dependency re-fired for unrelated books and unrelated settings.
    expect(entriesSectionSource).toContain('const bookViewPref = worldBookEntryViewPrefs[selectedBookId]')
    expect(entriesSectionSource).toContain("const prefSortBy = bookViewPref?.sortBy ?? 'custom'")
    expect(entriesSectionSource).toContain("const prefSortDir = bookViewPref?.sortDir ?? 'asc'")
    expect(entriesSectionSource).toContain('const prefPageSize = bookViewPref?.pageSize || DEFAULT_PAGE_SIZE')
    expect(entriesSectionSource).not.toContain('}, [selectedBookId, worldBookEntryViewPrefs])')
  })

  test('applies prefs without touching the selection', () => {
    const applyPrefs = effectBody(entriesSectionSource, 'prefSortBy, prefSortDir, prefPageSize')
    expect(applyPrefs).toContain('setEntrySortBy(prefSortBy)')
    expect(applyPrefs).toContain('setEntrySortDir(prefSortDir)')
    expect(applyPrefs).toContain('setEntryPageSize(prefPageSize)')
    // Changing sort order or page size reorders the same entries. Closing the
    // open editor is pure loss, and was the silent-collapse bug.
    expect(applyPrefs).not.toContain('setSelectedEntryId')
    expect(applyPrefs).not.toContain('setSelectMode')
    expect(applyPrefs).not.toContain('setEntrySearchFilter')
  })

  test('resets the transient view state on a book change only', () => {
    const resetOnBook = effectBody(entriesSectionSource, 'selectedBookId')
    expect(resetOnBook).toContain('setSelectedEntryId(null)')
    expect(resetOnBook).toContain('setEntryPage(1)')
    expect(resetOnBook).toContain("setEntrySearchFilter('')")
    expect(resetOnBook).toContain('setSelectMode(false)')
    expect(resetOnBook).toContain('setSelectedIds([])')
    expect(resetOnBook).toContain('setContextMenu(null)')
    expect(resetOnBook).toContain('setTypeMenu(null)')
    expect(resetOnBook).toContain('setPositionMenu(null)')
    // The prefs live in a separate effect now; re-reading them here would
    // reintroduce the object dependency.
    expect(resetOnBook).not.toContain('worldBookEntryViewPrefs')
  })

  test('drops a selection that the freshly loaded page no longer lists', () => {
    // Narrowing the prefs dependency means page size changes no longer blanket
    // clear the selection, so absence has to be checked against the real list.
    const prune = effectBody(entriesSectionSource, 'entries')
    expect(prune).toContain('setSelectedEntryId((current) => (')
    expect(prune).toContain('current && !entries.some((entry) => entry.id === current) ? null : current')
    expect(prune).toContain('setSelectedIds((current) => current.filter((id) => entries.some((entry) => entry.id === id)))')
  })

  test('keeps clearing the selection when the user pages', () => {
    expect(entriesSectionSource).toMatch(
      /onPageChange=\{\(page\) => \{\s*setEntryPage\(page\)\s*setSelectedEntryId\(null\)/,
    )
  })
})
