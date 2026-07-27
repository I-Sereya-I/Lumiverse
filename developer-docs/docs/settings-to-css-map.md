# Settings to CSS Map

Use this page to edit persisted settings, theme tokens, custom CSS, component
overrides, and layout settings. Settings are not all owned by one slice, so
start with the workflow that matches the change.

## Settings Ownership

| Setting family | Primary owner | Persistence |
| --- | --- | --- |
| Theme, layout, drawers, wallpaper, custom CSS, component overrides, Spindle UI settings, voice settings | `frontend/src/store/slices/settings.ts` | debounced `settingsApi.putMany` through `DATA_KEYS` |
| Active chat | `frontend/src/store/slices/chat.ts` | direct `settingsApi.put("activeChatId")`; backend emits `CHAT_SWITCHED` |
| Character browser filters, favorites, view mode | `frontend/src/store/slices/characters.ts` | direct `settingsApi.put` |
| Persona active ID, bindings, filters, view mode | `frontend/src/store/slices/personas.ts` | direct `settingsApi.put` |
| Connection profile, reasoning settings, prompt bias | `frontend/src/store/slices/connections.ts` | direct `settingsApi.put` |
| Summarization | `frontend/src/store/slices/summary.ts` | direct `settingsApi.put("summarization")` |
| Expression display | `frontend/src/store/slices/expressions.ts` | direct `settingsApi.put("expressionDisplay")` |
| Image generation defaults | `frontend/src/store/slices/image-gen-connections.ts` and settings hydration backfill | direct `settingsApi.put("imageGeneration")` |
| Chat heads runtime position | `frontend/src/store/slices/chat-heads.ts` | localStorage |
| Hidden extension placements | `frontend/src/store/slices/spindle-placement.ts` | localStorage |
| Muted extension themes | `frontend/src/store/slices/spindle.ts` | localStorage |
| UI productivity surfaces | `frontend/src/store/slices/settings.ts`, `frontend/src/lib/uiProductivityDefaults.ts` | debounced `settingsApi.putMany` through `DATA_KEYS` |

Backend storage for settings is generic. `src/services/settings.service.ts`
stores opaque JSON by `(key, user_id)` and validates size. Add a backend
migration only when renaming/removing existing persisted keys or changing data
that existing users already have.

Additional families have dedicated services or panels rather than the main
settings slice: world-book vector settings, databank settings, Dream Weaver
generation parameters, web-search settings, embedding and chat-memory
configuration, and operator-only database, Sharp, and DNS settings. Locate the
owning route/service before assuming a key belongs in `DATA_KEYS`.

