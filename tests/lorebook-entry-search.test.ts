import { describe, expect, test } from 'bun:test'
import {
  createEntrySearchIndex,
  filterEntriesByQuery,
  foldEntry,
  normalizeEntryQuery,
  type SearchableEntry,
} from '../frontend/src/lib/lorebookEntrySearch'

const workspaceSource = await Bun.file(
  'frontend/src/components/world-book-editor/LorebookEditorWorkspace.tsx',
).text()

function entry(over: Partial<SearchableEntry> = {}): SearchableEntry {
  return { comment: 'Escanor', content: 'The Lion Sin of Pride', key: ['sunshine'], ...over }
}

describe('query normalisation', () => {
  test('trims and lowercases, and is idempotent', () => {
    expect(normalizeEntryQuery('  Escanor  ')).toBe('escanor')
    expect(normalizeEntryQuery(normalizeEntryQuery('  Escanor  '))).toBe('escanor')
    expect(normalizeEntryQuery('   ')).toBe('')
  })
})

describe('matching preserves the original inline filter semantics exactly', () => {
  test('searches comment, content and keys, case-insensitively', () => {
    const index = createEntrySearchIndex()
    expect(index.matches(entry(), 'escanor')).toBe(true)
    expect(index.matches(entry(), 'lion sin')).toBe(true)
    expect(index.matches(entry(), 'sunshine')).toBe(true)
    expect(index.matches(entry(), 'meliodas')).toBe(false)
  })

  test('an empty query matches everything', () => {
    const index = createEntrySearchIndex()
    expect(index.matches(entry(), '')).toBe(true)
  })

  test('a match cannot span two fields', () => {
    // The rejected single-haystack design would join comment and content and
    // report a hit for a query straddling the seam. Three separate reads cannot.
    const index = createEntrySearchIndex()
    const straddling = entry({ comment: 'foo', content: 'bar', key: [] })
    expect(index.matches(straddling, 'foobar')).toBe(false)
    expect(index.matches(straddling, 'o b')).toBe(false)
    expect(index.matches(straddling, 'foo')).toBe(true)
    expect(index.matches(straddling, 'bar')).toBe(true)
  })

  test('matches inside a key, not only a whole key', () => {
    const index = createEntrySearchIndex()
    expect(index.matches(entry({ key: ['sunshine', 'pride'] }), 'shin')).toBe(true)
    expect(index.matches(entry({ key: [] }), 'shin')).toBe(false)
  })
})

describe('the fold is paid once per entry per edit, not once per keystroke', () => {
  test('typing a query does not refold anything', () => {
    const index = createEntrySearchIndex()
    const one = entry()
    const two = entry({ comment: 'Merlin', content: 'Boar Sin of Gluttony', key: ['infinity'] })

    // Simulate someone typing "esc" one character at a time over both entries.
    for (const query of ['e', 'es', 'esc']) {
      for (const e of [one, two]) index.matches(e, query)
    }

    // Two entries, two folds — NOT six.
    expect(index.folds()).toBe(2)
  })

  test('an empty query folds nothing at all', () => {
    const index = createEntrySearchIndex()
    index.matches(entry(), '')
    expect(index.folds()).toBe(0)
  })

  test('an edited entry is a fresh object, so it refolds', () => {
    const index = createEntrySearchIndex()
    const before = entry()
    index.matches(before, 'escanor')
    expect(index.folds()).toBe(1)

    // What `saveEntry` does: `{ ...entry, ...updates }` — a new object.
    const after = { ...before, content: 'The One' }
    expect(index.matches(after, 'the one')).toBe(true)
    expect(index.folds()).toBe(2)
  })

  test('an in-place mutation fails safe rather than serving a stale haystack', () => {
    // The WeakMap alone would happily return the pre-mutation fold. The length
    // re-checks are what make this a miss.
    const index = createEntrySearchIndex()
    const mutable = entry()
    index.matches(mutable, 'escanor')

    mutable.content = 'Something considerably longer than before'
    expect(index.matches(mutable, 'considerably')).toBe(true)
    expect(index.folds()).toBe(2)
  })

  test('a key edit is caught even when the key COUNT is unchanged', () => {
    // keyCount alone would miss this; the summed key length catches it.
    const index = createEntrySearchIndex()
    const mutable = entry({ key: ['sunshine'] })
    index.matches(mutable, 'sunshine')

    mutable.key = ['moonlight!']
    expect(index.matches(mutable, 'moonlight')).toBe(true)
    expect(index.folds()).toBe(2)
  })

  test('the injected folder is what actually runs', () => {
    let calls = 0
    const index = createEntrySearchIndex((e) => {
      calls += 1
      return { comment: e.comment.toLowerCase(), content: '', keys: [] }
    })
    expect(index.matches(entry(), 'lion')).toBe(false) // content was blanked
    expect(index.matches(entry({ comment: 'Escanor' }), 'escanor')).toBe(true)
    expect(calls).toBe(2)
  })
})

