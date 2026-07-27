import { describe, expect, test } from 'bun:test'
import {
  getHomepageCardMetadata,
  getHomepageVisibleTags,
  getCharacterGridMetrics,
  isHomepageOwnershipLabel,
  resolveCharacterDisplaySettings,
} from '../frontend/src/lib/characterDisplaySettings'
import type { CharacterTabDisplaySettings, HomepageCharacterLibrarySettings } from '../frontend/src/types/store'

const homepage: HomepageCharacterLibrarySettings = {
  enabled: true,
  maxVisibleTags: 6,
  showNameBackground: false,
  panelWidth: 360,
  panelImageHeight: 320,
  panelPinned: true,
  lastSelectedCharacterId: null,
  thumbnailWidth: 170,
  thumbnailHeight: 226,
  density: 'compact',
  footerMode: 'balanced',
  visibleMetadata: ['creator', 'tags'],
  tagRows: 1,
  viewMode: 'grid',
  defaultSort: 'shuffle',
  defaultFilter: 'groups',
}

const tab: CharacterTabDisplaySettings = {
  useHomepageSettings: false,
  thumbnailWidth: 220,
  thumbnailHeight: 260,
  density: 'large',
  footerMode: 'spacious',
  visibleMetadata: ['tags'],
  tagRows: 2,
  viewMode: 'list',
  defaultSort: 'name',
  defaultFilter: 'characters',
}

describe('resolveCharacterDisplaySettings', () => {
  test('uses homepage settings when Character Tab sharing is enabled', () => {
    const resolved = resolveCharacterDisplaySettings({
      surface: 'characters-tab',
      homepageSettings: homepage,
      characterTabSettings: { ...tab, useHomepageSettings: true },
    })

    expect(resolved.display.thumbnailWidth).toBe(170)
    expect(resolved.display.viewMode).toBe('grid')
  })

  test('uses Character Tab overrides when sharing is disabled', () => {
    const resolved = resolveCharacterDisplaySettings({
      surface: 'characters-tab',
      homepageSettings: homepage,
      characterTabSettings: tab,
    })

    expect(resolved.display.thumbnailWidth).toBe(220)
    expect(resolved.display.viewMode).toBe('list')
  })

  test('normalizes group shuffle queries to recent sorting', () => {
    const resolved = resolveCharacterDisplaySettings({
      surface: 'homepage',
      homepageSettings: homepage,
      characterTabSettings: tab,
    })

    expect(resolved.query.filterTab).toBe('groups')
    expect(resolved.query.sortField).toBe('recent')
  })

  test('clamps card geometry to deterministic virtualized bounds', () => {
    const metrics = getCharacterGridMetrics({
      ...homepage,
      thumbnailWidth: 20,
      thumbnailHeight: 2000,
      tagRows: 99,
    })

    expect(metrics.cardMinWidth).toBe(96)
    expect(metrics.imageHeight).toBe(520)
    expect(metrics.rowHeight).toBeGreaterThan(metrics.imageHeight)
  })

  test('derives footer geometry from shared display preferences', () => {
    const compact = getCharacterGridMetrics({ ...homepage, footerMode: 'compact', density: 'compact' })
    const spacious = getCharacterGridMetrics({ ...homepage, footerMode: 'spacious', density: 'large' })

    expect(compact.footerHeight).toBe(52)
    expect(spacious.footerHeight).toBe(92)
    expect(spacious.gap).toBeGreaterThan(compact.gap)
  })

  test('removes homepage ownership labels from card metadata', () => {
    expect(isHomepageOwnershipLabel('  My   Characters ')).toBe(true)
    expect(getHomepageCardMetadata({
      creator: 'Mine',
      tags: ['Mystic', 'My Characters', 'mine', 'Strategist'],
    })).toEqual({
      creator: null,
      tags: ['Mystic', 'Strategist'],
    })
  })

  test('preserves genuine homepage creator and tag metadata', () => {
    expect(getHomepageCardMetadata({
      creator: 'Aster Vale',
      tags: ['Mystic', 'Shared'],
    })).toEqual({
      creator: 'Aster Vale',
      tags: ['Mystic', 'Shared'],
    })
  })

  test('caps visible homepage tags independently from the row limit', () => {
    expect(getHomepageVisibleTags(['one', 'two', 'three', 'four'], 3, 2)).toEqual({
      visibleTags: ['one', 'two', 'three'],
      hiddenTagCount: 1,
    })
    expect(getHomepageVisibleTags(['one', 'two'], 20, 0)).toEqual({
      visibleTags: [],
      hiddenTagCount: 2,
    })
  })
})
