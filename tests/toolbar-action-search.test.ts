import { describe, expect, test } from 'bun:test'
import {
  actionMatchesQuery,
  canMoveWithinFiltered,
  filterActionIds,
  filterActions,
  moveWithinFiltered,
  normalizeActionQuery,
  type SearchableToolbarAction,
} from '../frontend/src/lib/toolbarActionSearch'

const searchSource = await Bun.file(
  new URL('../frontend/src/lib/toolbarActionSearch.ts', import.meta.url),
).text()

/**
 * A miniature of the real catalog built in `useQuickToolbarActions.ts:112-179`:
 * one drawer tab, two settings tabs, two commands that share the boilerplate
 * description `'Run this command.'`, and one extension input action. The shared
 * description is the whole reason `id` is searched as a third field.
 */
const catalog: SearchableToolbarAction[] = [
  { id: 'lorebook', label: 'Lorebook', description: 'Browse and edit world books.' },
  { id: 'settings', label: 'Settings', description: 'Open productivity settings.' },
  { id: 'settings:appearance', label: 'Appearance', description: 'Theme, colours and density.' },
  { id: 'command:regenerate', label: 'Regenerate', description: 'Run this command.' },
  { id: 'command:continue', label: 'Continue', description: 'Run this command.' },
  { id: 'input-action:acme:summarize', label: 'Summarize', description: 'Extension action.' },
  { id: 'no-desc', label: 'Bare Row' },
]

const ids = (actions: SearchableToolbarAction[]) => actions.map((action) => action.id)

