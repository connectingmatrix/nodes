# Auto-generated API

```json
{
  "package": "@connectingmatrix/nodes",
  "summary": "Node CRUD/entity/UI package owning node dataloader and GraphQL extension.",
  "contracts": [
    "Nodes.getList/getObject/search/create/update/delete",
    "Nodes.bindWithServer(endpoint)",
    "GraphQL nodesList/nodesGet/nodesSearch/nodesCreate/nodesUpdate/nodesDelete"
  ],
  "exports": [
    ".",
    "./backend",
    "./ui",
    "./entity",
    "./package.json",
    "./package-structure",
    "./launcher",
    "./observability"
  ],
  "folderCounts": {
    "src/client": 6,
    "src/backend": 49,
    "src/entity": 3,
    "migrations": 2,
    "tests": 9
  },
  "launcher": "playground.mjs",
  "observability": true
}
```

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
