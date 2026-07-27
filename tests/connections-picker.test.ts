import { describe, expect, test } from 'bun:test'
import {
  filterConnectionProfiles,
  getBalancedModelGridColumns,
  getConnectionProfileFavoriteModels,
  getConnectionProfileTagIds,
  getProviderTagsPickerHeight,
  normalizeConnectionProfileTags,
  parseConnectionsPickerVariantRects,
  resolveAnchoredConnectionsPickerRect,
  resolveConnectionsPickerRect,
  setConnectionProfileFavoriteModels,
  setConnectionProfileTagIds,
} from '../frontend/src/lib/connectionsPicker'
import { resizeSurfaceRect } from '../frontend/src/hooks/usePersistentRect'
import type { ConnectionProfile } from '../frontend/src/types/api'
import type { ConnectionProfileTag } from '../frontend/src/types/store'

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text()

const themeVariables = await read('../frontend/src/theme/variables.css')
const themeEngine = await read('../frontend/src/theme/engine.ts')
const pickerComponent = await read('../frontend/src/components/connections-picker/ConnectionsPicker.tsx')
const filePickerComponent = await read('../frontend/src/components/settings/ConnectionPicker.tsx')

const STYLESHEETS = {
  'ConnectionsPicker.module.css': await read(
    '../frontend/src/components/connections-picker/ConnectionsPicker.module.css',
  ),
  'ConnectionPicker.module.css': await read(
    '../frontend/src/components/settings/ConnectionPicker.module.css',
  ),
  'ConnectionManager.module.css': await read(
    '../frontend/src/components/panels/ConnectionManager.module.css',
  ),
  'ConnectionItem.module.css': await read(
    '../frontend/src/components/panels/connection-manager/ConnectionItem.module.css',
  ),
} as const

/** A token named inside a `/* … *\/` note is prose, not a read. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Every theme token name that actually exists, across BOTH namespaces.
 *
 * `variables.css` holds the static defaults; `engine.ts` emits a handful that
 * never landed there (`--lumiverse-primary-contrast`, `--lcs-glass-border-hover`).
 * Both count as real — a name in neither is a phantom.
 */
