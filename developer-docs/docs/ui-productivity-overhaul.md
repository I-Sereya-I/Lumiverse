# UI Productivity Overhaul

This page is the maintenance manual for Lumiverse's host-integrated productivity
surfaces. The overhaul is a narrow patch stack over the existing frontend, not
a separate frontend fork and not a pure Spindle extension.

## Mandatory UI Change Gate

Before modifying any overhaul UI:

1. Inspect the matching PNG under
   `design-outputs/confirmed-designs/<subsystem>/`.
2. Read that subsystem's `DESIGN-DECISIONS.md`.
3. Keep both references available while editing.
4. Compare the result at the desktop and narrow viewports in the test spec.

Do not implement or correct these surfaces from memory or from the current UI
alone.

## Host Integration Boundaries

These features are host-owned because they depend on internal routes, stores,
layout reservation, editor state, or backend event payloads:

| Feature | Host dependency |
| --- | --- |
| Quick Toolbar | Drawer registry, settings hydration, and chat layout |
| Connections Picker | Active profile/model ownership and profile metadata |
| Lore Indicator | `WORLD_INFO_ACTIVATED` data and exact lorebook navigation |
| Portrait Dock | Character-image launch surfaces and desktop chat reflow |
| Homepage Character Library | Homepage route, summary API, and character editor |
| Character Tab display | Existing browser state, management actions, and pagination |
| Lorebook Editor variants | Existing editor state, tokenization, bulk APIs, and conflict handling |

Spindle extensions can add drawer tabs, input actions, float widgets, and dock
panels, but cannot replace these host contracts without brittle DOM
manipulation. Keep extension placements working beside the overhaul.

## Persistence Contract

The settings types, defaults, persistence keys, and merge behavior live in:

- `frontend/src/types/store.ts`
- `frontend/src/lib/uiProductivityDefaults.ts`
- `frontend/src/store/slices/settings.ts`

All seven keys are server-backed user settings in `DATA_KEYS`:

- `quickToolbarSettings`
- `connectionsPickerSettings`
- `loreIndicatorSettings`
- `homepageCharacterLibrarySettings`
- `characterTabDisplaySettings`
- `portraitDockSettings`
- `lorebookEditorSettings`

`mergeStoredSetting()` recursively merges plain objects with defaults. Arrays
replace the default array wholesale, so writers must persist complete arrays
for action order, visible metadata, profile tags, and lore-strip items.
Transient open, hover, search, drag, and resize-preview state must remain local.

### Shared Rectangle

`SurfaceRectPrefs` contains `x`, `y`, `width`, and `height`. Free-position
surfaces use `usePersistentRect` and `ResizablePanelFrame` to clamp saved
geometry to the viewport and commit geometry at the end of a drag or resize.

Reset only the relevant `rect` or `halfRect` when preserving all other settings
is desirable.

## Persisted Settings Reference

### `quickToolbarSettings`

| Field | Meaning | Default |
| --- | --- | --- |
| `enabled` | Shows the toolbar | `true` |
| `variant` | `v1-free`, `v2-settings-adjacent`, or `v3-adaptive` | `v1-free` |
| `visibleTabIds` | Drawer/system action IDs shown by the toolbar | profile, connections, council, lorebook, presets, settings |
| `iconOrder` | Complete deterministic action ordering | same as `visibleTabIds` |
| `iconSize` | V1/V3 icon size | `20` |
| `labelVisible` | Shows action labels where supported | `false` |
| `labelTextSize` | V1/V3 label size | `11` |
| `scale` | Overall free-toolbar scale | `1` |
| `orientation` | `horizontal` or `vertical` | `horizontal` |
| `rotationDeg` | Free-toolbar rotation | `0` |
| `opacity` | Free-toolbar opacity | `0.96` |
| `snapToEdge` | Snaps free placement to a viewport edge | `true` |
| `rect` | Saved V1/V3 position and size | `328,18,368,54` |
| `v2IconSize` | Anchored V2 icon size | `28` |
| `v2LabelTextSize` | Anchored V2 label size | `11` |

Action IDs must come from the same registry as the drawer. If upstream removes
all saved IDs, fall back to visible registry defaults and expose a reset path.
V2 stays adjacent to host settings/drawer controls and does not use arbitrary
free placement.

### `connectionsPickerSettings`

| Field | Meaning | Default |
| --- | --- | --- |
| `enabled` | Enables the picker feature | `true` |
| `variant` | `provider-tags`, `split`, or `full` | `provider-tags` |
| `launcherEnabled` | Shows the compact composer launcher | `true` |
| `launcherIconSize` | Composer launcher size | `28` |
| `rect` | Picker position and dimensions | `24,96,420,520` |
| `thumbnailSize` | Profile/model thumbnail size | `28` |
| `density` | `compact`, `balanced`, `spacious`, or `custom` | `compact` |
| `showFavorites` | Shows favorites section | `true` |
| `showRecent` | Shows recent section | `true` |
| `showSearch` | Shows picker search | `true` |
| `showModelMetadata` | Shows model/provider detail | `true` |
| `profileTags` | Complete tag catalog with stable ID, name, color, and order | `[]` |
| `visibleTagIds` | Currently selected provider/profile tag filters | `[]` |
| `favoriteProfileIds` | Stable profile IDs shown in Favorites | `[]` |
| `recentProfileIds` | Stable profile IDs ordered for Recent | `[]` |
| `sectionSpacing` | Spacing between picker sections | `10` |
| `columnWidths` | Named split/full column widths | profiles `180`, models `220` |

