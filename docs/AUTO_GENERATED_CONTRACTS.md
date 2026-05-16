# Auto-generated contracts for `@connectingmatrix/nodes`

This document is generated from the final package audit. The package owns its `src/ui`, `src/backend`, `src/entity`, migrations, GraphQL/API surfaces, health/status, launcher, and tests unless this is a thin shell repo.

## Public contracts

- `Nodes.create/update/delete/getList/getObject/search`
- `Nodes.validate(nodeId)`
- `Nodes.execute(nodeId,input)`
- `Nodes.debugWithAI(...)`
- `Nodes.startDebugSession(...)`
- `Nodes.exportNodePackage/downloadNodePackage/importNodePackage/importDraggedNode`
- `Nodes.setExecutorAdapter(...)`

## Package use

```ts
import { createPackage } from '@connectingmatrix/nodes';
const pkg = createPackage();
await pkg.health?.();
```

## Backend registration

Register `pkg.routes`, merge `pkg.graphql`, run `pkg.migrations`, and keep auth/signature handling delegated to `@connectingmatrix/orm`.

## Frontend binding

UI adapters expose `bindWithServer('/graphql')` or route-specific helpers. Domain logic remains in the owning package.

## Launcher

```bash
npm run build
npm test
node playground.mjs
```
