import { describe, expect, test } from 'bun:test'
import { actionMatchesQuery, filterActionIds, moveWithinFiltered } from '../frontend/src/lib/toolbarActionSearch'

/**
 * Covers the quick-toolbar action *data*: the per-card context values, the
 * catalog's searchable text, and the reorder write path the search surfaces use.
 *
 * Source-text assertions, like the rest of `tests/` — there is no DOM here, and
 * both hooks import the store, `react-router` and `window`. The one module that
 * is imported for real is `lib/toolbarActionSearch.ts`, which is deliberately
 * React-free.
 */

const contextSource = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/useQuickToolbarContext.ts', import.meta.url),
).text()
const actionsSource = await Bun.file(
  new URL('../frontend/src/components/quick-toolbar/useQuickToolbarActions.ts', import.meta.url),
).text()
const drawerRegistrySource = await Bun.file(
  new URL('../frontend/src/lib/drawer-tab-registry.tsx', import.meta.url),
).text()
const settingsRegistrySource = await Bun.file(
  new URL('../frontend/src/lib/settings-tab-registry.tsx', import.meta.url),
).text()
const commandsSource = await Bun.file(
  new URL('../frontend/src/lib/commands.ts', import.meta.url),
).text()

/**
 * Every `id -> value expression` the context hook publishes, from both shapes it
 * uses: the object literal (`characters: libraryLabel`) and the conditional
 * assignments below it (`context.personas = personaName`).
 */
function contextAssignments(): Map<string, string> {
  const assignments = new Map<string, string>()
  const literal = contextSource.slice(
    contextSource.indexOf('const context: Record<string, string> = {'),
    contextSource.indexOf('return context'),
  )
  for (const [, id, value] of literal.matchAll(/^\s{6}(\w+): (\w+),$/gm)) {
    assignments.set(id, value)
  }
  for (const [, id, value] of literal.matchAll(/context\.(\w+) = (\w+)\b/g)) {
    assignments.set(id, value)
  }
  return assignments
}

describe('V2 card context — one meaning per card', () => {
  test('no two cards are handed the same value, except the deliberate lore pair', () => {
    // The bug this file exists for: `profile` and `characters` both received
    // `characterName`, so with "Show labels" off the strip rendered two
    // identical, meaningless "Narrator" cards. `presets`/`prompt` shared
    // `presetName` the same way.
    const byValue = new Map<string, string[]>()
    for (const [id, value] of contextAssignments()) {
      byValue.set(value, [...(byValue.get(value) ?? []), id])
    }
    const shared = [...byValue.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([value, ids]) => `${value} -> ${ids.sort().join(', ')}`)
    // `lorebook` (edit the books) and `worldinfo` (inspect the activation trace)
    // are the one remaining pair. It is knowingly left: the activated-entry
    // count is the correct answer for `worldinfo`, and the store holds no
    // inventory for the editor that would not under-report character-bound
    // books. Neither is in DESIGN_DEFAULT_IDS together today.
    expect(shared).toEqual(['loreLabel -> lorebook, worldinfo'])
  })

  test('profile keeps the active character; characters reports the library', () => {
    const assignments = contextAssignments()
    // `profile` opens CharacterProfile — "View and edit the active character".
    expect(assignments.get('profile')).toBe('characterName')
    expect(drawerRegistrySource).toContain('component: () => <CharacterProfile />')
    // `characters` opens CharacterBrowser — the card library, not the active
    // card — so it reports inventory instead of repeating the name.
    expect(assignments.get('characters')).toBe('libraryLabel')
    expect(drawerRegistrySource).toContain('component: () => <CharacterBrowser />')
    expect(contextSource).toContain("characters.length === 1 ? 'card' : 'cards'")
  })

  test('presets reports reasoning state, because that is the panel it opens', () => {
    // The `presets` drawer tab is named "Reasoning" and renders <PresetManager />,
    // which reads `reasoningSettings` and never touches `activePresetId`.
    expect(drawerRegistrySource).toMatch(/id: 'presets',[\s\S]{0,200}tabName: 'Reasoning',/)
    expect(contextAssignments().get('presets')).toBe('reasoningLabel')
    expect(contextSource).toContain('reasoningSettings.apiReasoning')
    expect(contextSource).toContain("'Reasoning off'")
  })

  test('prompt reports composition state, mirroring the panel it opens', () => {
    // The `prompt` drawer tab is named "Composition" and renders <PromptPanel />,
    // whose own counters are exactly these three arrays.
    expect(drawerRegistrySource).toMatch(/id: 'prompt',[\s\S]{0,200}tabName: 'Composition',/)
    expect(contextAssignments().get('prompt')).toBe('compositionLabel')
    for (const field of ['selectedLoomStyles', 'selectedLoomUtils', 'selectedLoomRetrofits']) {
      expect(contextSource).toContain(`s.${field}`)
    }
  })

  test('the live generation preset is read from the loom registry', () => {
    // `presets[activePresetId]?.name` was dead: nothing in the UI ever calls
    // `setActivePreset`, and `getActivePresetForGeneration()` returns
    // `activeLoomPresetId`. The name belongs to the tab that selects it.
    expect(contextAssignments().get('loom')).toBe('loomPresetName')
    expect(contextSource).toContain('loomRegistry[activeLoomPresetId]?.name')
    expect(contextSource).not.toContain('const presetName =')
  })

  test('every value reads on its own, because the heading may be hidden', () => {
    // `QuickToolbar.tsx` drops `.cardTitle` when "Show labels" is off, leaving
    // the value as the card's only text. A bare number would be unreadable.
    for (const bareCount of ['${characters.length}`', '${loomItemCount}`']) {
      expect(contextSource).not.toContain(bareCount)
    }
  })
})