describe('normalizeActionQuery', () => {
  const cases: Array<[input: string, expected: string]> = [
    ['', ''],
    ['   ', ''],
    ['\t\n ', ''],
    ['Lore', 'lore'],
    ['  LORE  ', 'lore'],
    ['Command:', 'command:'],
    ['two words', 'two words'],
  ]

  for (const [input, expected] of cases) {
    test(`normalises ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(normalizeActionQuery(input)).toBe(expected)
    })
  }

  test('is idempotent, so a pre-normalised needle can be passed anywhere', () => {
    for (const [input] of cases) {
      const once = normalizeActionQuery(input)
      expect(normalizeActionQuery(once)).toBe(once)
    }
  })
})

describe('actionMatchesQuery', () => {
  const action = catalog[2] // settings:appearance / Appearance / Theme, colours and density.

  const cases: Array<[name: string, query: string, expected: boolean]> = [
    ['empty query matches everything', '', true],
    ['whitespace-only query matches everything', '   ', true],
    ['matches the label', 'appear', true],
    ['matches the label case-insensitively', 'APPEAR', true],
    ['matches the label with surrounding space', '  appear  ', true],
    ['matches the description', 'colours', true],
    ['matches the id prefix', 'settings:', true],
    ['matches mid-id', ':appearance', true],
    ['does not match unrelated text', 'zzz', false],
    ['is substring, not fuzzy', 'apprnce', false],
    ['is a single substring, not an AND over terms', 'theme density', false],
  ]

  for (const [name, query, expected] of cases) {
    test(name, () => {
      expect(actionMatchesQuery(action, query)).toBe(expected)
    })
  }

  test('tolerates a missing description', () => {
    const bare = catalog[6]
    expect(actionMatchesQuery(bare, 'bare')).toBe(true)
    expect(actionMatchesQuery(bare, 'no-desc')).toBe(true)
    expect(actionMatchesQuery(bare, 'command')).toBe(false)
  })

  test('accepts a raw query as well as a normalised needle', () => {
    // Deliberate divergence from `bookMatchesQuery`, which requires the caller
    // to pre-normalise. Normalisation is idempotent, so both work.
    expect(actionMatchesQuery(action, normalizeActionQuery('  APPEAR '))).toBe(true)
    expect(actionMatchesQuery(action, '  APPEAR ')).toBe(true)
  })
})

describe('filterActions', () => {
  test('returns the input array identity for an empty or whitespace query', () => {
    // Identity matters: consumers hold this in a `useMemo` and a fresh array on
    // every keystroke that clears the field would re-render the whole list.
    expect(filterActions(catalog, '')).toBe(catalog)
    expect(filterActions(catalog, '   ')).toBe(catalog)
  })

  const cases: Array<[query: string, expected: string[]]> = [
    ['lorebook', ['lorebook']],
    ['LOREBOOK', ['lorebook']],
    ['  lorebook  ', ['lorebook']],
    // label match on one row, id match on another.
    ['settings', ['settings', 'settings:appearance']],
    // id-only bucketing: neither label nor description contains "command:".
    ['command:', ['command:regenerate', 'command:continue']],
    // The shared boilerplate description; useless as a discriminator, which is
    // exactly why `id` is searched too.
    ['run this command', ['command:regenerate', 'command:continue']],
    ['input-action:acme', ['input-action:acme:summarize']],
    ['zzz', []],
  ]

  for (const [query, expected] of cases) {
    test(`filters ${JSON.stringify(query)} to [${expected.join(', ')}]`, () => {
      expect(ids(filterActions(catalog, query))).toEqual(expected)
    })
  }

  test('preserves input order rather than ranking matches', () => {
    expect(ids(filterActions(catalog, 'e'))).toEqual(
      ids(catalog.filter((action) => actionMatchesQuery(action, 'e'))),
    )
  })

  test('is generic over the element type, so extra fields survive', () => {
    const rows = catalog.map((action) => ({ ...action, icon: action.id }))
    const filtered = filterActions(rows, 'lorebook')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].icon).toBe('lorebook')
  })
})

describe('filterActionIds', () => {
  const allIds = catalog.map((action) => action.id)
  const byId = new Map(catalog.map((action) => [action.id, action]))

  test('returns the input array identity for an empty or whitespace query', () => {
    // This is what lets a consumer pass the result straight to
    // `<SortableContext items={...}>` without changing dnd-kit's behaviour
    // while no search is active.
    expect(filterActionIds(allIds, catalog, '')).toBe(allIds)
    expect(filterActionIds(allIds, byId, '   ')).toBe(allIds)
  })

  test('accepts an array, a Map or a resolver and agrees across all three', () => {
    const fromArray = filterActionIds(allIds, catalog, 'settings')
    const fromMap = filterActionIds(allIds, byId, 'settings')
    const fromFn = filterActionIds(allIds, (id) => byId.get(id), 'settings')
    expect(fromArray).toEqual(['settings', 'settings:appearance'])
    expect(fromMap).toEqual(fromArray)
    expect(fromFn).toEqual(fromArray)
  })

  test('preserves the given id order, not catalog order', () => {
    const reversed = [...allIds].reverse()
    expect(filterActionIds(reversed, catalog, 'settings')).toEqual(['settings:appearance', 'settings'])
  })

  test('drops ids that resolve to nothing while a query is active', () => {
    // Both checklist surfaces already render `null` for these, so dropping them
    // is invisible — but leaving them in would corrupt the visible-neighbour
    // arithmetic in `moveWithinFiltered`.
    const withGhost = ['ghost', 'lorebook']
    expect(filterActionIds(withGhost, catalog, 'lorebook')).toEqual(['lorebook'])
    expect(filterActionIds(withGhost, catalog, 'ghost')).toEqual([])
  })

  test('keeps unresolvable ids when the query is empty, via the identity return', () => {
    const withGhost = ['ghost', 'lorebook']
    expect(filterActionIds(withGhost, catalog, '')).toBe(withGhost)
  })

  test('agrees with filterActions over the same rows', () => {
    for (const query of ['settings', 'command:', 'run this command', 'zzz', 'e']) {
      expect(filterActionIds(allIds, catalog, query)).toEqual(ids(filterActions(catalog, query)))
    }
  })
})

/**
 * The pre-existing behaviour this must reproduce when nothing is filtered:
 * `useQuickToolbarActions.ts:227-234`. It bails (writes nothing) when the swap
 * would run off either end, which is the same observable outcome as returning
 * the input identity.
 */
function pairwiseSwap(orderedIds: string[], id: string, direction: -1 | 1): string[] {
  const next = [...orderedIds]
  const index = next.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= next.length) return orderedIds
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

describe('moveWithinFiltered', () => {
  const ordered = ['a', 'b', 'c', 'd', 'e']
  const all = [...ordered]

  test('with no filter active it reproduces the existing pairwise swap exactly', () => {
    // Table-driven over every row and both directions: adopting this function
    // must be a no-op while the search box is empty.
    for (const id of ordered) {
      for (const direction of [-1, 1] as const) {
        const expected = pairwiseSwap(ordered, id, direction)
        const actual = moveWithinFiltered(ordered, all, id, direction)
        if (expected === ordered) {
          expect(actual).toBe(ordered)
        } else {
          expect(actual).toEqual(expected)
        }
      }
    }
  })

  const cases: Array<{
    name: string
    orderedIds: string[]
    filteredIds: string[]
    id: string
    direction: -1 | 1
    expected: string[] | 'identity'
  }> = [
    {
      name: 'jumps over hidden ids when moving up',
      orderedIds: ['a', 'b', 'c', 'd'],
      filteredIds: ['a', 'd'],
      id: 'd',
      direction: -1,
      expected: ['d', 'a', 'b', 'c'],
    },
    {
      name: 'jumps over hidden ids when moving down, landing immediately past the neighbour',
      orderedIds: ['a', 'b', 'c', 'd'],
      filteredIds: ['a', 'd'],
      id: 'a',
      direction: 1,
      expected: ['b', 'c', 'd', 'a'],
    },
    {
      name: 'moves one visible step at a time when three rows are visible',
      orderedIds: ['a', 'x', 'b', 'y', 'c'],
      filteredIds: ['a', 'b', 'c'],
      id: 'c',
      direction: -1,
      expected: ['a', 'x', 'c', 'b', 'y'],
    },
    {
      name: 'moving the middle visible row down lands it past the next visible row',
      orderedIds: ['a', 'x', 'b', 'y', 'c'],
      filteredIds: ['a', 'b', 'c'],
      id: 'b',
      direction: 1,
      expected: ['a', 'x', 'y', 'c', 'b'],
    },
    {
      name: 'is a no-op at the visible start even though hidden ids sit above it',
      orderedIds: ['x', 'y', 'a', 'b'],
      filteredIds: ['a', 'b'],
      id: 'a',
      direction: -1,
      expected: 'identity',
    },
    {
      name: 'is a no-op at the visible end even though hidden ids sit below it',
      orderedIds: ['a', 'b', 'x', 'y'],
      filteredIds: ['a', 'b'],
      id: 'b',
      direction: 1,
      expected: 'identity',
    },
    {
      name: 'a filter matching exactly one row disables the up direction',
      orderedIds: ['a', 'b', 'c'],
      filteredIds: ['b'],
      id: 'b',
      direction: -1,
      expected: 'identity',
    },
    {
      name: 'a filter matching exactly one row disables the down direction',
      orderedIds: ['a', 'b', 'c'],
      filteredIds: ['b'],
      id: 'b',
      direction: 1,
      expected: 'identity',
    },
    {
      name: 'is a no-op when the id is not in filteredIds (not visible)',
      orderedIds: ['a', 'b', 'c'],
      filteredIds: ['a', 'c'],
      id: 'b',
      direction: -1,
      expected: 'identity',
    },
    {
      name: 'is a no-op when the id is not in orderedIds (a disabled row)',
      orderedIds: ['a', 'b', 'c'],
      filteredIds: ['a', 'b', 'c', 'ghost'],
      id: 'ghost',
      direction: 1,
      expected: 'identity',
    },
    {
      name: 'is a no-op when nothing is visible',
      orderedIds: ['a', 'b', 'c'],
      filteredIds: [],
      id: 'a',
      direction: 1,
      expected: 'identity',
    },
    {
      name: 'is a no-op on an empty order',
      orderedIds: [],
      filteredIds: [],
      id: 'a',
      direction: -1,
      expected: 'identity',
    },
    {
      name: 'ignores filteredIds entries that are not in orderedIds',
      orderedIds: ['a', 'b'],
      filteredIds: ['ghost', 'a', 'b'],
      id: 'b',
      direction: -1,
      expected: ['b', 'a'],
    },
    {
      name: 'takes the neighbour from full-list order, not from filteredIds order',
      orderedIds: ['a', 'b', 'c'],
      filteredIds: ['c', 'a', 'b'],
      id: 'c',
      direction: -1,
      expected: ['a', 'c', 'b'],
    },
  ]

  for (const testCase of cases) {
    test(testCase.name, () => {
      const result = moveWithinFiltered(
        testCase.orderedIds,
        testCase.filteredIds,
        testCase.id,
        testCase.direction,
      )
      if (testCase.expected === 'identity') {
        // Same reference, so the consumer can `if (next === orderedIds) return`
        // and skip the settings write entirely.
        expect(result).toBe(testCase.orderedIds)
      } else {
        expect(result).toEqual(testCase.expected)
        expect(result).not.toBe(testCase.orderedIds)
      }
    })
  }

  test('duplicate ids relocate the first occurrence only and preserve length', () => {
    // Documented behaviour, not an endorsement: `iconOrder` should never hold a
    // duplicate, but corrupt persisted settings must not lose or clone rows.
    const withDuplicate = ['a', 'b', 'a', 'c']
    const result = moveWithinFiltered(withDuplicate, withDuplicate, 'a', 1)
    expect(result).toHaveLength(withDuplicate.length)
    expect([...result].sort()).toEqual([...withDuplicate].sort())
    expect(result).toEqual(['b', 'a', 'a', 'c'])
  })

  test('every successful move is a permutation of the input', () => {
    const orderedIds = ['a', 'b', 'c', 'd', 'e', 'f']
    const filters = [
      orderedIds,
      ['a', 'f'],
      ['b', 'd', 'f'],
      ['a', 'b', 'c'],
      ['c'],
      [],
    ]
    for (const filteredIds of filters) {
      for (const id of orderedIds) {
        for (const direction of [-1, 1] as const) {
          const result = moveWithinFiltered(orderedIds, filteredIds, id, direction)
          expect(result).toHaveLength(orderedIds.length)
          expect([...result].sort()).toEqual([...orderedIds].sort())
        }
      }
    }
  })

  test('repeated clicks walk an item across the visible rows and then stop', () => {
    // The user-visible promise: one click, one visible step, and the chevron
    // goes dead only once the row is genuinely at the visible end.
    const orderedIds = ['a', 'hidden1', 'b', 'hidden2', 'c']
    const filteredIds = ['a', 'b', 'c']
    let current = orderedIds
    const visibleOrder = () => current.filter((id) => filteredIds.includes(id))

    expect(visibleOrder()).toEqual(['a', 'b', 'c'])
    current = moveWithinFiltered(current, filteredIds, 'a', 1)
    expect(visibleOrder()).toEqual(['b', 'a', 'c'])
    current = moveWithinFiltered(current, filteredIds, 'a', 1)
    expect(visibleOrder()).toEqual(['b', 'c', 'a'])
    const stuck = moveWithinFiltered(current, filteredIds, 'a', 1)
    expect(stuck).toBe(current)
  })
})

describe('canMoveWithinFiltered', () => {
  const cases: Array<{
    name: string
    orderedIds: string[]
    filteredIds: string[]
    id: string
    direction: -1 | 1
    expected: boolean
  }> = [
    { name: 'first visible row cannot move up', orderedIds: ['a', 'b', 'c'], filteredIds: ['a', 'b', 'c'], id: 'a', direction: -1, expected: false },
    { name: 'first visible row can move down', orderedIds: ['a', 'b', 'c'], filteredIds: ['a', 'b', 'c'], id: 'a', direction: 1, expected: true },
    { name: 'last visible row cannot move down', orderedIds: ['a', 'b', 'c'], filteredIds: ['a', 'b', 'c'], id: 'c', direction: 1, expected: false },
    { name: 'row hidden above the first visible row does not enable the up arrow', orderedIds: ['x', 'a', 'b'], filteredIds: ['a', 'b'], id: 'a', direction: -1, expected: false },
    { name: 'row hidden below the last visible row does not enable the down arrow', orderedIds: ['a', 'b', 'x'], filteredIds: ['a', 'b'], id: 'b', direction: 1, expected: false },
    { name: 'a single visible match disables up', orderedIds: ['a', 'b', 'c'], filteredIds: ['b'], id: 'b', direction: -1, expected: false },
    { name: 'a single visible match disables down', orderedIds: ['a', 'b', 'c'], filteredIds: ['b'], id: 'b', direction: 1, expected: false },
    { name: 'an id missing from filteredIds is not movable', orderedIds: ['a', 'b', 'c'], filteredIds: ['a', 'c'], id: 'b', direction: 1, expected: false },
    { name: 'an id missing from orderedIds is not movable', orderedIds: ['a', 'b'], filteredIds: ['a', 'b', 'ghost'], id: 'ghost', direction: -1, expected: false },
    { name: 'a middle visible row moves in both directions', orderedIds: ['a', 'x', 'b', 'y', 'c'], filteredIds: ['a', 'b', 'c'], id: 'b', direction: -1, expected: true },
  ]

  for (const testCase of cases) {
    test(testCase.name, () => {
      expect(
        canMoveWithinFiltered(testCase.orderedIds, testCase.filteredIds, testCase.id, testCase.direction),
      ).toBe(testCase.expected)
    })
  }

  test('never disagrees with moveWithinFiltered', () => {
    // The chevron `disabled` prop and the chevron `onClick` must be driven by
    // the same answer, or the user gets a live-looking arrow that does nothing.
    const orderedIds = ['a', 'b', 'c', 'd', 'e']
    const filters = [orderedIds, ['a', 'e'], ['b', 'c'], ['d'], [], ['ghost', 'a', 'c']]
    for (const filteredIds of filters) {
      for (const id of [...orderedIds, 'ghost']) {
        for (const direction of [-1, 1] as const) {
          const can = canMoveWithinFiltered(orderedIds, filteredIds, id, direction)
          const moved = moveWithinFiltered(orderedIds, filteredIds, id, direction)
          expect(can).toBe(moved !== orderedIds)
        }
      }
    }
  })

  test('matches the old index-based disabled conditions when no filter is active', () => {
    // Today's call sites use `index <= 0` and `index >= orderedIds.length - 1`.
    const orderedIds = ['a', 'b', 'c', 'd']
    for (const id of orderedIds) {
      const index = orderedIds.indexOf(id)
      expect(canMoveWithinFiltered(orderedIds, orderedIds, id, -1)).toBe(!(index <= 0))
      expect(canMoveWithinFiltered(orderedIds, orderedIds, id, 1)).toBe(
        !(index < 0 || index >= orderedIds.length - 1),
      )
    }
  })
})

describe('module hygiene', () => {
  test('stays React-free, store-free, component-free and DOM-free', () => {
    expect(searchSource).not.toMatch(/from '(react|@\/store|@\/types\/|@\/components\/)/)
    expect(searchSource).not.toMatch(/^import /m)
    // `\.` so the prose in the module's own header comment ("crashes on
    // `window is not defined`") is not mistaken for a DOM reference.
    expect(searchSource).not.toMatch(/\b(document|window|globalThis)\./)
  })

  test('declares its input type structurally instead of importing ToolbarAction', () => {
    // `useQuickToolbarActions.ts` is referenced in prose (it is where the type
    // and the old `moveAction` live) but must never be imported: it pulls in the
    // store, `react-router` and `window`.
    expect(searchSource).toContain('export interface SearchableToolbarAction')
    expect(searchSource).not.toMatch(/^import[^\n]*ToolbarAction/m)
  })
})