describe('filterEntriesByQuery', () => {
  test('an empty query returns the input array BY REFERENCE', () => {
    // Identity is the contract `filterBooks`/`filterActions` also honour: an
    // unused search box must cost nothing and must not churn downstream memos.
    const index = createEntrySearchIndex()
    const entries = [entry(), entry({ comment: 'Merlin' })]
    expect(filterEntriesByQuery(entries, '', index)).toBe(entries)
    expect(filterEntriesByQuery(entries, '   ', index)).toBe(entries)
    expect(index.folds()).toBe(0)
  })

  test('normalises internally, so a raw string cannot be passed by mistake', () => {
    const index = createEntrySearchIndex()
    const entries = [entry(), entry({ comment: 'Merlin', content: 'Gluttony', key: [] })]
    expect(filterEntriesByQuery(entries, '  ESCANOR  ', index)).toHaveLength(1)
  })

  test('preserves input order', () => {
    const index = createEntrySearchIndex()
    const entries = [
      entry({ comment: 'a', content: 'sin', key: [] }),
      entry({ comment: 'b', content: 'sin', key: [] }),
      entry({ comment: 'c', content: 'sin', key: [] }),
    ]
    expect(filterEntriesByQuery(entries, 'sin', index).map((e) => e.comment)).toEqual(['a', 'b', 'c'])
  })
})

describe('the workspace wires it correctly', () => {
  test('the inline per-keystroke lowercase is gone', () => {
    // The exact shape of the bug: three fresh lowercased strings per entry, per
    // keystroke, inside the filter callback.
    expect(workspaceSource).not.toContain('entry.content.toLowerCase()')
    expect(workspaceSource).not.toContain('entry.comment.toLowerCase()')
    expect(workspaceSource).not.toContain('key.toLowerCase()')
  })

  test('the index is created ONCE, not per query', () => {
    // `useMemo(..., [])` is load-bearing: any dependency on `entrySearch` would
    // rebuild the WeakMap per keystroke and restore the original cost while
    // looking like a fix.
    expect(workspaceSource).toContain('const entrySearchIndex = useMemo(() => createEntrySearchIndex(), [])')
    expect(workspaceSource).toContain('filterEntriesByQuery(byType, entrySearch, entrySearchIndex)')
  })

  test('the type filter still runs, and runs first', () => {
    expect(workspaceSource).toContain("typeFilter === 'all'")
    expect(workspaceSource).toContain('getTriggerType(entry) === typeFilter')
    // Comments stripped first: the explanatory comment inside this memo names
    // `filterEntriesByQuery` above the code that calls it, which would invert
    // the ordering check.
    const memo = workspaceSource
      .slice(
        workspaceSource.indexOf('const filteredEntries = useMemo('),
        workspaceSource.indexOf('// Background token counting'),
      )
      .replace(/\/\/[^\n]*/g, '')
    expect(memo.indexOf('getTriggerType')).toBeGreaterThan(-1)
    expect(memo.indexOf('getTriggerType')).toBeLessThan(memo.indexOf('filterEntriesByQuery'))
  })

  test('the token hook still receives the filtered list', () => {
    // Pinned separately at tests/lorebook-editor.test.ts:1738 — restated here so
    // a change to this memo cannot quietly detach the token pipeline.
    expect(workspaceSource).toContain(
      'useTokenCounts({ bookId: selectedBookId, entries: filteredEntries, selectedEntryId })',
    )
  })
})

describe('measured against a book the size of the real one', () => {
  test('typing does not scale with book size', () => {
    // 554 entries x ~2,243 chars is the real book this was reported on.
    const entries: SearchableEntry[] = Array.from({ length: 554 }, (_, i) => ({
      comment: `Entry ${i}`,
      content: `${'Lorem ipsum dolor sit amet. '.repeat(80)}marker${i}`,
      key: [`key-${i}`, `alias-${i}`],
    }))
    const index = createEntrySearchIndex()

    // The old code folded every entry on every keystroke: 554 x 8 = 4,432 folds.
    for (const query of ['m', 'ma', 'mar', 'mark', 'marke', 'marker', 'marker5', 'marker55']) {
      filterEntriesByQuery(entries, query, index)
    }

    expect(index.folds()).toBe(554)
    // 553 is the highest index, so `marker553` has no `marker553x` siblings —
    // `marker53` would also match marker530..marker539.
    expect(filterEntriesByQuery(entries, 'marker553', index)).toHaveLength(1)
    expect(filterEntriesByQuery(entries, 'marker53', index)).toHaveLength(11)
  })
})

describe('foldEntry', () => {
  test('lowercases all three fields and keeps keys separate', () => {
    expect(foldEntry({ comment: 'AB', content: 'CD', key: ['EF', 'GH'] })).toEqual({
      comment: 'ab',
      content: 'cd',
      keys: ['ef', 'gh'],
    })
  })
})