describe('catalog search text', () => {
  /** Source blocks of `COMMANDS` entries in the `actions` group. */
  const actionCommandBlocks = commandsSource
    .split(/\r?\n {2}\{\r?\n/)
    .filter((block) => block.includes("group: 'actions'"))

  test('command actions no longer share one boilerplate description', () => {
    // Sixteen catalog rows used to carry the literal `'Run this command.'`,
    // which made description search useless across the largest block of the
    // catalog. `Command.description` has always held a real sentence.
    expect(actionsSource).toContain("description: command.description || 'Run this command.'")
    expect(actionsSource).not.toContain("      description: 'Run this command.',")
    expect(actionCommandBlocks.length).toBeGreaterThanOrEqual(16)
  })

  test('every command in the actions group supplies real, distinct copy', () => {
    const descriptions: string[] = []
    for (const block of actionCommandBlocks) {
      const description = block.match(/\r?\n {4}description: '([^']+)',/)?.[1]
      expect(description).toBeString()
      expect(description!.length).toBeGreaterThan(12)
      expect(block).toContain('keywords: [')
      descriptions.push(description!)
    }
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  test('keywords are passed through from the three registries, not re-typed', () => {
    // All three already declare `keywords` for the command palette, so the
    // catalog gets the synonyms ("cot", "png", "openrouter", "reroll") for free
    // and there is no second list to keep in sync.
    expect(actionsSource).toContain('keywords?: string[]')
    expect(actionsSource.match(/^\s+keywords: tab\.keywords,$/gm)).toHaveLength(2)
    expect(actionsSource).toContain('keywords: command.keywords,')
    expect(drawerRegistrySource).toContain('keywords: string[]')
    expect(settingsRegistrySource).toContain('keywords: string[]')
    expect(commandsSource).toContain('keywords: string[]')
  })

  test('extension entries describe themselves by extension, never identically', () => {
    expect(actionsSource).toContain('action.subtitle || `Input bar action from the ${action.extensionName} extension.`')
    expect(actionsSource).not.toContain("description: 'Extension action.',")
  })

  test('the keywords carried above are now actually searched', () => {
    // This closes the gap this test previously pinned open: the registries were
    // already handing `keywords` to the catalog, but `SearchableToolbarAction`
    // was `{ id, label, description? }`, so they were inert.
    const action = { id: 'characters', label: 'Characters', description: 'Browse and manage your character cards' }
    const withKeywords = { ...action, keywords: ['png', 'charx'] }
    expect(actionMatchesQuery(withKeywords, 'png')).toBe(true)
    expect(actionMatchesQuery(withKeywords, 'CHARX')).toBe(true)
    // Still substring, still case-insensitive, consistent with label/description.
    expect(actionMatchesQuery(withKeywords, 'ng')).toBe(true)
    // An action without the field must behave exactly as before — the synonym
    // only works because the registry supplied it, never by inference.
    expect(actionMatchesQuery(action, 'png')).toBe(false)
    // The fields that already worked, so the addition is additive, not a rewrite.
    expect(actionMatchesQuery(action, 'CARDS')).toBe(true)
    expect(actionMatchesQuery(action, 'characters')).toBe(true)
    // Keywords must never widen an empty query or leak into rendering.
    expect(actionMatchesQuery(withKeywords, '   ')).toBe(true)
  })
})

describe('the one-Settings-button dedupe still holds', () => {
  test('the catalog dedupes on id, so the two settings entries both survive it', () => {
    expect(actionsSource).toContain('new Map(catalog.map((action) => [action.id, action])).values()')
    expect(actionsSource).toContain("id: 'settings',")
    expect(actionsSource).toContain('id: `settings:${tab.id}`,')
  })

  test('the surface, not the id, is the identity used to drop the duplicate', () => {
    const actionsMemo = actionsSource.slice(
      actionsSource.indexOf('const actions = useMemo'),
      actionsSource.indexOf('/** Full catalog order'),
    )
    expect(actionsMemo).toContain("const root = resolved.find((action) => action.id === 'settings')")
    expect(actionsMemo).toContain("if (!root || root.surface.kind !== 'settings') return resolved")
    expect(actionsMemo).toContain('const rootView = root.surface.view')
    expect(actionsMemo).toContain(
      "action.id !== 'settings' && action.surface.kind === 'settings' && action.surface.view === rootView",
    )
    expect(actionsMemo).toContain("aliased ? resolved.filter((action) => action.id !== 'settings') : resolved")
    // The root opens 'productivity', which is a real settings tab id — i.e. the
    // collision the filter guards against is reachable, not hypothetical.
    expect(actionsSource).toContain("const SETTINGS_ROOT_VIEW = 'productivity'")
    expect(settingsRegistrySource).toContain("id: 'productivity',")
  })

  test('dedupe runs on the rendered list only, so the customizer still lists both', () => {
    // `catalogOrder` (what the three checklists render) is built from
    // `actionCatalog`, not from `actions`, so hiding the duplicate button never
    // hides its row in the customizer.
    expect(actionsSource).toContain(
      'const rest = actionCatalog.map((action) => action.id).filter((id) => !orderedIds.includes(id))',
    )
  })
})

describe('reorder write path', () => {
  test('moveActionWithin is exposed and bails on the identity sentinel', () => {
    expect(actionsSource).toContain(
      "import { moveWithinFiltered } from '@/lib/toolbarActionSearch'",
    )
    expect(actionsSource).toContain(
      'const moveActionWithin = useCallback((id: string, direction: -1 | 1, filteredIds: string[]) => {',
    )
    expect(actionsSource).toContain('const next = moveWithinFiltered(orderedIds, filteredIds, id, direction)')
    expect(actionsSource).toContain('if (next === orderedIds) return')
    expect(actionsSource).toMatch(/^\s+moveActionWithin,$/m)
  })

  test('the pairwise moveAction is left intact for the unfiltered call sites', () => {
    expect(actionsSource).toContain('const moveAction = useCallback((id: string, direction: -1 | 1) => {')
    expect(actionsSource).toContain(';[next[index], next[target]] = [next[target], next[index]]')
  })

  test("reorderActions' visibleIds filter is documented, not silent", () => {
    expect(actionsSource).toContain('updateSettings({ iconOrder: ids.filter((id) => visibleIds.includes(id)) })')
    expect(actionsSource).toContain('SILENTLY DROPS')
  })

  test('a moveWithinFiltered result survives that filter unchanged', () => {
    // The invariant that makes `reorderActions` safe for wave 2: the function
    // returns a permutation, and `orderedIds` is built from `visibleIds`, so the
    // filter is the identity for anything this produces.
    const orderedIds = ['profile', 'connections', 'council', 'lorebook', 'presets', 'settings']
    const visibleIds = new Set(orderedIds)
    const filtered = ['profile', 'presets']
    const next = moveWithinFiltered(orderedIds, filtered, 'presets', -1)
    expect(next).not.toBe(orderedIds)
    expect(next.filter((id) => visibleIds.has(id))).toEqual(next)
    expect([...next].sort()).toEqual([...orderedIds].sort())
    // One click, one visible step: 'presets' lands where 'profile' was, jumping
    // the three hidden rows in between.
    expect(next).toEqual(['presets', 'profile', 'connections', 'council', 'lorebook', 'settings'])
  })

  test('an empty query hands moveWithinFiltered the same array, so it matches moveAction', () => {
    const orderedIds = ['a', 'b', 'c']
    const filtered = filterActionIds(orderedIds, () => ({ id: 'x', label: 'x' }), '   ')
    expect(filtered).toBe(orderedIds)
    expect(moveWithinFiltered(orderedIds, filtered, 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveWithinFiltered(orderedIds, filtered, 'a', -1)).toBe(orderedIds)
  })
})
