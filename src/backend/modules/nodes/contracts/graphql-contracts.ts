import type { GraphqlOperationContract, RoleGateContract } from '@giga/shared/types/contracts/integration-contract.types';

const roles: RoleGateContract[] = [
  { actor: 'User', canInvoke: true, constraints: ['NODE_DESIGNER permissions required for node package mutations.'] },
  { actor: 'Root User', canInvoke: true, constraints: ['Root scope still checks node-designer capability matrix.'] },
  { actor: 'Super Admin', canInvoke: true, constraints: ['Super-admin scope still checks node-designer matrix and org policy.'] },
];

const sourcePaths = [
  'packages/apps/general/src/services/graphql/resolvers/integration/workflow.resolver.ts',
  'packages/apps/workflow-nodes/src/services/workflow/user-nodes',
];

const item = (
  operationName: string,
  kind: 'QUERY' | 'MUTATION',
  inputType: string,
  outputType: string,
  required: string[],
  optional: string[],
  notes: string[],
): GraphqlOperationContract => ({
  packageName: '@connectingmatrix/nodes',
  operationName,
  kind,
  inputType,
  outputType,
  description: 'Workflow node designer GraphQL surface composed by general resolver and workflow-nodes runtime.',
  parameters: [
    ...required.map((name) => ({ name, type: 'field', required: true, description: 'Required argument.' })),
    ...optional.map((name) => ({ name, type: 'field', required: false, description: 'Optional argument.' })),
  ],
  combinations: [{ name: 'default', required, optional, constraints: ['Resolver validates scope and payload keys before runtime.'] }],
  roleGates: roles,
  sourcePaths,
  notes,
});

export const GRAPHQL_CONTRACTS: GraphqlOperationContract[] = [
  item(
    'workflowUserNodes',
    'QUERY',
    'WorkflowUserNodesArgs',
    '[WorkflowUserNodePayload!]',
    [],
    ['includeInactive', 'organizationId', 'scopeType'],
    ['List node packages for designer.'],
  ),
  item('workflowUserNode', 'QUERY', 'id', 'WorkflowUserNodePayload', ['id'], [], ['Read one node package.']),
  item(
    'workflowCreateUserNode',
    'MUTATION',
    'WorkflowUserNodeInput',
    'WorkflowUserNodePayload',
    ['input.name', 'input.sourceFiles'],
    ['input.scopeType', 'input.organizationId'],
    ['Create node package.'],
  ),
  item('workflowUpdateUserNode', 'MUTATION', 'id + WorkflowUserNodeInput', 'WorkflowUserNodePayload', ['id'], ['input'], ['Update node package.']),
  item('workflowDeleteUserNode', 'MUTATION', 'id', 'WorkflowDeleteUserNodePayload', ['id'], [], ['Delete node package.']),
  item(
    'workflowValidateUserNode',
    'MUTATION',
    'WorkflowUserNodeInput',
    'WorkflowNodeValidationPayload',
    ['input.name', 'input.sourceFiles'],
    ['input.scopeType'],
    ['Validate node source and schema.'],
  ),
  item(
    'workflowValidateNodePackage',
    'MUTATION',
    'WorkflowNodePackageInput',
    'WorkflowNodePackagePayload',
    ['input.packageBase64'],
    ['input.scopeType', 'input.organizationId'],
    ['Validate exported/imported package archive.'],
  ),
  item(
    'workflowImportNodePackage',
    'MUTATION',
    'WorkflowNodePackageInput',
    'WorkflowNodePackagePayload',
    ['input.packageBase64'],
    ['input.scopeType', 'input.organizationId'],
    ['Import package archive into scoped nodes.'],
  ),
  item(
    'workflowExportNodePackage',
    'MUTATION',
    'id',
    'WorkflowNodePackagePayload',
    ['id'],
    [],
    ['Export scoped package archive for download/share.'],
  ),
];

export const NO_GRAPHQL_SURFACE_REASON = '';
