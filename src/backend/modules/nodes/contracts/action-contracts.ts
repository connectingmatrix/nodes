import type { ActionContract, RoleGateContract } from '@giga/shared/types/contracts/integration-contract.types';

const roles: RoleGateContract[] = [
  { actor: 'User', canInvoke: true, constraints: ['Node designer permissions required for mutating operations.'] },
  { actor: 'Root User', canInvoke: true, constraints: ['Root scope still enforces node-designer policy gates.'] },
  { actor: 'Super Admin', canInvoke: true, constraints: ['Super-admin scope still enforces node-designer policy gates.'] },
];

const action = (actionName: string, mutating: boolean, description: string, inputSchema: Record<string, string>): ActionContract => ({
  packageName: '@connectingmatrix/nodes',
  actionName,
  group: 'NODE',
  source: 'workflow-nodes',
  mutating,
  description,
  inputSchema,
  outputSchema: { actionName: 'string', result: 'record' },
  combinations: [
    { name: 'default', required: [], optional: Object.keys(inputSchema), constraints: ['Used by grouped action catalog and MCP node tools.'] },
  ],
  roleGates: roles,
  sourcePaths: ['packages/apps/workflow-nodes/src/services/workflow/user-nodes', 'packages/apps/workflow-nodes/src/services/mcp/tools'],
  notes: ['These actions are consolidated via @giga/ai-actions and exposed to MCP + chat runtimes.'],
});

export const ACTION_CONTRACTS: ActionContract[] = [
  action('list_scoped_nodes', false, 'List scoped node packages.', {}),
  action('get_scoped_node_source', false, 'Read scoped node source package.', { id: 'uuid' }),
  action('create_scoped_node', true, 'Create scoped node package.', { name: 'string', sourceFiles: 'object' }),
  action('update_scoped_node', true, 'Update scoped node package.', { id: 'uuid', patch: 'object' }),
  action('delete_scoped_node', true, 'Delete scoped node package.', { id: 'uuid' }),
  action('validate_node_package', false, 'Validate package archive content.', { packageBase64: 'string' }),
  action('import_node_package', true, 'Import package archive content.', { packageBase64: 'string' }),
  action('export_node_package', false, 'Export package archive for sharing.', { id: 'uuid' }),
];

export const NO_ACTION_SURFACE_REASON = '';
