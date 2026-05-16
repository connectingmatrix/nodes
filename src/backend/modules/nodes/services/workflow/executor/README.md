# Workflow Executor (Backend)

## Purpose

This folder is the backend runtime boundary for `@workflow/executor`.
The backend keeps node handlers and GraphQL orchestration local, but delegates DAG, step, queue, and live transport execution to the shared package.

## Files

- `runtime.ts`
  - Builds `createWorkflowExecutor({ mode: 'server', adapters })`.
  - Executes signed node workers only and routes backend bridges through a descriptor allowlist.
- `backend-dispatch.ts`
  - Validates `executeBackend({ service, function, description }, payload)` against first-party model descriptors.
  - Projects worker payload `NODE.PROPERTIES` / `NODE.PORTS` into the legacy backend handler shape.
- `index.ts`
  - Thin wrappers for `executeWorkflow` and `executeWorkflowStep`.
  - Maintains backend runId semantics and logger/event emission flow.
  - Passes both `onEvent` and compatibility `logger` to shared executor to support legacy and current contracts.
- `compat.ts`
  - Normalizes run events from either result shape (`events` or legacy `logs`).
  - Provides compatibility logger bridge (`push` + `entries`) for old/new shared runtime APIs.

## Canonical Payload Contract

Incoming workflow payloads are expected in slim form:

- `metadata`
- `nodes[]` with flat `runtime` and `ports.in/out`
- `connections[]`

Optional in execution payload:

- `nodeModels` (used by shared executor for schema-aware runtime behavior such as `allowVariables` checks)

Not required in execution payload:

- embedded logs/session logs

## Descriptor Bridge

Backend worker bridging is descriptor-first only:

- workers call `executeBackend({ service, function, description }, payload)`.
- `backend-dispatch.ts` validates the descriptor against the current node model ID.
- local-only nodes are intentionally excluded from backend dispatch, even if legacy handlers still exist elsewhere.

## Compatibility Mapping

Legacy backend handlers still consume `properties/input/output`.
`backend-dispatch.ts` projects worker payloads before invoking them:

- `properties <- payload.NODE.PROPERTIES` (fallback `runtime`)
- `input <- context.input.input` (fallback `context.input`)
- `output <- ports.out.output`

This keeps existing handlers operational while the canonical wire format stays worker-first and slim.

## Logs Behavior

- GraphQL and socket payloads keep log fields for compatibility.
- Returned payload logs are intentionally empty (`[]` / `""`).
- Real-time execution events continue through Executor pubsub streaming.
- Realtime stream now includes `node.delta` events with `data.node` snapshots for step-by-step frontend patching.
- Run event broadcasting should use user-scoped run rooms (`user + runId`) instead of global run rooms.

## Variable Resolution Behavior

- Shared executor resolves runtime variable tokens (for example `{{input.node_id.output.key}}`) before handler execution.
- Unresolved tokens fail node execution before handler invocation and emit failed lifecycle logs/events.
- When `nodeModels` schema exists, shared executor enforces `fields.<key>.allowVariables`; disallowed token usage fails node before handler call.
- Runtime token resolution is execution-scoped and does not rewrite canonical stored node runtime payload.

## Integration Touchpoints

- GraphQL mutation path:
  - `/Users/abeer/dev/giga/giga-ai-backend/src/services/workflow/service.ts`
- Executor setup path:
  - `/Users/abeer/dev/giga/giga-ai-backend/src/services/workflow/setupWorkflowExecutor.ts`

## Upgrade Workflow

1. Update shared repo `giga-wf-executor`.
2. Validate package there (`yarn typecheck && yarn test && yarn build`).
3. Upgrade backend dependency:
   - use the refreshed shared package revision or local workspace package
   - example local workspace flow: `yarn add @workflow/executor@file:../giga-wf-executor`
4. Validate backend:
   - `yarn run tsc -p tsconfig.json --noEmit`
   - `yarn build`
   - `yarn test workflow:compat`
   - smoke: workflow mutation + executor live transport.
