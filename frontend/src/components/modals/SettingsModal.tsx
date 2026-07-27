import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { ChevronDown, ChevronUp, RefreshCw, GripVertical, Plus, Search, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { useScaledSortableStyle } from '@/lib/dndUiScale'
import { CloseButton } from '@/components/shared/CloseButton'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'
import { useTranslation } from 'react-i18next'
import { translateSettingsField } from '@/lib/i18n/resolveLabel'
import { Button } from '@/components/shared/FormComponents'
import NumericInput from '@/components/shared/NumericInput'
import { Toggle } from '@/components/shared/Toggle'
import { spinClass } from '@/components/shared/Spinner'
import { useStore } from '@/store'
import { spindleApi } from '@/api/spindle'
import { connectionsApi } from '@/api/connections'
import { embeddingsApi } from '@/api/embeddings'
import { imagesApi } from '@/api/images'
import { settingsApi } from '@/api/settings'
import { notificationSoundsApi } from '@/api/notification-sounds'
import { unlockNotificationAudio } from '@/lib/notificationAudio'
import { useTokenizerAvailability } from '@/hooks/useTokenCounts'
import { webSearchApi, type WebSearchSettingsInput, type WebSearchTestResponse } from '@/api/web-search'
import type {
  CharacterDisplaySettings,
  CharacterTabDisplaySettings,
  ConnectionsPickerSettings,
  DrawerSettings,
  GuidedGeneration,
  HomepageCharacterLibrarySettings,
  LorebookEditorSettings,
  LoreIndicatorSettings,
  PortraitDockSettings,
  QuickReplySet,
  QuickToolbarSettings,
} from '@/types/store'
import type { Character, EmbeddingConfig, ChatMemorySettings } from '@/types/api'
import type { WorldBookVectorPresetMode, WorldBookVectorSettings } from '@/types/world-book-vector-settings'
import AccountSettings from '@/components/settings/AccountSettings'
import UserManagement from '@/components/settings/UserManagement'
import MigrationSettings from '@/components/settings/MigrationSettings'
import TokenizerManager from '@/components/settings/TokenizerManager'
import Diagnostics from '@/components/settings/Diagnostics'
import NotificationSettings from '@/components/settings/NotificationSettings'
import MemoryCortexSettings from '@/components/settings/MemoryCortexSettings'
import OperatorPanel from '@/components/settings/OperatorPanel'
import VoiceSettings from '@/components/settings/VoiceSettings'
import McpServerSettings from '@/components/settings/mcp-servers/McpServerSettings'
import DataPortability from '@/components/settings/DataPortability'
import CollapsibleSection from '@/components/shared/CollapsibleSection'
import ModelCombobox from '@/components/panels/connection-manager/ModelCombobox'
import { getVisibleSettingsTabs } from '@/lib/settings-tab-registry'
import {
  DESIGN_DEFAULT_IDS,
  useQuickToolbarActions,
} from '@/components/quick-toolbar/useQuickToolbarActions'
import { ENTRY_METADATA_VERSION } from '@/lib/lorebookEntryColumns'
import {
  canMoveWithinFiltered,
  filterActionIds,
  moveWithinFiltered,
} from '@/lib/toolbarActionSearch'
import {
  DEFAULT_CHARACTER_TAB_DISPLAY_SETTINGS,
  DEFAULT_CONNECTIONS_PICKER_SETTINGS,
  DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS,
  DEFAULT_LOREBOOK_EDITOR_SETTINGS,
  DEFAULT_LORE_INDICATOR_SETTINGS,
  DEFAULT_PORTRAIT_DOCK_SETTINGS,
  DEFAULT_QUICK_TOOLBAR_SETTINGS,
} from '@/lib/uiProductivityDefaults'
import { getConnectionProfileTagIds } from '@/lib/connectionsPicker'
import { getCharacterAvatarLargeUrlById } from '@/lib/avatarUrls'
import { getHomepageCardMetadata, getHomepageVisibleTags } from '@/lib/characterDisplaySettings'
import styles from './SettingsModal.module.css'
import clsx from 'clsx'

interface SettingsModalProps {
  onClose: () => void
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { t: ts } = useTranslation('settings')
  const settingsActiveView = useStore((s) => s.settingsActiveView)
  const user = useStore((s) => s.user)
  const [activeView, setActiveView] = useState(settingsActiveView || 'display')

  const VIEWS = useMemo(() => getVisibleSettingsTabs(user?.role), [user?.role])

  useEffect(() => {
    if (!VIEWS.some((tab) => tab.id === activeView) && VIEWS.length > 0) {
      setActiveView(VIEWS[0].id)
    }
  }, [VIEWS, activeView])

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <motion.div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{ts('title')}</h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className={styles.body}>
          <nav className={styles.sidebar}>
            {VIEWS.map((tab) => {
              const Icon = tab.tabIcon
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={clsx(styles.navBtn, activeView === tab.id && styles.navBtnActive)}
                  onClick={() => setActiveView(tab.id)}
                >
                  <Icon size={14} />
                  <span>{translateSettingsField(tab.id, 'shortName', tab.shortName)}</span>
                </button>
              )
            })}
          </nav>

          <div className={styles.content}>
            <SettingsView view={activeView} />
            <div
              className={clsx(
                styles.extensionMountHost,
                activeView !== 'extensions' && styles.extensionMountHostHidden
              )}
            >
              <div className={styles.extensionMount} data-spindle-mount="settings_extensions" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  )
}

