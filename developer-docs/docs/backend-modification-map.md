# Backend Modification Map

Use this page when changing server behavior, database shape, realtime events,
background jobs, or the Spindle runtime. Keep feature logic out of `src/main.ts`
and keep route handlers thin.

## Boot Sequence

1. `src/index.ts` performs Bun/native preflight and imports `src/main.ts`.
2. `src/main.ts` opens the database, runs migrations, starts maintenance and
   queues, imports the Hono app, starts enabled extensions, calls `Bun.serve`,
   and attaches the server to `eventBus`.
3. `src/app.ts` registers middleware, unauthenticated callback routes,
   authenticated `/api/v1/*` routes, WebSocket upgrade behavior, and static
   frontend serving.

Only process-wide startup and shutdown belongs in `main.ts`. Feature behavior
belongs in a service, route module, background service, or Spindle module.

## Route Ordering and Auth

Normal authenticated APIs mount after `app.use("/api/v1/*", requireAuth)`.
Public callback/result routes under `/api/v1` must be deliberately mounted
before that middleware. Other special surfaces include `/api/auth`,
`/api/spindle-oauth`, `/api/ws`, and the static frontend fallback.

Use `requireOwner` for owner-or-admin access and `requireOwnerStrict` for true
owner-only operations. WebSocket authentication mirrors session and role
resolution, so auth contract changes must update both HTTP middleware and
`src/ws/handler.ts`. Preserve CORS, host/origin checks, body caps, and auth rate
limits when adding pre-auth routes.

## Add Backend API Workflow

1. Add domain logic under `src/services` or an existing domain directory.
2. Add a Hono route module under `src/routes`.
3. Validate request payloads at the route boundary. Prefer service-owned SQL
   for new code, while recognizing that some existing route modules still own
   queries and require regression tests before extraction.
4. Import and mount the route in `src/app.ts` under `/api/v1`.
5. Add a frontend API wrapper in `frontend/src/api` when the UI needs it.
6. Add or extend a Zustand slice in `frontend/src/store/slices` when state is
   shared across components.
7. Emit a WebSocket event if other open clients must update.
8. Add service tests and route-level coverage where behavior or auth can
   regress.

Authenticated `/api/v1/*` routes pass through `requireAuth`. Use
`requireOwner` only for owner/admin operations. Extension-scoped operations
should use the existing Spindle ownership and `canManageExtension` checks.

## Database Migration Workflow

1. Add a numbered SQL migration in `src/db/migrations`.
2. Make it forward-only and compatible with existing rows.
3. Update the owning service and DTO shapes.
4. Backfill or tolerate missing values during mixed-version startup.
5. Add tests for the service path that reads/writes the new shape.

Migrations are run by `src/db/migrate.ts` during startup. Settings do not need
schema migrations for new keys because `src/services/settings.service.ts`
stores opaque JSON by `(key, user_id)`.

Migration filenames are sorted lexicographically and duplicate numeric prefixes
already exist. New migrations must sort after the current tail. Fresh databases
use `baseline.sql` plus post-baseline migrations; update the baseline only as an
intentional squash. Table rebuilds and foreign-key-off migrations need special
handling in the migration runner.

## Realtime Event Workflow

1. Add or reuse an event in `src/ws/events.ts`.
2. Emit from the service or route through `src/ws/bus.ts`.
3. Include `userId` for user-scoped events. Omitting it broadcasts on the
   system topic.
4. Handle the event in `frontend/src/ws/useWebSocket.ts`.
5. Update the relevant store slice and user-facing UI state.

The WebSocket handler also resolves Spindle modal, confirm, input, text-editor,
context-menu, visibility, and stream-focus responses.

The bus also supports `stream:<id>` focus topics and explicit topic overrides.
For inbound protocol changes, update `src/ws/handler.ts`, the frontend sender,
and any message-size/auth validation in addition to `EventType` consumers.

## Background Workflows

Use existing service patterns for long-running or queued work:

