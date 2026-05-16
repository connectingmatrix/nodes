# @connectingmatrix/nodes

Node CRUD/entity/UI package owning node dataloader and GraphQL extension.

## Ownership

This package owns its `src/ui`, `src/backend`, `src/entity`, GraphQL bundle, migrations, health/status, launcher, and package contracts. It can be included in backend or UI without assuming a monorepo.

## Public contracts

- `Nodes.getList/getObject/search/create/update/delete`
- `Nodes.bindWithServer(endpoint)`
- `GraphQL nodesList/nodesGet/nodesSearch/nodesCreate/nodesUpdate/nodesDelete`


## Basic usage

```ts
import { Nodes } from '@connectingmatrix/nodes';
const node = Nodes.create({ name: 'HTTP Call', description: 'calls API' }, ctx);
```

## Server usage

```ts
import { createPackage } from '@connectingmatrix/nodes';
const pkg = createPackage();
await pkg.health?.();
// register pkg.routes as middleware and merge pkg.graphql into /graphql
```

## UI usage

Package UI modules expose `bindWithServer('/graphql')` where applicable. Domain packages own their dataloaders; the thin UI only renders/binds.

## Observability and process monitor

All packages expose `PackageObservability`. The server wires logger and sockets into every package. Logger registers package health probes and exposes `/logger/process-monitor` plus `/server/process-monitor`.

## Launcher

Run locally:

```bash
npm run build
node playground.mjs
```

The launcher opens in stub mode so the package can be tested independently, similar to workflow designer stub mode.

## GraphQL and routes

GraphQL namespace and routes are returned by `createPackage()`. Routes include health and launcher endpoints when needed.

## Exports

- `.`
- `./backend`
- `./ui`
- `./entity`
- `./package.json`
- `./package-structure`
- `./launcher`
- `./observability`

## Folder counts

- `src/ui`: 6 files
- `src/backend`: 49 files
- `src/entity`: 3 files
- `migrations`: 2 files
- `tests`: 9 files



## Final gap closure

See `docs/FINAL_GAP_CLOSURE_CONTRACTS.md` for the final process-monitor, project, node, workflow, and package-owned contract audit.

## Eighth pass node creator contract

`@connectingmatrix/nodes` owns node CRUD, validation, execution, Debug with AI, `.node` package export/import, and node execution process tracking.

Public contracts:

```ts
Nodes.bindProcessMonitor(processMonitoring);
Nodes.useFileModule(File);
const node = Nodes.create({ name: 'My Node', source: 'export default async function run(input) { return input; }' });
Nodes.validate(node.id);
await Nodes.execute(node.id, { payload: true });
const session = Nodes.startDebugSession({ nodeId: node.id, mode: 'debug' });
await Nodes.debugWithAI({ sessionId: session.id, message: 'debug execute download .node package' });
const nodePackage = await Nodes.downloadNodePackage(node.id);
await Nodes.importDraggedNode(nodePackage);
```

ZIP/MIME/archive work is delegated to `@connectingmatrix/file`; the Nodes package owns the node manifest and lifecycle, not raw file processing.

## Final runtime contracts

See `docs/FINAL_RUNTIME_CONTRACTS.md` for the final package-owned API, routes, launcher, observability, and wiring contracts.


## Final package contracts

- `Nodes.create/update/delete/getList/getObject/search`
- `Nodes.validate(nodeId)`
- `Nodes.execute(nodeId,input)`
- `Nodes.debugWithAI(...)`
- `Nodes.startDebugSession(...)`
- `Nodes.exportNodePackage/downloadNodePackage/importNodePackage/importDraggedNode`
- `Nodes.setExecutorAdapter(...)`

See `docs/AUTO_GENERATED_CONTRACTS.md` and `docs/OBSERVABILITY.md` for generated operational docs.

## Ninth pass runtime queue/cache closure

Node package import/export now exposes package-owned contracts for live runtime status, package observability, and launcher/test mode. Runtime state should come from queues, process monitor, sockets, or explicit package adapters; persisted rows are retained for audit/history only.