function SettingsView({ view }: { view: string }) {
  const { t } = useTranslation('shared')
  switch (view) {
    case 'account':
      return <AccountSettings />
    case 'display':
      return <DisplaySettings />
    case 'productivity':
      return <ProductivitySettings />
    case 'chat':
      return <ChatSettings />
    case 'extensions':
      return <ExtensionSettingsView />
    case 'guided':
      return <GuidedGenerationSettings />
    case 'quickReplies':
      return <QuickRepliesSettings />
    case 'extensionPools':
      return <ExtensionPoolSettings />
    case 'advanced':
      return <AdvancedSettings />
    case 'embeddings':
      return <EmbeddingsSettings />
    case 'webSearch':
      return <WebSearchSettings />
    case 'lumihub':
      return <LumiHubSettings />
    case 'tokenizers':
      return <TokenizerManager />
    case 'users':
      return <UserManagement />
    case 'memoryCortex':
      return <MemoryCortexSettings />
    case 'notifications':
      return <NotificationSettings />
    case 'voice':
      return <VoiceSettings />
    case 'mcpServers':
      return <McpServerSettings />
    case 'dataPortability':
      return <DataPortability />
    case 'diagnostics':
      return <Diagnostics />
    case 'migration':
      return <MigrationSettings />
    case 'operator':
      return <OperatorPanel />
    default:
      return <div className={styles.placeholder}>{t('selectCategory')}</div>
  }
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const CHARACTER_METADATA_OPTIONS = ['creator', 'tags', 'description', 'lorebooks', 'lastChat']
const LORE_METADATA_OPTIONS = ['book', 'type', 'tokens', 'trigger', 'score', 'position', 'depth', 'priority']
const LOREBOOK_ENTRY_METADATA_OPTIONS = ['type', 'priority', 'position', 'depth', 'order', 'keys', 'enabled', 'tokens']
const LORE_V4_ITEM_LABELS: Record<string, string> = {
  'active-count': 'Active-entry count',
  'token-estimate': 'Token estimate',
  passes: 'Recursion passes',
  constant: 'Constant count',
  keyword: 'Keyword count',
  vector: 'Vector count',
  'lorebook-names': 'Lorebook names',
  search: 'Search control',
  grouping: 'Grouping control',
}

function getCharacterDisplayDefaults(
  settings: CharacterDisplaySettings,
): CharacterDisplaySettings {
  return {
    thumbnailWidth: settings.thumbnailWidth,
    thumbnailHeight: settings.thumbnailHeight,
    density: settings.density,
    footerMode: settings.footerMode,
    visibleMetadata: settings.visibleMetadata,
    tagRows: settings.tagRows,
    viewMode: settings.viewMode,
    defaultSort: settings.defaultSort,
    defaultFilter: settings.defaultFilter,
  }
}

function ProductivitySettings() {
  const quickToolbarSettings = useStore((s) => s.quickToolbarSettings)
  const storedConnectionsPickerSettings = useStore((s) => s.connectionsPickerSettings)
  const connectionsPickerSettings = {
    ...DEFAULT_CONNECTIONS_PICKER_SETTINGS,
    ...storedConnectionsPickerSettings,
    columnWidths: {
      ...DEFAULT_CONNECTIONS_PICKER_SETTINGS.columnWidths,
      ...storedConnectionsPickerSettings.columnWidths,
    },
  }
  const loreIndicatorSettings = useStore((s) => s.loreIndicatorSettings)
  const homepageCharacterLibrarySettings = useStore((s) => s.homepageCharacterLibrarySettings)
  const characterTabDisplaySettings = useStore((s) => s.characterTabDisplaySettings)
  const portraitDockSettings = useStore((s) => s.portraitDockSettings)
  const lorebookEditorSettings = useStore((s) => s.lorebookEditorSettings)
  // `countForModel` returns `null` — not an error — when no tokenizer pattern
  // matches the model, so "count every entry" would silently deliver `length / 4`
  // estimates. Probe once and disable the option with a reason instead.
  const tokenizerAvailability = useTokenizerAvailability()
  const characters = useStore((s) => s.characters)
  const profiles = useStore((s) => s.profiles)
  const updateProfile = useStore((s) => s.updateProfile)
  const setSetting = useStore((s) => s.setSetting)

  const updateToolbar = (patch: Partial<QuickToolbarSettings>) => {
    setSetting('quickToolbarSettings', { ...quickToolbarSettings, ...patch })
  }
  const updatePicker = (patch: Partial<ConnectionsPickerSettings>) => {
    setSetting('connectionsPickerSettings', { ...connectionsPickerSettings, ...patch })
  }
  const updateLoreIndicator = (patch: Partial<LoreIndicatorSettings>) => {
    setSetting('loreIndicatorSettings', { ...loreIndicatorSettings, ...patch })
  }
  const updateHomepageLibrary = (patch: Partial<HomepageCharacterLibrarySettings>) => {
    setSetting('homepageCharacterLibrarySettings', { ...homepageCharacterLibrarySettings, ...patch })
  }
  const updateCharacterTab = (patch: Partial<CharacterTabDisplaySettings>) => {
    setSetting('characterTabDisplaySettings', { ...characterTabDisplaySettings, ...patch })
  }
  const updatePortraitDock = (patch: Partial<PortraitDockSettings>) => {
    setSetting('portraitDockSettings', { ...portraitDockSettings, ...patch })
  }
  const updateLorebookEditor = (patch: Partial<LorebookEditorSettings>) => {
    setSetting('lorebookEditorSettings', { ...lorebookEditorSettings, ...patch })
  }
  // The visible-icons list is driven by the toolbar's own action catalog rather
  // than a local id array, so anything enabled through the toolbar's customizer
  // (a command, a settings tab, an extension input action) shows its real label
  // here instead of a raw `command:foo` / `input-action:ext:bar` id — and the
  // checkbox / reorder semantics are literally the same functions the
  // customizer calls, so the two surfaces can no longer disagree.
  const {
    actionById: toolbarActionById,
    visibleIds: toolbarVisibleIds,
    orderedIds: toolbarOrderedIds,
    reorderActions: reorderToolbarIcons,
    toggleAction: toggleToolbarIcon,
  } = useQuickToolbarActions()
  /**
   * Rows to render: everything currently configured (in its configured order),
   * then the design defaults so a user who removed one can put it back. Ids the
   * catalog does not know are dropped — the toolbar cannot render them either.
   */
  const toolbarRowIds = useMemo(() => {
    const rows: string[] = []
    for (const id of [
      ...toolbarOrderedIds,
      ...quickToolbarSettings.iconOrder,
      ...quickToolbarSettings.visibleTabIds,
      ...DESIGN_DEFAULT_IDS,
    ]) {
      if (!rows.includes(id) && toolbarActionById.has(id)) rows.push(id)
    }
    return rows
  }, [toolbarActionById, toolbarOrderedIds, quickToolbarSettings.iconOrder, quickToolbarSettings.visibleTabIds])
  /**
   * Icon-list search. Component-local and never persisted — a key on
   * `QuickToolbarSettings` would round-trip to the server, be wiped by
   * `resetCurrentVariant`, and leave the list mysteriously filtered next open.
   * Every other filter box in the app (`bookSearch`, `entrySearch`,
   * `SearchableSelect`) is local `useState` for the same reason.
   */
  const [toolbarIconQuery, setToolbarIconQuery] = useState('')
  /** The rows actually rendered. Empty query returns `toolbarRowIds` itself. */
  const filteredToolbarRowIds = useMemo(
    () => filterActionIds(toolbarRowIds, toolbarActionById, toolbarIconQuery),
    [toolbarRowIds, toolbarActionById, toolbarIconQuery],
  )
  /**
   * The reorderable subset: enabled icons that survive the filter, in stored
   * order. This is what makes the chevrons honest under a search — see
   * `moveToolbarIconWithinFilter` below.
   */
  const filteredToolbarOrderedIds = useMemo(
    () => filterActionIds(toolbarOrderedIds, toolbarActionById, toolbarIconQuery),
    [toolbarOrderedIds, toolbarActionById, toolbarIconQuery],
  )
  /**
   * Filtering changes **what is rendered**, never **what is stored**. The write
   * still goes through the full `toolbarOrderedIds`, resolved by id.
   *
   * Deliberately not the hook's `moveAction`: that does a pairwise swap, so
   * under an active filter it moves the row past an icon the user cannot see —
   * the row appears not to move and the chevron looks dead.
   * `moveWithinFiltered` removes and reinserts at the nearest VISIBLE
   * neighbour's full-list index instead, so one click is always one visible
   * step. With an empty query the two are identical.
   */
  const moveToolbarIconWithinFilter = (id: string, direction: -1 | 1) => {
    const next = moveWithinFiltered(toolbarOrderedIds, filteredToolbarOrderedIds, id, direction)
    // `moveWithinFiltered` returns its input's identity when the move is
    // impossible, so this skips the settings write entirely.
    if (next === toolbarOrderedIds) return
    reorderToolbarIcons(next)
  }
  const updateTag = (id: string, patch: Partial<ConnectionsPickerSettings['profileTags'][number]>) => {
    updatePicker({
      profileTags: connectionsPickerSettings.profileTags.map((tag) => tag.id === id ? { ...tag, ...patch } : tag),
    })
  }
  const moveTag = (id: string, direction: -1 | 1) => {
    const tags = [...connectionsPickerSettings.profileTags].sort((a, b) => a.order - b.order)
    const index = tags.findIndex((tag) => tag.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= tags.length) return
    ;[tags[index], tags[target]] = [tags[target], tags[index]]
    updatePicker({ profileTags: tags.map((tag, order) => ({ ...tag, order })) })
  }
  const removeTag = (id: string) => {
    updatePicker({
      profileTags: connectionsPickerSettings.profileTags.filter((tag) => tag.id !== id),
      visibleTagIds: connectionsPickerSettings.visibleTagIds.filter((tagId) => tagId !== id),
    })
    profiles.forEach((profile) => {
      const tagIds = getConnectionProfileTagIds(profile)
      if (!tagIds.includes(id)) return
      const metadata = { ...profile.metadata, tagIds: tagIds.filter((tagId) => tagId !== id) }
      updateProfile(profile.id, { metadata })
      void connectionsApi.update(profile.id, { metadata })
    })
  }
  const addTag = () => {
    const id = createId('connection-tag')
    const profileTags = [
      ...connectionsPickerSettings.profileTags,
      { id, name: 'New tag', color: '#8B5CF6', order: connectionsPickerSettings.profileTags.length },
    ]
    updatePicker({ profileTags, visibleTagIds: [...connectionsPickerSettings.visibleTagIds, id] })
  }
  const resetPickerVariant = () => {
    updatePicker({
      rect: DEFAULT_CONNECTIONS_PICKER_SETTINGS.rect,
      positionInitialized: false,
      opacity: DEFAULT_CONNECTIONS_PICKER_SETTINGS.opacity,
      thumbnailSize: DEFAULT_CONNECTIONS_PICKER_SETTINGS.thumbnailSize,
      density: DEFAULT_CONNECTIONS_PICKER_SETTINGS.density,
      showFavorites: DEFAULT_CONNECTIONS_PICKER_SETTINGS.showFavorites,
      showRecent: DEFAULT_CONNECTIONS_PICKER_SETTINGS.showRecent,
      showSearch: DEFAULT_CONNECTIONS_PICKER_SETTINGS.showSearch,
      showModelMetadata: DEFAULT_CONNECTIONS_PICKER_SETTINGS.showModelMetadata,
      rowPadding: DEFAULT_CONNECTIONS_PICKER_SETTINGS.rowPadding,
      rowGap: DEFAULT_CONNECTIONS_PICKER_SETTINGS.rowGap,
      sectionSpacing: DEFAULT_CONNECTIONS_PICKER_SETTINGS.sectionSpacing,
      columnWidths: DEFAULT_CONNECTIONS_PICKER_SETTINGS.columnWidths,
    })
  }
  const moveLoreV4Item = (id: string, direction: -1 | 1) => {
    const items = [...loreIndicatorSettings.v4Items].sort((a, b) => a.order - b.order)
    const index = items.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return
    ;[items[index], items[target]] = [items[target], items[index]]
    updateLoreIndicator({ v4Items: items.map((item, order) => ({ ...item, order })) })
  }
  const updateLoreV4Item = (id: string, patch: Partial<LoreIndicatorSettings['v4Items'][number]>) => {
    updateLoreIndicator({
      v4Items: loreIndicatorSettings.v4Items.map((item) => item.id === id ? { ...item, ...patch } : item),
    })
  }
  const resetLoreVariant = () => {
    if (loreIndicatorSettings.variant === 'v2-compact') {
      updateLoreIndicator({
        v2ActivationMode: DEFAULT_LORE_INDICATOR_SETTINGS.v2ActivationMode,
        visibleMetadata: DEFAULT_LORE_INDICATOR_SETTINGS.visibleMetadata,
        iconSize: DEFAULT_LORE_INDICATOR_SETTINGS.iconSize,
        textSize: DEFAULT_LORE_INDICATOR_SETTINGS.textSize,
      })
    } else if (loreIndicatorSettings.variant === 'v4-bottom-strip') {
      updateLoreIndicator({
        v4Items: DEFAULT_LORE_INDICATOR_SETTINGS.v4Items,
        v4Spacing: DEFAULT_LORE_INDICATOR_SETTINGS.v4Spacing,
        v4GroupBy: DEFAULT_LORE_INDICATOR_SETTINGS.v4GroupBy,
        v4BookPreviewCount: DEFAULT_LORE_INDICATOR_SETTINGS.v4BookPreviewCount,
        iconSize: DEFAULT_LORE_INDICATOR_SETTINGS.iconSize,
        textSize: DEFAULT_LORE_INDICATOR_SETTINGS.textSize,
      })
    } else {
      updateLoreIndicator({
        v5Keybind: DEFAULT_LORE_INDICATOR_SETTINGS.v5Keybind,
        v5ShowShortcutHints: DEFAULT_LORE_INDICATOR_SETTINGS.v5ShowShortcutHints,
        visibleMetadata: DEFAULT_LORE_INDICATOR_SETTINGS.visibleMetadata,
      })
    }
  }
  const resetHomepageLayout = () => updateHomepageLibrary({
    ...getCharacterDisplayDefaults(DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS),
    maxVisibleTags: DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.maxVisibleTags,
    showNameBackground: DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.showNameBackground,
    panelWidth: DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.panelWidth,
    panelImageHeight: DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.panelImageHeight,
    panelPinned: DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.panelPinned,
    lastSelectedCharacterId: DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.lastSelectedCharacterId,
  })
  const resetCharacterTabLayout = () => updateCharacterTab({
    ...getCharacterDisplayDefaults(DEFAULT_CHARACTER_TAB_DISPLAY_SETTINGS),
  })
  const resetPortraitLayout = () => updatePortraitDock({
    rect: DEFAULT_PORTRAIT_DOCK_SETTINGS.rect,
    pinned: DEFAULT_PORTRAIT_DOCK_SETTINGS.pinned,
    aspectRatioLocked: DEFAULT_PORTRAIT_DOCK_SETTINGS.aspectRatioLocked,
    dockSide: DEFAULT_PORTRAIT_DOCK_SETTINGS.dockSide,
    open: DEFAULT_PORTRAIT_DOCK_SETTINGS.open,
    lastPortrait: DEFAULT_PORTRAIT_DOCK_SETTINGS.lastPortrait,
  })
  const resetLorebookLayout = () => updateLorebookEditor({
    halfEditorMode: DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEditorMode,
    halfRect: DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfRect,
    minChatWidth: DEFAULT_LOREBOOK_EDITOR_SETTINGS.minChatWidth,
    minEditorPaneWidth: DEFAULT_LOREBOOK_EDITOR_SETTINGS.minEditorPaneWidth,
    booksPaneWidth: DEFAULT_LOREBOOK_EDITOR_SETTINGS.booksPaneWidth,
    entriesPaneWidth: DEFAULT_LOREBOOK_EDITOR_SETTINGS.entriesPaneWidth,
    inspectorPaneWidth: DEFAULT_LOREBOOK_EDITOR_SETTINGS.inspectorPaneWidth,
    rowDensity: DEFAULT_LOREBOOK_EDITOR_SETTINGS.rowDensity,
    visibleEntryMetadata: DEFAULT_LOREBOOK_EDITOR_SETTINGS.visibleEntryMetadata,
    tokenCountMode: DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode,
    tokenCountDelayMs: DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs,
    tokenPrefetchHover: DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHover,
    tokenPrefetchHoverDelayMs: DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHoverDelayMs,
    tokenCountAllEntries: DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountAllEntries,
  })

  return (
    <div className={styles.settingsSection}>
      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Quick Toolbar</div>
            <div className={styles.settingsCardMeta}>Choose a confirmed variant and persist its layout.</div>
          </div>
          <Toggle.Switch checked={quickToolbarSettings.enabled} onChange={(enabled) => updateToolbar({ enabled })} />
        </div>
        <div className={styles.settingsCardBody}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Variant</label>
            <div className={styles.segmented}>
              {([
                ['v1-free', 'V1 Free'],
                ['v2-settings-adjacent', 'V2 Adjacent'],
              ] as const).map(([variant, label]) => (
                <button
                  key={variant}
                  type="button"
                  className={clsx(styles.segmentedBtn, quickToolbarSettings.variant === variant && styles.segmentedBtnActive)}
                  onClick={() => updateToolbar({ variant })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingsGridTwo}>
            <RangeSetting label="Icon size" min={16} max={36} value={quickToolbarSettings.variant === 'v2-settings-adjacent' ? quickToolbarSettings.v2IconSize : quickToolbarSettings.iconSize} onChange={(value) => updateToolbar(quickToolbarSettings.variant === 'v2-settings-adjacent' ? { v2IconSize: value } : { iconSize: value })} suffix="px" />
            <RangeSetting label="Label size" min={9} max={18} value={quickToolbarSettings.variant === 'v2-settings-adjacent' ? quickToolbarSettings.v2LabelTextSize : quickToolbarSettings.labelTextSize} onChange={(value) => updateToolbar(quickToolbarSettings.variant === 'v2-settings-adjacent' ? { v2LabelTextSize: value } : { labelTextSize: value })} suffix="px" />
            {/*
              V2 pins its scale multiplier to 1 on purpose (`QuickToolbar.tsx`)
              — the anchored strip lives in the chat dock and must not resize
              it. The slider is therefore shown disabled with the reason rather
              than hidden, because a user who already dragged it to 77% and saw
              nothing happen needs the explanation, not a vanished control.
            */}
            <RangeSetting
              label="Scale"
              min={60}
              max={160}
              value={Math.round(quickToolbarSettings.scale * 100)}
              onChange={(value) => updateToolbar({ scale: value / 100 })}
              suffix="%"
              disabled={quickToolbarSettings.variant === 'v2-settings-adjacent'}
              hint={quickToolbarSettings.variant === 'v2-settings-adjacent'
                ? 'V2 never scales — it is anchored in the chat dock. Use Icon size and Label size instead.'
                : undefined}
            />
            <RangeSetting label="Opacity" min={30} max={100} value={Math.round(quickToolbarSettings.opacity * 100)} onChange={(value) => updateToolbar({ opacity: value / 100 })} suffix="%" />
            {/* Rotation is `0` for anchored V2 in `QuickToolbar.tsx`, so it stays hidden there. */}
            {quickToolbarSettings.variant !== 'v2-settings-adjacent' && (
              <RangeSetting label="Rotation" min={-180} max={180} value={quickToolbarSettings.rotationDeg} onChange={(rotationDeg) => updateToolbar({ rotationDeg })} suffix="°" />
            )}
          </div>
          {quickToolbarSettings.variant === 'v2-settings-adjacent' && (
            <SegmentedSetting
              label="Card density"
              value={quickToolbarSettings.v2Density ?? DEFAULT_QUICK_TOOLBAR_SETTINGS.v2Density}
              options={([
                ['comfortable', 'Comfortable'],
                ['compact', 'Compact'],
              ] as const)}
              onChange={(value) => updateToolbar({ v2Density: value as QuickToolbarSettings['v2Density'] })}
            />
          )}
          <div className={styles.settingsGridCompact}>
            <Toggle.Checkbox
              checked={quickToolbarSettings.variant === 'v2-settings-adjacent'
                ? quickToolbarSettings.v2LabelVisible !== false
                : quickToolbarSettings.labelVisible}
              onChange={(visible) => updateToolbar(quickToolbarSettings.variant === 'v2-settings-adjacent'
                ? { v2LabelVisible: visible }
                : { labelVisible: visible })}
              label="Show labels"
            />
            {quickToolbarSettings.variant !== 'v2-settings-adjacent' && (
              <>
                <Toggle.Checkbox checked={quickToolbarSettings.snapToEdge} onChange={(snapToEdge) => updateToolbar({ snapToEdge })} label="Snap to edge" />
                <Toggle.Checkbox
                  checked={quickToolbarSettings.resizeHandlesEnabled !== false}
                  onChange={(resizeHandlesEnabled) => updateToolbar({ resizeHandlesEnabled })}
                  label="Show resize handles"
                />
                <Toggle.Checkbox checked={quickToolbarSettings.orientation === 'vertical'} onChange={(vertical) => updateToolbar({ orientation: vertical ? 'vertical' : 'horizontal' })} label="Vertical orientation" />
                {/*
                  Only the free toolbar hides under a full-screen dialog — V2 is
                  in flow in the chat dock and stays put — so the restore tab is
                  meaningless for V2 and is not offered there.
                */}
                <Toggle.Checkbox
                  checked={quickToolbarSettings.modalRestoreHandle === true}
                  onChange={(modalRestoreHandle) => updateToolbar({ modalRestoreHandle })}
                  label="Restore tab over full-screen dialogs"
                  hint="The quick toolbar hides itself while a full-screen editor or dialog is open. Turn this on to leave a small tab at the screen edge that brings it back without closing the dialog."
                />
              </>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Visible icons and order</label>
            <label className={styles.searchField}>
              <Search size={14} />
              <input
                value={toolbarIconQuery}
                onChange={(e) => setToolbarIconQuery(e.target.value)}
                placeholder="Search icons..."
              />
            </label>
            <div className={styles.productivityList}>
              {filteredToolbarRowIds.map((id) => {
                const action = toolbarActionById.get(id)
                if (!action) return null
                return (
                  <div key={id} className={styles.productivityRow}>
                    <input
                      type="checkbox"
                      checked={toolbarVisibleIds.includes(id)}
                      onChange={() => toggleToolbarIcon(id)}
                      aria-label={action.label}
                    />
                    <span>{action.label}</span>
                    {/*
                      Reordering only applies to enabled icons, and only among
                      the rows the search leaves visible — a disabled row is
                      absent from `toolbarOrderedIds`, so both chevrons resolve
                      to "cannot move" exactly as the old index test did.
                    */}
                    <button type="button" disabled={!canMoveWithinFiltered(toolbarOrderedIds, filteredToolbarOrderedIds, id, -1)} onClick={() => moveToolbarIconWithinFilter(id, -1)} aria-label={`Move ${action.label} up`}><ChevronUp size={14} /></button>
                    <button type="button" disabled={!canMoveWithinFiltered(toolbarOrderedIds, filteredToolbarOrderedIds, id, 1)} onClick={() => moveToolbarIconWithinFilter(id, 1)} aria-label={`Move ${action.label} down`}><ChevronDown size={14} /></button>
                  </div>
                )
              })}
              {filteredToolbarRowIds.length === 0 && (
                <div className={styles.settingsCardMeta}>No icons match “{toolbarIconQuery.trim()}”.</div>
              )}
            </div>
          </div>
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={() => updateToolbar(DEFAULT_QUICK_TOOLBAR_SETTINGS)}>Reset all toolbar settings</Button>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Connections Picker</div>
            <div className={styles.settingsCardMeta}>Configure launcher, layouts, model metadata, and profile tags.</div>
          </div>
          <Toggle.Switch checked={connectionsPickerSettings.enabled} onChange={(enabled) => updatePicker({ enabled })} />
        </div>
        <div className={styles.settingsCardBody}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Variant</label>
            <div className={styles.segmented}>
              {([
                ['provider-tags', 'A Tags'],
                ['split', 'B Split'],
                ['full', 'C Full'],
              ] as const).map(([variant, label]) => (
                <button
                  key={variant}
                  type="button"
                  className={clsx(styles.segmentedBtn, connectionsPickerSettings.variant === variant && styles.segmentedBtnActive)}
                  onClick={() => updatePicker({ variant })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingsGridTwo}>
            <RangeSetting label="Menu width" min={360} max={1600} value={connectionsPickerSettings.rect.width} onChange={(width) => updatePicker({ rect: { ...connectionsPickerSettings.rect, width } })} suffix="px" />
            <RangeSetting label="Menu height" min={220} max={940} value={connectionsPickerSettings.rect.height} onChange={(height) => updatePicker({ rect: { ...connectionsPickerSettings.rect, height } })} suffix="px" />
            <RangeSetting label="Menu X" min={0} max={1600} value={connectionsPickerSettings.rect.x} onChange={(x) => updatePicker({ rect: { ...connectionsPickerSettings.rect, x }, positionInitialized: true })} suffix="px" />
            <RangeSetting label="Menu Y" min={0} max={1000} value={connectionsPickerSettings.rect.y} onChange={(y) => updatePicker({ rect: { ...connectionsPickerSettings.rect, y }, positionInitialized: true })} suffix="px" />
            <RangeSetting label="Menu opacity" min={30} max={100} value={Math.round(connectionsPickerSettings.opacity * 100)} onChange={(opacity) => updatePicker({ opacity: opacity / 100 })} suffix="%" />
            <RangeSetting label="Launcher icon" min={14} max={32} value={connectionsPickerSettings.launcherIconSize} onChange={(launcherIconSize) => updatePicker({ launcherIconSize })} suffix="px" />
            <RangeSetting label="Thumbnail size" min={20} max={56} value={connectionsPickerSettings.thumbnailSize} onChange={(thumbnailSize) => updatePicker({ thumbnailSize })} suffix="px" />
            <RangeSetting label="Section spacing" min={4} max={28} value={connectionsPickerSettings.sectionSpacing} onChange={(sectionSpacing) => updatePicker({ sectionSpacing })} suffix="px" />
            <RangeSetting label="Profile column" min={140} max={420} value={connectionsPickerSettings.columnWidths.profiles ?? 180} onChange={(profiles) => updatePicker({ columnWidths: { ...connectionsPickerSettings.columnWidths, profiles } })} suffix="px" />
            <RangeSetting label="Model column" min={180} max={520} value={connectionsPickerSettings.columnWidths.models ?? 220} onChange={(models) => updatePicker({ columnWidths: { ...connectionsPickerSettings.columnWidths, models } })} suffix="px" />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Density</label>
            <div className={styles.segmented}>
              {(['compact', 'balanced', 'spacious', 'custom'] as const).map((density) => (
                <button key={density} type="button" className={clsx(styles.segmentedBtn, connectionsPickerSettings.density === density && styles.segmentedBtnActive)} onClick={() => updatePicker({ density })}>
                  {density}
                </button>
              ))}
            </div>
          </div>
          {connectionsPickerSettings.density === 'custom' && (
            <div className={styles.settingsGridTwo}>
              <RangeSetting label="Row padding" min={4} max={20} value={connectionsPickerSettings.rowPadding} onChange={(rowPadding) => updatePicker({ rowPadding })} suffix="px" />
              <RangeSetting label="Row gap" min={2} max={20} value={connectionsPickerSettings.rowGap} onChange={(rowGap) => updatePicker({ rowGap })} suffix="px" />
            </div>
          )}
          <div className={styles.settingsGridCompact}>
            <Toggle.Checkbox checked={connectionsPickerSettings.launcherEnabled} onChange={(launcherEnabled) => updatePicker({ launcherEnabled })} label="Show chat launcher" />
            <Toggle.Checkbox checked={connectionsPickerSettings.showFavorites} onChange={(showFavorites) => updatePicker({ showFavorites })} label="Show favorites" />
            <Toggle.Checkbox checked={connectionsPickerSettings.showRecent} onChange={(showRecent) => updatePicker({ showRecent })} label="Show recent" />
            <Toggle.Checkbox checked={connectionsPickerSettings.showSearch} onChange={(showSearch) => updatePicker({ showSearch })} label="Show search" />
            <Toggle.Checkbox checked={connectionsPickerSettings.showModelMetadata} onChange={(showModelMetadata) => updatePicker({ showModelMetadata })} label="Show model metadata" />
          </div>
          <div className={styles.inlineHeader}>
            <div>
              <div className={styles.fieldLabel}>Provider/profile tags</div>
              <div className={styles.helperText}>Profiles can have multiple tags. Assign them in each connection form.</div>
            </div>
            <Button variant="secondary" size="sm" onClick={addTag}><Plus size={14} /> Add tag</Button>
          </div>
          <div className={styles.productivityList}>
            {[...connectionsPickerSettings.profileTags].sort((a, b) => a.order - b.order).map((tag, index, tags) => {
              const visible = connectionsPickerSettings.visibleTagIds.length === 0 || connectionsPickerSettings.visibleTagIds.includes(tag.id)
              return (
                <div key={tag.id} className={styles.tagEditorRow}>
                  <input type="checkbox" checked={visible} onChange={(event) => updatePicker({
                    visibleTagIds: event.target.checked
                      ? [...connectionsPickerSettings.visibleTagIds, tag.id]
                      : (connectionsPickerSettings.visibleTagIds.length === 0
                        ? connectionsPickerSettings.profileTags.map((item) => item.id).filter((id) => id !== tag.id)
                        : connectionsPickerSettings.visibleTagIds.filter((id) => id !== tag.id)),
                  })} />
                  <input type="color" value={tag.color} onChange={(event) => updateTag(tag.id, { color: event.target.value })} aria-label={`${tag.name} color`} />
                  <input className={styles.productivityTextInput} value={tag.name} onChange={(event) => updateTag(tag.id, { name: event.target.value })} />
                  <button type="button" disabled={index === 0} onClick={() => moveTag(tag.id, -1)}><ChevronUp size={14} /></button>
                  <button type="button" disabled={index === tags.length - 1} onClick={() => moveTag(tag.id, 1)}><ChevronDown size={14} /></button>
                  <button type="button" onClick={() => removeTag(tag.id)} aria-label={`Delete ${tag.name}`}><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={resetPickerVariant}>Reset current picker layout</Button>
            <Button variant="secondary" size="sm" onClick={() => updatePicker(DEFAULT_CONNECTIONS_PICKER_SETTINGS)}>Reset all picker settings</Button>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Lore Indicator</div>
            <div className={styles.settingsCardMeta}>Configure compact, bottom-strip, and command-palette lore activity views.</div>
          </div>
          <Toggle.Switch checked={loreIndicatorSettings.enabled} onChange={(enabled) => updateLoreIndicator({ enabled })} />
        </div>
        <div className={styles.settingsCardBody}>
          <SegmentedSetting
            label="Variant"
            value={loreIndicatorSettings.variant}
            options={[
              ['v2-compact', 'V2 Compact'],
              ['v4-bottom-strip', 'V4 Strip'],
              ['v5-command-palette', 'V5 Palette'],
            ]}
            onChange={(variant) => updateLoreIndicator({ variant: variant as LoreIndicatorSettings['variant'] })}
          />
          {loreIndicatorSettings.variant === 'v2-compact' && (
            <>
              <SegmentedSetting
                label="Activation"
                value={loreIndicatorSettings.v2ActivationMode}
                options={[['hover', 'Hover'], ['click', 'Click']]}
                onChange={(v2ActivationMode) => updateLoreIndicator({ v2ActivationMode: v2ActivationMode as 'hover' | 'click' })}
              />
              <SegmentedSetting
                label="Book labels"
                value={loreIndicatorSettings.v2BookDisplay}
                options={[['grouped', 'Grouped'], ['first-only', 'First only'], ['markers', 'Markers']]}
                onChange={(v2BookDisplay) => updateLoreIndicator({
                  v2BookDisplay: v2BookDisplay as LoreIndicatorSettings['v2BookDisplay'],
                })}
              />
            </>
          )}
          {loreIndicatorSettings.variant === 'v4-bottom-strip' && (
            <SegmentedSetting
              label="Group entries by"
              value={loreIndicatorSettings.v4GroupBy ?? DEFAULT_LORE_INDICATOR_SETTINGS.v4GroupBy}
              options={[['lorebook', 'Lorebook'], ['type', 'Activation type'], ['none', 'No grouping']]}
              onChange={(v4GroupBy) => updateLoreIndicator({ v4GroupBy: v4GroupBy as LoreIndicatorSettings['v4GroupBy'] })}
            />
          )}
          {loreIndicatorSettings.variant === 'v5-command-palette' && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Keyboard shortcut</label>
                <div className={styles.inlineInputRow}>
                  <input className={styles.productivityTextInput} value={loreIndicatorSettings.v5Keybind} onChange={(event) => updateLoreIndicator({ v5Keybind: event.target.value })} placeholder="No shortcut" />
                  <Button variant="secondary" size="sm" onClick={() => updateLoreIndicator({ v5Keybind: '' })}>Clear</Button>
                </div>
              </div>
              <div className={styles.settingsGridCompact}>
                <Toggle.Checkbox
                  checked={loreIndicatorSettings.v5ShowShortcutHints !== false}
                  onChange={(v5ShowShortcutHints) => updateLoreIndicator({ v5ShowShortcutHints })}
                  label="Show keyboard hints"
                />
              </div>
            </>
          )}
          <div className={styles.settingsGridTwo}>
            <RangeSetting label="Icon size" min={12} max={32} value={loreIndicatorSettings.iconSize} onChange={(iconSize) => updateLoreIndicator({ iconSize })} suffix="px" />
            <RangeSetting label="Text size" min={9} max={20} value={loreIndicatorSettings.textSize} onChange={(textSize) => updateLoreIndicator({ textSize })} suffix="px" />
            {loreIndicatorSettings.variant === 'v4-bottom-strip' && (
              <>
                <RangeSetting label="Item spacing" min={0} max={28} value={loreIndicatorSettings.v4Spacing} onChange={(v4Spacing) => updateLoreIndicator({ v4Spacing })} suffix="px" />
                <RangeSetting
                  label="Entries per group"
                  min={1}
                  max={25}
                  value={loreIndicatorSettings.v4BookPreviewCount ?? DEFAULT_LORE_INDICATOR_SETTINGS.v4BookPreviewCount}
                  onChange={(v4BookPreviewCount) => updateLoreIndicator({ v4BookPreviewCount })}
                />
              </>
            )}
          </div>
          <MetadataChecklist label="Visible metadata" options={LORE_METADATA_OPTIONS} value={loreIndicatorSettings.visibleMetadata} onChange={(visibleMetadata) => updateLoreIndicator({ visibleMetadata })} />
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Entry-type appearance</label>
            <div className={styles.productivityList}>
              {(['constant', 'keyword', 'vector'] as const).map((type) => (
                <div key={type} className={styles.appearanceRow}>
                  <strong>{type}</strong>
                  <input type="color" value={loreIndicatorSettings.entryTypeAppearance[type].color} onChange={(event) => updateLoreIndicator({
                    entryTypeAppearance: {
                      ...loreIndicatorSettings.entryTypeAppearance,
                      [type]: { ...loreIndicatorSettings.entryTypeAppearance[type], color: event.target.value },
                    },
                  })} aria-label={`${type} color`} />
                  <input className={styles.productivityTextInput} value={loreIndicatorSettings.entryTypeAppearance[type].icon} onChange={(event) => updateLoreIndicator({
                    entryTypeAppearance: {
                      ...loreIndicatorSettings.entryTypeAppearance,
                      [type]: { ...loreIndicatorSettings.entryTypeAppearance[type], icon: event.target.value },
                    },
                  })} aria-label={`${type} icon name`} />
                </div>
              ))}
            </div>
          </div>
          {loreIndicatorSettings.variant === 'v4-bottom-strip' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Bottom-strip items</label>
              <div className={styles.productivityList}>
                {[...loreIndicatorSettings.v4Items].sort((a, b) => a.order - b.order).map((item, index, items) => (
                  <div key={item.id} className={clsx(styles.loreStripRow, item.removed && styles.productivityRowMuted)}>
                    <input type="checkbox" checked={item.visible && !item.removed} disabled={item.removed} onChange={(event) => updateLoreV4Item(item.id, { visible: event.target.checked })} />
                    <span>{LORE_V4_ITEM_LABELS[item.id] ?? item.id}</span>
                    <select className={styles.select} value={item.mode} disabled={item.removed} onChange={(event) => updateLoreV4Item(item.id, { mode: event.target.value as 'icon' | 'iconText' })}>
                      <option value="icon">Icon only</option>
                      <option value="iconText">Icon + text</option>
                    </select>
                    <button type="button" disabled={index === 0} onClick={() => moveLoreV4Item(item.id, -1)}><ChevronUp size={14} /></button>
                    <button type="button" disabled={index === items.length - 1} onClick={() => moveLoreV4Item(item.id, 1)}><ChevronDown size={14} /></button>
                    <button type="button" onClick={() => updateLoreV4Item(item.id, { removed: !item.removed, visible: item.removed ? true : item.visible })}>
                      {item.removed ? <Plus size={14} /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={resetLoreVariant}>Reset current variant</Button>
            <Button variant="secondary" size="sm" onClick={() => updateLoreIndicator(DEFAULT_LORE_INDICATOR_SETTINGS)}>Reset all Lore Indicator settings</Button>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Homepage Character Library</div>
            <div className={styles.settingsCardMeta}>Control homepage cards, filters, view defaults, and selected-character panel.</div>
          </div>
          <Toggle.Switch checked={homepageCharacterLibrarySettings.enabled} onChange={(enabled) => updateHomepageLibrary({ enabled })} />
        </div>
        <div className={styles.settingsCardBody}>
          <HomepageCharacterLibraryPreview
            settings={homepageCharacterLibrarySettings}
            character={characters.find((character) => character.id === homepageCharacterLibrarySettings.lastSelectedCharacterId) ?? characters[0]}
          />
          <CharacterDisplayControls
            settings={homepageCharacterLibrarySettings}
            onChange={updateHomepageLibrary}
            compactFooterLabel="Compact glass"
          />
          <div className={styles.settingsGridTwo}>
            <RangeSetting label="Maximum visible tags" min={1} max={20} value={homepageCharacterLibrarySettings.maxVisibleTags ?? DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.maxVisibleTags} onChange={(maxVisibleTags) => updateHomepageLibrary({ maxVisibleTags })} />
            <RangeSetting label="Preview panel width" min={360} max={720} value={homepageCharacterLibrarySettings.panelWidth} onChange={(panelWidth) => updateHomepageLibrary({ panelWidth })} suffix="px" />
            <RangeSetting label="Preview image height" min={180} max={560} value={homepageCharacterLibrarySettings.panelImageHeight ?? DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.panelImageHeight} onChange={(panelImageHeight) => updateHomepageLibrary({ panelImageHeight })} suffix="px" />
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Last selected character</label>
              <select className={styles.select} value={homepageCharacterLibrarySettings.lastSelectedCharacterId ?? ''} onChange={(event) => updateHomepageLibrary({ lastSelectedCharacterId: event.target.value || null })}>
                <option value="">None</option>
                {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
            </div>
          </div>
          <Toggle.Checkbox checked={homepageCharacterLibrarySettings.showNameBackground ?? false} onChange={(showNameBackground) => updateHomepageLibrary({ showNameBackground })} label="Show card-name background" hint="Adds a dark backing behind names in compact glass mode." />
          <Toggle.Checkbox checked={homepageCharacterLibrarySettings.panelPinned} onChange={(panelPinned) => updateHomepageLibrary({ panelPinned })} label="Pin selected-character panel" />
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={resetHomepageLayout}>Reset homepage layout</Button>
            <Button variant="secondary" size="sm" onClick={() => updateHomepageLibrary(DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS)}>Reset all homepage library settings</Button>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Character Tab Display</div>
            <div className={styles.settingsCardMeta}>Share homepage card preferences or keep independent drawer-tab overrides.</div>
          </div>
          <Toggle.Switch checked={characterTabDisplaySettings.useHomepageSettings} onChange={(useHomepageSettings) => updateCharacterTab({ useHomepageSettings })} />
        </div>
        <div className={styles.settingsCardBody}>
          <Toggle.Checkbox checked={characterTabDisplaySettings.useHomepageSettings} onChange={(useHomepageSettings) => updateCharacterTab({ useHomepageSettings })} label="Use homepage character display settings" />
          <div className={clsx(characterTabDisplaySettings.useHomepageSettings && styles.disabledSettingsGroup)}>
            <CharacterDisplayControls settings={characterTabDisplaySettings} onChange={updateCharacterTab} disabled={characterTabDisplaySettings.useHomepageSettings} />
          </div>
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={resetCharacterTabLayout}>Reset Character Tab layout</Button>
            <Button variant="secondary" size="sm" onClick={() => updateCharacterTab(DEFAULT_CHARACTER_TAB_DISPLAY_SETTINGS)}>Reset all Character Tab settings</Button>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Portrait Dock</div>
            <div className={styles.settingsCardMeta}>Configure opening behavior, persistent layout, dock state, and hover controls.</div>
          </div>
          <Toggle.Switch checked={portraitDockSettings.enabled} onChange={(enabled) => updatePortraitDock({ enabled })} />
        </div>
        <div className={styles.settingsCardBody}>
          <div className={styles.settingsGridCompact}>
            <Toggle.Checkbox checked={portraitDockSettings.openAtOriginalSize} onChange={(openAtOriginalSize) => updatePortraitDock({ openAtOriginalSize })} label="Open at original size" />
            <Toggle.Checkbox checked={portraitDockSettings.rememberSizePosition} onChange={(rememberSizePosition) => updatePortraitDock({ rememberSizePosition })} label="Remember size and position" />
            <Toggle.Checkbox checked={portraitDockSettings.snapToEdge} onChange={(snapToEdge) => updatePortraitDock({ snapToEdge })} label="Snap to edge" />
            <Toggle.Checkbox checked={portraitDockSettings.hoverControls} onChange={(hoverControls) => updatePortraitDock({ hoverControls })} label="Show hover controls" />
            <Toggle.Checkbox checked={portraitDockSettings.defaultAspectRatioLock} onChange={(defaultAspectRatioLock) => updatePortraitDock({ defaultAspectRatioLock })} label="Default aspect-ratio lock" />
            <Toggle.Checkbox checked={portraitDockSettings.pinned} onChange={(pinned) => updatePortraitDock({ pinned })} label="Pinned" />
            <Toggle.Checkbox checked={portraitDockSettings.aspectRatioLocked} onChange={(aspectRatioLocked) => updatePortraitDock({ aspectRatioLocked })} label="Current aspect ratio locked" />
            <Toggle.Checkbox checked={portraitDockSettings.open} onChange={(open) => updatePortraitDock({ open })} label="Portrait currently open" />
          </div>
          <SegmentedSetting label="Default dock side" value={portraitDockSettings.defaultDockSide} options={[['left', 'Left'], ['right', 'Right']]} onChange={(defaultDockSide) => updatePortraitDock({ defaultDockSide: defaultDockSide as 'left' | 'right' })} />
          <SegmentedSetting label="Current dock side" value={portraitDockSettings.dockSide} options={[['left', 'Left'], ['right', 'Right'], ['floating', 'Floating']]} onChange={(dockSide) => updatePortraitDock({ dockSide: dockSide as PortraitDockSettings['dockSide'] })} />
          <div className={styles.settingsGridTwo}>
            <RangeSetting label="Hover-control size" min={18} max={48} value={portraitDockSettings.hoverControlSize} onChange={(hoverControlSize) => updatePortraitDock({ hoverControlSize })} suffix="px" />
            <RangeSetting label="Minimum width" min={120} max={720} value={portraitDockSettings.minWidth} onChange={(minWidth) => updatePortraitDock({ minWidth })} suffix="px" />
            <RangeSetting label="Minimum height" min={120} max={860} value={portraitDockSettings.minHeight} onChange={(minHeight) => updatePortraitDock({ minHeight })} suffix="px" />
            <RangeSetting label="Maximum width" min={240} max={1440} value={portraitDockSettings.maxWidth} onChange={(maxWidth) => updatePortraitDock({ maxWidth })} suffix="px" />
            <RangeSetting label="Maximum height" min={240} max={1200} value={portraitDockSettings.maxHeight} onChange={(maxHeight) => updatePortraitDock({ maxHeight })} suffix="px" />
            <RangeSetting label="Current width" min={120} max={1440} value={portraitDockSettings.rect.width} onChange={(width) => updatePortraitDock({ rect: { ...portraitDockSettings.rect, width } })} suffix="px" />
            <RangeSetting label="Current height" min={120} max={1200} value={portraitDockSettings.rect.height} onChange={(height) => updatePortraitDock({ rect: { ...portraitDockSettings.rect, height } })} suffix="px" />
            <RangeSetting label="Current X" min={0} max={1600} value={portraitDockSettings.rect.x} onChange={(x) => updatePortraitDock({ rect: { ...portraitDockSettings.rect, x } })} suffix="px" />
            <RangeSetting label="Current Y" min={0} max={1000} value={portraitDockSettings.rect.y} onChange={(y) => updatePortraitDock({ rect: { ...portraitDockSettings.rect, y } })} suffix="px" />
          </div>
          <div className={styles.runtimeStateRow}>
            <div>
              <div className={styles.fieldLabel}>Last portrait</div>
              <div className={styles.helperText}>{portraitDockSettings.lastPortrait ? portraitDockSettings.lastPortrait.displayName : 'No saved portrait'}</div>
            </div>
            <Button variant="secondary" size="sm" disabled={!portraitDockSettings.lastPortrait} onClick={() => updatePortraitDock({ lastPortrait: null })}>Clear saved portrait</Button>
          </div>
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={resetPortraitLayout}>Reset current portrait layout</Button>
            <Button variant="secondary" size="sm" onClick={() => updatePortraitDock(DEFAULT_PORTRAIT_DOCK_SETTINGS)}>Reset all Portrait Dock settings</Button>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.settingsCardTitle}>Lorebook Editor</div>
            <div className={styles.settingsCardMeta}>Configure full-page and half-screen launch behavior, pane sizes, and entry density.</div>
          </div>
        </div>
        <div className={styles.settingsCardBody}>
          <SegmentedSetting label="Default editor" value={lorebookEditorSettings.defaultVariant} options={[['full', 'A Full page'], ['half', 'B Half screen']]} onChange={(defaultVariant) => updateLorebookEditor({ defaultVariant: defaultVariant as 'full' | 'half' })} />
          <SegmentedSetting label="Trigger display" value={lorebookEditorSettings.triggerDisplay} options={[['words', 'Words'], ['icons', 'Icons']]} onChange={(triggerDisplay) => updateLorebookEditor({ triggerDisplay: triggerDisplay as 'words' | 'icons' })} />
          <div className={styles.settingsGridCompact}>
            <Toggle.Checkbox checked={lorebookEditorSettings.halfButtonEnabled} onChange={(halfButtonEnabled) => updateLorebookEditor({ halfButtonEnabled })} label="Show half-screen editor button" />
            <Toggle.Checkbox checked={lorebookEditorSettings.loreIndicatorActionEnabled} onChange={(loreIndicatorActionEnabled) => updateLorebookEditor({ loreIndicatorActionEnabled })} label="Show Lore Indicator editor action" />
            <Toggle.Checkbox checked={lorebookEditorSettings.allowSimultaneousEditors} onChange={(allowSimultaneousEditors) => updateLorebookEditor({ allowSimultaneousEditors })} label="Allow simultaneous editors" />
          </div>
          <SegmentedSetting
            label="Half-screen layout"
            value={lorebookEditorSettings.halfEditorMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEditorMode}
            options={[['docked', 'Docked'], ['floating', 'Floating']]}
            onChange={(halfEditorMode) => updateLorebookEditor({ halfEditorMode: halfEditorMode as LorebookEditorSettings['halfEditorMode'] })}
          />
          <div className={styles.settingsCardMeta}>
            {(lorebookEditorSettings.halfEditorMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEditorMode) === 'floating'
              ? 'Free panel: drag it anywhere and resize it from any edge or corner. All four size and position values below apply.'
              : 'Docked to the right of the chat, full height. Only the width applies — the height and position values are for floating mode.'}
          </div>
          <div className={styles.settingsGridTwo}>
            <RangeSetting label="Half-screen width" min={420} max={1400} value={lorebookEditorSettings.halfRect.width} onChange={(width) => updateLorebookEditor({ halfRect: { ...lorebookEditorSettings.halfRect, width } })} suffix="px" />
            {/* Not deleted — gated. They control nothing while docked, but floating
                mode reads the whole rect, so hiding them there would be the defect
                in the other direction. */}
            {(lorebookEditorSettings.halfEditorMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.halfEditorMode) === 'floating' && (
              <>
                <RangeSetting label="Half-screen height" min={360} max={1000} value={lorebookEditorSettings.halfRect.height} onChange={(height) => updateLorebookEditor({ halfRect: { ...lorebookEditorSettings.halfRect, height } })} suffix="px" />
                <RangeSetting label="Half-screen X" min={0} max={1600} value={lorebookEditorSettings.halfRect.x} onChange={(x) => updateLorebookEditor({ halfRect: { ...lorebookEditorSettings.halfRect, x } })} suffix="px" />
                <RangeSetting label="Half-screen Y" min={0} max={1000} value={lorebookEditorSettings.halfRect.y} onChange={(y) => updateLorebookEditor({ halfRect: { ...lorebookEditorSettings.halfRect, y } })} suffix="px" />
              </>
            )}
            <RangeSetting label="Books pane" min={160} max={520} value={lorebookEditorSettings.booksPaneWidth} onChange={(booksPaneWidth) => updateLorebookEditor({ booksPaneWidth })} suffix="px" />
            <RangeSetting label="Entries pane" min={220} max={720} value={lorebookEditorSettings.entriesPaneWidth} onChange={(entriesPaneWidth) => updateLorebookEditor({ entriesPaneWidth })} suffix="px" />
            <RangeSetting label="Inspector pane" min={300} max={960} value={lorebookEditorSettings.inspectorPaneWidth} onChange={(inspectorPaneWidth) => updateLorebookEditor({ inspectorPaneWidth })} suffix="px" />
          </div>
          <div className={styles.settingsGridTwo}>
            <RangeSetting
              label="Protected chat width"
              min={240}
              max={900}
              value={lorebookEditorSettings.minChatWidth ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.minChatWidth}
              onChange={(minChatWidth) => updateLorebookEditor({ minChatWidth })}
              suffix="px"
            />
            <RangeSetting
              label="Minimum editor width"
              min={280}
              max={900}
              value={lorebookEditorSettings.minEditorPaneWidth ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.minEditorPaneWidth}
              onChange={(minEditorPaneWidth) => updateLorebookEditor({ minEditorPaneWidth })}
              suffix="px"
            />
          </div>
          <div className={styles.settingsCardMeta}>
            The docked editor can never take the protected chat width, however far you drag it. Below the two
            values combined the row cannot hold both, so the editor covers it outright instead of leaving a
            sliver. The minimum editor width is also the full editor&apos;s floor.
          </div>
          <SegmentedSetting label="Entry row density" value={lorebookEditorSettings.rowDensity} options={[['compact', 'Compact'], ['balanced', 'Balanced'], ['spacious', 'Spacious']]} onChange={(rowDensity) => updateLorebookEditor({ rowDensity: rowDensity as LorebookEditorSettings['rowDensity'] })} />
          <SegmentedSetting
            label="Count tokens"
            value={lorebookEditorSettings.tokenCountMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode}
            options={[['live', 'Always on'], ['delayed', 'After a delay'], ['manual', 'Only on request']]}
            onChange={(tokenCountMode) => updateLorebookEditor({ tokenCountMode: tokenCountMode as LorebookEditorSettings['tokenCountMode'] })}
          />
          <div className={styles.settingsCardMeta}>
            {(lorebookEditorSettings.tokenCountMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode) === 'live'
              ? 'Recounts as you type.'
              : (lorebookEditorSettings.tokenCountMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode) === 'delayed'
                ? 'Counts once per opened entry. Opening one counts it straight away; the delay below only decides how long an edit must settle before the count is redone and saved. Use the button to recount after edits.'
                : 'Never counts automatically — press Count tokens in the entry editor.'}
          </div>
          {(lorebookEditorSettings.tokenCountMode ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode) === 'delayed' && (
            <RangeSetting
              label="Settle time before an edit is recounted"
              min={0}
              max={5000}
              value={lorebookEditorSettings.tokenCountDelayMs ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs}
              onChange={(tokenCountDelayMs) => updateLorebookEditor({ tokenCountDelayMs })}
              suffix="ms"
            />
          )}
          {/* Orthogonal to "Count tokens" above, and the copy has to say so:
              `tokenCountMode` decides when the OPEN entry is counted *and saved*;
              these two decide what is computed AHEAD of time and never saved.
              `Only on request` + `Count every entry` is a real combination —
              nothing is ever auto-written, but the list is exact. */}
          <div className={styles.settingsCardMeta}>
            Background counts are never saved back to the lorebook. &ldquo;Count tokens&rdquo; above decides when
            the entry you have open is counted and written; the two options below decide what is worked out
            ahead of time and kept only for this session.
          </div>
          <div className={styles.settingsGridCompact}>
            <Toggle.Checkbox
              checked={lorebookEditorSettings.tokenPrefetchHover ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHover}
              onChange={(tokenPrefetchHover) => updateLorebookEditor({ tokenPrefetchHover })}
              label="Count ahead when hovering an entry"
            />
            <Toggle.Checkbox
              checked={lorebookEditorSettings.tokenCountAllEntries ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountAllEntries}
              onChange={(tokenCountAllEntries) => updateLorebookEditor({ tokenCountAllEntries })}
              label="Count every entry in the open lorebook"
              disabled={tokenizerAvailability.status !== 'available'}
            />
          </div>
          {tokenizerAvailability.status !== 'available' && (
            <div className={styles.settingsCardMeta}>
              {tokenizerAvailability.status === 'no-model'
                ? 'Counting every entry needs a connection profile with a model selected — without one there is no tokenizer to count with, and every "exact" number would really be a length estimate.'
                : tokenizerAvailability.status === 'checking'
                  ? 'Checking which tokenizer handles this model...'
                  : `No tokenizer pattern matches ${tokenizerAvailability.model}. Add one under Tokenizers to get exact counts; until then the list shows ~ estimates.`}
            </div>
          )}
          {(lorebookEditorSettings.tokenPrefetchHover ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHover) && (
            <RangeSetting
              label="Hover delay before counting"
              min={0}
              max={1000}
              value={lorebookEditorSettings.tokenPrefetchHoverDelayMs ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenPrefetchHoverDelayMs}
              onChange={(tokenPrefetchHoverDelayMs) => updateLorebookEditor({ tokenPrefetchHoverDelayMs })}
              suffix="ms"
            />
          )}
          {/* Stamping the version here too means an explicit choice made before the
              lorebook editor is ever opened is not overwritten by its migration. */}
          <MetadataChecklist
            label="Visible entry metadata"
            options={LOREBOOK_ENTRY_METADATA_OPTIONS}
            value={lorebookEditorSettings.visibleEntryMetadata}
            onChange={(visibleEntryMetadata) => updateLorebookEditor({
              visibleEntryMetadata,
              entryMetadataVersion: ENTRY_METADATA_VERSION,
            })}
          />
          <div className={styles.presetRow}>
            <Button variant="secondary" size="sm" onClick={resetLorebookLayout}>Reset current editor layout</Button>
            <Button variant="secondary" size="sm" onClick={() => updateLorebookEditor(DEFAULT_LOREBOOK_EDITOR_SETTINGS)}>Reset all Lorebook Editor settings</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RangeSetting({ label, min, max, value, onChange, suffix, disabled = false, hint }: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  suffix?: string
  /** For a slider the current variant ignores — see the Scale slider under V2. */
  disabled?: boolean
  /** Say *why* it is disabled; a greyed slider with no reason reads as a bug. */
  hint?: string
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={clsx(styles.rangeRow, disabled && styles.rangeRowDisabled)}>
        <input type="range" className={styles.rangeSlider} min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
        <span className={styles.rangeValue}>{value}{suffix}</span>
      </div>
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  )
}

function SegmentedSetting({ label, value, options, onChange, disabled = false }: {
  label: string
  value: string
  options: ReadonlyArray<readonly [string, string]>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.segmented}>
        {options.map(([option, text]) => (
          <button key={option} type="button" disabled={disabled} className={clsx(styles.segmentedBtn, value === option && styles.segmentedBtnActive)} onClick={() => onChange(option)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function MetadataChecklist({ label, options, value, onChange, disabled = false }: {
  label: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.metadataGrid}>
        {options.map((option) => (
          <Toggle.Checkbox
            key={option}
            checked={value.includes(option)}
            disabled={disabled}
            onChange={(checked) => onChange(checked ? [...value, option] : value.filter((item) => item !== option))}
            label={option}
          />
        ))}
      </div>
    </div>
  )
}

function CharacterDisplayControls({ settings, onChange, disabled = false, compactFooterLabel = 'Compact' }: {
  settings: CharacterDisplaySettings
  onChange: (patch: Partial<CharacterDisplaySettings>) => void
  disabled?: boolean
  compactFooterLabel?: string
}) {
  return (
    <>
      <div className={styles.settingsGridTwo}>
        <RangeSetting label="Thumbnail width" min={100} max={360} value={settings.thumbnailWidth} onChange={(thumbnailWidth) => onChange({ thumbnailWidth })} suffix="px" />
        <RangeSetting label="Thumbnail height" min={120} max={520} value={settings.thumbnailHeight} onChange={(thumbnailHeight) => onChange({ thumbnailHeight })} suffix="px" />
        <RangeSetting label="Tag rows" min={0} max={5} value={settings.tagRows} onChange={(tagRows) => onChange({ tagRows })} />
      </div>
      <SegmentedSetting label="Density" value={settings.density} disabled={disabled} options={[['compact', 'Compact'], ['balanced', 'Balanced'], ['large', 'Large'], ['custom', 'Custom']]} onChange={(density) => onChange({ density: density as CharacterDisplaySettings['density'] })} />
      <SegmentedSetting label="Footer mode" value={settings.footerMode} disabled={disabled} options={[['compact', compactFooterLabel], ['balanced', 'Balanced'], ['spacious', 'Spacious']]} onChange={(footerMode) => onChange({ footerMode: footerMode as CharacterDisplaySettings['footerMode'] })} />
      <SegmentedSetting label="View mode" value={settings.viewMode} disabled={disabled} options={[['grid', 'Grid'], ['single', 'Single'], ['list', 'List']]} onChange={(viewMode) => onChange({ viewMode: viewMode as CharacterDisplaySettings['viewMode'] })} />
      <SegmentedSetting label="Default sort" value={settings.defaultSort} disabled={disabled} options={[['recent', 'Recent'], ['name', 'Name'], ['created', 'Created'], ['shuffle', 'Shuffle']]} onChange={(defaultSort) => onChange({ defaultSort: defaultSort as CharacterDisplaySettings['defaultSort'] })} />
      <SegmentedSetting label="Default filter" value={settings.defaultFilter} disabled={disabled} options={[['characters', 'Characters'], ['favorites', 'Favorites'], ['groups', 'Groups']]} onChange={(defaultFilter) => onChange({ defaultFilter: defaultFilter as CharacterDisplaySettings['defaultFilter'] })} />
      <MetadataChecklist label="Visible metadata" options={CHARACTER_METADATA_OPTIONS} value={settings.visibleMetadata} disabled={disabled} onChange={(visibleMetadata) => onChange({ visibleMetadata })} />
    </>
  )
}

function HomepageCharacterLibraryPreview({
  settings,
  character,
}: {
  settings: HomepageCharacterLibrarySettings
  character?: Character
}) {
  const cardScale = Math.min(1, 190 / settings.thumbnailWidth, 250 / settings.thumbnailHeight)
  const previewWidth = Math.max(96, Math.round(settings.thumbnailWidth * cardScale))
  const previewHeight = Math.max(120, Math.round(settings.thumbnailHeight * cardScale))
  const panelWidth = Math.max(112, Math.min(210, Math.round(settings.panelWidth * 0.42)))
  const panelImageHeight = Math.max(74, Math.min(150, Math.round((settings.panelImageHeight ?? DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.panelImageHeight) * 0.32)))
  const tagRowsMaxHeight = settings.tagRows > 0
    ? settings.tagRows * 18 + Math.max(settings.tagRows - 1, 0) * 3
    : 0
  const compactFooterMaxHeight = 38 + tagRowsMaxHeight
  const metadata = character
    ? getHomepageCardMetadata(character)
    : { creator: 'Character creator', tags: ['Mystic', 'Strategist', 'Empath'] }
  const { visibleTags, hiddenTagCount } = getHomepageVisibleTags(
    metadata.tags,
    settings.maxVisibleTags ?? DEFAULT_HOMEPAGE_CHARACTER_LIBRARY_SETTINGS.maxVisibleTags,
    settings.tagRows,
  )
  const avatarUrl = character ? getCharacterAvatarLargeUrlById(character.id, character.image_id) : ''
  const previewStyle = {
    '--homepage-preview-card-width': `${previewWidth}px`,
    '--homepage-preview-image-height': `${previewHeight}px`,
    '--homepage-preview-panel-width': `${panelWidth}px`,
    '--homepage-preview-panel-image-height': `${panelImageHeight}px`,
    '--homepage-preview-tag-lines': settings.tagRows,
    '--homepage-preview-tags-max-height': `${tagRowsMaxHeight}px`,
    '--homepage-preview-footer-max-height': `${compactFooterMaxHeight}px`,
  } as CSSProperties

  return (
    <div className={styles.homepageLivePreview} aria-label="Homepage character card live preview">
      <div className={styles.homepagePreviewLabel}>
        <span>Live preview</span>
        <span>{settings.thumbnailWidth} x {settings.thumbnailHeight}px</span>
      </div>
      <div className={styles.homepagePreviewCanvas} style={previewStyle}>
        <div className={styles.homepagePreviewGrid} data-density={settings.density}>
          <div
            className={styles.homepagePreviewCard}
            data-footer-mode={settings.footerMode}
            data-name-background={settings.showNameBackground ?? false}
          >
            {character ? (
              <img
                src={avatarUrl}
                alt=""
              />
            ) : (
              <div className={styles.homepagePreviewPlaceholder}>C</div>
            )}
            <div className={styles.homepagePreviewFooter}>
              <strong>{character?.name || 'Character name'}</strong>
              {settings.visibleMetadata.includes('creator') && metadata.creator && <span>{metadata.creator}</span>}
              {settings.visibleMetadata.includes('tags') && settings.tagRows > 0 && visibleTags.length > 0 && (
                <div className={styles.homepagePreviewTags}>
                  {visibleTags.map((tag) => <span key={tag}>{tag}</span>)}
                  {hiddenTagCount > 0 && <span>+{hiddenTagCount}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={styles.homepagePreviewPanel} data-pinned={settings.panelPinned}>
          {character ? (
            <img
              className={styles.homepagePreviewPanelImage}
              src={avatarUrl}
              alt=""
              style={{ '--homepage-preview-image-url': `url("${avatarUrl}")` } as CSSProperties}
            />
          ) : (
            <div className={styles.homepagePreviewPanelImage} />
          )}
          <strong>{character?.name || 'Character name'}</strong>
          <span>{settings.panelPinned ? 'Pinned preview' : 'Unpinned preview'}</span>
        </div>
      </div>
    </div>
  )
}

function DisplaySettings() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const drawerSettings = useStore((s) => s.drawerSettings)
  const modalWidthMode = useStore((s) => s.modalWidthMode)
  const modalMaxWidth = useStore((s) => s.modalMaxWidth)
  const landingPageChatsDisplayed = useStore((s) => s.landingPageChatsDisplayed)
  const landingPageLayoutMode = useStore((s) => s.landingPageLayoutMode)
  const toastPosition = useStore((s) => s.toastPosition)
  const chatHeadsEnabled = useStore((s) => s.chatHeadsEnabled)
  const chatHeadsSize = useStore((s) => s.chatHeadsSize)
  const chatHeadsDirection = useStore((s) => s.chatHeadsDirection)
  const chatHeadsOpacity = useStore((s) => s.chatHeadsOpacity)
  const chatHeadsCompletionSoundEnabled = useStore((s) => s.chatHeadsCompletionSoundEnabled)
  const chatHeadsCustomCompletionSound = useStore((s) => s.chatHeadsCustomCompletionSound)
  const setSetting = useStore((s) => s.setSetting)
  const addToast = useStore((s) => s.addToast)

  const updateDrawer = (patch: Partial<DrawerSettings>) => {
    setSetting('drawerSettings', { ...drawerSettings, ...patch })
  }

  return (
    <div className={styles.settingsSection}>
      <LanguageSwitcher />

      <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>{t('display.modalWidth.title')}</h3>
      <p className={styles.helperText}>
        {t('display.modalWidth.helper')}
      </p>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('display.modalWidth.maxWidth')}</label>
        <div className={styles.segmented}>
          {(['full', 'comfortable', 'compact', 'custom'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              className={clsx(styles.segmentedBtn, modalWidthMode === preset && styles.segmentedBtnActive)}
              onClick={() => setSetting('modalWidthMode', preset)}
            >
              {t(`display.modalWidth.${preset}`)}
            </button>
          ))}
        </div>
      </div>

      {modalWidthMode === 'custom' && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('display.modalWidth.maxWidth')}</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              className={styles.rangeSlider}
              min={340}
              max={1400}
              step={10}
              value={modalMaxWidth}
              onChange={(e) => setSetting('modalMaxWidth', parseInt(e.target.value, 10))}
            />
            <span className={styles.rangeValue}>{modalMaxWidth}px</span>
          </div>
        </div>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('display.drawer.title')}</h3>

      <div className={styles.drawerRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('display.drawer.side')}</label>
          <div className={styles.segmented}>
            <button
              type="button"
              className={clsx(styles.segmentedBtn, drawerSettings.side === 'left' && styles.segmentedBtnActive)}
              onClick={() => updateDrawer({ side: 'left' })}
            >
              {t('display.drawer.left')}
            </button>
            <button
              type="button"
              className={clsx(styles.segmentedBtn, drawerSettings.side === 'right' && styles.segmentedBtnActive)}
              onClick={() => updateDrawer({ side: 'right' })}
            >
              {t('display.drawer.right')}
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('display.drawer.tabPosition')}</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              className={styles.rangeSlider}
              min={0}
              max={70}
              value={drawerSettings.verticalPosition}
              onChange={(e) => updateDrawer({ verticalPosition: parseInt(e.target.value, 10) })}
            />
            <span className={styles.rangeValue}>{drawerSettings.verticalPosition}%</span>
          </div>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('display.drawer.tabSize')}</label>
        <div className={styles.segmented}>
          <button
            type="button"
            className={clsx(styles.segmentedBtn, drawerSettings.tabSize === 'large' && styles.segmentedBtnActive)}
            onClick={() => updateDrawer({ tabSize: 'large' })}
          >
            {t('display.drawer.tabSizeLarge')}
          </button>
          <button
            type="button"
            className={clsx(styles.segmentedBtn, drawerSettings.tabSize === 'compact' && styles.segmentedBtnActive)}
            onClick={() => updateDrawer({ tabSize: 'compact' })}
          >
            {t('display.drawer.tabSizeCompact')}
          </button>
        </div>
      </div>

      <Toggle.Checkbox
        checked={drawerSettings.showTabLabels ?? false}
        onChange={(checked) => updateDrawer({ showTabLabels: checked })}
        label={t('display.drawer.showTabLabels')}
        hint={t('display.drawer.showTabLabelsHint')}
      />

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('display.drawer.panelWidth')}</label>
        <div className={styles.segmented}>
          <button
            type="button"
            className={clsx(styles.segmentedBtn, drawerSettings.panelWidthMode !== 'custom' && styles.segmentedBtnActive)}
            onClick={() => updateDrawer({ panelWidthMode: 'default' })}
          >
            {t('display.drawer.panelDefault')}
          </button>
          <button
            type="button"
            className={clsx(styles.segmentedBtn, drawerSettings.panelWidthMode === 'custom' && styles.segmentedBtnActive)}
            onClick={() => updateDrawer({ panelWidthMode: 'custom' })}
          >
            {t('display.drawer.panelCustom')}
          </button>
        </div>
      </div>

      {drawerSettings.panelWidthMode === 'custom' && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('display.drawer.customWidthVw')}</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              className={styles.rangeSlider}
              min={20}
              max={80}
              step={1}
              value={drawerSettings.customPanelWidth}
              onChange={(e) => updateDrawer({ customPanelWidth: parseInt(e.target.value, 10) })}
            />
            <span className={styles.rangeValue}>{drawerSettings.customPanelWidth}vw</span>
          </div>
        </div>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('display.toast.title')}</h3>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('display.toast.position')}</label>
        <div className={styles.segmented}>
          {([
            ['top-left', 'tl'],
            ['top', 'top'],
            ['top-right', 'tr'],
            ['bottom-left', 'bl'],
            ['bottom', 'bottom'],
            ['bottom-right', 'br'],
          ] as const).map(([value, key]) => (
            <button
              key={value}
              type="button"
              className={clsx(styles.segmentedBtn, toastPosition === value && styles.segmentedBtnActive)}
              onClick={() => setSetting('toastPosition', value)}
            >
              {t(`display.toast.${key}`)}
            </button>
          ))}
        </div>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 8 }}>{t('display.chatHeads.title')}</h3>

      <Toggle.Checkbox
        checked={chatHeadsEnabled}
        onChange={(checked) => setSetting('chatHeadsEnabled', checked)}
        label={t('display.chatHeads.show')}
        hint={t('display.chatHeads.showHint')}
      />

      <Toggle.Checkbox
        checked={chatHeadsCompletionSoundEnabled}
        onChange={(checked) => setSetting('chatHeadsCompletionSoundEnabled', checked)}
        label={t('display.chatHeads.completionSound')}
        hint={t('display.chatHeads.completionSoundHint')}
      />

      <CompletionSoundUploader
        disabled={!chatHeadsCompletionSoundEnabled}
        current={chatHeadsCustomCompletionSound}
        onChange={(meta) => setSetting('chatHeadsCustomCompletionSound', meta)}
        onError={(message) => addToast({ type: 'error', message })}
        onSuccess={(message) => addToast({ type: 'success', message })}
      />

      {chatHeadsEnabled && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('display.chatHeads.size', { px: chatHeadsSize })}</label>
            <div className={styles.rangeRow}>
              <input
                type="range"
                className={styles.rangeSlider}
                min={32}
                max={64}
                step={4}
                value={chatHeadsSize}
                onChange={(e) => setSetting('chatHeadsSize', parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('display.chatHeads.layout')}</label>
            <div className={styles.segmented}>
              {(['column', 'row'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  className={`${styles.segmentedBtn} ${chatHeadsDirection === dir ? styles.segmentedBtnActive : ''}`}
                  onClick={() => setSetting('chatHeadsDirection', dir)}
                >
                  {dir === 'column' ? t('display.chatHeads.vertical') : t('display.chatHeads.horizontal')}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('display.chatHeads.opacity', { pct: Math.round(chatHeadsOpacity * 100) })}</label>
            <div className={styles.rangeRow}>
              <input
                type="range"
                className={styles.rangeSlider}
                min={20}
                max={100}
                step={5}
                value={Math.round(chatHeadsOpacity * 100)}
                onChange={(e) => setSetting('chatHeadsOpacity', parseInt(e.target.value, 10) / 100)}
              />
            </div>
          </div>

        </>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 8 }}>{t('display.landing.title')}</h3>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('display.landing.layout')}</label>
        <div className={styles.segmented}>
          <button
            type="button"
            className={clsx(styles.segmentedBtn, landingPageLayoutMode === 'cards' && styles.segmentedBtnActive)}
            onClick={() => setSetting('landingPageLayoutMode', 'cards')}
          >
            {t('display.landing.cards')}
          </button>
          <button
            type="button"
            className={clsx(styles.segmentedBtn, landingPageLayoutMode === 'compact' && styles.segmentedBtnActive)}
            onClick={() => setSetting('landingPageLayoutMode', 'compact')}
          >
            {t('display.landing.compactList')}
          </button>
        </div>
        <p className={styles.helperText} style={{ marginTop: 8 }}>
          {t('display.landing.layoutHelper')}
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('display.landing.batchSize')}</label>
        <NumericInput
          className={styles.numberInput}
          min={4}
          max={100}
          value={landingPageChatsDisplayed}
          integer
          onChange={(value) => setSetting('landingPageChatsDisplayed', value ?? 12)}
        />
      </div>

    </div>
  )
}

interface CompletionSoundUploaderProps {
  disabled: boolean
  current: {
    filename: string
    mimeType: string
    byteSize: number
    uploadedAt: number
  } | null
  onChange: (meta: CompletionSoundUploaderProps['current']) => void
  onError: (message: string) => void
  onSuccess: (message: string) => void
}

const MAX_COMPLETION_SOUND_BYTES = 2 * 1024 * 1024

function CompletionSoundUploader({ disabled, current, onChange, onError, onSuccess }: CompletionSoundUploaderProps) {
  const { t } = useTranslation('settings')
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const handleFile = async (file: File) => {
    if (file.size > MAX_COMPLETION_SOUND_BYTES) {
      onError(t('display.completionSound.fileTooLarge'))
      return
    }
    setUploading(true)
    try {
      const meta = await notificationSoundsApi.uploadCompletion(file)
      onChange({
        filename: meta.filename,
        mimeType: meta.mimeType,
        byteSize: meta.byteSize,
        uploadedAt: meta.uploadedAt,
      })
      onSuccess(t('display.completionSound.saved'))
    } catch (err: any) {
      onError(err?.body?.error || err?.message || t('display.completionSound.uploadFailed'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await notificationSoundsApi.deleteCompletion()
      onChange(null)
    } catch (err: any) {
      // 404 just means there was no file server-side; treat as success
      if (err?.status === 404) {
        onChange(null)
      } else {
        onError(err?.body?.error || err?.message || t('display.completionSound.removeFailed'))
        return
      }
    } finally {
      setRemoving(false)
    }
    onSuccess(t('display.completionSound.reverted'))
  }

  const handlePreview = async () => {
    if (!current) return
    setPreviewing(true)
    try {
      const unlocked = await unlockNotificationAudio()
      if (!unlocked) {
        onError(t('display.completionSound.blocked'))
        return
      }
      const url = notificationSoundsApi.completionUrl(current.uploadedAt)
      const audio = new Audio(url)
      audio.volume = 0.5
      await audio.play().catch((err) => {
        onError(err?.message || t('display.completionSound.playFailed'))
      })
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className={styles.field} style={{ opacity: disabled ? 0.5 : 1 }}>
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.aac,.m4a"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || uploading}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {current ? t('display.completionSound.replace') : t('display.completionSound.upload')}
        </Button>
        {current && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || previewing}
              onClick={handlePreview}
            >
              {t('display.completionSound.preview')}
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              disabled={disabled || removing}
              loading={removing}
              onClick={handleRemove}
            >
              {t('display.completionSound.useDefault')}
            </Button>
          </>
        )}
      </div>
      <p className={styles.helperText} style={{ marginTop: 6 }}>
        {current
          ? t('display.completionSound.usingFile', {
              filename: current.filename,
              size: (current.byteSize / 1024).toFixed(1),
              mime: current.mimeType,
            })
          : t('display.completionSound.uploadHint')}
      </p>
    </div>
  )
}

function ChatSettings() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const displayMode = useStore((s) => s.chatSheldDisplayMode)
  const bubbleUserAlign = useStore((s) => s.bubbleUserAlign)
  const bubbleHideAvatarBg = useStore((s) => s.bubbleHideAvatarBg)
  const bubbleOpacity = useStore((s) => s.bubbleOpacity ?? 1)
  const enterToSend = useStore((s) => s.chatSheldEnterToSend)
  const saveDraftInput = useStore((s) => s.saveDraftInput)
  const portraitPanelSide = useStore((s) => s.portraitPanelSide)
  const chatWidthMode = useStore((s) => s.chatWidthMode)
  const chatContentMaxWidth = useStore((s) => s.chatContentMaxWidth)
  const messagesPerPage = useStore((s) => s.messagesPerPage)
  const regenFeedback = useStore((s) => s.regenFeedback)
  const setSetting = useStore((s) => s.setSetting)
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('chat.title')}</h3>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('chat.displayMode')}</label>
        <div className={styles.displayModeGrid}>
          {/* ── Minimal card ── */}
          <button
            type="button"
            className={clsx(styles.displayModeCard, displayMode === 'minimal' && styles.displayModeCardActive)}
            onClick={() => setSetting('chatSheldDisplayMode', 'minimal')}
          >
            <div className={styles.previewMinimal}>
              {/* Character message */}
              <div className={styles.previewMinimalMsg}>
                <div className={styles.previewAccentLeft} />
                <div className={styles.previewMinimalAvatar} />
                <div className={styles.previewMinimalBody}>
                  <div className={styles.previewLine} style={{ width: '80%' }} />
                  <div className={styles.previewLine} style={{ width: '55%' }} />
                </div>
              </div>
              {/* User message */}
              <div className={clsx(styles.previewMinimalMsg, styles.previewMinimalMsgUser)}>
                <div className={styles.previewAccentRight} />
                <div className={styles.previewMinimalBody}>
                  <div className={styles.previewLine} style={{ width: '65%' }} />
                </div>
              </div>
              {/* Character message */}
              <div className={styles.previewMinimalMsg}>
                <div className={styles.previewAccentLeft} />
                <div className={styles.previewMinimalAvatar} />
                <div className={styles.previewMinimalBody}>
                  <div className={styles.previewLine} style={{ width: '90%' }} />
                  <div className={styles.previewLine} style={{ width: '40%' }} />
                </div>
              </div>
            </div>
            <span className={clsx(styles.displayModeLabel, displayMode === 'minimal' && styles.displayModeLabelActive)}>
              {t('chat.minimal')}
            </span>
          </button>

          {/* ── Bubble card ── */}
          <button
            type="button"
            className={clsx(styles.displayModeCard, displayMode === 'bubble' && styles.displayModeCardActive)}
            onClick={() => setSetting('chatSheldDisplayMode', 'bubble')}
          >
            <div className={styles.previewBubble}>
              {/* Character bubble message */}
              <div className={styles.previewBubbleMsg}>
                <div className={styles.previewBubbleFade} />
                <div className={styles.previewBubbleHeader}>
                  <div className={styles.previewBubbleAvatar} />
                  <div className={styles.previewBubbleMeta}>
                    <div className={styles.previewBubbleName} />
                    <div className={styles.previewBubblePill} />
                  </div>
                </div>
                <div className={styles.previewBubbleContent}>
                  <div className={styles.previewLine} style={{ width: '90%' }} />
                  <div className={styles.previewLine} style={{ width: '70%' }} />
                  <div className={styles.previewLine} style={{ width: '50%' }} />
                </div>
              </div>
              {/* User bubble message */}
              <div className={clsx(styles.previewBubbleMsg, styles.previewBubbleMsgUser)}>
                <div className={clsx(styles.previewBubbleFade, styles.previewBubbleFadeUser)} />
                <div className={styles.previewBubbleContent}>
                  <div className={styles.previewLine} style={{ width: '75%' }} />
                  <div className={styles.previewLine} style={{ width: '55%' }} />
                </div>
              </div>
            </div>
            <span className={clsx(styles.displayModeLabel, displayMode === 'bubble' && styles.displayModeLabelActive)}>
              {t('chat.bubble')}
            </span>
          </button>
        </div>
      </div>

      {displayMode === 'bubble' && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('chat.userAlign')}</label>
            <div className={styles.segmented}>
              {(['left', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={clsx(styles.segmentedBtn, (bubbleUserAlign ?? 'right') === align && styles.segmentedBtnActive)}
                  onClick={() => setSetting('bubbleUserAlign', align)}
                >
                  {align === 'left' ? t('chat.left') : t('chat.right')}
                </button>
              ))}
            </div>
          </div>

          <Toggle.Checkbox
            checked={!bubbleHideAvatarBg}
            onChange={(checked) => setSetting('bubbleHideAvatarBg', !checked)}
            label={t('chat.bubbleAvatarBg')}
            hint={t('chat.bubbleAvatarBgHint')}
          />

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('chat.bubbleOpacity', { pct: Math.round(bubbleOpacity * 100) })}</label>
            <div className={styles.rangeRow}>
              <input
                type="range"
                className={styles.rangeSlider}
                min={20}
                max={100}
                step={5}
                value={Math.round(bubbleOpacity * 100)}
                onChange={(e) => setSetting('bubbleOpacity', parseInt(e.target.value, 10) / 100)}
              />
              <span className={styles.rangeValue}>{Math.round(bubbleOpacity * 100)}%</span>
            </div>
          </div>
        </>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('chat.widthTitle')}</h3>
      <p className={styles.helperText}>
        {t('chat.widthHelper')}
      </p>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('chat.contentWidth')}</label>
        <div className={styles.segmented}>
          {(['full', 'comfortable', 'compact', 'custom'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              className={clsx(styles.segmentedBtn, chatWidthMode === preset && styles.segmentedBtnActive)}
              onClick={() => setSetting('chatWidthMode', preset)}
            >
              {t(`display.modalWidth.${preset}`)}
            </button>
          ))}
        </div>
      </div>

      {chatWidthMode === 'custom' && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('chat.maxWidthPx')}</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              className={styles.rangeSlider}
              min={500}
              max={2000}
              step={10}
              value={chatContentMaxWidth}
              onChange={(e) => setSetting('chatContentMaxWidth', parseInt(e.target.value, 10))}
            />
            <span className={styles.rangeValue}>{chatContentMaxWidth}px</span>
          </div>
        </div>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('chat.messagesPerPageTitle')}</h3>
      <p className={styles.helperText}>
        {t('chat.messagesPerPageHelper')}
      </p>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('chat.messagesPerPage')}</label>
        <div className={styles.segmented}>
          {[25, 50, 100, 200].map((value) => (
            <button
              key={value}
              type="button"
              className={clsx(styles.segmentedBtn, !![25, 50, 100, 200].includes(messagesPerPage ?? 50) && (messagesPerPage ?? 50) === value && styles.segmentedBtnActive)}
              onClick={() => setSetting('messagesPerPage', value)}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            className={clsx(styles.segmentedBtn, ![25, 50, 100, 200].includes(messagesPerPage ?? 50) && styles.segmentedBtnActive)}
            onClick={() => { if ([25, 50, 100, 200].includes(messagesPerPage ?? 50)) setSetting('messagesPerPage', 75) }}
          >
            {t('display.modalWidth.custom')}
          </button>
        </div>
      </div>

      {![25, 50, 100, 200].includes(messagesPerPage ?? 50) && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('chat.customValue')}</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              className={styles.rangeSlider}
              min={10}
              max={500}
              step={5}
              value={messagesPerPage ?? 50}
              onChange={(e) => setSetting('messagesPerPage', parseInt(e.target.value, 10))}
            />
            <span className={styles.rangeValue}>{messagesPerPage ?? 50}</span>
          </div>
        </div>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('chat.inputTitle')}</h3>

      <Toggle.Checkbox
        checked={enterToSend}
        onChange={(checked) => setSetting('chatSheldEnterToSend', checked)}
        label={t('chat.enterToSend')}
        hint={enterToSend
          ? t('chat.enterToSendHintOn')
          : isMac ? t('chat.enterToSendHintOffMac') : t('chat.enterToSendHintOffWin')}
      />

      <Toggle.Checkbox
        checked={saveDraftInput}
        onChange={(checked) => setSetting('saveDraftInput', checked)}
        label={t('chat.saveDraft')}
        hint={t('chat.saveDraftHint')}
      />

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('chat.portraitSide')}</label>
        <select
          className={styles.select}
          value={portraitPanelSide}
          onChange={(e) => setSetting('portraitPanelSide', e.target.value as 'left' | 'right' | 'none')}
        >
          <option value="none">{t('chat.none')}</option>
          <option value="left">{t('chat.left')}</option>
          <option value="right">{t('chat.right')}</option>
        </select>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('chat.regenTitle')}</h3>
      <p className={styles.helperText}>
        {t('chat.regenHelper')}
      </p>

      <Toggle.Checkbox
        checked={regenFeedback.enabled}
        onChange={(checked) => setSetting('regenFeedback', { ...regenFeedback, enabled: checked })}
        label={t('chat.regenPrompt')}
      />

      {regenFeedback.enabled && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('chat.regenPosition')}</label>
          <div className={styles.segmented}>
            {([
              { value: 'user', label: t('chat.regenUserMessage') },
              { value: 'system', label: t('chat.regenSystemPrompt') },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={clsx(styles.segmentedBtn, regenFeedback.position === opt.value && styles.segmentedBtnActive)}
                onClick={() => setSetting('regenFeedback', { ...regenFeedback, position: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className={styles.helperText}>
            {regenFeedback.position === 'user'
              ? t('chat.regenHintUser')
              : t('chat.regenHintSystem')}
          </p>
        </div>
      )}

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('chat.messageInfoTitle')}</h3>

      <Toggle.Checkbox
        checked={useStore((s) => s.showMessageTokenCount ?? true)}
        onChange={(checked) => setSetting('showMessageTokenCount', checked)}
        label={t('chat.showTokenCount')}
        hint={t('chat.showTokenCountHint')}
      />

      <Toggle.Checkbox
        checked={useStore((s) => s.messageContextMenuEnabled ?? true)}
        onChange={(checked) => setSetting('messageContextMenuEnabled', checked)}
        label={t('chat.contextMenu')}
        hint={t('chat.contextMenuHint')}
      />

      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{t('chat.swipeTitle')}</h3>
      <p className={styles.helperText}>
        {t('chat.swipeHelper')}
      </p>

      <Toggle.Checkbox
        checked={useStore((s) => s.swipeGesturesEnabled)}
        onChange={(checked) => setSetting('swipeGesturesEnabled', checked)}
        label={t('chat.swipeGestures')}
      />
    </div>
  )
}

function ExtensionSettingsView() {
  const { t } = useTranslation('settings')
  const extensions = useStore((s) => s.extensions)
  const frontendCount = extensions.filter((ext) => ext.has_frontend).length

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('extensions.title')}</h3>
      <p className={styles.placeholder}>
        {t('extensions.placeholder')}
        {frontendCount > 0
          ? ` ${t('extensions.frontendCount', { count: frontendCount })}`
          : ` ${t('extensions.noFrontend')}`}
      </p>
    </div>
  )
}

interface SortableGuideRowProps {
  guide: GuidedGeneration
  editing: boolean
  onToggleEnabled: (id: string, value: boolean) => void
  onToggleEdit: (id: string) => void
  onUpdate: (id: string, patch: Partial<GuidedGeneration>) => void
  onRemove: (id: string) => void
}

function SortableGuideRow({ guide, editing, onToggleEnabled, onToggleEdit, onUpdate, onRemove }: SortableGuideRowProps) {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: guide.id })
  const { setNodeRef, style } = useScaledSortableStyle({ setNodeRef: setSortableRef, transform, transition, isDragging })
  const positionLabel = {
    system: t('guided.positionSystem'),
    user_prefix: t('guided.positionBefore'),
    user_suffix: t('guided.positionAfter'),
  }[guide.position] ?? guide.position
  const modeLabel = guide.mode === 'oneshot' ? t('guided.oneshot') : t('guided.persistent')
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(styles.card, guide.enabled && styles.cardEnabled, isDragging && styles.cardDragging)}
    >
      <div className={styles.cardRow}>
        <span
          {...attributes}
          {...listeners}
          className={styles.dragHandle}
          title={t('guided.dragReorder')}
          aria-label={t('guided.dragAria')}
        >
          <GripVertical size={14} />
        </span>
        <Toggle.Switch checked={guide.enabled} onChange={(v) => onToggleEnabled(guide.id, v)} size="sm" />
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardTitle}>{guide.name || t('guided.untitled')}</div>
          <div className={styles.cardMeta}>{modeLabel} · {positionLabel}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onToggleEdit(guide.id)}>{editing ? tc('actions.done') : tc('actions.edit')}</Button>
        <Button variant="danger-ghost" size="sm" onClick={() => onRemove(guide.id)}>{tc('actions.delete')}</Button>
      </div>

      {editing && (
        <div className={styles.editorGrid}>
          <input
            className={styles.select}
            value={guide.name}
            onChange={(e) => onUpdate(guide.id, { name: e.target.value })}
            placeholder={t('guided.guideName')}
          />
          <div className={styles.drawerRow}>
            <select className={styles.select} value={guide.position} onChange={(e) => onUpdate(guide.id, { position: e.target.value as GuidedGeneration['position'] })}>
              <option value="system">{t('guided.positionSystem')}</option>
              <option value="user_prefix">{t('guided.positionBefore')}</option>
              <option value="user_suffix">{t('guided.positionAfter')}</option>
            </select>
            <select className={styles.select} value={guide.mode} onChange={(e) => onUpdate(guide.id, { mode: e.target.value as GuidedGeneration['mode'] })}>
              <option value="persistent">{t('guided.persistent')}</option>
              <option value="oneshot">{t('guided.oneshot')}</option>
            </select>
          </div>
          <textarea
            className={styles.textarea}
            value={guide.content}
            onChange={(e) => onUpdate(guide.id, { content: e.target.value })}
            placeholder={t('guided.guideContent')}
            rows={4}
          />
        </div>
      )}
    </div>
  )
}

function GuidedGenerationSettings() {
  const { t } = useTranslation('settings')
  const guides = useStore((s) => s.guidedGenerations)
  const setSetting = useStore((s) => s.setSetting)
  const [editingId, setEditingId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const addGuide = () => {
    const next: GuidedGeneration = {
      id: createId('guide'),
      name: t('guided.newGuideDefault'),
      content: '',
      position: 'system',
      mode: 'persistent',
      enabled: false,
      color: null,
    }
    setSetting('guidedGenerations', [...guides, next])
    setEditingId(next.id)
  }

  const updateGuide = (id: string, patch: Partial<GuidedGeneration>) => {
    setSetting('guidedGenerations', guides.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  const removeGuide = (id: string) => {
    setSetting('guidedGenerations', guides.filter((g) => g.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = guides.findIndex((g) => g.id === active.id)
    const newIndex = guides.findIndex((g) => g.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setSetting('guidedGenerations', arrayMove(guides, oldIndex, newIndex))
  }

  return (
    <div className={styles.settingsSection}>
      <div className={styles.inlineHeader}>
        <h3 className={styles.sectionTitle}>{t('guided.title')}</h3>
        <Button size="sm" onClick={addGuide}>{t('guided.newGuide')}</Button>
      </div>
      <p className={styles.placeholder}>{t('guided.helper')}</p>

      {guides.length === 0 && <p className={styles.placeholder}>{t('guided.empty')}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={guides.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          {guides.map((g) => (
            <SortableGuideRow
              key={g.id}
              guide={g}
              editing={editingId === g.id}
              onToggleEnabled={(id, value) => updateGuide(id, { enabled: value })}
              onToggleEdit={(id) => setEditingId((prev) => (prev === id ? null : id))}
              onUpdate={updateGuide}
              onRemove={removeGuide}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

function QuickRepliesSettings() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const sets = useStore((s) => s.quickReplySets)
  const setSetting = useStore((s) => s.setSetting)
  const [editingSetId, setEditingSetId] = useState<string | null>(null)

  const addSet = () => {
    const next: QuickReplySet = {
      id: createId('qrs'),
      name: t('quickReplies.newSetDefault'),
      color: null,
      enabled: true,
      replies: [],
    }
    setSetting('quickReplySets', [...sets, next])
    setEditingSetId(next.id)
  }

  const updateSet = (id: string, patch: Partial<QuickReplySet>) => {
    setSetting('quickReplySets', sets.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeSet = (id: string) => {
    setSetting('quickReplySets', sets.filter((s) => s.id !== id))
    if (editingSetId === id) setEditingSetId(null)
  }

  const addReply = (setId: string) => {
    setSetting('quickReplySets', sets.map((s) => {
      if (s.id !== setId) return s
      return {
        ...s,
        replies: [...s.replies, { id: createId('qr'), label: t('quickReplies.newReplyDefault'), message: '' }],
      }
    }))
  }

  const updateReply = (setId: string, replyId: string, patch: { label?: string; message?: string }) => {
    setSetting('quickReplySets', sets.map((s) => {
      if (s.id !== setId) return s
      return {
        ...s,
        replies: s.replies.map((r) => (r.id === replyId ? { ...r, ...patch } : r)),
      }
    }))
  }

  const removeReply = (setId: string, replyId: string) => {
    setSetting('quickReplySets', sets.map((s) => {
      if (s.id !== setId) return s
      return {
        ...s,
        replies: s.replies.filter((r) => r.id !== replyId),
      }
    }))
  }

  return (
    <div className={styles.settingsSection}>
      <div className={styles.inlineHeader}>
        <h3 className={styles.sectionTitle}>{t('quickReplies.title')}</h3>
        <Button size="sm" onClick={addSet}>{t('quickReplies.newSet')}</Button>
      </div>
      <p className={styles.placeholder}>{t('quickReplies.helper')}</p>

      {sets.length === 0 && <p className={styles.placeholder}>{t('quickReplies.empty')}</p>}

      {sets.map((set) => {
        const editing = editingSetId === set.id
        return (
          <div key={set.id} className={clsx(styles.card, set.enabled && styles.cardEnabled)}>
            <div className={styles.cardRow}>
              <Toggle.Switch checked={set.enabled} onChange={(v) => updateSet(set.id, { enabled: v })} size="sm" />
              <div className={styles.cardTitleWrap}>
                <div className={styles.cardTitle}>{set.name || t('quickReplies.untitled')}</div>
                <div className={styles.cardMeta}>{t('quickReplies.reply', { count: set.replies.length })}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditingSetId(editing ? null : set.id)}>{editing ? tc('actions.done') : tc('actions.edit')}</Button>
              <Button variant="danger-ghost" size="sm" onClick={() => removeSet(set.id)}>{tc('actions.delete')}</Button>
            </div>

            {editing && (
              <div className={styles.editorGrid}>
                <input
                  className={styles.select}
                  value={set.name}
                  onChange={(e) => updateSet(set.id, { name: e.target.value })}
                  placeholder={t('quickReplies.setName')}
                />

                {set.replies.map((reply) => (
                  <div key={reply.id} className={styles.quickReplyEditor}>
                    <input
                      className={styles.select}
                      value={reply.label}
                      onChange={(e) => updateReply(set.id, reply.id, { label: e.target.value })}
                      placeholder={t('quickReplies.label')}
                    />
                    <textarea
                      className={styles.textarea}
                      value={reply.message}
                      onChange={(e) => updateReply(set.id, reply.id, { message: e.target.value })}
                      placeholder={t('quickReplies.message')}
                      rows={2}
                    />
                    <Button variant="danger-ghost" size="sm" onClick={() => removeReply(set.id, reply.id)}>{t('quickReplies.remove')}</Button>
                  </div>
                ))}

                <Button size="sm" onClick={() => addReply(set.id)}>{t('quickReplies.addReply')}</Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let next = value
  let unit = units[0]
  for (const candidate of units) {
    unit = candidate
    next /= 1024
    if (next < 1024) break
  }
  return `${next.toFixed(next >= 100 ? 0 : 1)} ${unit}`
}

type PoolEditUnit = 'bytes' | 'mb' | 'gb'

function unitDivisor(unit: PoolEditUnit): number {
  if (unit === 'gb') return 1024 * 1024 * 1024
  if (unit === 'mb') return 1024 * 1024
  return 1
}

function convertUnitValue(value: string, from: PoolEditUnit, to: PoolEditUnit): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  const bytes = n * unitDivisor(from)
  const converted = bytes / unitDivisor(to)
  return String(Math.max(1, Math.round(converted)))
}

function parseValueToBytes(value: string, unit: PoolEditUnit): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return NaN
  return Math.floor(n * unitDivisor(unit))
}

function parseOverridesDetailed(text: string, unit: PoolEditUnit): {
  values: Record<string, number>
  invalidLines: Array<{ line: number; content: string; reason: string }>
} {
  const out: Record<string, number> = {}
  const invalidLines: Array<{ line: number; content: string; reason: string }> = []

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue
    const [identifier, raw] = trimmed.includes('=')
      ? trimmed.split('=').map((s) => s.trim())
      : trimmed.split(':').map((s) => s.trim())
    if (!identifier || !raw) {
      invalidLines.push({ line: i + 1, content: trimmed, reason: 'expected identifier=value' })
      continue
    }
    if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
      invalidLines.push({ line: i + 1, content: trimmed, reason: 'invalid identifier format' })
      continue
    }
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(b|mb|gb)?$/i)
    if (!match) {
      invalidLines.push({ line: i + 1, content: trimmed, reason: 'invalid numeric/unit value' })
      continue
    }
    const numeric = Number(match[1])
    if (!Number.isFinite(numeric) || numeric <= 0) {
      invalidLines.push({ line: i + 1, content: trimmed, reason: 'value must be positive' })
      continue
    }
    const explicitUnit = (match[2] || '').toLowerCase() as '' | 'b' | 'mb' | 'gb'
    const resolvedUnit: PoolEditUnit = explicitUnit === 'gb'
      ? 'gb'
      : explicitUnit === 'mb'
        ? 'mb'
        : explicitUnit === 'b'
          ? 'bytes'
          : unit
    out[identifier] = Math.floor(numeric * unitDivisor(resolvedUnit))
  }

  return { values: out, invalidLines }
}

function parseOverrides(text: string, unit: PoolEditUnit): Record<string, number> {
  return parseOverridesDetailed(text, unit).values
}

function ExtensionPoolSettings() {
  const { t } = useTranslation('settings')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [overviewMe, setOverviewMe] = useState<Awaited<ReturnType<typeof spindleApi.getEphemeralOverviewMe>> | null>(null)
  const [overviewAdmin, setOverviewAdmin] = useState<Awaited<ReturnType<typeof spindleApi.getEphemeralOverviewAdmin>> | null>(null)

  const [globalMaxBytes, setGlobalMaxBytes] = useState('')
  const [extensionDefaultMaxBytes, setExtensionDefaultMaxBytes] = useState('')
  const [reservationTtlMs, setReservationTtlMs] = useState('')
  const [overrideText, setOverrideText] = useState('')
  const [poolUnit, setPoolUnit] = useState<PoolEditUnit>('mb')
  const [password, setPassword] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [focusedInvalidLine, setFocusedInvalidLine] = useState<number | null>(null)
  const overridesRef = useRef<HTMLTextAreaElement | null>(null)

  const canEditPools = !!overviewMe?.canEditPools

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const me = await spindleApi.getEphemeralOverviewMe()
      setOverviewMe(me)

      if (me.canEditPools) {
        const [admin, cfg] = await Promise.all([
          spindleApi.getEphemeralOverviewAdmin(),
          spindleApi.getEphemeralConfig(),
        ])
        setOverviewAdmin(admin)
        setGlobalMaxBytes(String(Math.round(cfg.globalMaxBytes / unitDivisor(poolUnit))))
        setExtensionDefaultMaxBytes(String(Math.round(cfg.extensionDefaultMaxBytes / unitDivisor(poolUnit))))
        setReservationTtlMs(String(cfg.reservationTtlMs))
        setOverrideText(
          Object.entries(cfg.extensionMaxOverrides)
            .map(([id, bytes]) => `${id}=${Math.round(bytes / unitDivisor(poolUnit))}`)
            .join('\n')
        )
      } else {
        setOverviewAdmin(null)
      }
    } catch (err: any) {
      const msg = err?.body?.error || err?.message || t('extensionPools.loadFailed')
      setError(msg)
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(() => {
    if (overviewAdmin) return overviewAdmin.extensions
    return overviewMe?.extensions || []
  }, [overviewAdmin, overviewMe])

  const overrideValidation = useMemo(
    () => parseOverridesDetailed(overrideText, poolUnit),
    [overrideText, poolUnit]
  )

  const globalBytesValue = parseValueToBytes(globalMaxBytes, poolUnit)
  const extensionDefaultBytesValue = parseValueToBytes(extensionDefaultMaxBytes, poolUnit)
  const hasPoolThresholdWarning =
    Number.isFinite(globalBytesValue) &&
    Number.isFinite(extensionDefaultBytesValue) &&
    extensionDefaultBytesValue > globalBytesValue

  const approxFullDefaultExtensions =
    Number.isFinite(globalBytesValue) && Number.isFinite(extensionDefaultBytesValue) && extensionDefaultBytesValue > 0
      ? Math.max(0, Math.floor(globalBytesValue / extensionDefaultBytesValue))
      : 0

  const handleSave = async () => {
    setSaveMessage(null)
    setError(null)
    const global = parseValueToBytes(globalMaxBytes, poolUnit)
    const extDefault = parseValueToBytes(extensionDefaultMaxBytes, poolUnit)
    const ttl = Number(reservationTtlMs)

    if (!Number.isFinite(global) || global <= 0) {
      setError(t('extensionPools.errGlobalMax'))
      return
    }
    if (!Number.isFinite(extDefault) || extDefault <= 0) {
      setError(t('extensionPools.errExtDefault'))
      return
    }
    if (!Number.isFinite(ttl) || ttl <= 0) {
      setError(t('extensionPools.errTtl'))
      return
    }

    if (!password.trim()) {
      setError(t('extensionPools.errPassword'))
      return
    }

    setSaving(true)
    try {
      await spindleApi.setEphemeralConfig({
        password: password.trim(),
        globalMaxBytes: Math.floor(global),
        extensionDefaultMaxBytes: Math.floor(extDefault),
        reservationTtlMs: Math.floor(ttl),
        extensionMaxOverrides: parseOverrides(overrideText, poolUnit),
      })
      setSaveMessage(t('extensionPools.saveSuccess'))
      setPassword('')
      await load(true)
    } catch (err: any) {
      const msg = err?.body?.error || err?.message || t('extensionPools.saveFailed')
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const global = overviewAdmin?.global || overviewMe?.global

  const focusInvalidOverrideLine = (lineNumber: number) => {
    const ta = overridesRef.current
    if (!ta) return
    const lines = ta.value.split('\n')
    const clamped = Math.max(1, Math.min(lineNumber, lines.length))
    let start = 0
    for (let i = 0; i < clamped - 1; i += 1) {
      start += lines[i].length + 1
    }
    const end = start + (lines[clamped - 1]?.length || 0)
    ta.focus()
    ta.setSelectionRange(start, end)

    const total = lines.length || 1
    const ratio = (clamped - 1) / Math.max(1, total - 1)
    const target = ratio * Math.max(0, ta.scrollHeight - ta.clientHeight)
    ta.scrollTop = target

    setFocusedInvalidLine(clamped)
    window.setTimeout(() => setFocusedInvalidLine((prev) => (prev === clamped ? null : prev)), 1200)
  }

  const changePoolUnit = (nextUnit: PoolEditUnit) => {
    if (nextUnit === poolUnit) return
    setGlobalMaxBytes((v) => convertUnitValue(v, poolUnit, nextUnit))
    setExtensionDefaultMaxBytes((v) => convertUnitValue(v, poolUnit, nextUnit))
    setOverrideText((text) => {
      const parsed = parseOverrides(text, poolUnit)
      return Object.entries(parsed)
        .map(([id, bytes]) => `${id}=${Math.max(1, Math.round(bytes / unitDivisor(nextUnit)))}`)
        .join('\n')
    })
    setPoolUnit(nextUnit)
  }

  return (
    <div className={styles.settingsSection}>
      <div className={styles.inlineHeader}>
        <h3 className={styles.sectionTitle}>{t('extensionPools.title')}</h3>
        <Button
          size="icon"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          title={t('extensionPools.refresh')}
          aria-label={t('extensionPools.refresh')}
          icon={<RefreshCw size={13} className={refreshing ? spinClass : undefined} />}
        />
      </div>

      {loading ? (
        <p className={styles.placeholder}>{t('extensionPools.loading')}</p>
      ) : (
        <>
          {error && <p className={styles.errorText}>{error}</p>}
          {saveMessage && <p className={styles.successText}>{saveMessage}</p>}

          {global && (
            <div className={styles.poolSummaryGrid}>
              <div className={styles.poolSummaryCard}>
                <span className={styles.fieldLabel}>{t('extensionPools.globalUsed')}</span>
                <strong>{formatBytes(global.usedBytes)}</strong>
              </div>
              <div className={styles.poolSummaryCard}>
                <span className={styles.fieldLabel}>{t('extensionPools.globalReserved')}</span>
                <strong>{formatBytes(global.reservedBytes)}</strong>
              </div>
              <div className={styles.poolSummaryCard}>
                <span className={styles.fieldLabel}>{t('extensionPools.globalAvailable')}</span>
                <strong>{formatBytes(global.availableBytes)}</strong>
              </div>
            </div>
          )}

          <div className={styles.poolList}>
            {rows.map((row) => {
              const usedPct = row.extensionMaxBytes > 0
                ? Math.min(100, ((row.usedBytes + row.reservedBytes) / row.extensionMaxBytes) * 100)
                : 0

              return (
                <div key={row.extensionId} className={styles.poolRow}>
                  <div className={styles.poolRowTop}>
                    <div>
                      <div className={styles.cardTitle}>{row.name} <span className={styles.poolIdentifier}>({row.identifier})</span></div>
                      <div className={styles.cardMeta}>
                        {row.enabled ? t('extensionPools.enabled') : t('extensionPools.disabled')} • {row.hasEphemeralPermission ? t('extensionPools.ephemeralGranted') : t('extensionPools.noEphemeral')}
                      </div>
                    </div>
                    <div className={styles.poolNumbers}>
                      {t('extensionPools.poolUsage', {
                        used: formatBytes(row.usedBytes),
                        reserved: formatBytes(row.reservedBytes),
                        max: formatBytes(row.extensionMaxBytes),
                      })}
                    </div>
                  </div>
                  <div className={styles.poolBar}>
                    <div className={styles.poolBarFill} style={{ width: `${usedPct}%` }} />
                  </div>
                  <div className={styles.cardMeta}>{t('extensionPools.filesAvailable', { count: row.fileCount, available: formatBytes(row.availableBytes) })}</div>
                </div>
              )
            })}
          </div>

          {canEditPools && (
            <div className={styles.adminPoolSection}>
              <h4 className={styles.subsectionTitle}>{t('extensionPools.poolConfig')}</h4>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('extensionPools.editUnit')}</label>
                <div className={styles.segmented}>
                  <button type="button" className={clsx(styles.segmentedBtn, poolUnit === 'bytes' && styles.segmentedBtnActive)} onClick={() => changePoolUnit('bytes')}>{t('extensionPools.unitBytes')}</button>
                  <button type="button" className={clsx(styles.segmentedBtn, poolUnit === 'mb' && styles.segmentedBtnActive)} onClick={() => changePoolUnit('mb')}>{t('extensionPools.unitMb')}</button>
                  <button type="button" className={clsx(styles.segmentedBtn, poolUnit === 'gb' && styles.segmentedBtnActive)} onClick={() => changePoolUnit('gb')}>{t('extensionPools.unitGb')}</button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('extensionPools.globalMax', { unit: poolUnit.toUpperCase() })}</label>
                <input className={styles.numberInput} type="number" min={1} value={globalMaxBytes} onChange={(e) => setGlobalMaxBytes(e.target.value)} />
                <div className={styles.helperText}>
                  {Number.isFinite(globalBytesValue)
                    ? t('extensionPools.bytesHint', { count: globalBytesValue.toLocaleString() })
                    : t('extensionPools.enterPositive')}
                </div>
                {Number.isFinite(globalBytesValue) && Number.isFinite(extensionDefaultBytesValue) && extensionDefaultBytesValue > 0 && (
                  <div className={styles.helperText}>
                    {t('extensionPools.fitsExtensions', { count: approxFullDefaultExtensions })}
                  </div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('extensionPools.perExtDefault', { unit: poolUnit.toUpperCase() })}</label>
                <input className={styles.numberInput} type="number" min={1} value={extensionDefaultMaxBytes} onChange={(e) => setExtensionDefaultMaxBytes(e.target.value)} />
                <div className={styles.helperText}>
                  {Number.isFinite(extensionDefaultBytesValue)
                    ? t('extensionPools.bytesHint', { count: extensionDefaultBytesValue.toLocaleString() })
                    : t('extensionPools.enterPositive')}
                </div>
                {hasPoolThresholdWarning && (
                  <div className={styles.warningText}>
                    {t('extensionPools.warnExceedsGlobal')}
                  </div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('extensionPools.reservationTtl')}</label>
                <input className={styles.numberInput} type="number" min={1} value={reservationTtlMs} onChange={(e) => setReservationTtlMs(e.target.value)} />
                <div className={styles.helperText}>
                  {Number.isFinite(Number(reservationTtlMs)) && Number(reservationTtlMs) > 0
                    ? t('extensionPools.secondsHint', { count: Math.round(Number(reservationTtlMs) / 1000) })
                    : t('extensionPools.enterPositive')}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('extensionPools.overrides')}</label>
                <textarea
                  ref={overridesRef}
                  className={styles.textarea}
                  rows={5}
                  value={overrideText}
                  onChange={(e) => setOverrideText(e.target.value)}
                  placeholder={`simtracker=${poolUnit === 'gb' ? '1' : poolUnit === 'mb' ? '100' : '104857600'}`}
                />
                {overrideValidation.invalidLines.length > 0 && (
                  <div className={styles.warningText}>
                    {t('extensionPools.invalidOverrides')}{' '}
                    {overrideValidation.invalidLines.map((x, idx) => (
                      <span key={`${x.line}-${x.reason}`}>
                        {idx > 0 ? ', ' : ''}
                        <button
                          type="button"
                          className={styles.inlineLinkBtn}
                          onClick={() => focusInvalidOverrideLine(x.line)}
                        >
                          {x.line}
                        </button>
                        <span> ({x.reason})</span>
                      </span>
                    ))}
                  </div>
                )}
                {focusedInvalidLine !== null && (
                  <div className={styles.helperText}>{t('extensionPools.focusedLine', { line: focusedInvalidLine })}</div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('extensionPools.ownerPassword')}</label>
                <input
                  className={styles.select}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('extensionPools.ownerPasswordPlaceholder')}
                />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving} loading={saving}>
                {saving ? t('extensionPools.saving') : t('extensionPools.saveConfig')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EmbeddingsSettings() {
  const { t } = useTranslation('settings')
  const WORLD_BOOK_VECTOR_PRESETS: Record<Exclude<WorldBookVectorPresetMode, 'custom'>, Omit<WorldBookVectorSettings, 'presetMode'>> = {
    lean: {
      chunkTargetTokens: 220,
      chunkMaxTokens: 360,
      chunkOverlapTokens: 40,
      retrievalTopK: 4,
      maxChunksPerEntry: 4,
    },
    balanced: {
      chunkTargetTokens: 420,
      chunkMaxTokens: 700,
      chunkOverlapTokens: 80,
      retrievalTopK: 6,
      maxChunksPerEntry: 8,
    },
    deep: {
      chunkTargetTokens: 720,
      chunkMaxTokens: 1200,
      chunkOverlapTokens: 120,
      retrievalTopK: 8,
      maxChunksPerEntry: 12,
    },
  }
  const DEFAULT_WORLD_BOOK_VECTOR_SETTINGS: WorldBookVectorSettings = {
    presetMode: 'balanced',
    ...WORLD_BOOK_VECTOR_PRESETS.balanced,
  }

  const normalizeWorldBookVectorSettings = (
    value: unknown,
    retrievalFallback: number,
  ): WorldBookVectorSettings => {
    const raw = (value && typeof value === 'object') ? value as Partial<WorldBookVectorSettings> : {}
    const base = {
      ...DEFAULT_WORLD_BOOK_VECTOR_SETTINGS,
      retrievalTopK: retrievalFallback,
    }
    const presetMode: WorldBookVectorPresetMode = raw.presetMode === 'lean' || raw.presetMode === 'balanced' || raw.presetMode === 'deep' || raw.presetMode === 'custom'
      ? raw.presetMode
      : base.presetMode
    const preset = presetMode === 'custom' ? null : WORLD_BOOK_VECTOR_PRESETS[presetMode]
    const target = Math.min(2000, Math.max(120, Math.floor((raw.chunkTargetTokens ?? preset?.chunkTargetTokens ?? base.chunkTargetTokens))))
    const max = Math.min(4000, Math.max(target, Math.floor((raw.chunkMaxTokens ?? preset?.chunkMaxTokens ?? base.chunkMaxTokens))))
    return {
      presetMode,
      chunkTargetTokens: target,
      chunkMaxTokens: max,
      chunkOverlapTokens: Math.min(500, Math.max(0, Math.floor((raw.chunkOverlapTokens ?? preset?.chunkOverlapTokens ?? base.chunkOverlapTokens)))),
      retrievalTopK: Math.max(1, Math.floor((raw.retrievalTopK ?? preset?.retrievalTopK ?? base.retrievalTopK))),
      maxChunksPerEntry: Math.min(24, Math.max(1, Math.floor((raw.maxChunksPerEntry ?? preset?.maxChunksPerEntry ?? base.maxChunksPerEntry)))),
    }
  }

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [cfg, setCfg] = useState<EmbeddingConfig | null>(null)
  const [worldBookSettings, setWorldBookSettings] = useState<WorldBookVectorSettings>(DEFAULT_WORLD_BOOK_VECTOR_SETTINGS)
  const [worldBookSettingsLoading, setWorldBookSettingsLoading] = useState(true)
  const [worldBookSettingsStatus, setWorldBookSettingsStatus] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const worldBookSettingsLoadedRef = useRef(false)
  const worldBookSettingsDirtyRef = useRef(false)
  const worldBookSettingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await embeddingsApi.getConfig()
      setCfg(next)
      setApiKey('')
    } catch (err: any) {
      setError(err?.body?.error || err?.message || t('embeddings.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    let cancelled = false
    setWorldBookSettingsLoading(true)
    settingsApi.get('worldBookVectorSettings')
      .then((row) => {
        if (cancelled) return
        setWorldBookSettings(normalizeWorldBookVectorSettings(row.value, cfg?.retrieval_top_k ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.retrievalTopK))
        worldBookSettingsLoadedRef.current = true
      })
      .catch(() => {
        if (cancelled) return
        setWorldBookSettings(normalizeWorldBookVectorSettings(null, cfg?.retrieval_top_k ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.retrievalTopK))
        worldBookSettingsLoadedRef.current = true
      })
      .finally(() => {
        if (!cancelled) setWorldBookSettingsLoading(false)
      })
    return () => { cancelled = true }
  }, [cfg?.retrieval_top_k])

  useEffect(() => () => {
    if (worldBookSettingsSaveTimerRef.current) clearTimeout(worldBookSettingsSaveTimerRef.current)
  }, [])

  useEffect(() => {
    if (!worldBookSettingsLoadedRef.current || !worldBookSettingsDirtyRef.current) return
    if (worldBookSettingsSaveTimerRef.current) clearTimeout(worldBookSettingsSaveTimerRef.current)
    setWorldBookSettingsStatus(t('embeddings.worldBookSaving'))
    worldBookSettingsSaveTimerRef.current = setTimeout(async () => {
      try {
        await settingsApi.put('worldBookVectorSettings', worldBookSettings)
        worldBookSettingsDirtyRef.current = false
        setWorldBookSettingsStatus(t('embeddings.worldBookSaved'))
      } catch (err: any) {
        setWorldBookSettingsStatus(err?.body?.error || err?.message || t('embeddings.worldBookSaveFailed'))
      }
    }, 400)
    return () => {
      if (worldBookSettingsSaveTimerRef.current) clearTimeout(worldBookSettingsSaveTimerRef.current)
    }
  }, [worldBookSettings, t])

  useEffect(() => {
    setModels([])
    setModelLabels({})
  }, [cfg?.provider, cfg?.api_url])

  const PROVIDER_DEFAULTS: Record<string, { api_url: string }> = {
    'openai-compatible': { api_url: 'https://api.openai.com/v1/embeddings' },
    openai: { api_url: 'https://api.openai.com/v1/embeddings' },
    openrouter: { api_url: 'https://openrouter.ai/api/v1/embeddings' },
    electronhub: { api_url: 'https://api.electronhub.top/v1/embeddings' },
    bananabread: { api_url: 'http://localhost:8008/v1/embeddings' },
    nanogpt: { api_url: 'https://nano-gpt.com/api/v1/embeddings' },
  }

  const providerAllowsCustomApiUrl = (provider: EmbeddingConfig['provider']) => {
    return provider === 'openai-compatible' || provider === 'bananabread'
  }

  const update = (patch: Partial<EmbeddingConfig>) => {
    setCfg((current) => {
      if (!current) return current
      let nextPatch = patch
      // When provider changes, auto-fill URL with provider default.
      if (nextPatch.provider && nextPatch.provider !== current.provider) {
        const defaults = PROVIDER_DEFAULTS[nextPatch.provider]
        if (defaults) {
          nextPatch = { ...nextPatch, api_url: defaults.api_url }
        }
      }
      return { ...current, ...nextPatch }
    })
  }

  const updateWorldBookSettings = (patch: Partial<WorldBookVectorSettings>) => {
    worldBookSettingsDirtyRef.current = true
    setWorldBookSettings((current) => normalizeWorldBookVectorSettings({
      ...current,
      ...(patch.presetMode ? {} : { presetMode: 'custom' as const }),
      ...patch,
    }, cfg?.retrieval_top_k ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.retrievalTopK))
  }

  const applyWorldBookPreset = (presetMode: WorldBookVectorPresetMode) => {
    worldBookSettingsDirtyRef.current = true
    setWorldBookSettings((current) => normalizeWorldBookVectorSettings(
      presetMode === 'custom'
        ? { ...current, presetMode }
        : { ...current, ...WORLD_BOOK_VECTOR_PRESETS[presetMode], presetMode },
      cfg?.retrieval_top_k ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.retrievalTopK,
    ))
  }

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const saved = await embeddingsApi.updateConfig({
        enabled: cfg.enabled,
        provider: cfg.provider,
        api_url: cfg.api_url,
        model: cfg.model,
        dimensions: cfg.dimensions,
        retrieval_top_k: worldBookSettings.retrievalTopK,
        hybrid_weight_mode: cfg.hybrid_weight_mode,
        preferred_context_size: cfg.preferred_context_size,
        batch_size: cfg.batch_size,
        similarity_threshold: cfg.similarity_threshold,
        rerank_cutoff: cfg.rerank_cutoff,
        vectorize_world_books: cfg.vectorize_world_books,
        vectorize_chat_messages: cfg.vectorize_chat_messages,
        vectorize_chat_documents: cfg.vectorize_chat_documents,
        chat_memory_mode: cfg.chat_memory_mode,
        request_timeout: cfg.request_timeout,
        api_key: apiKey.trim() ? apiKey.trim() : undefined,
      })
      setCfg(saved)
      setApiKey('')
      setSuccess(t('embeddings.saveSuccess'))
    } catch (err: any) {
      setError(err?.body?.error || err?.message || t('embeddings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await embeddingsApi.testConfig('Lumiverse vector test')
      setCfg((current) => current
        ? {
            ...current,
            dimensions: result.applied_dimensions,
            has_api_key: result.config.has_api_key,
            inherited: result.config.inherited,
          }
        : result.config)
      setSuccess(t('embeddings.testSuccess', { dims: result.applied_dimensions }))
    } catch (err: any) {
      setError(err?.body?.error || err?.message || t('embeddings.testFailed'))
    } finally {
      setTesting(false)
    }
  }

  const fetchModels = async () => {
    if (!cfg) return
    setModelsLoading(true)
    try {
      const result = await embeddingsApi.previewModels({
        provider: cfg.provider,
        api_url: cfg.api_url || undefined,
        api_key: apiKey.trim() || undefined,
      })
      setModels(result.models || [])
      setModelLabels(result.model_labels || {})
    } catch {
      setModels([])
      setModelLabels({})
    } finally {
      setModelsLoading(false)
    }
  }

  if (loading || !cfg) {
    return (
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>{t('embeddings.title')}</h3>
        <p className={styles.placeholder}>{t('embeddings.loading')}</p>
      </div>
    )
  }

  const setupChecklist = [
    {
      label: t('embeddings.checkEnabled'),
      description: t('embeddings.checkEnabledDesc'),
      complete: cfg.enabled,
    },
    {
      label: t('embeddings.checkApiKey'),
      description: t('embeddings.checkApiKeyDesc'),
      complete: cfg.has_api_key,
    },
    {
      label: t('embeddings.checkDimensions'),
      description: t('embeddings.checkDimensionsDesc'),
      complete: !!cfg.dimensions,
    },
    {
      label: t('embeddings.checkWorldBook'),
      description: t('embeddings.checkWorldBookDesc'),
      complete: cfg.vectorize_world_books,
    },
  ]
  const completedChecklistCount = setupChecklist.filter((item) => item.complete).length
  const checklistPercent = Math.round((completedChecklistCount / setupChecklist.length) * 100)
  const checklistReady = completedChecklistCount === setupChecklist.length

  const inherited = !!cfg.inherited
  const canEditApiUrl = providerAllowsCustomApiUrl(cfg.provider)
  const defaultApiUrl = PROVIDER_DEFAULTS[cfg.provider]?.api_url || cfg.api_url
  const worldBookPresetDescriptions: Record<WorldBookVectorPresetMode, string> = {
    lean: t('embeddings.presetLeanDesc'),
    balanced: t('embeddings.presetBalancedDesc'),
    deep: t('embeddings.presetDeepDesc'),
    custom: t('embeddings.presetCustomDesc'),
  }
  const worldBookPresetLabels: Record<WorldBookVectorPresetMode, string> = {
    lean: t('embeddings.presetLean'),
    balanced: t('embeddings.presetBalanced'),
    deep: t('embeddings.presetDeep'),
    custom: t('embeddings.presetCustom'),
  }

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('embeddings.title')}</h3>
      <p className={styles.placeholder}>{t('embeddings.helper')}</p>

      {inherited && (
        <p className={styles.placeholder} style={{ fontStyle: 'normal', padding: '8px 12px', border: '1px solid var(--lumiverse-border-subtle)', borderRadius: 6, background: 'var(--lumiverse-surface-raised)' }}>
          {t('embeddings.inheritedNotice')}
        </p>
      )}

      {error && <p className={styles.errorText}>{error}</p>}
      {success && <p className={styles.successText}>{success}</p>}

      <div className={styles.embeddingChecklist}>
        <div className={styles.embeddingChecklistHeader}>
          <div className={styles.embeddingChecklistHeaderCopy}>
            <div className={styles.embeddingChecklistEyebrow}>{t('embeddings.readiness')}</div>
            <div className={styles.embeddingChecklistTitle}>{t('embeddings.setupTitle')}</div>
            <div className={styles.embeddingChecklistSubtitle}>
              {checklistReady
                ? t('embeddings.setupReady')
                : t('embeddings.setupProgress', { done: completedChecklistCount, total: setupChecklist.length })}
            </div>
          </div>
          <div className={styles.embeddingChecklistScore}>
            <span className={styles.embeddingChecklistScoreValue}>
              {completedChecklistCount}/{setupChecklist.length}
            </span>
            <span className={styles.embeddingChecklistScoreLabel}>
              {checklistReady ? t('embeddings.ready') : t('embeddings.inProgress')}
            </span>
          </div>
        </div>
        <div className={styles.embeddingChecklistProgress}>
          <span
            className={styles.embeddingChecklistProgressFill}
            style={{ width: `${checklistPercent}%` }}
          />
        </div>
        <div className={styles.embeddingChecklistItems}>
          {setupChecklist.map((item, index) => (
            <div
              key={item.label}
              className={clsx(
                styles.embeddingChecklistItem,
                item.complete && styles.embeddingChecklistItemComplete,
              )}
            >
              <span className={styles.embeddingChecklistStep}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className={styles.embeddingChecklistItemBody}>
                <div className={styles.embeddingChecklistItemTop}>
                  <span className={styles.embeddingChecklistItemLabel}>{item.label}</span>
                  <span className={item.complete ? styles.embeddingChecklistDone : styles.embeddingChecklistTodo}>
                    {item.complete ? t('embeddings.ready') : t('embeddings.needsAttention')}
                  </span>
                </div>
                <span className={styles.embeddingChecklistItemDescription}>
                  {item.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.subsectionTitle}>{t('embeddings.connection')}</div>
            <div className={styles.settingsCardTitle}>{t('embeddings.providerModel')}</div>
          </div>
        </div>
        <div className={styles.settingsCardBody}>
          <Toggle.Checkbox
            checked={cfg.enabled}
            onChange={(checked) => update({ enabled: checked })}
            label={t('embeddings.enable')}
          />

          <div className={styles.settingsGridTwo}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.provider')}</label>
              <select className={styles.select} value={cfg.provider} onChange={(e) => update({ provider: e.target.value as EmbeddingConfig['provider'] })} disabled={inherited}>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="electronhub">ElectronHub</option>
                <option value="bananabread">BananaBread</option>
                <option value="nanogpt">Nano-GPT</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.model')}</label>
              <ModelCombobox
                value={cfg.model}
                onChange={(value) => update({ model: value })}
                models={models}
                modelLabels={modelLabels}
                loading={modelsLoading}
                onRefresh={fetchModels}
                autoRefreshOnFocus
                refreshKey={`${cfg.provider}:${cfg.api_url}`}
                placeholder={t('embeddings.modelPlaceholder')}
                emptyMessage={t('embeddings.noModels')}
                browseHint={t('embeddings.browseHint')}
                disabled={inherited}
              />
            </div>
          </div>

          {canEditApiUrl ? (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.apiUrl')}</label>
              <input className={styles.select} value={cfg.api_url} onChange={(e) => update({ api_url: e.target.value })} disabled={inherited} />
              <span className={styles.helperText}>
                {t('embeddings.apiUrlPathHint')}
              </span>
              {cfg.provider === 'bananabread' && (
                <span className={styles.helperText}>
                  {t('embeddings.bananabreadHint')}
                </span>
              )}
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.apiEndpoint')}</label>
              <span className={styles.helperText}>{t('embeddings.apiEndpointDefault', { url: defaultApiUrl })}</span>
            </div>
          )}

          <div className={styles.settingsGridTwo}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.dimensionsOptional')}</label>
              <NumericInput
                className={styles.numberInput}
                min={1}
                value={cfg.dimensions ?? null}
                integer
                allowEmpty
                onChange={(value) => update({ dimensions: value })}
              />
            </div>

            {!inherited && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  {cfg.has_api_key ? t('embeddings.apiKeyConfigured') : t('embeddings.apiKeyNotConfigured')}
                </label>
                <input
                  className={styles.select}
                  type="password"
                  value={apiKey}
                  placeholder={t('embeddings.apiKeyPlaceholder')}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            )}
          </div>

          <Toggle.Checkbox
            checked={cfg.send_dimensions ?? false}
            onChange={(checked) => update({ send_dimensions: checked })}
            label={t('embeddings.sendDimensions')}
            hint={t('embeddings.sendDimensionsHint')}
          />
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.subsectionTitle}>{t('embeddings.worldBooksEyebrow')}</div>
            <div className={styles.settingsCardTitle}>{t('embeddings.worldBooksCardTitle')}</div>
            <div className={styles.settingsCardMeta}>{t('embeddings.worldBooksCardMeta')}</div>
          </div>
          <span className={styles.settingsCardStatus}>
            {worldBookSettingsLoading ? t('embeddings.loadingShort') : worldBookSettingsStatus ?? t('embeddings.ready')}
          </span>
        </div>
        <div className={styles.settingsCardBody}>
          <Toggle.Checkbox
            checked={cfg.vectorize_world_books}
            onChange={(checked) => update({ vectorize_world_books: checked })}
            label={t('embeddings.vectorizeWorldBooks')}
          />

          <div className={styles.presetRow}>
            {(['lean', 'balanced', 'deep', 'custom'] as WorldBookVectorPresetMode[]).map((preset) => (
              <button
                key={preset}
                type="button"
                className={clsx(styles.presetBtn, worldBookSettings.presetMode === preset && styles.presetBtnActive)}
                onClick={() => applyWorldBookPreset(preset)}
              >
                {worldBookPresetLabels[preset]}
              </button>
            ))}
          </div>
          <span className={styles.helperText}>
            {worldBookPresetDescriptions[worldBookSettings.presetMode]}
            {worldBookSettings.presetMode !== 'custom' ? t('embeddings.presetEditSwitch') : ''}
          </span>

          <div className={styles.settingsGridCompact}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.retrievedEntries')}</label>
              <NumericInput
                className={styles.numberInput}
                min={1}
                value={worldBookSettings.retrievalTopK}
                disabled={worldBookSettingsLoading}
                integer
                onChange={(value) => updateWorldBookSettings({ retrievalTopK: value ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.retrievalTopK })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.chunkTargetTokens')}</label>
              <NumericInput
                className={styles.numberInput}
                min={120}
                max={2000}
                value={worldBookSettings.chunkTargetTokens}
                disabled={worldBookSettingsLoading}
                integer
                onChange={(value) => updateWorldBookSettings({ chunkTargetTokens: value ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.chunkTargetTokens })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.chunkMaxTokens')}</label>
              <NumericInput
                className={styles.numberInput}
                min={120}
                max={4000}
                value={worldBookSettings.chunkMaxTokens}
                disabled={worldBookSettingsLoading}
                integer
                onChange={(value) => updateWorldBookSettings({ chunkMaxTokens: value ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.chunkMaxTokens })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.chunkOverlapTokens')}</label>
              <NumericInput
                className={styles.numberInput}
                min={0}
                max={500}
                value={worldBookSettings.chunkOverlapTokens}
                disabled={worldBookSettingsLoading}
                integer
                onChange={(value) => updateWorldBookSettings({ chunkOverlapTokens: value ?? 0 })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.storedChunksPerEntry')}</label>
              <NumericInput
                className={styles.numberInput}
                min={1}
                max={24}
                value={worldBookSettings.maxChunksPerEntry}
                disabled={worldBookSettingsLoading}
                integer
                onChange={(value) => updateWorldBookSettings({ maxChunksPerEntry: value ?? DEFAULT_WORLD_BOOK_VECTOR_SETTINGS.maxChunksPerEntry })}
              />
            </div>
          </div>

          <div className={styles.settingsGridTwo}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.hybridWeightMode')}</label>
              <select
                className={styles.select}
                value={cfg.hybrid_weight_mode}
                onChange={(e) => update({ hybrid_weight_mode: e.target.value as EmbeddingConfig['hybrid_weight_mode'] })}
              >
                <option value="keyword_first">{t('embeddings.keywordFirst')}</option>
                <option value="balanced">{t('embeddings.hybridBalanced')}</option>
                <option value="vector_first">{t('embeddings.vectorFirst')}</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.similarityThreshold')}</label>
              <NumericInput
                className={styles.numberInput}
                min={0}
                max={2}
                step={0.05}
                value={cfg.similarity_threshold}
                onChange={(value) => update({ similarity_threshold: Math.max(0, Math.min(2, value ?? 0)) })}
              />
              <span className={styles.helperText}>{t('embeddings.similarityThresholdHint')}</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('embeddings.worldBookRerankCutoff')}</label>
            <NumericInput
              className={styles.numberInput}
              min={0}
              max={2}
              step={0.01}
              value={cfg.rerank_cutoff}
              onChange={(value) => update({ rerank_cutoff: Math.max(0, Math.min(2, value ?? 0)) })}
            />
            <span className={styles.helperText}>{t('embeddings.rerankCutoffHint')}</span>
          </div>
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <div className={styles.subsectionTitle}>{t('embeddings.runtimeEyebrow')}</div>
            <div className={styles.settingsCardTitle}>{t('embeddings.runtimeTitle')}</div>
          </div>
        </div>
        <div className={styles.settingsCardBody}>
          <div className={styles.settingsGridTwo}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.embeddingBatchSize')}</label>
              <NumericInput
                className={styles.numberInput}
                min={1}
                max={200}
                value={cfg.batch_size}
                integer
                onChange={(value) => update({ batch_size: Math.max(1, Math.min(200, value ?? 50)) })}
              />
              <span className={styles.helperText}>{t('embeddings.batchSizeHint')}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('embeddings.requestTimeoutSec')}</label>
              <NumericInput
                className={styles.numberInput}
                min={0}
                max={300}
                step={5}
                value={cfg.request_timeout ?? 60}
                integer
                onChange={(value) => update({ request_timeout: Math.max(0, Math.min(300, value ?? 60)) })}
              />
              <span className={styles.helperText}>{t('embeddings.requestTimeoutHint')}</span>
            </div>
          </div>

          <Toggle.Checkbox
            checked={cfg.vectorize_chat_documents}
            onChange={(checked) => update({ vectorize_chat_documents: checked })}
            label={t('embeddings.vectorizeChatDocuments')}
          />

          <Toggle.Checkbox
            checked={cfg.vectorize_chat_messages}
            onChange={(checked) => update({ vectorize_chat_messages: checked })}
            label={t('embeddings.vectorizeChatMessages')}
          />

          {cfg.vectorize_chat_messages && (
            <div className={styles.settingsGridTwo}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('embeddings.preferredContextSize')}</label>
                <NumericInput
                  className={styles.numberInput}
                  min={1}
                  max={64}
                  value={cfg.preferred_context_size}
                  integer
                  onChange={(value) => update({ preferred_context_size: value ?? 1 })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('embeddings.memoryRetrievalMode')}</label>
                <select
                  className={styles.select}
                  value={cfg.chat_memory_mode}
                  onChange={(e) => update({ chat_memory_mode: e.target.value as EmbeddingConfig['chat_memory_mode'] })}
                >
                  <option value="conservative">{t('embeddings.memoryModeConservative')}</option>
                  <option value="balanced">{t('embeddings.memoryModeBalanced')}</option>
                  <option value="aggressive">{t('embeddings.memoryModeAggressive')}</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.drawerRow}>
        <Button size="sm" onClick={save} disabled={saving || inherited} loading={saving}>
          {saving ? t('embeddings.saving') : t('embeddings.saveSettings')}
        </Button>
        <Button size="sm" onClick={test} disabled={testing || saving} loading={testing}>
          {testing ? t('embeddings.testing') : t('embeddings.testApi')}
        </Button>
      </div>
      <p className={styles.placeholder}>
        {inherited ? t('embeddings.testInheritedHint') : t('embeddings.testHint')}
      </p>
    </div>
  )
}

interface WebSearchSettingsState {
  enabled: boolean
  provider: 'searxng'
  apiUrl: string
  requestTimeoutMs: number
  defaultResultCount: number
  maxResultCount: number
  maxPagesToScrape: number
  maxCharsPerPage: number
  language: string
  safeSearch: 0 | 1 | 2
  engines: string[]
  hasApiKey: boolean
}

const WEB_SEARCH_DEFAULTS: WebSearchSettingsState = {
  enabled: false,
  provider: 'searxng',
  apiUrl: '',
  requestTimeoutMs: 15000,
  defaultResultCount: 3,
  maxResultCount: 5,
  maxPagesToScrape: 3,
  maxCharsPerPage: 3000,
  language: 'all',
  safeSearch: 1,
  engines: [],
  hasApiKey: false,
}

function WebSearchSettings() {
  const { t } = useTranslation('settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [cfg, setCfg] = useState<WebSearchSettingsState>(WEB_SEARCH_DEFAULTS)
  const [apiKey, setApiKey] = useState('')
  const [testQuery, setTestQuery] = useState('latest AI roleplay tools')
  const [testResult, setTestResult] = useState<WebSearchTestResponse | null>(null)
  const [enginesInput, setEnginesInput] = useState('')

  useEffect(() => {
    webSearchApi.getSettings()
      .then((row) => {
        const next = { ...WEB_SEARCH_DEFAULTS, ...(row || {}) }
        setCfg(next)
        setEnginesInput(Array.isArray(next.engines) ? next.engines.join(', ') : '')
      })
      .catch(() => {
        setCfg(WEB_SEARCH_DEFAULTS)
      })
      .finally(() => setLoading(false))
  }, [])

  const update = (patch: Partial<WebSearchSettingsState>) => {
    setCfg((prev) => ({ ...prev, ...patch }))
  }

  const buildPayload = (): WebSearchSettingsInput => ({
    enabled: cfg.enabled,
    provider: 'searxng',
    apiUrl: cfg.apiUrl,
    requestTimeoutMs: cfg.requestTimeoutMs,
    defaultResultCount: cfg.defaultResultCount,
    maxResultCount: cfg.maxResultCount,
    maxPagesToScrape: cfg.maxPagesToScrape,
    maxCharsPerPage: cfg.maxCharsPerPage,
    language: cfg.language,
    safeSearch: cfg.safeSearch,
    engines: enginesInput.split(',').map((item) => item.trim()).filter(Boolean),
  })

  const save = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = buildPayload()
      const next = await webSearchApi.putSettings({
        ...payload,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      setCfg(next)
      setEnginesInput(next.engines.join(', '))
      setApiKey('')
      setSuccess(t('webSearch.saveSuccess'))
    } catch (err: any) {
      setError(err?.body?.error || err?.message || t('webSearch.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setError(null)
    setSuccess(null)
    setTestResult(null)
    try {
      const result = await webSearchApi.test(testQuery, buildPayload(), apiKey.trim() || undefined)
      setTestResult(result)
      setSuccess(t('webSearch.testSuccess', { results: result.results.length, pages: result.documents.length }))
    } catch (err: any) {
      setError(err?.body?.error || err?.message || t('webSearch.testFailed'))
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>{t('webSearch.title')}</h3>
        <p className={styles.placeholder}>{t('webSearch.loading')}</p>
      </div>
    )
  }

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('webSearch.title')}</h3>
      <p className={styles.placeholder}>{t('webSearch.helper')}</p>

      {error && <p className={styles.errorText}>{error}</p>}
      {success && <p className={styles.successText}>{success}</p>}

      <Toggle.Checkbox
        checked={cfg.enabled}
        onChange={(checked) => update({ enabled: checked })}
        label={t('webSearch.enable')}
      />

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('webSearch.provider')}</label>
        <select className={styles.select} value={cfg.provider} onChange={() => update({ provider: 'searxng' })}>
          <option value="searxng">{t('webSearch.providerSearxng')}</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('webSearch.apiUrl')}</label>
        <input className={styles.select} value={cfg.apiUrl} onChange={(e) => update({ apiUrl: e.target.value })} placeholder={t('webSearch.apiUrlPlaceholder')} />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('webSearch.apiKey')} {cfg.hasApiKey ? t('webSearch.apiKeyConfigured') : t('webSearch.apiKeyOptional')}</label>
        <input
          className={styles.select}
          type="password"
          value={apiKey}
          placeholder={t('webSearch.apiKeyPlaceholder')}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('webSearch.engines')}</label>
        <input className={styles.select} value={enginesInput} onChange={(e) => setEnginesInput(e.target.value)} placeholder={t('webSearch.enginesPlaceholder')} />
        <span className={styles.placeholder} style={{ marginTop: '2px', fontSize: 'calc(11px * var(--lumiverse-font-scale, 1))' }}>
          {t('webSearch.enginesHint')}
        </span>
      </div>

      <div className={styles.drawerRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.language')}</label>
          <input className={styles.select} value={cfg.language} onChange={(e) => update({ language: e.target.value })} placeholder={t('webSearch.languagePlaceholder')} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.safeSearch')}</label>
          <select className={styles.select} value={cfg.safeSearch} onChange={(e) => update({ safeSearch: Number(e.target.value) as 0 | 1 | 2 })}>
            <option value={0}>{t('webSearch.safeOff')}</option>
            <option value={1}>{t('webSearch.safeModerate')}</option>
            <option value={2}>{t('webSearch.safeStrict')}</option>
          </select>
        </div>
      </div>

      <div className={styles.drawerRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.timeout')}</label>
          <NumericInput className={styles.numberInput} min={5000} max={120000} step={1000} value={cfg.requestTimeoutMs} integer onChange={(value) => update({ requestTimeoutMs: Math.max(5000, Math.min(120000, value ?? 15000)) })} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.defaultResults')}</label>
          <NumericInput className={styles.numberInput} min={1} max={10} value={cfg.defaultResultCount} integer onChange={(value) => update({ defaultResultCount: Math.max(1, Math.min(10, value ?? 3)) })} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.maxResults')}</label>
          <NumericInput className={styles.numberInput} min={1} max={20} value={cfg.maxResultCount} integer onChange={(value) => update({ maxResultCount: Math.max(1, Math.min(20, value ?? 5)) })} />
        </div>
      </div>

      <div className={styles.drawerRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.pagesToScrape')}</label>
          <NumericInput className={styles.numberInput} min={1} max={10} value={cfg.maxPagesToScrape} integer onChange={(value) => update({ maxPagesToScrape: Math.max(1, Math.min(10, value ?? 3)) })} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.charsPerPage')}</label>
          <NumericInput className={styles.numberInput} min={500} max={20000} step={250} value={cfg.maxCharsPerPage} integer onChange={(value) => update({ maxCharsPerPage: Math.max(500, Math.min(20000, value ?? 3000)) })} />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t('webSearch.testQuery')}</label>
        <input className={styles.select} value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder={t('webSearch.testQueryPlaceholder')} />
      </div>

      <div className={styles.drawerRow}>
        <Button size="sm" onClick={save} disabled={saving} loading={saving}>
          {saving ? t('webSearch.saving') : t('webSearch.save')}
        </Button>
        <Button size="sm" onClick={test} disabled={testing || saving} loading={testing}>
          {testing ? t('webSearch.testing') : t('webSearch.test')}
        </Button>
      </div>

      <p className={styles.placeholder}>{t('webSearch.testFormHint')}</p>

      {testResult && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('webSearch.preview')}</label>
          <div className={styles.placeholder} style={{ whiteSpace: 'pre-wrap', padding: '10px 12px', border: '1px solid var(--lumiverse-border-subtle)', borderRadius: 8, background: 'var(--lumiverse-surface-raised)', maxHeight: 280, overflowY: 'auto' }}>
            {testResult.context}
          </div>
        </div>
      )}
    </div>
  )
}

function ImageOptimizationSettings() {
  const { t } = useTranslation('settings')
  const thumbnailSettings = useStore((s) => (s as any).thumbnailSettings as { smallSize?: number, largeSize?: number } | undefined)
  const setSetting = useStore((s) => s.setSetting)

  const smallSize = thumbnailSettings?.smallSize ?? 300
  const largeSize = thumbnailSettings?.largeSize ?? 700

  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildProgress, setRebuildProgress] = useState<{ current: number, total: number } | null>(null)
  const [rebuildStatus, setRebuildStatus] = useState<string | null>(null)

  const update = (patch: { smallSize?: number, largeSize?: number }) => {
    setSetting('thumbnailSettings', { smallSize, largeSize, ...patch })
  }

  const formatRebuildParts = (generated: number, skipped: number, failed: number) => {
    const parts: string[] = []
    if (generated > 0) parts.push(t('advanced.rebuildGenerated', { count: generated }))
    if (skipped > 0) parts.push(t('advanced.rebuildSkipped', { count: skipped }))
    if (failed > 0) parts.push(t('advanced.rebuildFailedCount', { count: failed }))
    return parts.join(', ')
  }

  const handleRebuild = async () => {
    if (rebuilding) return
    setRebuilding(true)
    setRebuildStatus(t('advanced.rebuildStarting'))
    setRebuildProgress(null)
    try {
      const result = await imagesApi.rebuildThumbnails({
        onProgress: (p) => {
          setRebuildProgress({ current: p.current, total: p.total })
          const parts = [`${p.current}/${p.total}`]
          if (p.generated > 0) parts.push(t('advanced.rebuildGenerated', { count: p.generated }))
          if (p.skipped > 0) parts.push(t('advanced.rebuildSkipped', { count: p.skipped }))
          if (p.failed > 0) parts.push(t('advanced.rebuildFailedCount', { count: p.failed }))
          setRebuildStatus(parts.join(' \u2022 '))
        },
      })
      setRebuildStatus(t('advanced.rebuildDone', {
        summary: formatRebuildParts(result.generated, result.skipped, result.failed),
      }))
    } catch (err: any) {
      setRebuildStatus(t('advanced.rebuildFailed', {
        error: err.message || t('advanced.rebuildUnknownError'),
      }))
    } finally {
      setRebuilding(false)
    }
  }

  const pct = rebuildProgress && rebuildProgress.total > 0
    ? Math.round((rebuildProgress.current / rebuildProgress.total) * 100)
    : 0

  return (
    <>
      <p className={styles.placeholder}>
        {t('advanced.imgOptHelper')}
      </p>

      <div className={styles.field}>
        <div className={styles.imgOptSliderHeader}>
          <label className={styles.fieldLabel}>{t('advanced.smallTier')}</label>
          <span className={styles.imgOptSliderValue}>{smallSize}px</span>
        </div>
        <input
          type="range"
          className={styles.imgOptSlider}
          min={100} max={500} step={50}
          value={smallSize}
          onChange={(e) => update({ smallSize: Number(e.target.value) })}
        />
        <span className={styles.placeholder} style={{ fontSize: 11 }}>
          {t('advanced.smallTierHint')}
        </span>
      </div>

      <div className={styles.field}>
        <div className={styles.imgOptSliderHeader}>
          <label className={styles.fieldLabel}>{t('advanced.largeTier')}</label>
          <span className={styles.imgOptSliderValue}>{largeSize}px</span>
        </div>
        <input
          type="range"
          className={styles.imgOptSlider}
          min={400} max={1200} step={50}
          value={largeSize}
          onChange={(e) => update({ largeSize: Number(e.target.value) })}
        />
        <span className={styles.placeholder} style={{ fontSize: 11 }}>
          {t('advanced.largeTierHint')}
        </span>
      </div>

      <div className={styles.imgOptRebuild}>
        <div className={styles.field} style={{ flex: 1 }}>
          <label className={styles.fieldLabel}>{t('advanced.rebuildCache')}</label>
          <span className={styles.placeholder} style={{ fontSize: 11 }}>
            {t('advanced.rebuildCacheHint')}
          </span>
        </div>
        <button
          type="button"
          className={clsx(styles.segmentedBtn, styles.segmentedBtnActive)}
          style={{ padding: '6px 16px', whiteSpace: 'nowrap' }}
          disabled={rebuilding}
          onClick={handleRebuild}
        >
          {rebuilding ? t('advanced.rebuilding') : t('advanced.rebuildThumbnails')}
        </button>
      </div>
      {rebuilding && rebuildProgress && rebuildProgress.total > 0 && (
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--lumiverse-fill-subtle)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--lumiverse-primary)', transition: 'width 0.2s ease' }} />
        </div>
      )}
      {rebuildStatus && (
        <span className={styles.placeholder} style={{ fontSize: 11 }}>
          {rebuildStatus}
        </span>
      )}
    </>
  )
}

function AdvancedSettings() {
  const { t } = useTranslation('settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [cfg, setCfg] = useState<ChatMemorySettings | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const settings = await embeddingsApi.getChatMemorySettings()
      setCfg(settings)
      // Mark as loaded so auto-save doesn't fire on initial load
      setTimeout(() => { loadedRef.current = true }, 50)
    } catch (err: any) {
      setError(err?.body?.error || err?.message || t('advanced.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const quickModePresets: Record<string, Pick<ChatMemorySettings, 'chunkTargetTokens' | 'chunkMaxTokens' | 'chunkOverlapTokens' | 'exclusionWindow'>> = {
    conservative: { chunkTargetTokens: 600, chunkMaxTokens: 1200, chunkOverlapTokens: 100, exclusionWindow: 30 },
    balanced: { chunkTargetTokens: 800, chunkMaxTokens: 1600, chunkOverlapTokens: 120, exclusionWindow: 20 },
    aggressive: { chunkTargetTokens: 1000, chunkMaxTokens: 2000, chunkOverlapTokens: 200, exclusionWindow: 15 },
  }

  const loadedRef = useRef(false)
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (patch: Partial<ChatMemorySettings>) => {
    if (!cfg) return
    const next = { ...cfg, ...patch }
    // When switching to a quick mode, overlay its preset values so the UI reflects them
    if (patch.quickMode && patch.quickMode in quickModePresets) {
      Object.assign(next, quickModePresets[patch.quickMode])
    }
    dirtyRef.current = true
    setCfg(next)
  }

  // Auto-save on change with debounce
  useEffect(() => {
    if (!cfg || !loadedRef.current || !dirtyRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      dirtyRef.current = false
      setSaving(true)
      setError(null)
      try {
        await embeddingsApi.updateChatMemorySettings(cfg)
        setSuccess(t('advanced.saveSuccess'))
        setTimeout(() => setSuccess(null), 1500)
      } catch (err: any) {
        setError(err?.body?.error || err?.message || t('advanced.saveFailed'))
      } finally {
        setSaving(false)
      }
    }, 600)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [cfg])

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('advanced.title')}</h3>

      {/* Image Optimization accordion */}
      <CollapsibleSection title={t('advanced.imageOptimization')} defaultExpanded={false}>
        <ImageOptimizationSettings />
      </CollapsibleSection>

      {/* Long-Term Memory accordion */}
      <CollapsibleSection title={t('advanced.longTermMemory')} defaultExpanded>
        {loading || !cfg ? (
          <p className={styles.placeholder}>{t('advanced.loadingMemory')}</p>
        ) : (
          <>
            {error && <p className={styles.errorText}>{error}</p>}
            {success && <p className={styles.successText}>{success}</p>}

            <Toggle.Checkbox
              checked={cfg.autoWarmup}
              onChange={(checked) => update({ autoWarmup: checked })}
              label={t('advanced.warmup')}
              hint={t('advanced.warmupHint')}
            />

            {/* Quick Mode / Manual toggle */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('advanced.memoryMode')}</label>
              <div className={styles.segmented}>
                {(['conservative', 'balanced', 'aggressive', null] as const).map((mode) => (
                  <button
                    key={mode ?? 'manual'}
                    type="button"
                    className={clsx(styles.segmentedBtn, cfg.quickMode === mode && styles.segmentedBtnActive)}
                    onClick={() => update({ quickMode: mode })}
                  >
                    {mode === null ? t('advanced.manual') : t(`advanced.${mode}`)}
                  </button>
                ))}
              </div>
              <span className={styles.placeholder} style={{ marginTop: 2, fontSize: 11 }}>
                {t('advanced.memoryModeHint')}
              </span>
            </div>

            {/* Section: Chunking */}
            <CollapsibleSection title={t('advanced.chunking')} defaultExpanded={false}>
              <div className={styles.memoryGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.targetTokens')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={200} max={2000}
                    value={cfg.chunkTargetTokens}
                    disabled={cfg.quickMode !== null}
                    integer
                    onChange={(value) => update({ chunkTargetTokens: value ?? 800 })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.maxTokens')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={400} max={4000}
                    value={cfg.chunkMaxTokens}
                    disabled={cfg.quickMode !== null}
                    integer
                    onChange={(value) => update({ chunkMaxTokens: value ?? 1600 })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.overlapTokens')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={0} max={500}
                    value={cfg.chunkOverlapTokens}
                    disabled={cfg.quickMode !== null}
                    integer
                    onChange={(value) => update({ chunkOverlapTokens: value ?? 0 })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.maxMessagesChunk')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={0} max={100}
                    value={cfg.maxMessagesPerChunk}
                    integer
                    onChange={(value) => update({ maxMessagesPerChunk: value ?? 0 })}
                  />
                  <span className={styles.placeholder} style={{ fontSize: 11 }}>{t('advanced.unlimited')}</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.timeGapSplit')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={0} max={1440}
                    value={cfg.splitOnTimeGapMinutes}
                    integer
                    onChange={(value) => update({ splitOnTimeGapMinutes: value ?? 0 })}
                  />
                  <span className={styles.placeholder} style={{ fontSize: 11 }}>{t('advanced.disabled')}</span>
                </div>
              </div>

              <Toggle.Checkbox
                checked={cfg.splitOnSceneBreaks}
                onChange={(checked) => update({ splitOnSceneBreaks: checked })}
                label={t('advanced.splitSceneBreaks')}
              />
            </CollapsibleSection>

            {/* Section: Retrieval */}
            <CollapsibleSection title={t('advanced.retrieval')} defaultExpanded={false}>
              <div className={styles.memoryGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.topK')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={1}
                    value={cfg.retrievalTopK}
                    integer
                    onChange={(value) => update({ retrievalTopK: value ?? 4 })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.exclusionWindow')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={5} max={50}
                    value={cfg.exclusionWindow}
                    disabled={cfg.quickMode !== null}
                    integer
                    onChange={(value) => update({ exclusionWindow: value ?? 20 })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.similarityThreshold')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={0} max={2} step={0.05}
                    value={cfg.similarityThreshold}
                    onChange={(value) => update({ similarityThreshold: Math.max(0, Math.min(2, value ?? 0)) })}
                  />
                  <span className={styles.placeholder} style={{ fontSize: 11 }}>
                    {t('advanced.similarityHint')}
                  </span>
                </div>
              </div>
            </CollapsibleSection>

            {/* Section: Query */}
            <CollapsibleSection title={t('advanced.querySection')} defaultExpanded={false}>
              <div className={styles.memoryGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.queryStrategy')}</label>
                  <select
                    className={styles.select}
                    value={cfg.queryStrategy}
                    onChange={(e) => update({ queryStrategy: e.target.value as ChatMemorySettings['queryStrategy'] })}
                  >
                    <option value="recent_messages">{t('advanced.queryRecentMessages')}</option>
                    <option value="last_user_message">{t('advanced.queryLastUserMessage')}</option>
                    <option value="weighted_recent">{t('advanced.queryWeightedRecent')}</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.queryContextSize')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={1} max={64}
                    value={cfg.queryContextSize}
                    integer
                    onChange={(value) => update({ queryContextSize: value ?? 6 })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.queryMaxTokens')}</label>
                  <NumericInput
                    className={styles.numberInput}
                    min={1000} max={32000}
                    value={cfg.queryMaxTokens}
                    integer
                    onChange={(value) => update({ queryMaxTokens: value ?? 8000 })}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Section: Formatting */}
            <CollapsibleSection title={t('advanced.formattingSection')} defaultExpanded={false}>
              <span className={styles.placeholder} style={{ fontSize: 11, marginBottom: 4 }}>
                {t('advanced.formattingHelper', {
                  memories: '{{memories}}',
                  content: '{{content}}',
                  score: '{{score}}',
                  startIndex: '{{startIndex}}',
                  endIndex: '{{endIndex}}',
                })}
              </span>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('advanced.headerTemplate')}</label>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={cfg.memoryHeaderTemplate}
                  onChange={(e) => update({ memoryHeaderTemplate: e.target.value })}
                />
              </div>

              <div className={styles.drawerRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.chunkTemplate')}</label>
                  <input
                    className={styles.select}
                    value={cfg.chunkTemplate}
                    onChange={(e) => update({ chunkTemplate: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{t('advanced.chunkSeparator')}</label>
                  <input
                    className={styles.select}
                    value={cfg.chunkSeparator}
                    onChange={(e) => update({ chunkSeparator: e.target.value })}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {saving && <p className={styles.placeholder} style={{ marginTop: 8, fontSize: 11 }}>{t('advanced.saving')}</p>}
          </>
        )}
      </CollapsibleSection>
    </div>
  )
}

function LumiHubSettings() {
  const { t } = useTranslation('settings')
  const user = useStore((s) => s.user)
  const defaultInstanceName = user?.name ? `${user.name}'s Lumiverse` : t('lumihub.defaultInstance')
  const [lumihubUrl, setLumihubUrl] = useState('https://lumi.spot')
  const [instanceName, setInstanceName] = useState(defaultInstanceName)
  const [status, setStatus] = useState<{
    linked: boolean
    lumihub_url?: string
    instance_name?: string
    connected?: boolean
    last_connected_at?: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/v1/lumihub/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (data.lumihub_url) setLumihubUrl(data.lumihub_url)
        if (data.instance_name) setInstanceName(data.instance_name)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [])

  const handleLink = async () => {
    if (!lumihubUrl.trim()) {
      setError(t('lumihub.errUrl'))
      return
    }
    setError(null)
    setLinking(true)
    try {
      const res = await fetch('/api/v1/lumihub/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lumihub_url: lumihubUrl.trim(), instance_name: instanceName.trim() || t('lumihub.defaultInstance'), redirect_origin: window.location.origin }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as any).error || t('lumihub.errLinkFailed'))
        return
      }
      const data = await res.json() as { authorize_url: string }
      window.open(data.authorize_url, '_blank')
      // Poll for status change
      const poll = setInterval(async () => {
        const checkRes = await fetch('/api/v1/lumihub/status', { credentials: 'include' })
        if (checkRes.ok) {
          const checkData = await checkRes.json()
          if (checkData.linked) {
            clearInterval(poll)
            setStatus(checkData)
            setLinking(false)
          }
        }
      }, 2000)
      // Stop polling after 5 minutes
      setTimeout(() => { clearInterval(poll); setLinking(false) }, 5 * 60 * 1000)
    } catch (err: any) {
      setError(err.message || t('lumihub.errConnectFailed'))
      setLinking(false)
    }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await fetch('/api/v1/lumihub/unlink', { method: 'POST', credentials: 'include' })
      setStatus({ linked: false })
      setLumihubUrl('')
    } catch {
      setError(t('lumihub.errUnlinkFailed'))
    } finally {
      setUnlinking(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>{t('lumihub.title')}</h3>
        <span className={styles.helperText}>{t('lumihub.loading')}</span>
      </div>
    )
  }

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('lumihub.title')}</h3>
      <span className={styles.helperText}>
        {t('lumihub.helper')}
      </span>

      {status?.linked ? (
        <div className={styles.lumihubCard}>
          <div className={styles.lumihubStatusRow}>
            <span className={clsx(styles.lumihubDot, status.connected ? styles.lumihubDotOnline : styles.lumihubDotOffline)} />
            <span className={styles.lumihubStatusText}>
              {t('lumihub.statusLine', {
                status: status.connected ? t('lumihub.connected') : t('lumihub.disconnected'),
                name: status.instance_name,
              })}
            </span>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('lumihub.url')}</span>
            <span className={styles.lumihubMeta}>{status.lumihub_url}</span>
          </div>

          {status.last_connected_at && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('lumihub.lastConnected')}</span>
              <span className={styles.lumihubMeta}>
                {new Date(status.last_connected_at).toLocaleString()}
              </span>
            </div>
          )}

          <div className={styles.lumihubDisclosure}>
            <span className={styles.lumihubDisclosureTitle}>{t('lumihub.manifestTitle')}</span>
            <span className={styles.lumihubDisclosureText}>
              {t('lumihub.manifestText')}
            </span>
          </div>

          <Button
            variant="danger-ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={unlinking}
            loading={unlinking}
          >
            {unlinking ? t('lumihub.unlinking') : t('lumihub.unlink')}
          </Button>
        </div>
      ) : (
        <div className={styles.lumihubCard}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('lumihub.url')}</span>
            <input
              className={styles.lumihubInput}
              type="text"
              placeholder={t('lumihub.urlPlaceholder')}
              value={lumihubUrl}
              onChange={(e) => setLumihubUrl(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('lumihub.instanceName')}</span>
            <input
              className={styles.lumihubInput}
              type="text"
              placeholder={t('lumihub.instancePlaceholder')}
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
            <span className={styles.helperText}>
              {t('lumihub.instanceHint')}
            </span>
          </div>

          <button
            className={styles.lumihubPrimaryBtn}
            onClick={handleLink}
            disabled={linking}
          >
            {linking ? t('lumihub.waitingApproval') : t('lumihub.link')}
          </button>
        </div>
      )}

      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  )
}
