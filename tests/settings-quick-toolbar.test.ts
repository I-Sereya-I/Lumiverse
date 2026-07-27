import { describe, expect, test } from 'bun:test'

/**
 * Guards the quick-toolbar settings chain: the two new persisted keys
 * (`modalRestoreHandle`, `v2Density`), the Settings-modal controls that write
 * them, the icon-list search added to the "Visible icons and order" card, and
 * the `InputArea` call site that used to set `activeModal` to a name nothing
 * renders.
 *
 * Source-text assertions throughout — there is no DOM test environment in this
 * repo, so these read the files with `Bun.file(...).text()` exactly like
 * `tests/quick-toolbar.test.ts` and `tests/lorebook-editor.test.ts` do.
 */

const storeTypes = await Bun.file(
  new URL('../frontend/src/types/store.ts', import.meta.url),
).text()
const defaultsSource = await Bun.file(
  new URL('../frontend/src/lib/uiProductivityDefaults.ts', import.meta.url),
).text()
const settingsSliceSource = await Bun.file(
  new URL('../frontend/src/store/slices/settings.ts', import.meta.url),
).text()
const settingsModalSource = await Bun.file(
  new URL('../frontend/src/components/modals/SettingsModal.tsx', import.meta.url),
).text()
const settingsModalStyles = await Bun.file(
  new URL('../frontend/src/components/modals/SettingsModal.module.css', import.meta.url),
).text()
const inputAreaSource = await Bun.file(
  new URL('../frontend/src/components/chat/InputArea.tsx', import.meta.url),
).text()

/** `^selector\s*{ ... }` — same helper shape `tests/quick-toolbar.test.ts` uses. */
function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  return match ? match[1] : ''
}

describe('new quick-toolbar settings — type and default', () => {
  test('`modalRestoreHandle` is a boolean on QuickToolbarSettings', () => {
    expect(storeTypes).toContain('modalRestoreHandle: boolean')
  })

  test('`v2Density` is the two-value union, declared as a named type', () => {
    expect(storeTypes).toContain("export type QuickToolbarDensity = 'comfortable' | 'compact'")
    expect(storeTypes).toContain('v2Density: QuickToolbarDensity')
  })

  test('both default keys sit in DEFAULT_QUICK_TOOLBAR_SETTINGS', () => {
    const block = defaultsSource.slice(
      defaultsSource.indexOf('DEFAULT_QUICK_TOOLBAR_SETTINGS'),
      defaultsSource.indexOf('DEFAULT_CONNECTIONS_PICKER_SETTINGS'),
    )
    expect(block).toContain('modalRestoreHandle: false')
    expect(block).toContain("v2Density: 'comfortable'")
  })

  test('neither key gets a migration — `mergeStoredSetting` backfills them', () => {
    // A `rectVersion`-style migration would be dead code: the merge in
    // `loadSettings` fills a missing key from the default *before* any
    // migration runs, so the migration can never observe the absent state.
    expect(settingsSliceSource).not.toContain('modalRestoreHandle')
    expect(settingsSliceSource).not.toContain('v2Density')
  })
})