- vectorization: `src/services/vectorization-queue.service.ts`;
- chat memory cache: `src/services/chat-memory-cache.service.ts`;
- Dream Weaver visual jobs: `src/services/dream-weaver/visual-studio`;
- database maintenance: `src/db/maintenance.ts` and
  `src/db/maintenance-scheduler.ts`;
- disk monitor: `src/services/disk-monitor.service.ts`;
- Spindle bulk updates: `src/spindle/bulk-update.service.ts`.

Long-running jobs should report progress with user-scoped events, tolerate
process shutdown, and avoid blocking request handlers.

Any process-wide background service added to startup needs a paired, idempotent
shutdown path in `main.ts`, including timers, queues, workers, and EventBus
listeners.

## Spindle Extension Lifecycle

| Area | File |
| --- | --- |
| Management routes | `src/routes/spindle.routes.ts` |
| Install/update/build/metadata/branches/permissions/storage | `src/spindle/manager.service.ts` |
| Running host lifecycle | `src/spindle/lifecycle.ts` |
| Host-side permission and capability boundary | `src/spindle/worker-host.ts` |
| Extension-side global `spindle` API | `src/spindle/worker-runtime.ts` |
| Process/worker/sandbox transport | `src/spindle/runtime-transport.ts` |
| Runtime sandbox helpers | `src/spindle/worker-runtime-sandbox.ts` |
| Shared RPC pool | `src/spindle/shared-rpc-pool.service.ts` |
| Bulk update orchestration | `src/spindle/bulk-update.service.ts` |

The default runtime is one Bun subprocess per backend extension. Worker mode is
legacy. The macOS sandbox transport falls back to process mode elsewhere.

## Add Spindle Capability Workflow

1. Define the public extension-facing type in the Spindle types package or the
   local type surface used by the runtime.
2. Update runtime request/response unions and expose the method on the
   `spindleApi` object in `src/spindle/worker-runtime.ts`.
3. Update host message unions and the host dispatch switch.
4. Implement the authoritative handler in `src/spindle/worker-host.ts`.
5. Permission-check, user-scope, validate IDs, and enforce payload limits in the
   host handler.
6. Add or update permission metadata, auto-grant/privileged policy, manifest
   `requested_capabilities`, and bundle safety-scanner rules in
   `src/spindle/manager.service.ts` when relevant.
7. Update developer docs under `developer-docs/docs/backend-api` or
   `developer-docs/docs/frontend-api`.
8. Add a fixture extension or focused runtime test crossing the worker-runtime
   to worker-host boundary.

Never trust extension-side checks as the security boundary. The host handler is
authoritative.

## Extension Install and Update

`src/spindle/manager.service.ts` validates `spindle.json`, resolves
`entry_backend` and `entry_frontend` with defaults of `dist/backend.js` and
`dist/frontend.js`, installs dependencies with lifecycle scripts disabled,
accepts tracked prebuilt `dist`, otherwise generic-builds only
`src/backend.ts` and `src/frontend.ts` into the configured output paths, scans
the backend bundle, seeds storage, and creates a disabled DB record. Install
Git URLs must satisfy the manager's HTTPS/safety rules.

Normal update paths reset and clean the Git checkout before pulling. Use
manifest `dev_mode` while editing an installed extension, or local changes can
be lost. Branch switching still cleans. Updates also reconcile permission
grants with the new manifest.

## Build and Deployment Seams

- Root scripts: `package.json`.
- Frontend checked build: `bun run build:frontend`.
- Development server: `bun run dev`.
- Container stages and runtime asset copies: `Dockerfile`.
- Spindle runtime mode selection and fallback:
  `src/spindle/runtime-transport.ts`.
- Backend TypeScript config covers `src`; frontend and some top-level tests have
  separate build/test paths.

## Backend Verification

Choose focused commands:

```powershell
bunx tsc --noEmit
bun test src/services/<service>.test.ts
bun test src/spindle
bun run build:frontend
uvx zensical build --config-file developer-docs/zensical.toml
bun run src/index.ts
```

There is no established generic route-test suite; route changes need a focused
Hono/app harness or authenticated runtime exercise. For
Spindle runtime changes, run at least one installed backend extension and one
frontend extension that uses the touched bridge.