The seven productivity setting families and every nested field are documented
in [UI Productivity Overhaul](ui-productivity-overhaul.md#persisted-settings-reference).
Their arrays replace defaults wholesale; do not persist partial icon-order,
profile-tag, lore-strip, or visible-metadata arrays.

## Add Persisted Setting Workflow

Use this for a new user-editable host setting.

1. Add the type to `frontend/src/types/store.ts` or the closest domain type.
2. Add the default value in the owning store slice.
3. If `settings.ts` owns it, add the key to `DATA_KEYS` and call `persistKey`
   from a focused setter.
4. If a domain slice owns it, persist with `settingsApi.put` from that slice.
5. Hydrate through the owning path. `loadSettings` ignores keys outside
   `DATA_KEYS`, and bootstrap contains only an explicit subset.
6. Add UI in the closest panel: `SettingsModal`, `ThemePanel`,
   `WallpaperPanel`, `CustomCSSModal`, or a domain-specific panel.
   Settings tabs require metadata in `frontend/src/lib/settings-tab-registry.tsx`
   and rendering in the `SettingsView` switch. Account for role gates and
   command-palette registration. Theme is a drawer tab, not a settings tab.
7. Consume the setting near the behavior it controls. Avoid making components
   read unrelated slices just to avoid passing a prop.
8. If the setting affects CSS, route it through a variable or data attribute and
   document that variable here.
9. Verify persistence by changing the value, reloading, and checking both the
   UI and the backend settings row path.

Do not put transient open/hover/editing state into the server-backed settings
slice. Use component state or localStorage for local-only UI state.

## Theme Layer Order

Later layers win:

1. Static defaults from `frontend/src/theme/variables.css`.
2. User theme from `frontend/src/store/slices/settings.ts`.
3. Character-aware overlay from `frontend/src/hooks/useCharacterTheme.ts`.
4. Active extension theme overrides from `frontend/src/store/slices/spindle.ts`.
5. Late user CSS from `frontend/src/hooks/useCustomCSSApplicator.ts`.

`frontend/src/hooks/useThemeApplicator.ts` writes variables to
`document.documentElement`, sets `data-theme-mode`, toggles `data-glass`, and
updates scale-dependent shell height. Character-aware overlays are suppressed
when extension theme overrides are active. An extension override with at least
40 variables is treated as a full theme-sized override.

Full extension themes still layer over the user's generated base variables.
Selecting a preset clears extension theme overrides. Any active unmuted
extension override suppresses character-aware palette derivation.

## Edit Theme Token Workflow

1. Add or adjust the model in `frontend/src/types/theme.ts`.
2. Generate variables in `frontend/src/theme/engine.ts`.
3. Add defaults or presets in `frontend/src/theme/presets.ts`.
4. Expose controls in `frontend/src/components/panels/ThemePanel.tsx` when the
   setting should be user-editable.
5. Consume variables in CSS. Prefer semantic variables to raw colors.
6. Confirm light mode, dark mode, system mode, glass enabled/disabled,
   character-aware mode, and active extension overrides.

`ThemeConfig` currently includes `mode`, `accent`, `statusColors`,
`baseColors`, `baseColorsByMode`, `radiusScale`, `enableGlass`, `fontScale`,
`uiScale`, and `characterAware`.

## Edit Custom CSS Workflow

The custom CSS and component override path is intentionally constrained:

- `frontend/src/components/modals/CustomCSSModal.tsx` is the editing UI.
- `frontend/src/hooks/useCustomCSSApplicator.ts` injects global CSS and enabled
  component CSS overrides into `style#lumiverse-user-css`.
- `frontend/src/lib/cssValidator.ts` strips external imports, HTTP CSS URLs,
  and `javascript:` URLs.
- `frontend/src/lib/themeAssetCss.ts` rewrites `./assets/...` references to the
  theme-bundle asset API.
- `frontend/src/lib/cssModuleRegistry.ts` generates component override metadata
  from CSS modules and TSX files.
- `frontend/src/hooks/useComponentOverride.tsx` applies interpreted TSX
  overrides.
- TSX replacement is currently wired for `BubbleMessage` and `MinimalMessage`.

Enabled component CSS overrides are concatenated globally; they are not
automatically scoped. Prefer selectors based on `[data-component="Name"]`.
Imported theme-pack TSX overrides are disabled by default.

Relative and `data:` URLs can remain valid; theme bundle rewriting only targets
`./assets/...` and `assets/...`. TSX overrides also have source-length,
AST/render-budget, tag, prop, action, identifier, and property restrictions.
The component registry intentionally excludes sensitive auth, operator,
settings shell, modal shell, and editor infrastructure. Extension theme/style
control that changes host presentation requires `app_manipulation`.

## Layout Settings Map

| Setting | Consumer |
| --- | --- |
| `chatWidthMode`, `chatContentMaxWidth` | chat content width variables and chat layout |
| `modalWidthMode`, `modalMaxWidth` | root `--lumiverse-content-max-width` in `App.tsx` |
| `drawerSettings` | `ViewportDrawer.tsx`, drawer tab ordering and visibility |
| `bubbleUserAlign`, `bubbleUseFullAvatar`, `bubbleDisableHover`, `bubbleHideAvatarBg`, `bubbleOpacity`, `chatSheldDisplayMode` | chat message renderers and root data attributes |
| global `wallpaper`, `useCharacterBackground` | global/character chat background layers |
| per-chat wallpaper metadata | `WallpaperPanel`/`PortraitPanel` through `chatsApi.patchMetadata`; precedence is per-chat, then global, then character background |
| `portraitPanelSide` | portrait panel layout |
| `landingPageLayoutMode`, `landingPageChatsDisplayed` | landing page density |
| `viewMode`, `personaViewMode`, pagination settings | browser density and page size |
| `toastPosition` | toast container placement |
| `spindleSettings.dockPanelDesktopSide` | Spindle dock edge and app inset variables |
| `voiceSettings` | STT/TTS UI and speech behavior |
| `expressionDisplay` | floating expression layout through the expression slice |

Search the exact setting key before changing its shape; many settings have more
than one consumer.

### Component-scoped CSS variables

Step 8 of the Add Persisted Setting Workflow requires CSS-affecting settings to
name their variable here. These are *not* theme tokens: they are written at
runtime onto a single element and are deliberately absent from
`frontend/src/theme/variables.css` and `frontend/src/theme/engine.ts`, so every
reader must carry a fallback.

| Variable | Written by | Read by | Driving setting |
| --- | --- | --- | --- |
| `--lorebook-half-width` | inline on the host `<aside>`, `LorebookHalfScreenEditor.tsx:166` | `LorebookHalfScreenEditor.module.css:26`, `:29` | `lorebookEditorSettings.halfEditorWidth` via `resolveHalfEditorLayout` |
| `--lorebook-min-chat-width` | inline on the same element, `LorebookHalfScreenEditor.tsx:167` | `LorebookHalfScreenEditor.module.css:30` (the `max-width` clamp) | `lorebookEditorSettings.minChatWidth` |
| `--lcs-top-dock-height` | `useDockHeightVar` from `ChatView.tsx:975`, only in `strip` dock mode | `ChatView.module.css:147`, `:502` (notice-dock top offset) | `quickToolbarSettings` dock mode |
| `--lcs-lore-dock-height` | `useDockHeightVar` from `ChatView.tsx:1007`, only in `strip` dock mode | `ChatView.module.css:113` (folded into `--lcs-chat-bottom-inset`) | lore indicator variant |
| `--lumiverse-content-max-width` | `App.tsx:138-147` on `documentElement`; **removed** for the `full` mode | `SettingsModal.module.css:18`, `ExpandedTextEditor.module.css:29`, `AddGroupMemberModal.module.css:22`, plus `ModalShell maxWidth=` call sites | `modalWidthMode`, `modalMaxWidth` |
| `--lumiverse-chat-content-width` | inline on `.chatColumnInner`, `ChatView.tsx:402-405`; **not set** for the default full-width mode | `ChatView.module.css:95` | `chatWidthMode`, `chatContentMaxWidth` |

`--lumiverse-chat-content-width` also has a `:root` default of `none` in
`variables.css` so the token resolves; do not give it a length there or the
full-width chat mode is silently capped.

`HomepageCharacterLibrary.tsx:157-169` sets a further inline family —
`--homepage-panel-width`, `--homepage-panel-image-height`,
`--character-card-width`, `--character-image-height`, `--character-tag-lines`,
`--character-tags-max-height`, `--character-footer-max-height`,
`--character-grid-gap` — all derived from `homepageCharacterLibrarySettings`.

### Stacking ladder (`--z-*`)

A second token namespace lives in `frontend/src/theme/variables.css` alongside
the `--lumiverse-*` tokens. It is **not** part of `ThemeConfig`, the theme engine
never emits it, and `frontend/scripts/extract-css-vars.ts` does not scrape it
(that script matches `--lumiverse-*` only). Adding a `--z-*` token therefore
means editing `variables.css` and nothing else.

| Token | Value | Consumer |
| --- | --- | --- |
| `--z-chat-top-dock` | `8` | `ChatView.module.css:297` |
| `--z-chat-lore-dock` | `33` | `ChatView.module.css:125` |
| `--z-homepage-preview-panel` | `9990` | `HomepageCharacterLibrary.module.css:371` |
| `--z-connections-picker` | `9995` | `ConnectionsPicker.module.css:6` |
| `--z-quick-toolbar-floating` | `10005` | `QuickToolbar.module.css:19` |
| `--z-quick-toolbar-popover` | `10014` | `QuickToolbar.module.css:331` |

The two viewport-level rungs bracket `ViewportDrawer` (`9992`) deliberately: the
homepage preview is page furniture and must stay *under* a drawer the user opened
on top of it, while the connections picker is a draggable utility panel routinely
used *with* the drawer open, so it sits above — but below `SettingsModal`
(`10001`) and `ModalShell` (`10002`), which own the screen. `10012` is asserted
**forbidden** by `tests/lore-indicator.test.ts:361`; never pick it.

Every call site keeps a literal fallback, and `tests/quick-toolbar.test.ts` pins
both quick-toolbar declarations *including* the fallback — treat the fallback as
contract, not decoration. The remaining untokenised rungs are listed in the
comment at `variables.css:191-216`; migrate them as a set, not piecemeal.

### Formerly-undefined theme tokens

The tokens below were read across the app as `var(--lumiverse-x, <literal>)` but
defined nowhere, so every consumer rendered its own Tailwind-slate fallback and no
theme layer could reach them. They were first defined at the *majority* fallback
found in the tree — reachable by Custom CSS, but still not theme-tracking, and
still frozen at a **dark** value in light mode. **All seven literals are now
aliases onto tokens `theme/engine.ts` emits in both modes.** This was an approved,
app-wide visual change, not a refactor; see "What the repoint changes" below.

| Token | Value | Note |
| --- | --- | --- |
| `--lumiverse-surface` | `var(--lumiverse-bg)` | base panel rung; was `#111827` |
| `--lumiverse-surface-raised` | `var(--lumiverse-bg-elevated)` | lifted-panel rung; was `#16191f` |
| `--lumiverse-surface-hover` | `var(--lumiverse-bg-hover)` | hover rung; was `rgba(148, 163, 184, 0.14)` |
| `--lumiverse-border-subtle` | `var(--lumiverse-border)` | was slate `0.18`; four alphas existed (0.14/0.16/0.18/0.2) |
| `--lumiverse-primary-soft` | `var(--lumiverse-primary-020)` | was a fixed violet `rgba(139, 92, 246, 0.18)` |
| `--lumiverse-primary-040` | `var(--lumiverse-primary-050)` | `-040` is **not** an emitted rung; `-050` is the nearest |
| `--lumiverse-input-bg` | `var(--lumiverse-fill-hover)` | identical in dark; drops 0.2 → 0.08 black in light |
| `--lumiverse-bg-panel` | `var(--lumiverse-bg)` | alias, tracks the theme |
| `--lumiverse-text-secondary` | `var(--lumiverse-text-muted)` | alias, tracks the theme |
| `--lumiverse-accent` | `var(--lumiverse-primary)` | alias, tracks the theme |
| `--lumiverse-chat-content-width` | `none` | see the component-scoped table above |

`--lumiverse-chat-content-width` is the one entry that must stay a literal.
`ChatView.tsx:402-405` writes it inline for the comfortable / compact / custom
width modes and writes **nothing** for the default full-width mode, so a length at
`:root` would silently cap full-width chat for every user. `tests/theme-tokens.test.ts`
pins it.

#### What the repoint changes

`variables.css` is a dark-only static block; `theme/engine.ts` writes inline on
`documentElement` and therefore wins. That is why aliasing is the whole fix: an
alias inherits the engine's light-mode value automatically, a literal cannot.
`tests/theme-tokens.test.ts` asserts each of the seven is `var(--lumiverse-…)`
**and** that its target appears as a `vars['…']` assignment in `engine.ts`, so
aliasing onto another dark-only literal in this file fails the suite.

- **Accent hue.** Panels, hover states, selected chips and focus rings across
  QuickToolbar, HomepageCharacterLibrary, PortraitDock, RegexPanel/RegexEditorModal,
  LoomBuilder, MessageAudioPlayer, ResizablePanelFrame and the Settings modal now
  follow the accent instead of rendering slate/violet.
- **`baseColors.background` override.** `engine.ts:412-418` re-derives
  `--lumiverse-bg`/`-elevated`/`-hover` from a user-picked background, so those
  surfaces now honour it too.
- **Hover states become solid.** `--lumiverse-surface-hover` was a translucent
  wash (alpha 0.14) layered over whatever sat beneath; `--lumiverse-bg-hover` is
  a near-opaque surface step (alpha 0.9 with glass on, 1.0 with glass off). Hover
  reads as a filled chip rather than a tint — more legible, visibly different.
- **`border-subtle` is ~25% fainter in dark mode** (accent at 0.12 vs slate at
  0.18) and slightly stronger in light (0.15). No consumer relies on it as the
  sole delineation of a surface; each pairs it with a fill or a shadow.
- **Light mode was broken and is now correct.** Every one of the seven was
  pinned to a dark literal, so in light mode e.g. the homepage library rendered a
  near-black `#111827` panel on a near-white page and `--lumiverse-primary-040`
  focus rings were pale lavender on white. All seven are now mode-aware.

### `--lcs-*` first-paint defaults

`variables.css` is what paints before `useThemeApplicator` runs. A token that
`engine.ts` emits but `variables.css` omits is invalid-at-computed-value-time
until then, so the whole declaration reading it **drops**. `--lcs-glass-bg-hover`
and `--lcs-glass-border-hover` were in exactly that state while
`ConnectionsPicker.module.css` read them bare at 11 sites — a borderless flash on
first paint. Both now have static defaults mirroring the engine's dark + glass
branch (`engine.ts:355-358`). `tests/theme-tokens.test.ts` fails if any
engine-emitted `--lcs-*` token loses its static default again.

Not every `--lcs-*` name belongs here: `--lcs-input-safe-zone`, `--lcs-bubble-bg`,
`--lcs-top-dock-height` and friends are written inline at runtime by their owning
component and are deliberately unset in some states, so defining them at `:root`
would break the unset case.

### Tag palette (`--lumiverse-tag-1` … `-12`)

Twelve stable hues for character tags, holding the values that used to be the
`PALETTE` array in `frontend/src/lib/tagColors.ts`.

- Each token is a bare `R, G, B` triple with **no** `rgb()`/`rgba()` wrapper, so
  the consumer supplies its own alpha:
  `background: rgba(var(--lumiverse-tag-1), 0.15)`,
  `color: rgb(var(--lumiverse-tag-1))`.
- `frontend/src/lib/tagColors.ts` maps a tag to a slot and returns token
  references, not colours. The hash and the 12-slot modulo are frozen — changing
  either reshuffles every tag in the UI. The colour is not frozen and lives only
  in `variables.css`, so re-tinting tags is a theme edit.

Because the values are now tokens rather than JS-computed inline `rgba()`, a tag
chip no longer outranks the user's Custom CSS.

Connection-profile hydration can intentionally overwrite `reasoningSettings`
and `promptBias`. Image-generation profile hydration also has dirty-key guards.
Preserve those overwrite/dirty-key rules when changing profile-bound settings.

## Extension Styling

Extensions can inject namespaced CSS, use a sandbox frame, or apply theme
overrides through the backend theme capability. Host layout manipulation should
follow Canvas only after reading its teardown and observer patterns. Sandboxed
HTML should follow Creator Notes Renderer or Vishrun.

## Settings Verification

Run the narrowest verification that covers the change:

```powershell
bun run build:frontend
bun --cwd frontend run typecheck
bun test src/services/world-book-vector-settings.service.test.ts
bun test src/services/sidecar-settings.service.test.ts
uvx zensical build --config-file developer-docs/zensical.toml
```

Manual checks: reload persistence, light/dark/system theme, custom CSS enabled,
component override enabled, mobile width, desktop width, drawer open/closed,
role-gated settings visibility, per-chat wallpaper precedence, and at least one
installed extension visible.
