import { beforeEach, describe, expect, test } from 'bun:test'
import { ESTIMATE_CHARS_PER_TOKEN, estimateTokens } from '../frontend/src/lib/tokenEstimate'
import {
  TOKEN_CACHE_MAX_ENTRIES,
  clearTokenCountCache,
  fnv1a32,
  getTokenCount,
  getTokenCountVersion,
  hasTokenCount,
  setTokenCount,
  subscribeTokenCounts,
  tokenCacheKey,
  tokenCacheKeys,
  tokenCacheSize,
} from '../frontend/src/lib/tokenCountCache'
import {
  DEFAULT_ACTIVITY_PAUSE_MS,
  TokenCountScheduler,
  type TokenCountOutcome,
  type TokenCountPriority,
  type TokenCountRequest,
  type TokenCountSchedulerDeps,
} from '../frontend/src/lib/tokenCountScheduler'
import { resizeSurfaceRect } from '../frontend/src/hooks/usePersistentRect'
import { DEFAULT_LOREBOOK_EDITOR_SETTINGS } from '../frontend/src/lib/uiProductivityDefaults'
import {
  clampEditorRectToViewport,
  clampHalfEditorWidth,
  DEFAULT_MIN_CHAT_WIDTH,
  DEFAULT_MIN_EDITOR_PANE_WIDTH,
  FULL_EDITOR_MARGIN,
  FULL_EDITOR_MIN,
  HALF_EDITOR_MIN_CHAT_WIDTH,
  resolveHalfEditorLayout,
} from '../frontend/src/lib/lorebookEditorGeometry'
import {
  ENTRY_COLUMNS,
  ENTRY_COLUMN_DROP_ORDER,
  ENTRY_COLUMN_GAP,
  ENTRY_ENABLED_WIDTH,
  ENTRY_GUTTER_WIDTH,
  ENTRY_METADATA_ADDITIONS,
  ENTRY_METADATA_VERSION,
  ENTRY_NAME_MIN_WIDTH,
  backfillEntryMetadata,
  buildEntryGridTemplate,
  buildEntryTableMinWidth,
  resolveResponsiveColumns,
  resolveVisibleColumns,
} from '../frontend/src/lib/lorebookEntryColumns'
import { filterBooks } from '../frontend/src/lib/lorebookBookSearch'
import {
  BULK_UNCHANGED,
  EMPTY_BULK_FIELD_FORM,
  buildBulkFieldPatch,
  hasBulkFieldMutation,
  type BulkFieldForm,
} from '../frontend/src/lib/lorebookBulkPatch'

const workspaceSource = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/LorebookEditorWorkspace.tsx', import.meta.url),
).text()
// The entries toolbar and the entry table were extracted out of the workspace so
// the responsive-column and token-prefetch work could proceed in parallel. They
// are asserted against their own source rather than a concatenation, so every
// assertion still pins the JSX to the file that actually renders it.
const entriesToolbarSource = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/EntriesToolbar.tsx', import.meta.url),
).text()
const entryTableSource = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/EntryTable.tsx', import.meta.url),
).text()
const bookSearchSource = await Bun.file(
  new URL('../frontend/src/lib/lorebookBookSearch.ts', import.meta.url),
).text()
const bulkPatchSource = await Bun.file(
  new URL('../frontend/src/lib/lorebookBulkPatch.ts', import.meta.url),
).text()
// The half editor's book picker delegates its search behaviour to this shared
// component, so the assertions that pin `sublabel` / `searchThreshold` read it
// directly rather than restating what it is assumed to do.
const searchableSelectSource = await Bun.file(
  new URL('../frontend/src/components/shared/SearchableSelect.tsx', import.meta.url),
).text()
const workspaceStyles = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/LorebookEditorLayout.module.css', import.meta.url),
).text()
// `.halfScreenHost` / `.halfResizeHandle` and the narrow-viewport host override
// were split out of the layout stylesheet into the host's own module.
const halfEditorStyles = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/LorebookHalfScreenEditor.module.css', import.meta.url),
).text()
const entryEditorStyles = await Bun.file(
  new URL('../frontend/src/components/shared/WorldBookEntryEditor.module.css', import.meta.url),
).text()
const entryEditorSource = await Bun.file(
  new URL('../frontend/src/components/shared/WorldBookEntryEditor.tsx', import.meta.url),
).text()
const halfEditorSource = await Bun.file(
  new URL('../frontend/src/components/world-book-editor/LorebookHalfScreenEditor.tsx', import.meta.url),
).text()
const modalSource = await Bun.file(
  new URL('../frontend/src/components/modals/WorldBookEditorModal.tsx', import.meta.url),
).text()
const settingsModalSource = await Bun.file(
  new URL('../frontend/src/components/modals/SettingsModal.tsx', import.meta.url),
).text()
const frameSource = await Bun.file(
  new URL('../frontend/src/components/shared/ResizablePanelFrame.tsx', import.meta.url),
).text()
const geometrySource = await Bun.file(
  new URL('../frontend/src/lib/lorebookEditorGeometry.ts', import.meta.url),
).text()
const entryColumnsSource = await Bun.file(
  new URL('../frontend/src/lib/lorebookEntryColumns.ts', import.meta.url),
).text()
const uiScaleSource = await Bun.file(
  new URL('../frontend/src/lib/uiScale.ts', import.meta.url),
).text()
// Read as source rather than imported: the slice pulls in the whole store, which
// touches `window` and cannot load under `bun test`.
const settingsSliceSource = await Bun.file(
  new URL('../frontend/src/store/slices/settings.ts', import.meta.url),
).text()

/**
 * Splits a `grid-template-columns` value into tracks.
 *
 * Naive whitespace splitting over-counts, because `minmax(42px, max-content)` is a
 * single track that contains a space.
 */
function splitGridTracks(template: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''
  for (const char of template) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ' ' && depth === 0) {
      if (current) tracks.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) tracks.push(current)
  return tracks
}

