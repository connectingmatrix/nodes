import { nowIso, type PackageLauncherPanel, type RequestContext } from './contracts.js';

export function createConnectingmatrixNodesStubLauncher(context: RequestContext = {}): PackageLauncherPanel {
  return {
    packageName: '@connectingmatrix/nodes',
    title: 'Nodes Launcher',
    mode: 'stub',
    status: 'ready',
    checkedAt: nowIso(),
    summary: 'Launches node CRUD, catalog dataloader, package parse/export and GraphQL.',
    healthPath: '/nodes/health',
    graphqlNamespace: 'nodes',
    routes: [
      { method: 'GET', path: '/nodes/health', description: 'Health/status endpoint' },
      { method: 'GET', path: '/nodes/launcher', description: 'Stub launcher panel' }
    ],
    owns: {
      ui: ['dataloaders', 'bindWithServer', 'status/launcher UI'],
      backend: ["node catalog", "node package parser"],
      entity: ["NodeDefinition", "NodePackage"],
      migrations: ['migrations/*.sql']
    },
    actions: [
      { name: 'createNode', label: 'createNode', method: 'LOCAL' as const, description: 'Run createNode demo action' },
      { name: 'search', label: 'search', method: 'LOCAL' as const, description: 'Run search demo action' },
      { name: 'exportPackage', label: 'exportPackage', method: 'LOCAL' as const, description: 'Run exportPackage demo action' }
    ],
    sampleData: { context: 'stub-playground', userId: context.userId ?? 'stub-user' },
    context: { userId: context.userId, organizationId: context.organizationId, root: Boolean(context.root), traceId: context.traceId },
    notes: [
      'This launcher is intentionally stub-mode playable so the package can be tested outside giga-ai-backend.',
      'The launcher exposes this package boundary only; cross-package behavior is injected through adapters.'
    ]
  };
}

export const createStubLauncher = createConnectingmatrixNodesStubLauncher;
export const Launcher = { open: createConnectingmatrixNodesStubLauncher, mode: 'stub' as const };
export const launcher = createConnectingmatrixNodesStubLauncher;
