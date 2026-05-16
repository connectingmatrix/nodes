import { nowIso, type PackageLauncherPanel, type RequestContext } from '../contracts.js';

export function createPackageStatusPanel(context: RequestContext = {}): PackageLauncherPanel {
  return {
    packageName: '@connectingmatrix/nodes',
    title: '@connectingmatrix/nodes package status',
    mode: 'connected',
    status: 'ready',
    checkedAt: nowIso(),
    summary: 'Runtime package status panel. Debug/demo stubs live in examples/stub-launcher.ts and examples/playground.mjs.',
    healthPath: '/nodes/health',
    graphqlNamespace: 'nodes',
    routes: [{ method: 'GET', path: '/nodes/health', description: 'Package health endpoint' }],
    owns: { ui: ['src/client'], backend: ['src/backend'], entity: ['src/entity'], migrations: ['migrations'] },
    actions: [{ name: 'open-examples', label: 'Run examples/playground.mjs', method: 'LOCAL', description: 'Launch the package example/debug harness.' }],
    sampleData: { context: 'package-status', userId: context.userId ?? 'example-user' },
    context: context as Record<string, unknown>,
    notes: ['Runtime code lives in src/. Example-only stubs and debug launchers live in examples/.']
  };
}

export const Launcher = { open: createPackageStatusPanel, mode: 'connected' as const };
export const launcher = createPackageStatusPanel;