const definedTokens = new Set([
  ...[...themeVariables.matchAll(/(--(?:lumiverse|lcs)-[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]),
  ...[...themeEngine.matchAll(/vars\['(--(?:lumiverse|lcs)-[a-zA-Z0-9-]+)'\]\s*=/g)].map((m) => m[1]),
])

const profile = (id: string, metadata: Record<string, unknown> = {}): ConnectionProfile => ({
  id,
  name: id === 'a' ? 'Roleplay Primary' : 'Fast Draft',
  provider: id === 'a' ? 'openrouter' : 'moonshot',
  api_url: '',
  model: id === 'a' ? 'model-roleplay' : 'model-fast',
  preset_id: null,
  is_default: id === 'a',
  has_api_key: true,
  metadata,
  created_at: 0,
  updated_at: 0,
})

describe('connections picker helpers', () => {
  test('normalizes legacy metadata tags into catalog entries and tagIds', () => {
    const result = normalizeConnectionProfileTags([profile('a', { tags: ['Roleplay', 'Fast'] })], [])

    expect(result.profileTags.map((tag) => tag.name)).toEqual(['Roleplay', 'Fast'])
    expect(result.profiles[0].metadata.tags).toBeUndefined()
    expect(result.profiles[0].metadata.tagIds).toEqual(['legacy-roleplay', 'legacy-fast'])
  })

  test('drops unknown tag ids deterministically', () => {
    const tags: ConnectionProfileTag[] = [{ id: 'roleplay', name: 'Roleplay', color: '#8B5CF6', order: 0 }]
    const result = normalizeConnectionProfileTags([profile('a', { tagIds: ['roleplay', 'missing'] })], tags)

    expect(result.profiles[0].metadata.tagIds).toEqual(['roleplay'])
  })

  test('sets tag ids without clobbering unrelated metadata', () => {
    const next = setConnectionProfileTagIds(profile('a', { reasoningBindings: { x: true } }), ['roleplay', 'roleplay'])

    expect(next.metadata.reasoningBindings).toEqual({ x: true })
    expect(getConnectionProfileTagIds(next)).toEqual(['roleplay'])
  })

  test('stores favorite models per connection profile without clobbering metadata', () => {
    const next = setConnectionProfileFavoriteModels(
      profile('a', { tagIds: ['roleplay'], favoriteModels: ['old-model'] }),
      ['model-roleplay', 'model-roleplay'],
    )

    expect(next.metadata.tagIds).toEqual(['roleplay'])
    expect(getConnectionProfileFavoriteModels(next)).toEqual(['model-roleplay'])
  })

  test('searches profile name provider model and tag name', () => {
    const tags: ConnectionProfileTag[] = [{ id: 'roleplay', name: 'Roleplay', color: '#8B5CF6', order: 0 }]
    const profiles = [profile('a', { tagIds: ['roleplay'] }), profile('b')]

    expect(filterConnectionProfiles(profiles, tags, 'openrouter').map((p) => p.id)).toEqual(['a'])
    expect(filterConnectionProfiles(profiles, tags, 'model-fast').map((p) => p.id)).toEqual(['b'])
    expect(filterConnectionProfiles(profiles, tags, 'roleplay').map((p) => p.id)).toEqual(['a'])
    expect(filterConnectionProfiles(profiles, tags, '', 'roleplay').map((p) => p.id)).toEqual(['a'])
  })

  test('centers an uninitialized picker and preserves a saved position', () => {
    const bounds = { minWidth: 680, minHeight: 480, maxWidth: 1440, maxHeight: 900 }
    const rect = { x: 120, y: 90, width: 800, height: 600 }

    expect(resolveConnectionsPickerRect(rect, bounds, 1600, 1000, true)).toEqual({
      x: 400,
      y: 200,
      width: 800,
      height: 600,
    })
    expect(resolveConnectionsPickerRect(rect, bounds, 1600, 1000, false)).toEqual(rect)
  })

  test('clamps a remembered picker into the current viewport', () => {
    expect(resolveConnectionsPickerRect(
      { x: 1400, y: 900, width: 900, height: 700 },
      { minWidth: 680, minHeight: 480, maxWidth: 1440, maxHeight: 900 },
      1280,
      800,
      false,
    )).toEqual({
      x: 380,
      y: 100,
      width: 900,
      height: 700,
    })
  })

  test('restores a separate persisted rectangle for each picker variant', () => {
    const rects = parseConnectionsPickerVariantRects(JSON.stringify({
      'provider-tags': { x: 10, y: 20, width: 900, height: 300 },
      split: { x: 120, y: 80, width: 1100, height: 650 },
      full: { x: 40, y: 30, width: 1400, height: 800 },
    }))

    expect(rects.split).toEqual({ x: 120, y: 80, width: 1100, height: 650 })
    expect(rects.full).toEqual({ x: 40, y: 30, width: 1400, height: 800 })
    expect(rects['provider-tags']).toEqual({ x: 10, y: 20, width: 900, height: 300 })
  })

  test('ignores malformed persisted picker rectangles', () => {
    expect(parseConnectionsPickerVariantRects('{broken')).toEqual({})
    expect(parseConnectionsPickerVariantRects(JSON.stringify({
      split: { x: 10, y: 20, width: 'wide', height: 600 },
      full: { x: 30, y: 40, width: 1200, height: 700 },
      unknown: { x: 0, y: 0, width: 10, height: 10 },
    }))).toEqual({
      full: { x: 30, y: 40, width: 1200, height: 700 },
    })
  })

  test('anchors variant A flush above the chat input surface', () => {
    expect(resolveAnchoredConnectionsPickerRect(
      { x: 0, y: 0, width: 860, height: 300 },
      { minWidth: 360, minHeight: 220, maxHeight: 380 },
      1600,
      1000,
      { left: 100, top: 820, width: 1200 },
    )).toEqual({ x: 100, y: 520, width: 1200, height: 300 })
  })

  test('uses content height for variant A cards without constraining its model view', () => {
    expect(getProviderTagsPickerHeight(380, false, false)).toBe(308)
    expect(getProviderTagsPickerHeight(380, true, false)).toBe(354)
    expect(getProviderTagsPickerHeight(360, false, true)).toBe(360)
  })

  test('allows split and full pickers to expand to the viewport instead of a fixed desktop cap', () => {
    expect(resolveConnectionsPickerRect(
      { x: 0, y: 0, width: 2200, height: 1200 },
      { minWidth: 680, minHeight: 480 },
      2200,
      1200,
      false,
    )).toEqual({ x: 0, y: 0, width: 2200, height: 1200 })
  })

  test('keeps the opposite edge anchored when resizing to viewport limits', () => {
    const bounds = { minWidth: 680, minHeight: 480 }
    const rect = { x: 300, y: 200, width: 800, height: 500 }

    expect(resizeSurfaceRect(rect, 'e', 2000, 0, bounds)).toEqual({
      x: 300,
      y: 200,
      width: 1620,
      height: 500,
    })
    expect(resizeSurfaceRect(rect, 'nw', -2000, -2000, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1100,
      height: 700,
    })
  })

  test('balances model columns against pane width and height without oversized rows', () => {
    expect(getBalancedModelGridColumns(18, 1040, 320)).toBe(3)
    expect(getBalancedModelGridColumns(40, 1040, 700)).toBe(3)
    expect(getBalancedModelGridColumns(40, 420, 200)).toBe(2)
    expect(getBalancedModelGridColumns(0, 1040, 700)).toBe(1)
  })
})

describe('connections surfaces are wired to the theme token system', () => {
  /**
   * The phantom-token guard.
   *
   * `tests/quick-toolbar.test.ts:295-311` only collects BARE `var(--lumiverse-x)`
   * reads, which is precisely how eleven tokens that were defined nowhere survived
   * for so long: each call site wrote `var(--phantom, #literal)`, the lint walked
   * past, and the literal did all the painting while the theme engine could not
   * touch it. This matcher takes reads with OR without a fallback.
   */
  test.each(Object.entries(STYLESHEETS))('%s reads only tokens the theme defines', (_name, css) => {
    const reads = [...stripComments(css).matchAll(/var\(\s*(--(?:lumiverse|lcs)-[a-zA-Z0-9-]+)\s*[,)]/g)]
      .map((match) => match[1])

    expect([...new Set(reads)].filter((token) => !definedTokens.has(token))).toEqual([])
  })

  /**
   * `theme/engine.ts` recomputes every `--lumiverse-radius-*` from the user's
   * radius-scale setting, so a literal `border-radius: 9px` silently opts that
   * element out of the slider. Pills (`999px`), circles (`50%`) and the 3px
   * corner tick on the picker's resize grip are the only intentional literals.
   */
  test.each(Object.entries(STYLESHEETS))('%s takes its radii from the radius scale', (_name, css) => {
    const literals = [...stripComments(css).matchAll(/border-radius:\s*([^;]+);/g)]
      .map((match) => match[1].trim())
      .filter((value) => /\d+(px|rem|em|%)/.test(value.replace(/var\([^)]*\)/g, '')))
      .filter((value) => !/^999px$/.test(value) && !/^50%$/.test(value) && !/^0 0 3px$/.test(value))

    expect(literals).toEqual([])
  })

  /**
   * Font sizes ride `--lumiverse-font-scale` — there is no font-size token family,
   * so `calc(Npx * var(--lumiverse-font-scale, 1))` IS the contract. The picker
   * used to be the one connections surface with bare px sizes, so the user's
   * font-size setting moved every other panel and left it behind.
   */
  test.each(Object.entries(STYLESHEETS))('%s scales its font sizes with the theme', (_name, css) => {
    const sizes = [...stripComments(css).matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1])

    expect(sizes.filter((size) => !size.includes('--lumiverse-font-scale'))).toEqual([])
  })

  /**
   * `ComponentCssReference.tsx:13` hands the user `[data-component="<Name>"]` as
   * THE selector for a component override, and overrides are concatenated
   * globally and unscoped — hashed CSS-Module class names give them no
   * alternative. Without the attribute that selector matches nothing.
   */
  test('both pickers emit the data-component hook the Custom CSS UI advertises', () => {
    expect(pickerComponent).toContain('data-component="ConnectionsPicker"')
    expect(filePickerComponent).toContain('data-component="ConnectionPicker"')
  })

  /**
   * `connectionsPickerSettings` is a DATA_KEY (store/slices/settings.ts:133), so a
   * `setSetting` inside a pointermove handler re-rendered the picker and queued a
   * debounced server write on every frame of a column drag.
   */
  test('column resize commits to the store on release, not on every pointermove', () => {
    const move = pickerComponent.slice(
      pickerComponent.indexOf('const move = (moveEvent: PointerEvent)'),
      pickerComponent.indexOf('const stop = ()'),
    )

    expect(move).not.toContain('updateSettings')
    expect(move).toContain('style.setProperty')
  })
})