describe('Settings modal — controls for the new keys', () => {
  test('the restore-handle checkbox writes `modalRestoreHandle`', () => {
    expect(settingsModalSource).toContain(
      'onChange={(modalRestoreHandle) => updateToolbar({ modalRestoreHandle })}',
    )
  })

  test('the restore-handle copy explains the behaviour, not the field name', () => {
    expect(settingsModalSource).toContain('hides itself while a full-screen editor or dialog is open')
  })

  test('the density control is a segmented Comfortable / Compact pair', () => {
    expect(settingsModalSource).toContain("['comfortable', 'Comfortable']")
    expect(settingsModalSource).toContain("['compact', 'Compact']")
    expect(settingsModalSource).toContain('updateToolbar({ v2Density:')
  })

  test('the density control renders only for the anchored V2 variant', () => {
    expect(settingsModalSource).toMatch(
      /quickToolbarSettings\.variant === 'v2-settings-adjacent' && \(\s*<SegmentedSetting/,
    )
  })
})

describe('Settings modal — controls that are inert for V2', () => {
  test('Scale is disabled under V2, because QuickToolbar pins its scale to 1', () => {
    expect(settingsModalSource).toContain(
      "disabled={quickToolbarSettings.variant === 'v2-settings-adjacent'}",
    )
    expect(settingsModalSource).toContain('V2 never scales')
  })

  test('RangeSetting can say *why* it is disabled', () => {
    expect(settingsModalSource).toContain('disabled?: boolean')
    expect(settingsModalSource).toContain('hint?: string')
    expect(settingsModalSource).toContain('{hint && <span className={styles.fieldHint}>{hint}</span>}')
  })

  test('Rotation, snap-to-edge, resize handles and orientation stay V1-only', () => {
    // All four are read as `freePosition ? ... : <constant>` in QuickToolbar.tsx,
    // so they are hidden rather than shown dead.
    const v2Guards = settingsModalSource.match(
      /quickToolbarSettings\.variant !== 'v2-settings-adjacent'/g,
    )
    expect(v2Guards).not.toBeNull()
    expect((v2Guards ?? []).length).toBeGreaterThanOrEqual(2)
    expect(settingsModalSource).toContain('label="Rotation"')
    expect(settingsModalSource).toContain('label="Snap to edge"')
  })
})

describe('Settings modal — icon-list search', () => {
  test('the query is component-local state and is never persisted', () => {
    expect(settingsModalSource).toContain("const [toolbarIconQuery, setToolbarIconQuery] = useState('')")
    expect(storeTypes).not.toContain('toolbarIconQuery')
    expect(settingsSliceSource).not.toContain('toolbarIconQuery')
  })

  test('filtering goes through the shared pure module', () => {
    expect(settingsModalSource).toContain("from '@/lib/toolbarActionSearch'")
    expect(settingsModalSource).toContain(
      'filterActionIds(toolbarRowIds, toolbarActionById, toolbarIconQuery)',
    )
    expect(settingsModalSource).toContain(
      'filterActionIds(toolbarOrderedIds, toolbarActionById, toolbarIconQuery)',
    )
  })

  test('rows render from the filtered list, not the full one', () => {
    expect(settingsModalSource).toContain('{filteredToolbarRowIds.map((id) => {')
    expect(settingsModalSource).not.toContain('{toolbarRowIds.map((id) => {')
  })

  test('reorder uses remove-and-reinsert, never the pairwise swap', () => {
    // The pairwise `moveAction` moves a row past an icon the query hides, so the
    // row visibly does not move and the chevron looks dead.
    expect(settingsModalSource).toContain(
      'moveWithinFiltered(toolbarOrderedIds, filteredToolbarOrderedIds, id, direction)',
    )
    expect(settingsModalSource).not.toContain('moveAction: moveToolbarIcon')
    expect(settingsModalSource).not.toContain('moveToolbarIcon(id,')
  })

  test('the write still targets the full stored order', () => {
    expect(settingsModalSource).toContain('reorderActions: reorderToolbarIcons')
    expect(settingsModalSource).toContain('reorderToolbarIcons(next)')
    // `moveWithinFiltered` returns its input's identity for an impossible move.
    expect(settingsModalSource).toContain('if (next === toolbarOrderedIds) return')
  })

  test('both chevrons disable through `canMoveWithinFiltered`', () => {
    for (const direction of ['-1', '1']) {
      expect(settingsModalSource).toContain(
        `disabled={!canMoveWithinFiltered(toolbarOrderedIds, filteredToolbarOrderedIds, id, ${direction})}`,
      )
    }
    expect(settingsModalSource).not.toContain('disabled={index <= 0}')
  })

  test('the search chrome matches the house idiom', () => {
    expect(settingsModalSource).toContain('<label className={styles.searchField}>')
    expect(settingsModalSource).toContain('<Search size={14} />')
    expect(settingsModalSource).toContain('placeholder="Search icons..."')
  })
})

describe('Settings modal stylesheet', () => {
  test('.searchField declares its own display — it inherits nothing here', () => {
    // The rule this was cloned from picks up `display: flex; align-items: center`
    // from a grouped selector elsewhere in its stylesheet. Copying only the
    // visual block would leave a `display: block` label with the icon above the
    // input.
    const rule = declarations(settingsModalStyles, '.searchField')
    expect(rule).toContain('display: flex')
    expect(rule).toContain('align-items: center')
  })

  test('.searchField input is styled as a descendant, so the input needs no class', () => {
    expect(settingsModalStyles).toContain('.searchField input {')
  })

  test('the new rules exist and read real tokens', () => {
    expect(declarations(settingsModalStyles, '.fieldHint')).toContain('var(--lumiverse-text-dim)')
    expect(declarations(settingsModalStyles, '.rangeRowDisabled')).toContain('opacity')
  })

  test('CSS Modules are camelCaseOnly — never bracket lookups', () => {
    expect(settingsModalSource).not.toContain("styles['")
    expect(settingsModalSource).not.toContain('styles[`')
  })
})

describe('InputArea no longer sets `activeModal` to an unrendered name', () => {
  test('the STT branch opens the settings modal through its own store field', () => {
    expect(inputAreaSource).toContain("useStore.getState().openSettings('voice')")
  })

  test('no call site asks `openModal` for a settings modal', () => {
    // `ModalContainer.tsx` has no `activeModal === 'settings'` branch, and every
    // `closeModal()` caller lives inside a modal component — so such a call
    // parks `activeModal` on a truthy value with nothing on screen to clear it.
    expect(inputAreaSource).not.toMatch(/openModal\(\s*['"]settings['"]/)
  })
})
