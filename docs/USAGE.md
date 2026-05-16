# Usage for @connectingmatrix/nodes

```ts
import { Nodes } from '@connectingmatrix/nodes';
const node = Nodes.create({ name: 'HTTP Call', description: 'calls API' }, ctx);
```

See `../README.md` for the full contract list.

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