The tag catalog is settings-owned. Profile associations are separately stored
in `ConnectionProfile.metadata.tagIds`; updates must merge existing metadata.
Legacy `metadata.tags` values normalize into stable catalog IDs. Active profile
selection remains owned by `activeProfileId`, while the main model remains
owned by `ConnectionProfile.model`. Do not overwrite sidecar, expression, or
Weaver model bindings.

### `loreIndicatorSettings`

| Field | Meaning | Default |
| --- | --- | --- |
| `enabled` | Shows lore activation UI | `true` |
| `variant` | `v2-compact`, `v4-bottom-strip`, or `v5-command-palette` | `v2-compact` |
| `v2ActivationMode` | Opens V2 details on `hover` or `click` | `click` |
| `v5Keybind` | Editable/removable V5 shortcut string | `Ctrl+Shift+L` |
| `visibleMetadata` | Complete metadata field list | book, type, tokens, trigger |
| `iconSize` | Lore icon size | `16` |
| `textSize` | Lore text size | `12` |
| `entryTypeAppearance` | Color/icon for constant, keyword, and vector entries | amber pin, blue key, violet search |
| `v4Items` | Complete bottom-strip item visibility, removal, display mode, and order | six standard items |
| `v4Spacing` | Bottom-strip item spacing | `8` |

The UI consumes the latest `WORLD_INFO_ACTIVATED` payload. Preserve legacy
`source`, use `activationType` for Constant/Keyword/Vector, and display
`bookName` when available. First-trigger labels are valid only when backend
trace instrumentation supplies them; never infer them from final sorted order.
Entry navigation must reuse pending world-book/editor state.

### Character display settings

The homepage and Character Tab share this base:

| Field | Meaning | Default |
| --- | --- | --- |
| `thumbnailWidth` | Independent image/card width | `170` |
| `thumbnailHeight` | Independent image height | `226` |
| `density` | `compact`, `balanced`, `large`, or `custom` | `compact` |
| `footerMode` | `compact`, `balanced`, or `spacious` | `balanced` |
| `visibleMetadata` | Complete footer metadata list | creator, tags |
| `tagRows` | Visible tag rows before `+N` overflow | `1` |
| `viewMode` | `grid`, `single`, or `list` | `grid` |
| `defaultSort` | name, recent, created, or shuffle | `recent` |
| `defaultFilter` | characters, favorites, or groups | characters |

`characterDisplaySettings.ts` clamps dimensions, normalizes invalid values, and
coerces the unsupported groups-plus-shuffle combination to recent sorting.

`homepageCharacterLibrarySettings` adds:

| Field | Meaning | Default |
| --- | --- | --- |
| `enabled` | Shows the homepage library | `true` |
| `panelWidth` | Selected-character panel width | `360` |
| `panelPinned` | Keeps the preview panel open | `true` |
| `lastSelectedCharacterId` | Restores the previous selection | `null` |

The homepage uses the lightweight summary hook and requests full preview data
only for the selected character. The internal library scope `mine` must never
render as `Mine`, `My Characters`, a tag, or a creator fallback.

`characterTabDisplaySettings` adds `useHomepageSettings`, default `true`. When
false, the Character Tab uses its own copy of the base display fields while
preserving search, tags, favorites, sorting, pagination, import, create, edit,
duplicate, and delete behavior.

### `portraitDockSettings`

| Field | Meaning | Default |
| --- | --- | --- |
| `enabled` | Enables character-image docking | `true` |
| `openAtOriginalSize` | Starts at natural dimensions when space permits | `true` |
| `rememberSizePosition` | Reuses saved geometry | `true` |
| `defaultDockSide` | Initial `left` or `right` edge | `right` |
| `snapToEdge` | Snaps floating geometry to an edge | `true` |
| `hoverControls` | Shows fit/close controls on hover | `true` |
| `hoverControlSize` | Hover control size | `28` |
| `defaultAspectRatioLock` | Locks aspect ratio on initial open | `false` |
| `minWidth`, `minHeight` | Resize lower bounds | `180`, `180` |
| `maxWidth`, `maxHeight` | Resize upper bounds | `720`, `860` |
| `rect` | Saved floating/dock dimensions | `0,0,360,520` |
| `pinned` | Keeps the dock open across eligible navigation | `true` |
| `aspectRatioLocked` | Current aspect-ratio lock state | `false` |
| `dockSide` | Current `left`, `right`, or `floating` state | `right` |
| `open` | Restores whether the portrait dock is open | `false` |
| `lastPortrait` | Last portrait image URL and display name | `null` |