/**
 * Removes block and line comments.
 *
 * Several assertions below are of the form "this file no longer contains X", and
 * X is usually exactly what the replacement's own comment has to *name* in order
 * to explain itself. Asserting against the stripped source keeps those checks
 * honest: prose about `window.innerWidth` must not be able to satisfy — or defeat
 * — a check about the code that reads it.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('lorebook editor geometry', () => {
  test('persists a normal full-editor rectangle separately from fullscreen state', () => {
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.fullRect).toEqual({
      x: 48,
      y: 36,
      width: 1540,
      height: 840,
    })
    expect(geometrySource).toContain('function centerEditorRect(')
    expect(geometrySource).toContain('Math.round((viewport.width - rect.width) / 2)')
    expect(geometrySource).toContain('Math.round((viewport.height - rect.height) / 2)')
    expect(modalSource).toContain('rect={fullscreen ? viewportRect : centeredFullRect}')
    expect(modalSource).toContain('if (!fullscreen)')
    expect(modalSource).toContain('fullRect,')
  })

  test('supports edge and corner resizing through the shared frame', () => {
    expect(frameSource).toContain("['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']")

    const resized = resizeSurfaceRect(
      DEFAULT_LOREBOOK_EDITOR_SETTINGS.fullRect,
      'nw',
      -20,
      -30,
      { minWidth: 760, minHeight: 520, maxWidth: 1920, maxHeight: 1080 },
    )

    expect(resized).toMatchObject({ x: 28, y: 6, width: 1560, height: 870 })
  })

  test('uses the persisted entries width in half-screen mode', () => {
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEntriesPaneWidth).toBe(390)
    expect(workspaceSource).toContain("variant === 'half' ? settings.halfEntriesPaneWidth : settings.entriesPaneWidth")
    expect(workspaceSource).toContain("variant === 'half' ? { halfEntriesPaneWidth: width }")
    expect(workspaceStyles).toMatch(
      /\.halfWorkspace \.entriesPane\s*\{[^}]*width:\s*var\(--lorebook-entries-width\);[^}]*flex:\s*0 1 var\(--lorebook-entries-width\);/s,
    )
    expect(halfEditorSource).toContain('startWidth + startX - moveEvent.clientX')
  })
})

describe('lorebook editor row controls', () => {
  test('keeps trigger presentation while exposing a native type selector', () => {
    // `settings.triggerDisplay` reaches the badge as the `triggerDisplay` prop now
    // that the table is its own component; the workspace still passes exactly it.
    expect(entryTableSource).toContain('<TriggerBadge entry={entry} display={triggerDisplay} />')
    expect(workspaceSource).toContain('triggerDisplay={settings.triggerDisplay}')
    expect(entryTableSource).toContain('aria-label={`Type for ${entry.comment')
    expect(workspaceStyles).toMatch(/\.rowTypeSelect\s*\{[^}]*opacity:\s*0;/s)
    const constantRule = workspaceStyles.match(/\.trigger_constant\s*\{([^}]*)\}/s)?.[1] ?? ''
    const keywordRule = workspaceStyles.match(/\.trigger_keyword\s*\{([^}]*)\}/s)?.[1] ?? ''
    const vectorRule = workspaceStyles.match(/\.trigger_vector\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(constantRule).toContain('color: #f6b73c')
    expect(constantRule).toContain('background: color-mix(in srgb, #f5a623 18%, transparent)')
    expect(keywordRule).toContain('color: #5da9ff')
    expect(keywordRule).toContain('background: color-mix(in srgb, #4d95ff 16%, transparent)')
    expect(keywordRule).not.toContain('var(--lumiverse-primary')
    expect(vectorRule).toContain('color: #c084fc')
    expect(vectorRule).toContain('background: color-mix(in srgb, #a855f7 18%, transparent)')
  })

  test('exposes editable priority, position, depth, and order fields', () => {
    expect(entryTableSource).toContain('label={`Priority for ${name}`}')
    expect(entryTableSource).toContain('onCommit={(priority) => void saveEntry(entry.id, { priority })}')
    expect(entryTableSource).toContain('label={`Position for ${name}`}')
    expect(entryTableSource).toContain('onCommit={(position) => void saveEntry(entry.id, { position })}')
    // Depth used to render as read-only text next to a dead gap before Enabled.
    expect(entryTableSource).toContain('label={`Depth for ${name}`}')
    expect(entryTableSource).toContain('onCommit={(depth) => void saveEntry(entry.id, { depth })}')
    expect(entryTableSource).toContain('label={`Order for ${name}`}')
    expect(entryTableSource).toContain('onCommit={(order_value) => void saveEntry(entry.id, { order_value })}')
    // `saveEntry` is the workspace's own writer, threaded through unchanged.
    expect(workspaceSource).toContain('saveEntry={saveEntry}')
  })

  test('persists optional token-column visibility', () => {
    expect(workspaceSource).toContain("settings.visibleEntryMetadata.includes('tokens')")
    expect(workspaceSource).toContain("settings.visibleEntryMetadata.filter((item) => item !== 'tokens')")
    // The column model itself now lives in the pure lorebookEntryColumns module.
    expect(entryColumnsSource).toContain("{ id: 'tokens', label: 'Tokens'")
  })

  test('derives entry columns from visible metadata so header and rows agree', () => {
    // The column model moved out of the component into a pure module so it can be
    // exercised without a DOM; the workspace only consumes it now.
    expect(entryColumnsSource).toContain('const ENTRY_COLUMNS')
    expect(entryColumnsSource).toContain('visibleEntryMetadata.includes(column.id)')
    expect(workspaceSource).toContain("} from '@/lib/lorebookEntryColumns'")
    expect(workspaceSource).toContain('resolveVisibleColumns(settings.visibleEntryMetadata)')
    expect(workspaceSource).toContain('buildEntryGridTemplate(visibleColumns)')
    // The template is still built in the workspace; the table only consumes it.
    expect(workspaceSource).toContain('entryGridTemplate={entryGridTemplate}')
    // The var itself moved with the table markup. Which identifier feeds it is
    // the table's business (it re-derives the template from the columns that
    // survive its width measurement); that it is fed a built template is not.
    expect(entryTableSource).toMatch(/'--lorebook-entry-columns': \w+,/)
    expect(entryTableSource).toMatch(/'--lorebook-entry-min-width': `\$\{\w+\}px`/)
    expect(workspaceSource).not.toContain('styles.withoutTokens')
    expect(entryTableSource).not.toContain('styles.withoutTokens')
    expect(workspaceStyles).toMatch(/grid-template-columns:\s*var\(--lorebook-entry-columns/s)
    expect(workspaceStyles).toMatch(/\.entryTableContent\s*\{[^}]*min-width:\s*var\(--lorebook-entry-min-width, 450px\);/s)
    for (const id of ['type', 'priority', 'position', 'depth', 'order', 'keys', 'tokens']) {
      expect(entryColumnsSource).toContain(`id: '${id}'`)
    }
    expect(ENTRY_COLUMNS.map((column) => column.id)).toEqual([
      'type', 'priority', 'position', 'depth', 'order', 'keys', 'tokens',
    ])
  })

  test('keeps bulk type, priority, position, and depth controls interactive', () => {
    expect(entriesToolbarSource).toContain('aria-label="Bulk priority"')
    expect(entriesToolbarSource).toContain('aria-label="Bulk position"')
    expect(entriesToolbarSource).toContain('aria-label="Bulk depth"')
    expect(entriesToolbarSource).toContain('aria-label="Bulk trigger"')
    expect(entriesToolbarSource).toContain('aria-label="Bulk enabled"')
  })

  test('hides the bulk bar until something is selected but keeps the toggle live', () => {
    // Visibility used to be derived (`bulkPinned || selectedIds.length > 0`), which
    // made the toolbar button a no-op while anything was selected. It is now real
    // state that the selection *seeds* via an effect, so the button can always win.
    expect(workspaceSource).toContain('const [bulkVisible, setBulkVisible] = useState(false)')
    expect(workspaceSource).toContain('const hasSelection = selectedIds.length > 0')
    expect(workspaceSource).toMatch(
      /useEffect\(\(\) => \{\s*setBulkVisible\(hasSelection\)\s*\}, \[hasSelection\]\)/s,
    )
    // The state stays in the workspace; the extracted toolbar receives the setter
    // itself, so the button keeps overriding the selection-seeded value.
    expect(workspaceSource).toContain('setBulkVisible={setBulkVisible}')
    expect(entriesToolbarSource).toContain('onClick={() => setBulkVisible((value) => !value)}')
    expect(workspaceSource).not.toContain('bulkPinned')
    expect(entriesToolbarSource).not.toContain('bulkPinned')
    expect(entriesToolbarSource).toContain('{bulkVisible && (')
    expect(workspaceSource).toContain('Select all listed entries')
  })

  test('contains bulk controls and entry-table overflow inside the entries pane', () => {
    expect(workspaceStyles).toMatch(/\.bulkBar\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*hidden;/s)
    expect(workspaceStyles).toMatch(/\.entryTableRegion\s*\{[^}]*overflow:\s*auto;/s)
    expect(entryTableSource).toContain('styles.entryTableRegion')
    expect(workspaceSource).toContain('density="compact"')
    expect(entryEditorStyles).toMatch(/\.compactEntryEditor \.entryTextarea\s*\{[^}]*min-height:\s*232px;/s)
  })

  test('lets the inspector content field consume the leftover pane height', () => {
    expect(workspaceSource).toContain('fillContent')
    expect(workspaceStyles).toMatch(/\.inspectorPane\s*\{[^}]*overflow:\s*hidden;/s)
    expect(entryEditorStyles).toMatch(/\.fillEntryEditor\s*\{[^}]*flex:\s*1 1 auto;[^}]*overflow:\s*auto;/s)
    expect(entryEditorStyles).toMatch(/\.fillEntryEditor \.entryTextarea\s*\{[^}]*flex:\s*1 1 auto;/s)
  })

  test('re-points the growing row at Content once the identity grid collapses', () => {
    // Under 420px the identity grid drops to a single column, so the row that
    // carries the 1fr changed: without an explicit row list the 1fr landed on
    // Primary keys and Content stayed collapsed.
    const narrowBlock = entryEditorStyles.match(/@media \(max-width: 420px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(narrowBlock).toContain('.compactEntryEditor .identityFieldGroup')
    expect(narrowBlock).toContain('grid-template-columns: 1fr;')
    expect(narrowBlock).toMatch(
      /\.fillEntryEditor \.identityFieldGroup\s*\{[^}]*grid-template-rows:\s*auto auto auto auto minmax\(180px, 1fr\);/s,
    )
  })

  test('does not remount the entry editor on every background save', () => {
    // Keying on the revision meant the automatic token estimate remounted the
    // editor and wiped in-progress local field state.
    expect(workspaceSource).toContain("key={`${selectedEntry.id}:${conflicts[selectedEntry.id] ? 'conflict' : 'clean'}`}")
    expect(workspaceSource).not.toContain('${selectedEntry.revision}')
  })
})

describe('lorebook entry column model', () => {
  test('resolves visible columns in render order regardless of stored order', () => {
    expect(resolveVisibleColumns(['tokens', 'type', 'depth']).map((column) => column.id))
      .toEqual(['type', 'depth', 'tokens'])
    // 'enabled' is a fixed trailing cell, not a data column.
    expect(resolveVisibleColumns(['enabled']).map((column) => column.id)).toEqual([])
    expect(resolveVisibleColumns([])).toEqual([])
  })

  test('builds a grid template with one track per cell so the header and rows line up', () => {
    for (const visibleEntryMetadata of [
      [],
      ['tokens'],
      ['type', 'priority'],
      ['type', 'priority', 'position', 'depth', 'order', 'enabled', 'tokens'],
      ['type', 'priority', 'position', 'depth', 'order', 'keys', 'tokens'],
    ]) {
      const columns = resolveVisibleColumns(visibleEntryMetadata)
      const tracks = splitGridTracks(buildEntryGridTemplate(columns))
      // Gutter + name, then one track per visible column, then Enabled.
      expect(tracks).toHaveLength(2 + columns.length + 1)
      expect(tracks[0]).toBe(`${ENTRY_GUTTER_WIDTH}px`)
      expect(tracks[1]).toBe(`minmax(${ENTRY_NAME_MIN_WIDTH}px, 1.6fr)`)
      expect(tracks.slice(2, -1)).toEqual(columns.map((column) => column.width))
      expect(tracks.at(-1)).toBe(`${ENTRY_ENABLED_WIDTH}px`)
    }
  })

  test('sizes the table minimum width from the same column set', () => {
    // Empty selection still reserves the gutter, name, Enabled toggle, gaps and
    // the scrollbar allowance.
    expect(buildEntryTableMinWidth(resolveVisibleColumns([]))).toBe(
      ENTRY_GUTTER_WIDTH + ENTRY_NAME_MIN_WIDTH + ENTRY_ENABLED_WIDTH + 2 * ENTRY_COLUMN_GAP + 14,
    )
    expect(buildEntryTableMinWidth(resolveVisibleColumns([]))).toBe(188)
    expect(buildEntryTableMinWidth(resolveVisibleColumns(['tokens']))).toBe(244)
    // The shipped default selection.
    expect(buildEntryTableMinWidth(
      resolveVisibleColumns(DEFAULT_LOREBOOK_EDITOR_SETTINGS.visibleEntryMetadata),
    )).toBe(524)
    expect(buildEntryTableMinWidth(ENTRY_COLUMNS)).toBe(594)

    // Every added column widens the minimum, so nothing can be squeezed to zero.
    let previous = buildEntryTableMinWidth([])
    for (let count = 1; count <= ENTRY_COLUMNS.length; count += 1) {
      const width = buildEntryTableMinWidth(ENTRY_COLUMNS.slice(0, count))
      expect(width).toBeGreaterThan(previous)
      previous = width
    }
  })

  test('backfills column ids introduced after visibleEntryMetadata first shipped', () => {
    expect(ENTRY_METADATA_ADDITIONS).toEqual(['order'])
    expect(ENTRY_METADATA_VERSION).toBe(1)
    // mergeStoredSetting replaces stored arrays wholesale, so a pre-upgrade install
    // would never see Order without this one-off backfill.
    const stored = ['type', 'priority', 'position', 'depth', 'enabled', 'tokens']
    const upgraded = backfillEntryMetadata(stored, 0)
    expect(upgraded).toContain('order')
    expect(upgraded).not.toBe(stored)
    // Render order is rebuilt from ENTRY_COLUMNS, with non-column ids re-appended.
    expect(upgraded).toEqual(['type', 'priority', 'position', 'depth', 'order', 'tokens', 'enabled'])
    // Nothing that was visible before is lost.
    for (const id of stored) expect(upgraded).toContain(id)
    // "Everything hidden" is a legitimate pre-upgrade state, and the version — not
    // the contents — is what decides, so it is migrated like any other.
    expect(backfillEntryMetadata([], 0)).toEqual(['order'])
    expect(backfillEntryMetadata(['keys'], 0)).toEqual(['order', 'keys'])
  })

  test('leaves a migrated selection alone even when the new id is absent', () => {
    // This is the defect the version gate exists for. Inferring "pre-upgrade" from
    // the ids present cannot tell an old array from one where the user has since
    // unticked Order, so the old check re-ticked it on every single remount.
    const untickedAfterMigration = ['type', 'priority', 'position', 'depth', 'enabled', 'tokens']
    expect(backfillEntryMetadata(untickedAfterMigration, ENTRY_METADATA_VERSION))
      .toBe(untickedAfterMigration)
    expect(backfillEntryMetadata(untickedAfterMigration, ENTRY_METADATA_VERSION))
      .not.toContain('order')
    // A version from the future is equally settled.
    expect(backfillEntryMetadata(untickedAfterMigration, ENTRY_METADATA_VERSION + 1))
      .toBe(untickedAfterMigration)
    // Empty stays empty once migrated, too.
    const nothingVisible: string[] = []
    expect(backfillEntryMetadata(nothingVisible, ENTRY_METADATA_VERSION)).toBe(nothingVisible)
  })

  test('returns the same array reference when there is nothing to add', () => {
    // The caller compares by reference to skip a redundant settings write.
    const alreadyUpgraded = ['type', 'priority', 'position', 'depth', 'order', 'enabled', 'tokens']
    expect(backfillEntryMetadata(alreadyUpgraded, 0)).toBe(alreadyUpgraded)

    const onlyOrder = ['order']
    expect(backfillEntryMetadata(onlyOrder, 0)).toBe(onlyOrder)

    // Omitting the version is the same as version 0, so a caller that forgets it
    // still migrates rather than silently skipping.
    expect(backfillEntryMetadata(alreadyUpgraded)).toBe(alreadyUpgraded)
    expect(backfillEntryMetadata(['type'])).toEqual(['type', 'order'])
  })

  test('defaults the stored metadata version to 0 so pre-upgrade rows still migrate', () => {
    // Deliberately 0 rather than ENTRY_METADATA_VERSION: mergeStoredSetting fills any
    // field the stored row is *missing* from the default, so every row written before
    // `entryMetadataVersion` existed resolves to exactly this value. Seeding it with
    // the current version would mark those installs as already migrated and Order
    // would never appear for them — which is the whole point of the field.
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.entryMetadataVersion).toBe(0)
    expect(ENTRY_METADATA_VERSION).toBeGreaterThan(
      DEFAULT_LOREBOOK_EDITOR_SETTINGS.entryMetadataVersion,
    )
    // The shipped default selection is already current, so a fresh install's
    // migration costs a reference-equal backfill plus the single version write.
    expect(backfillEntryMetadata(DEFAULT_LOREBOOK_EDITOR_SETTINGS.visibleEntryMetadata, 0))
      .toBe(DEFAULT_LOREBOOK_EDITOR_SETTINGS.visibleEntryMetadata)
    // "Reset all Lorebook Editor settings" writes the whole default object, version
    // included, so it re-arms the migration — harmlessly, per the assertion above.
    expect(settingsModalSource)
      .toContain('onClick={() => updateLorebookEditor(DEFAULT_LOREBOOK_EDITOR_SETTINGS)}')
  })

  test('gates the workspace backfill on the stored version, once per mount', () => {
    expect(workspaceSource).toContain('const storedVersion = current.entryMetadataVersion ?? 0')
    expect(workspaceSource).toContain('if (storedVersion >= ENTRY_METADATA_VERSION) return')
    expect(workspaceSource)
      .toContain('backfillEntryMetadata(current.visibleEntryMetadata, storedVersion)')
    expect(workspaceSource).toContain('entryMetadataVersion: ENTRY_METADATA_VERSION')
    // The effect depends only on the store's stable setter, so it runs once per
    // mount; and because it records the version it just satisfied, a re-run could
    // only ever bail at the guard. It reads live state rather than the render-time
    // settings object, so it cannot re-trigger itself through its own write.
    expect(workspaceSource).toMatch(
      /useEffect\(\(\) => \{\r?\n\s*const current = useStore\.getState\(\)\.lorebookEditorSettings[\s\S]*?\r?\n {2}\}, \[setSetting\]\)/,
    )
  })

  test('stamps the metadata version when the settings checklist writes a selection', () => {
    // Source assertion rather than a render: importing SettingsModal pulls in the
    // zustand store, which touches `window` and cannot load under bun test.
    // An explicit choice made before the lorebook editor is ever mounted has to
    // close the migration too, or the workspace effect would re-tick Order over it.
    expect(settingsModalSource)
      .toContain("import { ENTRY_METADATA_VERSION } from '@/lib/lorebookEntryColumns'")
    expect(settingsModalSource).toMatch(
      /value=\{lorebookEditorSettings\.visibleEntryMetadata\}\r?\n\s*onChange=\{\(visibleEntryMetadata\) => updateLorebookEditor\(\{\r?\n\s*visibleEntryMetadata,\r?\n\s*entryMetadataVersion: ENTRY_METADATA_VERSION,\r?\n\s*\}\)\}/,
    )
    // The version it stamps is the one the gate compares against, so the write
    // satisfies `storedVersion >= ENTRY_METADATA_VERSION` on the next mount.
    expect(backfillEntryMetadata(['type', 'keys'], ENTRY_METADATA_VERSION))
      .toEqual(['type', 'keys'])
  })
})

describe('lorebook editor token counting', () => {
  test('defaults to a delayed single count instead of firing on every open', () => {
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode).toBe('delayed')
    // 500, not 1000: the delay is now purely a typing debounce — a fresh open is
    // counted immediately by `shouldCountOpenEntryImmediately` — and 500 is
    // `DEFAULT_ACTIVITY_PAUSE_MS`, this codebase's existing "typing has stopped"
    // window. See `lib/uiProductivityDefaults`.
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs).toBe(500)
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs).toBe(DEFAULT_ACTIVITY_PAUSE_MS)
  })

  test('honours the configured mode in the entry editor', () => {
    expect(entryEditorSource).toContain("if (tokenCountMode === 'manual') return")
    expect(entryEditorSource).toContain("if (tokenCountMode === 'delayed' && autoCountedId.current === entry.id) return")
    expect(entryEditorSource).toContain("tokenCountMode === 'delayed' ? Math.max(0, tokenCountDelayMs) : 300")
    expect(entryEditorSource).toContain('autoCountedId.current = null')
  })
})

describe('lorebook editor viewport containment', () => {
  test('clamps the half editor so it always leaves room for the chat', () => {
    expect(clampHalfEditorWidth(1_800, 1_280)).toBe(1_040)
    expect(clampHalfEditorWidth(720, 1_280)).toBe(720)
    expect(clampHalfEditorWidth(120, 1_280)).toBe(360)
    // Very narrow viewports fall back to the editor minimum rather than 0.
    expect(clampHalfEditorWidth(720, 400)).toBe(360)
    expect(halfEditorSource).toContain('--lorebook-half-width')
    expect(halfEditorStyles).toMatch(/\.halfScreenHost\s*\{[^}]*min-width:\s*0;/s)
    expect(halfEditorSource).toContain("from './LorebookHalfScreenEditor.module.css'")
    // The resize handle and the mobile full-bleed override travelled with the host.
    expect(halfEditorStyles).toContain('.halfResizeHandle {')
    expect(halfEditorStyles).toMatch(
      /@media \(max-width: 900px\) \{[\s\S]*?\.halfScreenHost\s*\{[^}]*position: fixed;/,
    )
  })

  test('yields to the modal layer only where full-bleed would bury it', () => {
    // The full-bleed rung has to clear --z-quick-toolbar-floating (10005), and
    // nothing clears the toolbar without also clearing SettingsModal (10001) and
    // ModalShell (10002). `onOpenFullEditor` opens `worldBookEditor` WITHOUT
    // closing this pane, so without a guard the modal opens behind it.
    expect(halfEditorSource).toContain("openModal('worldBookEditor'")
    expect(halfEditorSource).toContain("data-modal-open={activeModal ? 'true' : undefined}")

    const fullBleed = halfEditorStyles.match(
      /@media \(max-width: 900px\) \{([\s\S]*?)\n\}/,
    )?.[1] ?? ''
    expect(fullBleed).toMatch(
      /\.halfScreenHost\[data-modal-open='true'\]\s*\{[^}]*display:\s*none;/s,
    )

    // Scoped to the breakpoint on purpose: at wide widths this pane is a flex
    // sibling of the message list, so hiding it would reflow and re-anchor that
    // list behind the backdrop. There it already paints under the modal.
    const outsideMedia = halfEditorStyles.replace(
      /@media \(max-width: 900px\) \{[\s\S]*?\n\}/,
      '',
    )
    expect(outsideMedia).not.toContain('data-modal-open')
  })

  test('clamps a remembered full-editor rectangle to the viewport', () => {
    expect(clampEditorRectToViewport(
      { width: 1_540, height: 840 },
      { width: 1_280, height: 720 },
    )).toEqual({ width: 1_248, height: 688 })

    expect(clampEditorRectToViewport(
      { width: 1_540, height: 840 },
      { width: 1_920, height: 1_080 },
    )).toEqual({ width: 1_540, height: 840 })
  })

  test('keeps the centred rectangle in state so left-edge resizing cannot re-centre it', () => {
    expect(modalSource).toContain('const [centeredFullRect, setCenteredFullRect] = useState(')
    expect(modalSource).toContain('setCenteredFullRect(fullRect)')
  })
})

describe('responsive entry columns', () => {
  const ids = (columns: { id: string }[]) => columns.map((column) => column.id)
  const all = ENTRY_COLUMNS
  const defaults = resolveVisibleColumns(DEFAULT_LOREBOOK_EDITOR_SETTINGS.visibleEntryMetadata)

  test('drops every column exactly once, in a defined order', () => {
    // A column missing from the ladder would be undroppable and would pin the
    // table's minimum width forever; a duplicate would make the ladder ambiguous.
    expect([...ENTRY_COLUMN_DROP_ORDER].sort()).toEqual([...ids(ENTRY_COLUMNS)].sort())
    expect(new Set(ENTRY_COLUMN_DROP_ORDER).size).toBe(ENTRY_COLUMNS.length)
    expect(ENTRY_COLUMN_DROP_ORDER).toEqual([
      'keys', 'order', 'depth', 'position', 'priority', 'tokens', 'type',
    ])
  })

  test('keeps everything, by reference, when the pane is wide enough', () => {
    expect(resolveResponsiveColumns(all, buildEntryTableMinWidth(all))).toBe(all)
    expect(resolveResponsiveColumns(all, 5_000)).toBe(all)
    expect(resolveResponsiveColumns(defaults, buildEntryTableMinWidth(defaults))).toBe(defaults)
  })

  test('sheds columns in ladder order until the table fits', () => {
    // One pixel under the full minimum is enough to surrender the first column.
    expect(ids(resolveResponsiveColumns(all, buildEntryTableMinWidth(all) - 1)))
      .toEqual(['type', 'priority', 'position', 'depth', 'order', 'tokens'])

    // Walking the ladder down: keys, order, depth, position, priority, tokens.
    const survivors = [
      ['type', 'priority', 'position', 'depth', 'order', 'tokens'],
      ['type', 'priority', 'position', 'depth', 'tokens'],
      ['type', 'priority', 'position', 'tokens'],
      ['type', 'priority', 'tokens'],
      ['type', 'tokens'],
      ['type'],
    ]
    let width = buildEntryTableMinWidth(all)
    for (const expected of survivors) {
      width = buildEntryTableMinWidth(resolveVisibleColumns(expected))
      expect(ids(resolveResponsiveColumns(all, width))).toEqual(expected)
    }
    expect(width).toBe(268)
  })

  test('never drops the last remaining column', () => {
    // 20px cannot hold anything, but a table with no data columns is worse than a
    // table that scrolls, so the floor holds and the region scrolls instead.
    expect(ids(resolveResponsiveColumns(all, 20))).toEqual(['type'])
    expect(ids(resolveResponsiveColumns(all, 1))).toEqual(['type'])
    const onlyKeys = resolveVisibleColumns(['keys'])
    expect(resolveResponsiveColumns(onlyKeys, 20)).toBe(onlyKeys)
    expect(resolveResponsiveColumns([], 20)).toEqual([])
  })

  test('treats an unmeasured width as unknown rather than as zero', () => {
    // The ResizeObserver has not fired on the first paint. Degrading to a
    // one-column skeleton there would flash on every mount.
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveResponsiveColumns(all, width)).toBe(all)
    }
  })

  test("respects the user's column set instead of a hard-coded ladder", () => {
    // This is why the ladder cannot live in CSS: `['tokens','enabled']` has a true
    // minimum of 244, so a static 524px step would manufacture 280px of scroll on
    // a table that already fitted.
    const tokensOnly = resolveVisibleColumns(['tokens', 'enabled'])
    expect(buildEntryTableMinWidth(tokensOnly)).toBe(244)
    expect(resolveResponsiveColumns(tokensOnly, 244)).toBe(tokensOnly)
    expect(resolveResponsiveColumns(tokensOnly, 320)).toBe(tokensOnly)
    expect(resolveResponsiveColumns(tokensOnly, 400)).toBe(tokensOnly)
  })

  test('the surviving set always fits, or is a single column', () => {
    for (let width = 60; width <= 700; width += 7) {
      for (const set of [all, defaults, resolveVisibleColumns(['type', 'keys', 'tokens'])]) {
        const kept = resolveResponsiveColumns(set, width)
        // Never invents a column, never reorders.
        expect(ids(set)).toEqual(expect.arrayContaining(ids(kept)))
        expect(ids(kept)).toEqual(ids(set).filter((id) => ids(kept).includes(id)))
        if (kept.length > 1) expect(buildEntryTableMinWidth(kept)).toBeLessThanOrEqual(width)
      }
    }
  })

  test('removes the horizontal scroll every user got at the shipped defaults', () => {
    // The defect: 6 default columns need 524px, and the shipped `entriesPaneWidth`
    // was 320, so the full editor opened with ~204px of sideways scroll before any
    // drag. Dropping columns fixed the scroll but 320 is four pixels short of the
    // 324px `[type, tokens]` step, so it left exactly one column standing — the
    // default pane width is now 380, which clears the 374px `[type, priority,
    // tokens]` step instead.
    const paneWidth = DEFAULT_LOREBOOK_EDITOR_SETTINGS.entriesPaneWidth
    expect(paneWidth).toBe(380)
    expect(buildEntryTableMinWidth(defaults)).toBe(524)

    expect(resolveResponsiveColumns(defaults, 320).map((column) => column.id)).toEqual(['type'])
    const kept = resolveResponsiveColumns(defaults, paneWidth)
    expect(buildEntryTableMinWidth(kept)).toBeLessThanOrEqual(paneWidth)
    expect(kept.map((column) => column.id)).toEqual(['type', 'priority', 'tokens'])

    // The half editor's wider default pane can never keep fewer of them, from the
    // same arithmetic and with no second ladder.
    const halfWidth = DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEntriesPaneWidth
    expect(halfWidth).toBe(390)
    const halfKept = resolveResponsiveColumns(defaults, halfWidth)
    expect(buildEntryTableMinWidth(halfKept)).toBeLessThanOrEqual(halfWidth)
    expect(halfKept.length).toBeGreaterThanOrEqual(kept.length)
  })

  test('keeps emitting literal grid tracks for whatever survives', () => {
    // No `var(--lb-col-*)` indirection and no `display: none` on cells: the header
    // and the rows iterate the same resolved array, so the cell-count invariant
    // holds by construction rather than by a CSS rule staying in sync.
    for (const width of [180, 260, 330, 430, 600]) {
      const kept = resolveResponsiveColumns(all, width)
      const tracks = splitGridTracks(buildEntryGridTemplate(kept))
      expect(tracks).toHaveLength(2 + kept.length + 1)
      expect(tracks.slice(2, -1)).toEqual(kept.map((column) => column.width))
    }
    expect(entryColumnsSource).not.toContain('--lb-col-')
    expect(workspaceStyles).not.toContain('--lb-col-')
    expect(workspaceStyles).not.toContain('data-col')
    // `ENTRY_COLUMN_GAP = 6` has to keep matching the stylesheet, or every
    // computed minimum is wrong.
    expect(ENTRY_COLUMN_GAP).toBe(6)
    expect(workspaceStyles).toMatch(
      /\.entryTableHeader,\s*\.entryRow\s*\{[^}]*gap:\s*6px;/s,
    )
  })

  test('measures the table region in layout px, not device px', () => {
    // `contentBoxSize` under CSS `zoom` is unverified in this codebase. Guessing
    // wrong would reproduce the sideways-scrolling bug for every user at a UI
    // scale other than 1 while passing every test at scale 1, so measure the way
    // the rest of the app already compensates.
    expect(entryTableSource).toContain('new ResizeObserver(')
    expect(entryTableSource).toContain('getBoundingClientRect().width / scale')
    expect(entryTableSource).toContain('readUiScale')
    // Named in the comment that explains the choice, but never read.
    expect(entryTableSource).not.toMatch(/contentBoxSize\s*\[/)
    expect(entryTableSource).not.toContain('inlineSize')
    expect(entryTableSource).toContain('observer.disconnect()')
  })

  test('renders the resolved column set from both the header and the rows', () => {
    // Iterating one array from two places is what makes the cell-count invariant
    // structural. `display: none` on individual cells would remove them from the
    // grid entirely and shift every later cell one track left.
    expect(entryTableSource).toContain(
      'resolveResponsiveColumns(visibleColumns, availableWidth)',
    )
    expect(entryTableSource).toContain('buildEntryGridTemplate(responsiveColumns)')
    expect(entryTableSource).toContain('buildEntryTableMinWidth(responsiveColumns)')
    expect((entryTableSource.match(/responsiveColumns\.map\(/g) ?? [])).toHaveLength(2)
    // The unmeasured column set must never reach the grid template, or the table
    // reserves width for columns it just dropped.
    expect(entryTableSource).not.toContain('visibleColumns.map(')
    expect(entryTableSource).not.toContain('buildEntryGridTemplate(visibleColumns)')
  })
})

describe('lorebook editor pane ladder', () => {
  test('queries the workspace container rather than the viewport', () => {
    expect(workspaceStyles).toMatch(
      /\.workspace\s*\{[^}]*container-type:\s*inline-size;[^}]*container-name:\s*lbWorkspace;/s,
    )
    // Four tiers: wide (no rules), standard, narrow, stacked.
    expect(workspaceStyles).toContain('@container lbWorkspace (max-width: 1039px)')
    expect(workspaceStyles).toContain('@container lbWorkspace (max-width: 759px)')
    expect(workspaceStyles).toContain('@container lbWorkspace (max-width: 519px)')
  })

  test('hides the books pane and its splitter before anything else', () => {
    const standard = workspaceStyles.match(
      /@container lbWorkspace \(max-width: 1039px\) \{([\s\S]*?)\n\}/,
    )?.[1] ?? ''
    expect(standard).toContain('.workspace .booksPane')
    expect(standard).toContain('.workspace .booksPane + .splitter')
    expect(standard).toContain('display: none;')
  })

  test('stacks the panes on the pane width, keeping the old declarations', () => {
    const narrow = workspaceStyles.match(
      /@container lbWorkspace \(max-width: 759px\) \{([\s\S]*?)\n\}/,
    )?.[1] ?? ''
    expect(narrow).toMatch(/\.workspace \.panes\s*\{[^}]*flex-direction:\s*column;/s)
    expect(narrow).toMatch(/width:\s*100%;[^}]*flex:\s*1 1 50%;/s)
    expect(narrow).toMatch(/\.workspace \.splitter\s*\{[^}]*cursor:\s*row-resize;/s)
    // Selectors must be `.workspace X`, not bare `X`: `.halfWorkspace .entriesPane`
    // above is (0,2,0) and a bare `.entriesPane` here would silently lose to it.
    expect(narrow).not.toMatch(/^\s{2}\.entriesPane/m)
    expect(narrow).not.toContain('.halfWorkspace')
  })

  test('drops the splitter and the pane floors once resizing is meaningless', () => {
    const stacked = workspaceStyles.match(
      /@container lbWorkspace \(max-width: 519px\) \{([\s\S]*?)\n\}/,
    )?.[1] ?? ''
    expect(stacked).toMatch(/\.workspace \.splitter\s*\{[^}]*display:\s*none;/s)
    expect(stacked).toMatch(/min-width:\s*0;/s)
  })

  test('no longer reflows panes from a viewport query', () => {
    // The pane rules used to live in `@media (max-width: 900px)`, which keys on
    // the viewport — the one dimension the user is *not* changing when they drag
    // a divider. They are now in the container ladder. The only viewport rule
    // left anywhere is the half editor's mobile full-bleed host, and that moved
    // out to `LorebookHalfScreenEditor.module.css` with the rest of the host.
    for (const [, block] of workspaceStyles.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) {
      expect(block).not.toContain('flex-direction: column')
      expect(block).not.toContain('row-resize')
      expect(block).not.toContain('.panes')
      expect(block).not.toContain('.entriesPane')
      expect(block).not.toContain('.inspectorPane')
    }
    // And the declarations really did land in the ladder rather than vanish.
    const ladder = workspaceStyles.slice(workspaceStyles.indexOf('@container lbWorkspace'))
    expect(ladder).toContain('flex-direction: column;')
    expect(ladder).toContain('cursor: row-resize;')
  })

  test('never overwrites a dragged width with an automatic collapse', () => {
    // Collapse is presentational: `width: 100%` stops `--lorebook-entries-width`
    // from being consulted, and the stored px value comes back verbatim.
    expect(workspaceStyles).toMatch(
      /\.entriesPane\s*\{[^}]*width:\s*var\(--lorebook-entries-width\);/s,
    )
    expect(workspaceStyles).not.toContain('rememberedWidth')
    expect(workspaceSource).not.toContain('collapsedWidth')
  })
})

describe('css module class lookups', () => {
  test('never indexes a stylesheet by its snake_case source name', async () => {
    // Vite runs CSS Modules with localsConvention: 'camelCaseOnly', so
    // styles['trigger_constant'] / styles[`handle_${x}`] resolve to undefined.
    // That silently dropped trigger colours and every resize handle.
    const glob = new Bun.Glob('**/*.{ts,tsx}')
    const root = new URL('../frontend/src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const offenders: string[] = []
    for await (const file of glob.scan({ cwd: root })) {
      const source = await Bun.file(`${root}/${file}`).text()
      if (/styles\[\s*`?[a-zA-Z]+_/.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

describe('lorebook book search', () => {
  const books = [
    { id: 'a', name: 'Aetheria Codex', folder: 'Worldbuilding' },
    { id: 'b', name: 'Character Notes', folder: 'Worldbuilding' },
    { id: 'c', name: 'Scratch', folder: '' },
    { id: 'd', name: 'lore dump' },
  ]

  test('returns the input array identity for an empty or whitespace query', () => {
    // Identity matters: `filteredBooks` is a `useMemo` and a fresh array on
    // every keystroke that clears the field would re-render the pane for nothing.
    expect(filterBooks(books, '')).toBe(books)
    expect(filterBooks(books, '   ')).toBe(books)
  })

  test('matches book names case-insensitively and ignores surrounding space', () => {
    expect(filterBooks(books, 'aetheria').map((b) => b.id)).toEqual(['a'])
    expect(filterBooks(books, '  LORE  ').map((b) => b.id)).toEqual(['d'])
  })

  test('matches the folder as well as the name', () => {
    // This is the semantics change: the full editor's Books pane used to search
    // names only. Both surfaces now search name + folder.
    expect(filterBooks(books, 'worldbuilding').map((b) => b.id)).toEqual(['a', 'b'])
  })

  test('tolerates a missing or empty folder', () => {
    expect(filterBooks(books, 'scratch').map((b) => b.id)).toEqual(['c'])
    expect(filterBooks(books, 'zzz')).toEqual([])
  })

  test('agrees with SearchableSelect, which filters label + sublabel only', () => {
    // SearchableSelect.tsx:115-139 has no predicate prop and never searches
    // `group`. Mapping folder -> sublabel is the only thing keeping the half
    // editor's picker and `filterBooks` answering the same question.
    const needle = 'worldbuilding'
    const options = books.map((b) => ({
      value: b.id,
      label: b.name,
      sublabel: b.folder?.trim() || undefined,
      group: b.folder?.trim() || undefined,
    }))
    const selectMatches = options.filter(
      (o) => o.label.toLowerCase().includes(needle)
        || (o.sublabel !== undefined && o.sublabel.toLowerCase().includes(needle)),
    )
    expect(selectMatches.map((o) => o.value)).toEqual(filterBooks(books, needle).map((b) => b.id))
  })

  test('the module stays React-free, store-free and DOM-free', () => {
    expect(bookSearchSource).not.toMatch(/from '(react|@\/store|@\/types\/)/)
    // `\.` so the prose in the module's own header comment ("crashes on
    // `window is not defined`") is not mistaken for a DOM reference.
    expect(bookSearchSource).not.toMatch(/\b(document|window|globalThis)\./)
  })
})

describe('half editor lorebook picker', () => {
  test('replaced the unfiltered native select with a searchable picker', () => {
    expect(entriesToolbarSource).not.toContain('halfBookSelect')
    expect(entriesToolbarSource).toContain('<SearchableSelect')
    expect(entriesToolbarSource).toContain('styles.halfBookPicker')
  })

  test('portals the popover, because both ancestor panes clip', () => {
    // `.workspace` and `.entriesPane` are `overflow: hidden`; an inline popover
    // would be cut off at the pane edge.
    expect(entriesToolbarSource).toMatch(/^\s*portal\r?$/m)
    expect(workspaceStyles).toMatch(/\.workspace\s*\{[^}]*overflow:\s*hidden;/s)
    expect(workspaceStyles).toMatch(/\.entriesPane,\r?\n\.inspectorPane\s*\{[^}]*overflow:\s*hidden;/s)
  })

  test('forces the search field to show for a small library', () => {
    // SearchableSelect defaults searchThreshold to 8 and renders the field only
    // when `options.length > searchThreshold`, so the default hides "search
    // lorebooks" from anyone with fewer than nine books.
    expect(entriesToolbarSource).toContain('searchThreshold={0}')
    expect(searchableSelectSource).toContain('const showSearch = options.length > searchThreshold')
  })

  test('maps the folder to sublabel, not only to group', () => {
    expect(entriesToolbarSource).toContain('sublabel: folder, group: folder')
    // Guard the reason: the component filters label + sublabel and nothing else.
    expect(searchableSelectSource).toContain('o.label.toLowerCase().includes(needle)')
    expect(searchableSelectSource).toContain('o.sublabel.toLowerCase().includes(needle)')
    expect(searchableSelectSource).not.toMatch(/o\.group.*includes\(needle\)/)
  })

  test('labels the control for assistive tech and names the search field', () => {
    expect(entriesToolbarSource).toContain('searchPlaceholder="Search lorebooks..."')
    expect(entriesToolbarSource).toContain('ariaLabel="Lorebook"')
  })

  test('keeps the entry search field owning the row slack, at a legible width', () => {
    const picker = workspaceStyles.match(
      /\.entriesToolbar \.halfBookPicker\s*\{([^}]*)\}/,
    )?.[1] ?? ''
    expect(picker).toContain('min-width: 0')
    const basis = picker.match(/flex:\s*0\s+1\s+(\d+)px/)?.[1]
    expect(basis).toBeDefined()
    // 120px left ~11 characters after padding, gap and chevron.
    expect(Number(basis)).toBeGreaterThan(120)
    expect(workspaceStyles).toMatch(/\.entriesToolbar \.searchField\s*\{[^}]*flex:\s*1\s+1\s+auto;/s)
  })

  test('keeps the shared control chrome on the picker trigger', () => {
    // The class used to sit in the shared chrome group as `.halfBookSelect`;
    // renaming it out of that group would silently drop the border, background
    // and 30px min-height that align it with the rest of the toolbar row.
    const chrome = workspaceStyles.match(
      /([^}]*\.halfBookPickerTrigger)\s*\{([^}]*)\}/,
    )?.[2] ?? ''
    expect(chrome).toContain('min-height: 30px')
    expect(chrome).toContain('border: 1px solid var(--lumiverse-border)')
    expect(entriesToolbarSource).toContain('styles.halfBookPickerTrigger')
    expect(workspaceStyles).not.toContain('halfBookSelect')
  })

  test('gives the half variant a way to create a book', () => {
    // The full variant has `.bottomAction` under its Books pane; the half
    // variant had no create affordance at all.
    expect(entriesToolbarSource).toContain('onCreateBook')
    expect(entriesToolbarSource).toContain('aria-label="New lorebook"')
    expect(workspaceSource).toContain('onCreateBook={() => void createBook()}')
  })

  test('routes the full editor Books pane through the same module', () => {
    expect(workspaceSource).toContain('filterBooks(books, bookSearch)')
    expect(workspaceSource).not.toContain('books.filter((book) => book.name.toLowerCase()')
  })
})

describe('half editor layout resolution', () => {
  const chat = DEFAULT_MIN_CHAT_WIDTH
  const editor = DEFAULT_MIN_EDITOR_PANE_WIDTH

  test('ships the generous protected minimums, not the legacy 240', () => {
    // The actual defect the user reported: a 1920px row with a 240px reservation
    // already permitted a 1680px editor next to a 240px sliver of chat. Overlay
    // mode does not answer that — it covers *more*, not less. Raising the
    // reservation is what answers it.
    expect(DEFAULT_MIN_CHAT_WIDTH).toBe(420)
    expect(DEFAULT_MIN_EDITOR_PANE_WIDTH).toBe(360)
    expect(HALF_EDITOR_MIN_CHAT_WIDTH).toBe(240)
    expect(DEFAULT_MIN_CHAT_WIDTH).toBeGreaterThan(HALF_EDITOR_MIN_CHAT_WIDTH)
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.minChatWidth).toBe(DEFAULT_MIN_CHAT_WIDTH)
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.minEditorPaneWidth).toBe(DEFAULT_MIN_EDITOR_PANE_WIDTH)
    // On the row the user actually has, the editor now stops 180px earlier.
    expect(resolveHalfEditorLayout({ requestedWidth: 5_000, availableWidth: 1_920 }))
      .toEqual({ width: 1_500, mode: 'docked' })
  })

  test('docks whenever a usable chat and a usable editor both fit', () => {
    expect(resolveHalfEditorLayout({ requestedWidth: 720, availableWidth: 1_280 }))
      .toEqual({ width: 720, mode: 'docked' })
    expect(resolveHalfEditorLayout({ requestedWidth: 1_800, availableWidth: 1_280 }))
      .toEqual({ width: 860, mode: 'docked' })
    expect(resolveHalfEditorLayout({ requestedWidth: 120, availableWidth: 1_280 }))
      .toEqual({ width: editor, mode: 'docked' })
  })

  test('overlays only as a last resort, below minChat + minEditor', () => {
    // 780 exactly: the narrowest row that can still hold both.
    expect(resolveHalfEditorLayout({ requestedWidth: 720, availableWidth: chat + editor }))
      .toEqual({ width: editor, mode: 'docked' })
    expect(resolveHalfEditorLayout({ requestedWidth: 720, availableWidth: chat + editor - 1 }))
      .toEqual({ width: chat + editor - 1, mode: 'overlay' })
    // The case the old clamp got outright wrong: on a 560px row it returned 360,
    // i.e. a width the row was told to hold beside a 240px reservation it could not.
    expect(clampHalfEditorWidth(720, 560)).toBe(360)
    expect(resolveHalfEditorLayout({ requestedWidth: 720, availableWidth: 560 }))
      .toEqual({ width: 560, mode: 'overlay' })
    expect(resolveHalfEditorLayout({ requestedWidth: 200, availableWidth: 400 }))
      .toEqual({ width: 400, mode: 'overlay' })
  })

  test('honours caller-supplied minimums rather than reading a constant', () => {
    // D2: the reservation is a user setting, so it has to be a parameter.
    expect(resolveHalfEditorLayout({
      requestedWidth: 5_000,
      availableWidth: 1_280,
      minChatWidth: 700,
      minEditorWidth: 300,
    })).toEqual({ width: 580, mode: 'docked' })
    expect(resolveHalfEditorLayout({
      requestedWidth: 100,
      availableWidth: 1_280,
      minChatWidth: 700,
      minEditorWidth: 300,
    })).toEqual({ width: 300, mode: 'docked' })
    expect(resolveHalfEditorLayout({
      requestedWidth: 900,
      availableWidth: 900,
      minChatWidth: 700,
      minEditorWidth: 300,
    })).toEqual({ width: 900, mode: 'overlay' })
  })

  test('THE invariant: the width always fits the row and never collapses', () => {
    // This single property is what makes "dragging the editor too far left covers
    // everything" structurally impossible, at every row width and every request.
    for (let available = 0; available <= 2_400; available += 17) {
      for (const requested of [-500, 0, 1, 200, 360, 720, 1_337, 4_000, 100_000]) {
        for (const [minChat, minEditor] of [
          [DEFAULT_MIN_CHAT_WIDTH, DEFAULT_MIN_EDITOR_PANE_WIDTH],
          [240, 360],
          [900, 900],
          [0, 0],
          [420, 280],
        ]) {
          const layout = resolveHalfEditorLayout({
            requestedWidth: requested,
            availableWidth: available,
            minChatWidth: minChat,
            minEditorWidth: minEditor,
          })
          expect(layout.width).toBeLessThanOrEqual(available)
          expect(layout.width).toBeGreaterThanOrEqual(Math.min(minEditor, available))
          expect(Number.isInteger(layout.width)).toBe(true)
          // Overlay is reachable only when the row genuinely cannot hold both.
          expect(layout.mode).toBe(available - minChat >= minEditor ? 'docked' : 'overlay')
          if (layout.mode === 'docked') {
            expect(available - layout.width).toBeGreaterThanOrEqual(minChat)
          }
        }
      }
    }
  })

  test('treats a nonsense measurement as zero rather than propagating NaN', () => {
    for (const available of [Number.NaN, Number.POSITIVE_INFINITY, -10]) {
      expect(resolveHalfEditorLayout({ requestedWidth: 720, availableWidth: available }))
        .toEqual({ width: 0, mode: 'overlay' })
    }
    expect(resolveHalfEditorLayout({ requestedWidth: Number.NaN, availableWidth: 1_280 }))
      .toEqual({ width: editor, mode: 'docked' })
  })

  test('leaves the legacy clamp exactly as it was', () => {
    // Deliberately NOT reimplemented as a wrapper: overlay behaviour would change
    // every one of these answers, and they are pinned above.
    expect(clampHalfEditorWidth(1_800, 1_280)).toBe(1_040)
    expect(clampHalfEditorWidth(720, 400)).toBe(360)
    expect(geometrySource).toContain('viewportWidth - HALF_EDITOR_MIN_CHAT_WIDTH')
    expect(geometrySource).not.toMatch(
      /function clampHalfEditorWidth\([\s\S]{0,400}resolveHalfEditorLayout/,
    )
  })

  test('the geometry module stays React-free, store-free and DOM-free', () => {
    expect(geometrySource).not.toMatch(/from '(react|@\/store|@\/types\/)/)
    expect(geometrySource).not.toMatch(/\b(document|window|globalThis)\./)
  })
})

describe('half editor measurement', () => {
  const halfEditorCode = stripComments(halfEditorSource)
  const halfEditorCss = stripComments(halfEditorStyles)

  test('measures the row it lives in, not the window', () => {
    // `window.innerWidth` was wrong twice over: it ignores the spindle dock insets
    // and it is device px while the row's layout width is scaled.
    expect(halfEditorCode).not.toContain('window.innerWidth')
    expect(halfEditorCode).not.toContain('viewportWidth')
    expect(halfEditorSource).toContain('new ResizeObserver(')
    expect(halfEditorSource).toContain('observer.disconnect()')
    expect(halfEditorSource).toContain('resolveHalfEditorLayout(')
  })

  test('observes the chat column and the host, never the whole body row', () => {
    // `.body` also holds the portrait side panels and PortraitDock, which are
    // siblings of both and are never subtracted — measuring it would let the editor
    // eat the chat reservation whenever a portrait panel was open.
    expect(halfEditorSource).toContain('previousElementSibling')
    expect(halfEditorSource).toContain('hostWidth + chatWidth')
    expect(halfEditorSource).toContain('observer.observe(host)')
    expect(halfEditorSource).toContain('observer.observe(chatColumn)')
  })

  test('converts device px to layout px at every measurement site', () => {
    // B-M19: `contentBoxSize` under CSS `zoom` is unverified, so it is not used.
    expect(halfEditorSource).toContain("from '@/lib/uiScale'")
    expect(halfEditorSource).toContain('getBoundingClientRect().width')
    expect(halfEditorSource).toContain('readUiScale() || 1')
    expect(halfEditorSource).not.toMatch(/contentBoxSize\s*\[/)
    expect(halfEditorSource).not.toContain('inlineSize')
    // The drag delta is client px too, and used to be added to a layout-px width.
    expect(halfEditorSource).toContain('(startX - moveEvent.clientX) / scale')
  })

  test('clamps at render time and persists only a live drag', () => {
    // A user-dragged width is stored intent: an automatic clamp must never write
    // back, or opening the editor in a narrow window silently shrinks it forever.
    // Exactly one call site, and it is inside the pointer drag.
    expect(halfEditorCode.match(/commitWidth\(/g) ?? []).toHaveLength(1)
    expect(halfEditorCode).toMatch(/onPointerDown[\s\S]*commitWidth\(resolveHalfEditorLayout\(/)
    expect(halfEditorCode).not.toMatch(/useEffect\([\s\S]{0,300}commitWidth\(/)
    // The render-time resolve is separate and writes nothing.
    expect(halfEditorCode).toMatch(/const layout = resolveHalfEditorLayout\(\{/)
  })

  test('publishes the overlay state so the stylesheet can respond', () => {
    expect(halfEditorSource).toContain('data-layout={layout.mode}')
    expect(halfEditorStyles).toContain(".halfScreenHost[data-layout='overlay']")
    // A splitter that cannot split the row is a control that does nothing.
    expect(halfEditorStyles).toMatch(
      /\[data-layout='overlay'\] \.halfResizeHandle\s*\{[^}]*display:\s*none;/s,
    )
  })

  test('backs the clamp with a zoom-proof percentage, not a viewport unit', () => {
    // `vw` is unaffected by `body > * { zoom }`, so `calc(100vw - 240px)` was too
    // permissive by the whole scale factor and measured a box the host is not in.
    expect(halfEditorCss).not.toContain('100vw')
    expect(stripComments(workspaceStyles)).not.toContain('100vw')
    expect(halfEditorCss).toContain('calc(100% - var(--lorebook-min-chat-width, 420px))')
    expect(halfEditorSource).toContain('--lorebook-min-chat-width')
  })
})

describe('half editor floating mode', () => {
  test('defaults to docked, so nobody is moved off the behaviour they have', () => {
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEditorMode).toBe('docked')
  })

  test('floating renders through the shared resizable frame', () => {
    expect(halfEditorSource).toContain("settings.halfEditorMode === 'floating'")
    expect(halfEditorSource).toContain('<ResizablePanelFrame')
    expect(halfEditorSource).toContain('rect={settings.halfRect}')
    expect(halfEditorSource).toContain('onCommit={commitRect}')
    // Eight handles come from the frame itself, the same ones the full editor uses.
    expect(frameSource).toContain("['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']")
  })

  test('adds no zoom compensation of its own on the frame path', () => {
    // `usePersistentRect` is already scale-aware; a second division would shrink
    // every drag at scale != 1.
    const floatingBlock = halfEditorSource.slice(
      halfEditorSource.indexOf('if (floating)'),
      halfEditorSource.indexOf('// A remembered width'),
    )
    expect(floatingBlock).toContain('<ResizablePanelFrame')
    expect(floatingBlock).not.toContain('readUiScale')
    expect(floatingBlock).toContain('minWidth: minEditorWidth')
  })

  test('lifts the frame above the composer inside the chat stacking context', () => {
    // `.body` is `z-index: 2` and creates a stacking context; inside it the
    // composer is 20 and `.chatToolbar` is 8, so the frame's own 50 needs raising
    // only enough to clear them, not enough to escape the chat surface.
    expect(halfEditorStyles).toMatch(
      /\.halfFloatingFrame\.halfFloatingFrame\s*\{[^}]*z-index:\s*60;/s,
    )
    expect(halfEditorSource).toContain('styles.halfFloatingFrame')
    // Doubled selector, because `.frame`'s own `z-index: 50` has equal specificity
    // and lives in a different module — injection order must not decide this.
    expect(frameSource).toContain("from './ResizablePanelFrame.module.css'")
  })

  test('does not measure the row while floating', () => {
    // A fixed-position frame is out of flow: the chat column reclaims the whole
    // row, so there is nothing to reserve.
    expect(halfEditorSource).toContain('state.open && !floating')
  })
})

describe('full editor containment', () => {
  test('builds its viewport in layout px', () => {
    // `documentElement.clientWidth` is device px while the frame renders inside the
    // zoom layer. `usePersistentRect` divides internally, but `centerEditorRect`
    // and `bounds` run outside the hook, so the division has to be repeated here.
    expect(modalSource).toContain("from '@/lib/uiScale'")
    expect(modalSource).toContain('readUiScale() || 1')
    expect(modalSource).toContain('document.documentElement.clientWidth || window.innerWidth) / scale')
    expect(modalSource).toContain('document.documentElement.clientHeight || window.innerHeight) / scale')
    expect(modalSource).not.toMatch(/width: Math\.max\(1, document\.documentElement\.clientWidth/)
  })

  test('lowers the floor now that the workspace can lay itself out narrow', () => {
    // Safe only because the container ladder landed: the books pane collapses at
    // 1039, the panes stack at 759, the splitter goes at 519, and
    // `resolveResponsiveColumns` sheds entry columns to fit the pane.
    expect(FULL_EDITOR_MIN).toEqual({ width: 560, height: 420 })
    expect(workspaceStyles).toContain('@container lbWorkspace (max-width: 759px)')
    expect(workspaceStyles).toContain('@container lbWorkspace (max-width: 519px)')

    // A 1280x720 laptop keeps a real resizable range rather than one legal size.
    const viewport = { width: 1_280, height: 720 }
    const maxed = clampEditorRectToViewport({ width: 9_999, height: 9_999 }, viewport)
    expect(maxed.width - FULL_EDITOR_MIN.width).toBeGreaterThan(600)
    expect(maxed.height - FULL_EDITOR_MIN.height).toBeGreaterThan(250)
    expect(maxed).toEqual({
      width: viewport.width - FULL_EDITOR_MARGIN * 2,
      height: viewport.height - FULL_EDITOR_MARGIN * 2,
    })
    // The floor still wins on a viewport too small to honour the margin.
    expect(clampEditorRectToViewport({ width: 200, height: 200 }, viewport))
      .toEqual({ width: 560, height: 420 })
  })

  test('raises its own minimum with the shared minEditorPaneWidth', () => {
    // The same number that governs the half editor's clamp, so the full editor
    // cannot be dragged to a state where its content is unusable either.
    expect(modalSource).toContain('settings.minEditorPaneWidth ?? DEFAULT_MIN_EDITOR_PANE_WIDTH')
    expect(modalSource).toMatch(/minWidth: Math\.min\(\s*Math\.max\(\s*FULL_EDITOR_MIN\.width,/s)
    // Below the default it is the editor's own floor that holds.
    expect(DEFAULT_MIN_EDITOR_PANE_WIDTH).toBeLessThan(FULL_EDITOR_MIN.width)
  })
})

describe('shared ui scale module', () => {
  test('is neutral: no react, no store, no feature import', () => {
    expect(uiScaleSource).not.toMatch(/^import /m)
    expect(uiScaleSource).toContain('export function readUiScale()')
    expect(uiScaleSource).toContain('--lumiverse-ui-scale')
  })

  test('keeps the server-side guard the original had', () => {
    // Without it, importing anything that transitively reaches this module blows up
    // under `bun test`, which has no DOM at all.
    expect(uiScaleSource).toContain("if (typeof document === 'undefined') return 1")
  })

  test('does not modify the quick-toolbar copy a concurrent job owns', () => {
    // A later cleanup pass re-points `quickToolbarPlacement` at this module; doing
    // it here would collide with the QuickToolbar rewrite in flight.
    expect(halfEditorSource).not.toContain('quickToolbarPlacement')
    expect(modalSource).not.toContain('quickToolbarPlacement')
  })
})

describe('lorebook editor settings surface', () => {
  test('offers the mode as a toggle instead of deleting the dead sliders', () => {
    expect(settingsModalSource).toContain('label="Half-screen layout"')
    expect(settingsModalSource).toContain("[['docked', 'Docked'], ['floating', 'Floating']]")
    expect(settingsModalSource).toContain('halfEditorMode: halfEditorMode as')
  })

  test('gates height / X / Y on floating rather than removing them', () => {
    // They control nothing while docked, but floating mode reads the whole rect.
    expect(settingsModalSource).toContain('label="Half-screen width"')
    expect(settingsModalSource).toContain('label="Half-screen height"')
    expect(settingsModalSource).toContain('label="Half-screen X"')
    expect(settingsModalSource).toContain('label="Half-screen Y"')
    const gate = settingsModalSource.slice(
      settingsModalSource.indexOf('label="Half-screen width"'),
      settingsModalSource.indexOf('label="Books pane"'),
    )
    expect(gate).toContain("=== 'floating' && (")
    // The width slider is outside the gate — it is the one value docked mode reads.
    expect(gate.indexOf('label="Half-screen width"'))
      .toBeLessThan(gate.indexOf("=== 'floating' && ("))
  })

  test('exposes both protected minimums as ranges', () => {
    expect(settingsModalSource).toContain('label="Protected chat width"')
    expect(settingsModalSource).toContain('onChange={(minChatWidth) => updateLorebookEditor({ minChatWidth })}')
    expect(settingsModalSource).toContain('label="Minimum editor width"')
    expect(settingsModalSource).toContain('onChange={(minEditorPaneWidth) => updateLorebookEditor({ minEditorPaneWidth })}')
  })

  test('resets the new keys with the rest of the layout', () => {
    const start = settingsModalSource.indexOf('const resetLorebookLayout')
    const reset = settingsModalSource.slice(start, start + 900)
    for (const key of ['halfEditorMode', 'minChatWidth', 'minEditorPaneWidth']) {
      expect(reset).toContain(`${key}: DEFAULT_LOREBOOK_EDITOR_SETTINGS.${key}`)
    }
  })

  test('needs no migration, because mergeStoredSetting backfills scalars', () => {
    // store/slices/settings.ts spreads the default first and only then overlays the
    // stored keys, so a row written before these fields existed reads the defaults.
    expect(settingsSliceSource).toContain('const merged: Record<string, any> = { ...defaultValue }')
    expect(settingsSliceSource).toContain('for (const key of Object.keys(storedValue))')
    // None of the three new keys is an array, so nothing replaces wholesale.
    for (const key of ['halfEditorMode', 'minChatWidth', 'minEditorPaneWidth'] as const) {
      expect(Array.isArray(DEFAULT_LOREBOOK_EDITOR_SETTINGS[key])).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// LB-3 â€” background token counting
// ---------------------------------------------------------------------------

const tokenSchedulerSource = await Bun.file(
  new URL('../frontend/src/lib/tokenCountScheduler.ts', import.meta.url),
).text()
const tokenCountsHookSource = await Bun.file(
  new URL('../frontend/src/hooks/useTokenCounts.ts', import.meta.url),
).text()
const tokenizersApiSource = await Bun.file(
  new URL('../frontend/src/api/tokenizers.ts', import.meta.url),
).text()

describe('token estimate (tier 0)', () => {
  test('is the same arithmetic the list column always used', () => {
    // Replacing four inlined `Math.ceil(content.length / 4)` expressions must not
    // move a single number on screen, or "the counter got worse" is the report.
    expect(estimateTokens('')).toBe(0)
    expect(ESTIMATE_CHARS_PER_TOKEN).toBe(4)
    for (const length of [1, 3, 4, 5, 100, 2_047, 9_999]) {
      expect(estimateTokens('x'.repeat(length))).toBe(Math.ceil(length / 4))
    }
  })

  test('is monotonic in length', () => {
    let previous = -1
    for (let length = 0; length < 400; length += 7) {
      const value = estimateTokens('y'.repeat(length))
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('token count cache', () => {
  beforeEach(() => {
    clearTokenCountCache()
  })

  test('never stores the counted text â€” the memory requirement, asserted directly', () => {
    // The predecessor key was `${model}:${content}`, i.e. a full second copy of
    // every counted entry's text. A 500-entry book at 2KB an entry is ~1MB of
    // duplicated strings, and the sweep counts every entry in the book.
    const sample = 'Aurelia keeps the ledger of the drowned city and will not speak of it.'
    setTokenCount('gpt-4', sample, { count: 17, approximate: false, model: 'gpt-4' })
    const keys = tokenCacheKeys()
    expect(keys).toHaveLength(1)
    for (const key of keys) {
      expect(key).not.toContain(sample)
      expect(key).not.toContain('Aurelia')
      expect(key).not.toContain('drowned')
    }
    // Model, length and hash â€” fixed size regardless of entry size.
    expect(keys[0]).toBe(`gpt-4:${sample.length}:${fnv1a32(sample)}`)
  })

  test('the length in the key makes a hash collision insufficient on its own', () => {
    const key = tokenCacheKey('m', 'abcd')
    expect(key.split(':')[1]).toBe('4')
    expect(tokenCacheKey('m', 'abcd')).not.toBe(tokenCacheKey('m', 'abcde'))
    // Two contents can only share a key if they share BOTH a 32-bit hash and an
    // exact length.
    expect(tokenCacheKey('m', 'abcd').split(':').slice(1).join(':'))
      .not.toBe(tokenCacheKey('m', 'dcba').split(':').slice(1).join(':'))
  })

  test('does not let two models share an answer', () => {
    setTokenCount('gpt-4', 'shared', { count: 2, approximate: false, model: 'gpt-4' })
    setTokenCount('claude', 'shared', { count: 3, approximate: false, model: 'claude' })
    expect(getTokenCount('gpt-4', 'shared')?.count).toBe(2)
    expect(getTokenCount('claude', 'shared')?.count).toBe(3)
    expect(getTokenCount('llama', 'shared')).toBeNull()
    expect(tokenCacheSize()).toBe(2)
  })

  test('evicts at the bound, least-recently-read first, and `get` promotes', () => {
    for (let i = 0; i < TOKEN_CACHE_MAX_ENTRIES; i += 1) {
      setTokenCount('m', `entry-${i}`, { count: i, approximate: false, model: 'm' })
    }
    expect(tokenCacheSize()).toBe(TOKEN_CACHE_MAX_ENTRIES)

    // Reading the oldest record promotes it out of the firing line; the next
    // oldest is evicted instead. A whole-book sweep must not be able to evict the
    // handful of entries the user is actually working in.
    expect(getTokenCount('m', 'entry-0')?.count).toBe(0)
    setTokenCount('m', 'overflow', { count: -1, approximate: false, model: 'm' })
    expect(tokenCacheSize()).toBe(TOKEN_CACHE_MAX_ENTRIES)
    expect(getTokenCount('m', 'entry-0')?.count).toBe(0)
    expect(getTokenCount('m', 'entry-1')).toBeNull()
  })

  test('notifies subscribers once per write so useSyncExternalStore can drive the list', () => {
    let notifications = 0
    const before = getTokenCountVersion()
    const unsubscribe = subscribeTokenCounts(() => { notifications += 1 })
    setTokenCount('m', 'a', { count: 1, approximate: false, model: 'm' })
    setTokenCount('m', 'b', { count: 2, approximate: false, model: 'm' })
    getTokenCount('m', 'a')
    expect(notifications).toBe(2)
    expect(getTokenCountVersion()).toBe(before + 2)
    unsubscribe()
    setTokenCount('m', 'c', { count: 3, approximate: false, model: 'm' })
    expect(notifications).toBe(2)
  })

  test('records an approximate answer distinguishably, so the cell can render a tilde', () => {
    setTokenCount('m', 'unmatched', { count: 9, approximate: true, model: 'm' })
    expect(getTokenCount('m', 'unmatched')).toEqual({ count: 9, approximate: true, model: 'm' })
    expect(hasTokenCount('m', 'unmatched')).toBe(true)
    expect(hasTokenCount('m', 'other')).toBe(false)
  })
})

// A fake clock, fake timers and a manually settled counter: the scheduler is
// deliberately DOM-free so all of this is testable without a renderer.
function makeSchedulerHarness(overrides: Partial<TokenCountSchedulerDeps> = {}) {
  let now = 0
  let nextTimerId = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  const calls: string[] = []
  const pending: {
    text: string
    signal: AbortSignal
    resolve: (value: number | null) => void
    reject: (error: unknown) => void
  }[] = []
  const results: TokenCountOutcome[] = []

  const scheduler = new TokenCountScheduler({
    count: (text, signal) => {
      calls.push(text)
      return new Promise<number | null>((resolve, reject) => {
        pending.push({ text, signal, resolve, reject })
      })
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextTimerId += 1
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimer: (handle) => { timers.delete(handle as number) },
    onResult: (outcome) => { results.push(outcome) },
    ...overrides,
  })

  const advance = (ms: number) => {
    now += ms
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id)
        timer.fn()
      }
    }
  }
  // Real macrotask turn: the dispatch path chains several `.then`s, and counting
  // microtasks by hand is exactly the kind of assertion that rots.
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  // Microtask-only drain, for the 500-item loop where 500 real timer turns would
  // dominate the runtime without testing anything extra.
  const flushMicro = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve()
  }
  const settleOldest = (value: number | null) => {
    const next = pending.shift()
    if (!next) throw new Error('nothing in flight')
    next.resolve(value)
  }

  return { scheduler, advance, flush, flushMicro, calls, pending, results, settleOldest }
}

const req = (
  key: string,
  priority: TokenCountPriority,
  text = `text-${key}`,
): TokenCountRequest => ({ key, text, model: 'm', priority })

describe('token count scheduler', () => {
  test('never exceeds two in flight', async () => {
    // Two, not more: the backend counts synchronously on the Bun event loop, so
    // extra concurrency only queues work in front of the request the user is
    // actually waiting on.
    const h = makeSchedulerHarness()
    for (let i = 0; i < 6; i += 1) void h.scheduler.request(req(`k${i}`, 'interactive'))
    expect(h.scheduler.inFlightCount).toBe(2)
    expect(h.calls).toHaveLength(2)
    expect(h.scheduler.queueLength).toBe(4)

    h.settleOldest(10)
    await h.flush()
    expect(h.scheduler.inFlightCount).toBe(2)
    expect(h.calls).toHaveLength(3)
  })

  test('an interactive enqueue preempts queued sweep work', async () => {
    const h = makeSchedulerHarness()
    for (let i = 0; i < 4; i += 1) void h.scheduler.request(req(`s${i}`, 'sweep'))
    // Sweep items are never released by `request` â€” only by `pumpSweep`.
    expect(h.calls).toHaveLength(0)

    void h.scheduler.request(req('hot', 'interactive'))
    expect(h.calls).toEqual(['text-hot'])

    // And when a slot frees while both bands are queued, the foreground wins.
    void h.scheduler.request(req('hot2', 'interactive'))
    void h.scheduler.request(req('hot3', 'interactive'))
    h.settleOldest(1)
    await h.flush()
    expect(h.calls).toEqual(['text-hot', 'text-hot2', 'text-hot3'])
  })

  test('promotes a queued sweep item that the user then hovers', () => {
    const h = makeSchedulerHarness()
    void h.scheduler.request(req('k', 'sweep'))
    expect(h.calls).toHaveLength(0)
    void h.scheduler.request(req('k', 'interactive'))
    // One dispatch, not two: same key, promoted band.
    expect(h.calls).toEqual(['text-k'])
    expect(h.scheduler.queueLength).toBe(0)
  })

  test('a duplicate key in flight yields one request and two resolved callers', async () => {
    const h = makeSchedulerHarness()
    const first = h.scheduler.request(req('k', 'interactive'))
    const second = h.scheduler.request(req('k', 'interactive'))
    expect(h.calls).toHaveLength(1)
    h.settleOldest(42)
    await h.flush()
    expect((await first).count).toBe(42)
    expect((await second).count).toBe(42)
    // Exactly one answer reaches the cache sink, too.
    expect(h.results).toHaveLength(1)
    expect(h.results[0].text).toBe('text-k')
  })

  test('abortAll clears the queue, aborts in flight, and leaves the cache intact', async () => {
    clearTokenCountCache()
    setTokenCount('m', 'already counted', { count: 7, approximate: false, model: 'm' })

    const h = makeSchedulerHarness()
    const inFlight = h.scheduler.request(req('a', 'interactive'))
    void h.scheduler.request(req('b', 'interactive'))
    void h.scheduler.request(req('c', 'interactive'))
    void h.scheduler.request(req('d', 'sweep'))
    const signal = h.pending[0].signal
    expect(signal.aborted).toBe(false)

    h.scheduler.abortAll()
    expect(h.scheduler.queueLength).toBe(0)
    expect(h.scheduler.inFlightCount).toBe(0)
    expect(signal.aborted).toBe(true)
    expect((await inFlight).aborted).toBe(true)

    // The point of keeping the cache: coming back to the book is instant.
    expect(getTokenCount('m', 'already counted')?.count).toBe(7)

    // A late answer from the cancelled generation must not reach the sink.
    h.pending[0]?.resolve(99)
    await h.flush()
    expect(h.results).toHaveLength(0)
  })

  test('a hover cancelled before the dwell issues no request', () => {
    const h = makeSchedulerHarness()
    h.scheduler.scheduleDwell(req('k', 'interactive'), 220)
    h.advance(219)
    expect(h.calls).toHaveLength(0)
    h.scheduler.cancelDwell('k')
    h.advance(1_000)
    expect(h.calls).toHaveLength(0)
  })

  test('a hover that survives the dwell issues exactly one request', () => {
    const h = makeSchedulerHarness()
    h.scheduler.scheduleDwell(req('k', 'interactive'), 220)
    h.advance(220)
    expect(h.calls).toEqual(['text-k'])
    // The click that follows joins the in-flight request rather than adding one.
    void h.scheduler.request(req('k', 'interactive'))
    expect(h.calls).toHaveLength(1)
  })

  test('noteUserActivity parks the sweep without parking interactive work', async () => {
    const h = makeSchedulerHarness()
    h.scheduler.noteUserActivity()
    void h.scheduler.request(req('s', 'sweep'))
    expect(h.scheduler.pumpSweep()).toBe(false)
    expect(h.calls).toHaveLength(0)

    // Typing must never delay the count for the entry the user has open.
    void h.scheduler.request(req('hot', 'interactive'))
    expect(h.calls).toEqual(['text-hot'])

    h.advance(500)
    // Still suppressed: foreground work is outstanding.
    expect(h.scheduler.pumpSweep()).toBe(false)
    h.settleOldest(3)
    await h.flush()
    expect(h.scheduler.pumpSweep()).toBe(true)
    expect(h.calls).toEqual(['text-hot', 'text-s'])
  })

  test('a hidden tab pauses the sweep and resuming releases it', () => {
    const h = makeSchedulerHarness()
    void h.scheduler.request(req('s', 'sweep'))
    h.scheduler.setPaused(true)
    expect(h.scheduler.isPaused).toBe(true)
    expect(h.scheduler.pumpSweep()).toBe(false)
    h.scheduler.setPaused(false)
    expect(h.scheduler.pumpSweep()).toBe(true)
  })

  test('a 500-item sweep runs one dispatch per idle callback and never exceeds two concurrent', async () => {
    const h = makeSchedulerHarness()
    const total = 500
    for (let i = 0; i < total; i += 1) void h.scheduler.request(req(`s${i}`, 'sweep'))
    expect(h.scheduler.queueLength).toBe(total)
    expect(h.calls).toHaveLength(0)

    // One per callback â€” this is the "yields between items" property.
    expect(h.scheduler.pumpSweep()).toBe(true)
    expect(h.calls).toHaveLength(1)
    expect(h.scheduler.pumpSweep()).toBe(true)
    expect(h.calls).toHaveLength(2)
    expect(h.scheduler.pumpSweep()).toBe(false)
    expect(h.scheduler.inFlightCount).toBe(2)

    let guard = 0
    while (h.calls.length < total) {
      guard += 1
      if (guard > total * 4) throw new Error('sweep did not drain')
      if (!h.scheduler.pumpSweep()) {
        h.settleOldest(1)
        await h.flushMicro()
      }
      expect(h.scheduler.inFlightCount).toBeLessThanOrEqual(2)
    }
    expect(h.calls).toHaveLength(total)
    expect(h.results.length).toBeGreaterThan(0)
  })

  test('a failed request is reported as an error, not as a count of null', async () => {
    const h = makeSchedulerHarness()
    const promise = h.scheduler.request(req('k', 'interactive'))
    h.pending[0].reject(new Error('offline'))
    const outcome = await promise
    expect(outcome.aborted).toBe(false)
    expect(outcome.count).toBeNull()
    expect(outcome.error).toBeInstanceOf(Error)
  })
})

describe('token counting never writes to the server from the background', () => {
  test('the scheduler and the hook cannot reach the entry save path', () => {
    // The single most important regression guard in this feature. Asserted
    // against the RAW source, comments included: a background count that ever
    // reaches the entry-update path becomes a PUT with `expected_revision`, which
    // bumps `revision = revision + 1`, touches the book and emits an
    // entry-changed event â€” for every entry, on a 500-entry sweep.
    for (const source of [tokenSchedulerSource, tokenCountsHookSource]) {
      expect(source).not.toContain('onImmediateUpdate')
      expect(source).not.toContain('saveEntry')
      expect(source).not.toContain('worldBooksApi')
    }
  })

  test('the exactness gate is inside persistTokenCount, not at its call sites', () => {
    // One call site passes the *variable* `next.approximate`, so a grep for a
    // literal `true` cannot see the branch that fires most often. The gate has to
    // be at the top of the function.
    const start = entryEditorSource.indexOf('const persistTokenCount = useCallback(')
    expect(start).toBeGreaterThan(-1)
    const body = entryEditorSource.slice(start, start + 260)
    expect(body).toContain('if (approximate) return')
    // Every remaining `length / 4` path is therefore unable to write.
    expect(stripComments(entryEditorSource)).not.toContain('Math.ceil(targetContent.length / 4)')
    expect(stripComments(entryEditorSource)).toContain('estimateTokens(targetContent)')
  })

  test('the open entry reads the shared cache before issuing a request', () => {
    // A hit means the prefetch already did the work, so `delayed` mode persists
    // with no request at all. The old cache was a `useRef` Map that died with
    // every remount of the editor.
    expect(stripComments(entryEditorSource)).not.toContain('tokenCache.current')
    expect(entryEditorSource).toContain('readCachedTokenCount(model, targetContent)')
    expect(entryEditorSource).toContain('getTokenCountScheduler().request(')
    expect(entryEditorSource).toContain("priority: 'interactive'")
    // Typing parks the sweep rather than competing with it.
    expect(entryEditorSource).toContain('noteUserActivity()')
  })

  test('background counts reach the list through the cache subscription only', () => {
    expect(tokenCountsHookSource).toContain('useSyncExternalStore(')
    expect(tokenCountsHookSource).toContain('subscribeTokenCounts')
    expect(tokenCountsHookSource).toContain('getTokenCountVersion')
    // No store write anywhere in the hook: every write would re-render every
    // subscriber and sit next to the persisted-settings machinery.
    expect(tokenCountsHookSource).not.toContain('setSetting(')
  })
})

describe('token prefetch wiring', () => {
  test('cancellation is possible at all â€” the API forwards a signal', () => {
    expect(tokenizersApiSource).toContain('countForModel(modelId: string, text: string, options?: RequestOptions)')
    expect(tokenizersApiSource).toContain('type RequestOptions')
    expect(tokenCountsHookSource).toContain('tokenizersApi.countForModel(model, text, { signal })')
  })

  test('the sweep is scoped to the open book and aborts when it changes', () => {
    // The user constraint, not an optimisation: never sweep the library.
    expect(tokenCountsHookSource).toContain('return () => scheduler.abortAll()')
    // The abort effect re-runs on book change and on profile/model change.
    expect(tokenCountsHookSource).toContain('}, [bookId, model])')
    // The sweep only ever reads the entries of the open book, and refuses to run
    // without one.
    expect(tokenCountsHookSource).toContain('if (!bookId || !model) return')
    expect(tokenCountsHookSource).toContain('for (const entry of entriesRef.current)')
    expect(tokenCountsHookSource).toContain("priority: 'sweep'")
  })

  test('no tokenizer means the option is disabled, not silently estimating', () => {
    // `countForModel` returns null when no pattern matches the model. Estimating
    // under an option labelled "count every entry" would make the feature's whole
    // promise quietly false.
    expect(tokenCountsHookSource).toContain("if (availability.status !== 'available') return")
    expect(tokenCountsHookSource).toContain('tokenizersApi.testPattern(model)')
    expect(settingsModalSource).toContain('label="Count every entry in the open lorebook"')
    expect(settingsModalSource).toContain("disabled={tokenizerAvailability.status !== 'available'}")
    expect(settingsModalSource).toContain('useTokenizerAvailability()')
  })

  test('uses hover intent and selection adjacency, never IntersectionObserver', () => {
    // A fast scroll through a 500-row list would enqueue everything â€” that is the
    // sweep with worse pacing and no user intent behind it.
    expect(tokenCountsHookSource).not.toContain('IntersectionObserver')
    expect(tokenCountsHookSource).toContain('scheduleDwell(')
    expect(tokenCountsHookSource).toContain('cancelDwell(')
    expect(tokenCountsHookSource).toContain("enqueue(list[index - 1], 'adjacent')")
    expect(tokenCountsHookSource).toContain("enqueue(list[index + 1], 'adjacent')")
    // `requestIdleCallback` with the documented `setTimeout(fn, 1)` fallback.
    expect(tokenCountsHookSource).toContain('requestIdleCallback')
    expect(tokenCountsHookSource).toContain('window.setTimeout(fn, 1)')
  })

  test('the workspace hands the row handlers and the resolver to the table', () => {
    expect(workspaceSource).toContain('useTokenCounts({ bookId: selectedBookId, entries: filteredEntries, selectedEntryId })')
    expect(workspaceSource).toContain('onEntryPointerEnter={handleEntryPointerEnter}')
    expect(workspaceSource).toContain('onEntryPointerLeave={handleEntryPointerLeave}')
    expect(workspaceSource).toContain('resolveTokenCount={resolveTokenCount}')
    expect(entryTableSource).toContain('onPointerEnter={() => onEntryPointerEnter?.(entry.id)}')
    expect(entryTableSource).toContain('onPointerLeave={() => onEntryPointerLeave?.(entry.id)}')
  })

  test('the tokens cell marks estimates with a leading tilde', () => {
    expect(entryTableSource).toContain("{tokens.exact ? '' : '~'}{tokens.value}")
    expect(stripComments(entryTableSource)).not.toContain('Math.ceil(entry.content.length / 4)')
    expect(entryTableSource).toContain('estimateTokens(entry.content)')
  })

  test('does not add a batch tokenizer endpoint', () => {
    // Batching 50 texts into one synchronous handler blocks the Bun event loop
    // and delays the interactive count the user *is* waiting on.
    expect(tokenizersApiSource).not.toContain('count-batch')
    expect(tokenCountsHookSource).not.toContain('count-batch')
  })
})

describe('token prefetch settings (D3)', () => {
  test('two independent settings, not one enum', () => {
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHover).toBe(true)
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountAllEntries).toBe(false)
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHoverDelayMs).toBe(220)
    // Orthogonal to the existing mode, which is unchanged.
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode).toBe('delayed')
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs).toBe(500)
    expect('tokenPrefetch' in DEFAULT_LOREBOOK_EDITOR_SETTINGS).toBe(false)
  })

  test('needs no migration, because mergeStoredSetting backfills scalars', () => {
    expect(settingsSliceSource).toContain('const merged: Record<string, any> = { ...defaultValue }')
    for (const key of ['tokenPrefetchHover', 'tokenPrefetchHoverDelayMs', 'tokenCountAllEntries'] as const) {
      expect(Array.isArray(DEFAULT_LOREBOOK_EDITOR_SETTINGS[key])).toBe(false)
    }
  })

  test('all three are exposed and reset with the rest of the layout', () => {
    expect(settingsModalSource).toContain('label="Count ahead when hovering an entry"')
    expect(settingsModalSource).toContain('label="Hover delay before counting"')
    const start = settingsModalSource.indexOf('const resetLorebookLayout')
    const reset = settingsModalSource.slice(start, start + 1_200)
    for (const key of ['tokenPrefetchHover', 'tokenPrefetchHoverDelayMs', 'tokenCountAllEntries']) {
      expect(reset).toContain(`${key}: DEFAULT_LOREBOOK_EDITOR_SETTINGS.${key}`)
    }
  })

  test('the hover delay slider only appears while hover prefetch is on', () => {
    const gate = settingsModalSource.slice(
      settingsModalSource.indexOf('label="Count ahead when hovering an entry"'),
      settingsModalSource.indexOf('label="Hover delay before counting"'),
    )
    expect(gate).toContain('lorebookEditorSettings.tokenPrefetchHover ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHover) && (')
    // The delay is clamped to the documented 0-1000 range on the read side too,
    // so a hand-edited settings row cannot park a prefetch for a minute.
    expect(tokenCountsHookSource).toContain('Math.min(1_000, Math.max(0,')
  })

  test('the settings copy says the two groups are orthogonal', () => {
    // `manual` + "count every entry" is a legitimate combination: nothing is
    // auto-saved, but the list is exact. The copy has to make that legible.
    expect(settingsModalSource).toContain('Background counts are never saved back to the lorebook.')
  })
})

describe('bulk set_fields builds a sparse patch (BUG 1)', () => {
  const untouched: BulkFieldForm = EMPTY_BULK_FIELD_FORM

  test('the empty form is the sentinel form, and it mutates nothing', () => {
    expect(EMPTY_BULK_FIELD_FORM).toEqual({
      priority: '',
      depth: '',
      position: BULK_UNCHANGED,
      trigger: BULK_UNCHANGED,
      enabled: BULK_UNCHANGED,
    })
    expect(buildBulkFieldPatch(untouched)).toEqual({})
    expect(hasBulkFieldMutation(untouched)).toBe(false)
  })

  test('a State-only Apply carries no priority, depth, position or trigger', () => {
    // This is the data-loss case. `trigger` in particular made the server clear
    // `vectorized` and drop the stored embeddings, permanently demoting every
    // semantic entry in the selection to a keyword entry.
    const patch = buildBulkFieldPatch({ ...untouched, enabled: 'disabled' })
    expect(patch).toEqual({ enabled: false })
    for (const key of ['priority', 'depth', 'position', 'trigger'] as const) {
      expect(Object.hasOwn(patch, key)).toBe(false)
    }
    expect(hasBulkFieldMutation({ ...untouched, enabled: 'disabled' })).toBe(true)
  })

  test('every other single-field Apply is equally narrow', () => {
    expect(buildBulkFieldPatch({ ...untouched, priority: '250' })).toEqual({ priority: 250 })
    expect(buildBulkFieldPatch({ ...untouched, depth: '12' })).toEqual({ depth: 12 })
    expect(buildBulkFieldPatch({ ...untouched, position: '4' })).toEqual({ position: 4 })
    expect(buildBulkFieldPatch({ ...untouched, trigger: 'vector' })).toEqual({ trigger: 'vector' })
    expect(buildBulkFieldPatch({ ...untouched, enabled: 'enabled' })).toEqual({ enabled: true })
  })

  test('0 is a real value in every number field, not "untouched"', () => {
    // `Number('') === 0` is exactly how an empty box used to become a real write,
    // so emptiness has to be decided before the coercion.
    expect(buildBulkFieldPatch({ ...untouched, priority: '0' })).toEqual({ priority: 0 })
    expect(buildBulkFieldPatch({ ...untouched, depth: '0' })).toEqual({ depth: 0 })
    expect(buildBulkFieldPatch({ ...untouched, position: '0' })).toEqual({ position: 0 })
  })

  test('whitespace and garbage are dropped rather than coerced to 0', () => {
    expect(buildBulkFieldPatch({ ...untouched, priority: '   ' })).toEqual({})
    expect(buildBulkFieldPatch({ ...untouched, priority: 'abc' })).toEqual({})
    expect(buildBulkFieldPatch({ ...untouched, depth: 'NaN' })).toEqual({})
    expect(hasBulkFieldMutation({ ...untouched, priority: 'abc' })).toBe(false)
  })

  test('depth is floored at 0 and fractions truncated, matching the server', () => {
    expect(buildBulkFieldPatch({ ...untouched, depth: '-5' })).toEqual({ depth: 0 })
    expect(buildBulkFieldPatch({ ...untouched, depth: '3.7' })).toEqual({ depth: 3 })
    expect(buildBulkFieldPatch({ ...untouched, priority: '-20' })).toEqual({ priority: -20 })
  })

  test('a fully-set form still sends all five, so the bar is not crippled', () => {
    expect(buildBulkFieldPatch({
      priority: '10', depth: '4', position: '0', trigger: 'keyword', enabled: 'enabled',
    })).toEqual({ priority: 10, depth: 4, position: 0, trigger: 'keyword', enabled: true })
  })

  test('the module stays dependency-free so it can be unit-tested at all', () => {
    expect(bulkPatchSource).not.toMatch(/^import /m)
  })
})

describe('the bulk bar cannot rebuild a full patch (BUG 1 regression guard)', () => {
  test('no hard-coded field default survives in the workspace state', () => {
    expect(workspaceSource).not.toContain("useState('10')")
    expect(workspaceSource).not.toContain("useState('4')")
    expect(workspaceSource).not.toContain("useState('0')")
    expect(workspaceSource).not.toMatch(/useState<TriggerType>\('keyword'\)/)
    for (const field of ['priority', 'depth', 'position', 'trigger', 'enabled']) {
      expect(workspaceSource).toContain('(EMPTY_BULK_FIELD_FORM.' + field + ')')
    }
  })

  test('applyBulk spreads the sparse patch instead of listing fields', () => {
    const applyBulkBody = workspaceSource.slice(
      workspaceSource.indexOf('const applyBulk = useCallback'),
      workspaceSource.indexOf('const createBook = useCallback'),
    )
    expect(applyBulkBody).toContain('buildBulkFieldPatch(bulkForm)')
    expect(applyBulkBody).toContain("await runBulk({ action: 'set_fields', entry_ids: selectedIds, ...patch })")
    // Not one field name is spelled out at the call site any more.
    for (const key of ['priority:', 'depth:', 'position:', 'trigger:', 'enabled:']) {
      expect(applyBulkBody).not.toContain(key)
    }
    // An all-untouched form never reaches the wire: the server 400s on it.
    expect(applyBulkBody).toContain('if (Object.keys(patch).length === 0) return')
  })

  test('every bulk control visibly starts in a leave-as-is state', () => {
    // Pos / Type / State selects each offer Unchanged; Pri / Depth show it as a
    // placeholder because an empty number input has nothing else to say.
    expect(entriesToolbarSource.match(/<option value="unchanged">Unchanged<\/option>/g)?.length).toBe(3)
    expect(entriesToolbarSource.match(/placeholder="Unchanged"/g)?.length).toBe(2)
  })

  test('Apply is disabled while the form would send nothing', () => {
    expect(entriesToolbarSource).toContain('disabled={selectedIds.length === 0 || !bulkHasMutation}')
    expect(workspaceSource).toContain('const bulkHasMutation = useMemo(() => hasBulkFieldMutation(bulkForm), [bulkForm])')
    expect(workspaceSource).toContain('bulkHasMutation={bulkHasMutation}')
  })

  test('the toolbar props admit the sentinel, so the select value is always real', () => {
    // A `value="unchanged"` with no matching option renders as an unselected
    // select and React warns - the widened types keep the two in step.
    expect(entriesToolbarSource).toContain('bulkPosition: BulkPositionSelection')
    expect(entriesToolbarSource).toContain('bulkTrigger: BulkTriggerSelection')
    expect(entriesToolbarSource).not.toMatch(/bulkTrigger: TriggerType$/m)
  })
})

describe('loadEntries selection precedence (BUG 2)', () => {
  const loadEntriesBody = workspaceSource.slice(
    workspaceSource.indexOf('const loadEntries = useCallback'),
    workspaceSource.indexOf('void loadBooks()'),
  )

  test('the opening entry id is a consume-once ref, not a standing override', () => {
    expect(workspaceSource)
      .toContain('const pendingInitialEntryId = useRef<string | null>(initialEntryId ?? null)')
    expect(loadEntriesBody).toContain('pendingInitialEntryId.current = null')
    // The unconditional override is gone.
    expect(workspaceSource).not.toMatch(/const requested = initialEntryId/)
    expect(loadEntriesBody).not.toContain('initialEntryId')
  })

  test('preserveSelection is reachable, and only after the pin has fired once', () => {
    const pinIndex = loadEntriesBody.indexOf('pendingInitialEntryId.current = null')
    const preserveIndex = loadEntriesBody.indexOf('if (preserveSelection && current')
    expect(pinIndex).toBeGreaterThan(-1)
    expect(preserveIndex).toBeGreaterThan(pinIndex)
    expect(loadEntriesBody).toMatch(/if \(pending && result\.data\.some/)
  })

  test('loadEntries no longer depends on initialEntryId, so its identity is stable', () => {
    expect(workspaceSource).not.toContain('}, [commitEntries, initialEntryId])')
    expect(loadEntriesBody).toContain('}, [commitEntries])')
  })

  test('a later re-open onto a different entry consumes the pin immediately', () => {
    // Otherwise the pin sits armed with no load to consume it and hijacks the
    // next unrelated Refresh.
    const syncEffect = workspaceSource.slice(
      workspaceSource.indexOf('const pendingInitialEntryId'),
      workspaceSource.indexOf('const commitEntries'),
    )
    expect(syncEffect).toContain('pendingInitialEntryId.current = next')
    expect(syncEffect).toContain('entriesRef.current.some((entry) => entry.id === next)')
    expect(syncEffect).toContain('setSelectedEntryId(next)')
    expect(syncEffect).toContain('}, [initialEntryId])')
  })

  test('Refresh and every bulk action go through the preserving path', () => {
    // `runBulk` ends in `loadEntries(selectedBookId)` (preserveSelection defaults
    // to true), and Refresh calls it the same way. Both used to snap back.
    expect(workspaceSource).toContain('await loadEntries(selectedBookId)')
    expect(workspaceSource).toContain('onClick={() => selectedBookId && void loadEntries(selectedBookId)}')
    // The book switch is the one caller that deliberately opts out.
    expect(workspaceSource).toContain('void loadEntries(selectedBookId, false)')
  })
})
