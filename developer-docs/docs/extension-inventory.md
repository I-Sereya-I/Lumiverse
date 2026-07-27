# Installed Extension Inventory

This inventory describes the installed extension repositories under
`data/extensions/*/repo`. Use it to choose the right pattern before editing or
creating an extension.

## Inventory Caveats

- `spindle.json` uses `minimum_lumiverse_version`; do not read only a
  `min_lumiverse_version` property.
- Missing `entry_backend` or `entry_frontend` means the manager defaults to
  `dist/backend.js` and `dist/frontend.js`.
- Some repositories ship tracked `dist`. The manager can skip building tracked
  dist, but local development should still run the package scripts.
- `dev_mode` is a local manifest field, not a known UI toggle. Normal update
  runs Git checkout/clean/pull; `dev_mode: true` skips those steps but still
  rebuilds. Branch switching always cleans.
- The manager installs dependencies, skips build when `dist` is tracked, and
  otherwise generic-builds only `src/backend.ts` and `src/frontend.ts`. It does
  not run package build scripts.
- Extension storage is usually per-user Spindle storage, not host settings.
  Browser `localStorage` is local to one browser profile.

## Extension Build Matrix

| Extension | Manifest entries | Build/typecheck/test |
| --- | --- | --- |
| `auto_retry` | frontend `dist/frontend.js`, no backend | no package scripts; source is `src/frontend.ts` |
| `canvas` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `creator_notes_html_renderer` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `lumiagent` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `lumirealm` | `dist/backend.js`, `dist/frontend.js` plus regex runner build | `bun run build`, `bun run typecheck`, `bun run test:fast` or broader tests |
| `lumiscript` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `lumi_books` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `prompt_viewer` | manifest omits entries; defaults apply | `bun run build`, `bun run typecheck` |
| `shutter` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `silly_sim_tracker` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun run typecheck` |
| `vishrun` | `dist/backend.js`, `dist/frontend.js` | `bun run build`, `bun test` |

## auto_retry Extension

- Purpose: retries failed, stalled, empty, short, or structurally truncated
  generations with backoff and jitter.
- Edit first: `data/extensions/auto_retry/repo/src/frontend.ts`.
- UI: chat input Extras action, settings modal, and fixed status toast.
- Persistence: browser `localStorage` key `lv-auto-retry:settings:v1`; retry
  state and watchdog timers are memory-only.
- Events: `GENERATION_STARTED`, `STREAM_TOKEN_RECEIVED`, `GENERATION_ENDED`,
  `GENERATION_STOPPED`.
- Permissions: `generation`.
- Risk: DOM selectors drive stop/regenerate/swipe behavior; selector changes
  must be tested against the live chat UI.

## canvas Extension

- Purpose: adds an opposite-side drawer, tab reassignment, resizing, chat
  reflow, layout persistence, and slash-command extension points.
- Edit first: `src/setup.ts`, `src/sidebar/secondary.tsx`,
  `src/tabs/assignment.ts`, `src/layout/persist.ts`, `src/backend.ts`.
- UI: second drawer, tab context menus, drag/resize handles, slash suggestions,
  toasts, and settings panel.
- Persistence: backend `layout.json` stores layout, widths, open state,
  detached tabs, and preferences.
- Messages/events: `SET_DEBUG`, `SAVE_LAYOUT`, `LOAD_LAYOUT`, `LAYOUT_DATA`;
  browser events `canvas:slash-register`, `canvas:slash-unregister`,
  `canvas:slash-toast`.
- Permissions: none declared.
- Risk: moves host DOM nodes. Keep teardown, MutationObserver, ResizeObserver,
  and guarded DOM operations intact.

## creator_notes_html_renderer Extension

- Purpose: renders character `creator_notes` HTML/CSS inside a sandboxed
  preview.
- Edit first: `src/frontend.ts`, `src/sanitizer.ts`, `src/backend.ts`.
- UI: `HTML Preview` drawer tab with placeholder/error states.
- Persistence: none.
- Events: tab activation, `CHAT_SWITCHED`, `CHARACTER_EDITED`.
- Messages: backend has `fetch_creator_notes` and `creator_notes_response`,
  but current frontend reads characters directly; treat that backend path as
  dormant unless you reconnect it.
- Permissions: `ui_panels`, `characters`.
- Risk: sanitizer and iframe sandbox are the safety boundary.
- Dormant code: `src/index.ts` and `src/widget.ts` implement an older float
  widget/RPC path but are not package build entrypoints.

## lumiagent Extension

- Purpose: agentic editor/workbench for cards, lorebooks, regex, chats,
  personas, databanks, presets, and files.
- Edit first: `src/backend.ts`, `src/agent/loop.ts`, `src/agent/tools`,
  `src/ui/drawer.ts`, `src/types.ts`, `src/state`.
- UI: `lumiagent` drawer with composer, sessions, diffs, workspace, settings,
  permission, version, and bridge surfaces.
- Persistence: `settings.json`, `ui-prefs.json`, `sessions/index.json`,
  `sessions/<id>.json`, workspace files, ledgers, temporary outputs, and custom
  tools.
- Frontend localStorage also stores the custom icon, sitting image, and display
  name under `lumiagent.customIcon.v1`, `lumiagent.customMousey.v1`, and
  `lumiagent.displayName.v1`.
- Messages/events: large typed frontend/backend protocol; LumiRealm bridge via
  `lumirealm.phoneline`.
- Permissions: broad generation/data/UI/app/storage permissions plus privileged
  capabilities such as dynamic code execution and base64 decoding.
- Risk: reversible edit ledger and recent-read gates are intentional; do not
  bypass them when changing editing tools.

## lumirealm Extension

- Purpose: RisuAI compatibility runtime for `.charx`, `.risum`, macros, regex,
  Lua/trigger actions, variables, display HTML, assets, BGM, and auxiliary LLM
  calls.
- Edit first: `src/backend.ts`, `src/frontend.ts`, `src/handlers`,
  `src/interpreter`, `src/state`, `src/ui`, `src/types/messages.ts`.
- UI: `lumirealm` drawer with Import, Viewer, State, Settings, Realm browser,
  translation, display, BGM, picker, permission, bridge, and version overlays.
- Persistence: `lumirealm/settings.json`, `lumirealm/modules`, character
  extension payloads, chat metadata variables, journals, migration state, and
  frontend logging localStorage.
- Events: settings, chat, message, generation, character, world-book, and
  display lifecycle events.
- Permissions: broad data, interceptor, macro, UI, storage, app, image, regex,
  web, and base64 capabilities.
- Risk: compatibility adapters and migrations are coupled; prefer adding a
  handler/module over expanding a monolithic entrypoint.

## lumiscript Extension

- Purpose: user-authored JavaScript scripts and reusable libraries bound to
  characters or chats.
- Edit first: `src/frontend.tsx`, `src/backend.ts`, `src/engine/executor.ts`,
  `src/storage`, `src/types/messages.ts`.
- UI: React right dock panel and Extensions settings mount.
- Persistence: `scripts.json`, `settings.json`, and variable files under
  `variables/global.json`, `variables/chats`, and `variables/characters`.
- Messages: `get_scripts`, `get_settings`, `get_active_context`,
  `create_script`, `update_script`, `delete_script`, `duplicate_script`,
  `update_settings`, and `run_script`. Events include `CHAT_CHANGED`,
  `CHARACTER_EDITED`, and `PERSONA_CHANGED`.
- Permissions: `chat_mutation`, `generation`, `interceptor`, `cors_proxy`,
  `ui_panels`.
- Risk: `script.on()` trigger auto-execution is currently a no-op, and some
  APIs are stubs. Do not document trigger automation as complete until wired.

## lumi_books Extension

- Purpose: compresses old chat into chapter and arc summaries stored as
  chat-bound world-book entries, then injects coverage in place of history.
- Source build entry: `src/backend.ts`, which imports `src/backend/index.ts`.
  Edit core behavior first in `src/backend/index.ts`, `src/backend/pipeline.ts`,
  `src/backend/injection.ts`, `src/backend/storage.ts`, `src/ui/app.ts`.
- UI: drawer with Books, Make, Profile, Prompts, and Stuff views.
- Persistence: versioned `settings.json`; summaries and coverage metadata live
  in world books and chat metadata.
- Events: `MESSAGE_SENT`, `GENERATION_ENDED`, `CHAT_SWITCHED`,
  `MESSAGE_DELETED`, `WORLD_BOOK_ENTRY_DELETED`, `WORLD_BOOK_DELETED`,
  `REGEX_SCRIPT_CHANGED`, `REGEX_SCRIPT_DELETED`,
  `CONNECTION_PROFILE_LOADED`, and `MAIN_API_CHANGED`.
- Messages cover ready/refresh, settings/profile CRUD, chapter/arc operations,
  dry runs/previews, visibility resync, book ensure/detach/rebase/rebuild,
  preset operations, and busy abort.
- Permissions: `world_books`, `chats`, `chat_mutation`, `interceptor`,
  `generation`, `memories`, `characters`, `regex_scripts`.
- Risk: prompt and world-info interceptors must avoid duplicate summary
  injection.

## prompt_viewer Extension

- Purpose: captures the final assembled LLM message array through a
  late-priority interceptor.
- Edit first: `src/backend.ts`, `src/frontend.ts`, `src/storage/prompt-store.ts`.
- Manifest entries: omitted; manager defaults to `dist/backend.js` and
  `dist/frontend.js`.
- UI: Prompt Viewer drawer and settings panel with formatted, raw JSON, and
  rendered-text modes.
- Persistence: display preferences and history limit in `settings.json`;
  prompt snapshots are memory-only and lost on worker restart.
- Events: generation start/end/stop, chat switches, swipes, deletion, and
  permission changes.
- Messages: `get_latest`, `get_history`, `get_by_id`, `clear_history`,
  `get_settings`, `save_settings`; backend responses include prompt data,
  history, clear/settings state, capture/update notifications, and chat change.
- Permissions: `chats`, `chat_mutation`, `generation`, `interceptor`.
- Risk: history is intentionally bounded and volatile; do not treat it as an
  audit log.

## shutter Extension

- Purpose: quick ImageGen controls and generated-image Markdown insertion into
  chat messages.
- Edit first: `src/frontend.ts`, `src/backend.ts`, and
  `defaults/settings.json`; the manifest seeds it into per-user storage as
  `settings.json`.
- UI: settings panel, optional floating button, input-bar action, context menu,
  prompt editor, destination modal, and lightbox.
- Persistence: `settings.json` controls widget, insertion, prompt preview,
  automatic generation, replacement, and confirmation behavior.
- Events: `CHAT_SWITCHED`, `GENERATION_ENDED`.
- Messages: `request_settings`, `update_settings`,
  `resolve_last_message_id`, `insert_into_message`, `delete_image`,
  `delete_all_images`, with settings/last-message replies and chat mutation.
- Permissions: `chat_mutation`, `ui_panels`.
- Risk: backend mutates chat messages; verify append, replace, remove-last, and
  remove-all paths.

## silly_sim_tracker Extension

- Purpose: parses tracker tags/code blocks into Handlebars cards, retains
  tracker history in prompts, and can use a secondary LLM for state.
- Edit first: `src/backend.ts`, `src/frontend.ts`, templates and build script.
- UI: settings plus cards in messages, app panels, or legacy sidebar mounts.
- Persistence: `preferences.json`, seeded templates, ephemeral imports, and
  local event-tracking records.
- Events: message sent/edited/swiped/deleted, tag interception, generation,
  chat switching. Macros include `sim_format`, `sim_tracker`,
  `last_sim_stats`.
- Frontend also listens to `SWIPE_EDITED`, `CHARACTER_MESSAGE_RENDERED`, and
  `PERMISSION_CHANGED`; backend also tracks `GENERATION_STARTED` and
  `MESSAGE_TAG_INTERCEPTED`.
- Permissions: `interceptor`, `ephemeral_storage`, `chat_mutation`, `chats`,
  `event_tracking`, `generation`, `generation_parameters`, `app_manipulation`.
- Risk: template rendering, tracker history, and secondary generation touch both
  prompt content and visible message DOM.

## vishrun Extension

- Purpose: SillyTavern compatibility runtime that expands character
  `regex_scripts` into interactive message widgets.
- Edit first: `src/frontend.ts`, `src/backend/index.ts`, `src/render`,
  `src/backend`.
- UI: no drawer/settings panel; widgets render in message bubbles as sandboxed
  iframes with host auto-resize disabled and Vishrun's own resize reporter.
- Persistence: no extension settings; state is reconstructed from character
  cards, chat messages, and Lumiverse variables.
- Events: chat changes, edits, swipes, generation completion, and active-chat
  hydration.
- Permissions: `cors_proxy`, `chat_mutation`, `chats`, `characters`,
  `unsafe_eval`.
- Risk: iframe shims and external fetch bridges are compatibility boundaries;
  keep request IDs and idempotent DOM markers.

## Pattern Selection

| Goal | Use this pattern |
| --- | --- |
| Persistent inspector | `prompt_viewer`, `lumi_books` |
| Dense editor | `lumiscript` for React, `lumiagent` for vanilla DOM |
| Message rendering | `vishrun`, `silly_sim_tracker` |
| Input-bar action | `auto_retry`, `shutter` |
| Full compatibility runtime | `lumirealm` |
| Host layout manipulation | `canvas` |
