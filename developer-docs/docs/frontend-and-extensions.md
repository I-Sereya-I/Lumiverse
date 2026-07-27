# Frontend and Extension Editing Map

This page is the main navigation surface for changing the Lumiverse frontend or
building a Spindle extension. It is written as edit workflows because broad
Graphify queries like "change the frontend" or "add a setting" can match common
symbols before they match the right files.

## Edit Anything in Lumiverse

Start from the workflow that owns the change:

| Goal or query alias | Workflow |
| --- | --- |
| Change Any Frontend Feature | [Edit Frontend Feature Workflow](#edit-frontend-feature-workflow) |
| Change Frontend Styling | [Edit Frontend Styling Workflow](#edit-frontend-styling-workflow) |
| Edit Any Setting | [Add Persisted Setting Workflow](settings-to-css-map.md#add-persisted-setting-workflow) |
| Edit Theme or CSS | [Settings to CSS Map](settings-to-css-map.md) |
| Implement UI Productivity Overhaul | [UI Productivity Overhaul](ui-productivity-overhaul.md) |
| Modify Any Backend Feature | [Add Backend API Workflow](backend-modification-map.md#add-backend-api-workflow) |
| Add Database or Realtime Behavior | [Backend Modification Map](backend-modification-map.md) |
| Create Spindle Extension | [Create Extension Workflow](#create-extension-workflow) |
| Change Installed Extension | [Installed Extension Inventory](extension-inventory.md) |

Use the exact workflow or alias text in Graphify queries. The source maps remain
the authority when a broad natural-language query resolves to a generic symbol.

## Edit Frontend Feature Workflow

Use this path when changing host UI behavior, not extension code.

1. Classify the owner: boot/global behavior in `main.tsx`, shell hooks in
   `App.tsx`, routes in `router.tsx`, visible UI in `components`, shared state
   in `store`, HTTP in `api`, realtime behavior in `ws`, or styling in
   `theme`/CSS.
2. Check shared state in `frontend/src/store/index.ts` and the relevant slice
   under `frontend/src/store/slices`.
3. Check the API module under `frontend/src/api` when server data is involved.
4. Check realtime effects in `frontend/src/ws/useWebSocket.ts` when backend
   events should update visible state.
5. Add local styles beside the component as a CSS module unless the change is a
   theme token, reset rule, shell layout rule, or user-customizable variable.
6. Update tests or add a focused smoke path when the feature already has tests.
7. Verify with `bun run build:frontend` from the repo root, or
   `bun run build:checked` inside `frontend`. Use `build:frontend:fast` only for
   a quick smoke build.

Common starting points:

| Change | Start here | Then check |
| --- | --- | --- |
| App boot and providers | `frontend/src/main.tsx` | `frontend/src/App.tsx` |
| Routes | `frontend/src/router.tsx` | route target component |
| Chat UI | `frontend/src/components/chat` | `frontend/src/store/slices/chat.ts`, `frontend/src/api/chats.ts` |
| Modal or settings UI | `frontend/src/components/modals`, `frontend/src/components/settings`, `frontend/src/components/panels` | `frontend/src/store/slices/settings.ts` |
| Drawer behavior | `frontend/src/components/panels/ViewportDrawer.tsx` | `frontend/src/store/slices/settings.ts`, `frontend/src/store/slices/spindle-placement.ts` |
| Spindle UI placements | `frontend/src/components/spindle` | `frontend/src/lib/spindle/placement-helper.ts`, `frontend/src/lib/spindle/loader.ts` |
| API client behavior | `frontend/src/api/client.ts` | feature API module |
| WebSocket behavior | `frontend/src/ws/client.ts` | `frontend/src/ws/useWebSocket.ts`, `frontend/src/types/ws-events.ts` |
| Theme and CSS | `frontend/src/theme`, `frontend/src/hooks/useThemeApplicator.ts`, `frontend/src/hooks/useCustomCSSApplicator.ts` | `developer-docs/docs/settings-to-css-map.md` |

## Edit Frontend Styling Workflow

Use local CSS modules for component styling. Use theme variables only when the
setting should be global, reusable, or user-editable.

1. Search the component for `styles.` and nearby `*.module.css` files.
2. If a token already exists in `frontend/src/theme/variables.css`, consume it.
3. If a new token is needed, add it to the theme engine path described in
   `settings-to-css-map.md`.
4. Keep shell-level layout rules close to the shell that owns them.
5. Verify desktop, mobile, light mode, dark mode, custom CSS enabled, and drawer
   open/closed states.

Do not add global selectors for a component just to make override authoring
easier. Prefer stable component data attributes or documented CSS variables.

## Create Extension Workflow

Use this path when creating a new Spindle extension under
`data/extensions/<identifier>/repo` or in an external Git repo.

1. Create `spindle.json` with `identifier`, `name`, `version`, `author`,
   `github`, `homepage`, `permissions`, and optional
   `minimum_lumiverse_version`. Add entry paths only when deviating from
   `dist/backend.js` and `dist/frontend.js`. Optional fields include
   `requested_capabilities`, storage seeds, and interceptor timeouts.
2. Add `src/frontend.ts` for the manager's generic source build. TSX, React,
   plugins, or custom source paths require the extension's own build to produce
   the configured `dist` file, or a tracked prebuilt `dist`.
3. Add `src/backend.ts` when the extension needs storage, host APIs,
   interceptors, generation, macros, or frontend RPC.
4. Add package scripts that build into `dist`, and run them before
   install/update when using TSX or a custom build. The manager installs
   dependencies but does not run package `build` scripts.
5. Keep frontend/backend messages typed around a `type` field.
6. Request only the permissions the code actually uses. Non-privileged
   permissions auto-grant; privileged permissions require explicit approval.
7. Add local-only `"dev_mode": true` to the installed extension manifest while
   editing. Normal update runs Git checkout/clean/pull; branch switching still
   cleans. Do not ship `dev_mode` in a release manifest.
8. Run the extension's `bun run typecheck`, `bun run build`, and tests when
   available.

Primary extension references:

| Need | Reference extension |
| --- | --- |
| Frontend-only input action | `auto_retry` |
| Layout-level drawer manipulation | `canvas` |
| Sandboxed HTML preview | `creator_notes_html_renderer` |
| Vanilla DOM drawer workbench | `lumiagent` |
| Large compatibility runtime | `lumirealm` |
| React dock panel | `lumiscript` |
| Prompt/world-book interceptors | `lumi_books` |
| Prompt inspection interceptor | `prompt_viewer` |
| Image generation action/widget | `shutter` |
| Message cards plus tracker history | `silly_sim_tracker` |
| Message-bubble iframe widgets | `vishrun` |

See `developer-docs/docs/extension-inventory.md` before copying a pattern.

## Extension Frontend Surfaces

Frontend extensions receive a `SpindleFrontendContext` from
`frontend/src/lib/spindle/loader.ts`. Placement handles are implemented in
`frontend/src/lib/spindle/placement-helper.ts` and stored in
`frontend/src/store/slices/spindle-placement.ts`.

| Surface | API | Use for | Permission |
| --- | --- | --- | --- |
| Drawer tab | `ctx.ui.registerDrawerTab` | persistent dashboards, inspectors, settings | no explicit placement permission in loader |
| Input action | `ctx.ui.registerInputBarAction` | chat input actions | no explicit placement permission in loader |
| Float widget | `ctx.ui.createFloatWidget` | small persistent controls | `ui_panels` |
| Dock panel | `ctx.ui.requestDockPanel` | dense side tools | `ui_panels` |
| App mount | `ctx.ui.mountApp` | app-level mounts and overlays | `app_manipulation` |
| Context menu | `ctx.ui.showContextMenu` | pointer-position choices | no explicit frontend permission |
| Modal/confirm | `ctx.ui.showModal`, `ctx.ui.showConfirm` | focused user interaction | no explicit frontend permission; modal stack limit applies |
| Backend RPC | `ctx.sendToBackend`, `ctx.onBackendMessage` | extension frontend/backend protocol | backend entry required |
| Events | `ctx.events.on`, `ctx.events.emit` | host WS events and frontend-only extension events | no explicit frontend permission |
| Shared components | `ctx.components.*` | themed host controls inside extension DOM | no explicit frontend permission |
| Uploads | `ctx.uploads.pickFile` | browser file selection into bytes | no explicit frontend permission |
| Permission UI | `ctx.permissions.getGranted`, `ctx.permissions.request` | permission-aware extension UI | requested permissions may require approval |
| Active data | `ctx.getActiveChat`, `ctx.characters`, `ctx.chats` | active context and entity reads | API-specific permissions |
| Message surfaces | `ctx.messages.*` | tags, widgets, and message IDs | API-specific permissions |
| Display resolver | `ctx.display.registerResolver` | browser-side display ownership | no explicit frontend permission |
| Frontend processes | `ctx.processes.*` | supervised browser workers/processes | API-specific |

Operator-scoped backend extensions should include `userId` when replying to a
specific user. Omitting it can broadcast to all connected users for some host
events.

## Extension Backend Surfaces

Backend extensions run in the Spindle runtime and access the global `spindle`
API. Start with these docs:

- `developer-docs/docs/backend-api/index.md`
- `developer-docs/docs/backend-api/frontend-communication.md`
- `developer-docs/docs/backend-api/storage.md`
- `developer-docs/docs/backend-api/events.md`
- `developer-docs/docs/backend-api/interceptors.md`
- `developer-docs/docs/backend-api/macros.md`
- `developer-docs/docs/backend-api/theme.md`
- `developer-docs/docs/getting-started/runtime.md`
- `developer-docs/docs/frontend-api/shared-components.md`
- `developer-docs/docs/frontend-api/file-uploads.md`
- `developer-docs/docs/frontend-api/processes.md`
- `developer-docs/docs/frontend-api/message-tags.md`
- `developer-docs/docs/frontend-api/display-resolver.md`

For host-side changes to the Spindle runtime itself, use
`developer-docs/docs/backend-modification-map.md`.

## Graphify Query Anchors

Use specific workflow labels. Avoid generic queries that start with words like
"add", "any", "setting", or "behavior".

```bash
graphify query "Change Any Frontend Feature"
graphify query "Edit Frontend Feature Workflow"
graphify query "Edit Frontend Styling Workflow"
graphify query "Create Extension Workflow"
graphify query "Extension Frontend Surfaces"
graphify query "Extension Backend Surfaces"
graphify query "Settings to CSS Map"
graphify query "Add Persisted Setting Workflow"
graphify query "Add Backend API Workflow"
graphify query "Add Spindle Capability Workflow"
```

Regenerate the graph and curated report after source or guide changes:

```powershell
bun run graphify:refresh
```

The graph is currently too large for Graphify's default HTML visualization
limit. The refresh removes stale `graph.html` output rather than presenting an
older graph as current.