Desktop docking reserves layout space so chat and composer remain usable.
Narrow layouts use drawer/backdrop behavior and must not reserve desktop width.
Character-image launch surfaces open the dock by default; legacy floating
avatar behavior, if retained, must be an explicit action.

### `lorebookEditorSettings`

| Field | Meaning | Default |
| --- | --- | --- |
| `defaultVariant` | Opens `full` or `half` editor by default | `full` |
| `triggerDisplay` | Shows trigger types as `words` or `icons` | `words` |
| `halfButtonEnabled` | Shows the independent half-screen launch action | `true` |
| `loreIndicatorActionEnabled` | Allows launch from the Lore Indicator | `true` |
| `allowSimultaneousEditors` | Permits full and half editors together | `true` |
| `halfRect` | Half-screen editor geometry | `24,24,720,640` |
| `booksPaneWidth` | Lorebook list pane width | `220` |
| `entriesPaneWidth` | Entry list pane width | `320` |
| `inspectorPaneWidth` | Entry inspector pane width | `520` |
| `rowDensity` | `compact`, `balanced`, or `spacious` rows | `compact` |
| `visibleEntryMetadata` | Complete entry-row metadata list | type, priority, position, depth, enabled, tokens |

Automatic token counts use the selected profile model and existing tokenizer
endpoint, with `Math.ceil(content.length / 4)` only as a failure fallback.
Simultaneous editing requires monotonic revisions and stale-write conflicts;
second-resolution `updated_at` is not a valid concurrency token.

## Reset And Troubleshooting

Use the Productivity/Layout settings reset for the affected section when it is
available. For development or recovery against stored data:

1. Reset the relevant key to its constant in
   `frontend/src/lib/uiProductivityDefaults.ts`.
2. Reload the frontend.
3. For geometry-only failures, reset `rect` or `halfRect` and retain the rest.
4. If stale arrays hide all content, reset the complete array field rather than
   merging one element into it.

Common cases:

| Symptom | Recovery |
| --- | --- |
| Toolbar disappeared | Re-enable it, reset `visibleTabIds`/`iconOrder`, then reset `rect` |
| Picker is too large or off-screen | Reset `rect`, `sectionSpacing`, and `columnWidths` |
| Lore indicator is noisy | Use V2, disable metadata, or hide/remove V4 items |
| Portrait is off-screen | Reset `rect`, set `dockSide` to the preferred edge, then reload |
| Character cards are malformed | Reset thumbnail dimensions, density, footer, and metadata arrays |
| Lorebook panes collapse | Reset all three pane widths and `halfRect` |
| Old connection tags remain | Normalize metadata, then remove unknown IDs from complete `tagIds` arrays |

## Upgrade And Rebase Maintenance

Keep the overhaul as isolated components, typed settings, and small host hooks.
During an upstream rebase:

1. Recheck drawer action IDs before accepting toolbar conflicts.
2. Recheck settings hydration and `DATA_KEYS`.
3. Recheck composer, ChatView, homepage, Character Browser, and world-book
   editor mount points.
4. Recheck `WORLD_INFO_ACTIVATED` payload compatibility.
5. Recheck connection metadata merging and active profile/model ownership.
6. Recheck extension input actions and dock panels beside host surfaces.
7. Run the focused tests, typecheck/build, docs builds, and manual capture
   matrix before accepting the rebase.

Avoid generated CSS-module selectors and broad DOM surgery. A separate frontend
fork would duplicate routes, stores, websocket behavior, extension placements,
and API types, making upstream maintenance substantially more expensive.

## Known Limitations

- The persisted schema can exist before every settings control or surface is
  wired in an in-progress branch. Confirm component mounts before documenting a
  feature as released.
- Arrays replace defaults. Partial-array writes can unintentionally hide
  actions or metadata.
- The Lore Indicator cannot truthfully show first-trigger ordering without
  backend trace data.
- Profile tags are navigation metadata, not model capability tags.
- Homepage summary loading intentionally omits Character Tab import, batch, and
  pagination behavior.
- Desktop layout reservation does not apply to mobile portrait/editor drawers.
- Spindle can complement these surfaces but cannot own their internal settings,
  routes, or exact host layout.
- Visual acceptance requires the final screenshot comparison; functional
  presence alone is insufficient.

## Verification

Focused automated checks currently present:

```powershell
bun test tests/character-display-settings.test.ts
bun test tests/connections-picker.test.ts
```

Final source verification:

```powershell
bun --cwd frontend run typecheck
bun run build:frontend
```

Documentation verification:

```powershell
uvx zensical build --config-file developer-docs/zensical.toml
uvx zensical build --config-file user-docs/zensical.toml
```

Graphify refresh is deliberately final-only for this implementation effort.
Run `bun run graphify:refresh` after all source and documentation lanes have
finished, not during this documentation lane.

Manual QA must follow
`.omx/plans/test-spec-lumiverse-ui-productivity-overhaul.md`, including desktop
`1738x862`, narrow `390x844`, a second installed theme, increased font scale,
and every confirmed design state.
