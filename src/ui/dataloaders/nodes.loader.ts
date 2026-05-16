import type { EntityListResult, UserNodeRecord, WorkflowNodeValidation, WorkflowUserNodeInput } from '@/orm';
import { createWorkflowUserNodeOperation, deleteWorkflowUserNodeOperation, updateWorkflowUserNodeOperation, validateWorkflowUserNodeOperation, workflowUserNodeOperation, workflowUserNodesOperation } from '@/orm';
import type { UiDataContext } from '@/dataloaders/context';
import { assertCanPerform } from '@/dataloaders/permissions.loader';

const searchNodes = (rows: UserNodeRecord[], search: string): UserNodeRecord[] => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((node) => node.title.toLowerCase().includes(query) || node.subtitle.toLowerCase().includes(query) || node.slug.toLowerCase().includes(query) || node.scopeLabel.toLowerCase().includes(query));
};

export const listUserNodes = async (context: UiDataContext, search = ''): Promise<EntityListResult<UserNodeRecord>> => {
    assertCanPerform(context.policy, 'Node', 'list');
    const result = await workflowUserNodesOperation(context.policy.scope, true);
    const rows = searchNodes(result.rows, search);
    return { rows, count: rows.length };
};

export const loadUserNode = async (context: UiDataContext, id: string): Promise<UserNodeRecord> => {
    assertCanPerform(context.policy, 'Node', 'read');
    return workflowUserNodeOperation(id);
};

export const createUserNode = async (context: UiDataContext, input: WorkflowUserNodeInput): Promise<UserNodeRecord> => {
    assertCanPerform(context.policy, 'Node', 'create');
    return createWorkflowUserNodeOperation(context.policy.scope, input);
};

export const updateUserNode = async (context: UiDataContext, id: string, input: WorkflowUserNodeInput): Promise<UserNodeRecord> => {
    assertCanPerform(context.policy, 'Node', 'update');
    return updateWorkflowUserNodeOperation(id, input);
};

export const deleteUserNode = async (context: UiDataContext, id: string): Promise<void> => {
    assertCanPerform(context.policy, 'Node', 'delete');
    const deleted = await deleteWorkflowUserNodeOperation(id);
    if (!deleted) throw new Error(`Workflow user node ${id} was not deleted.`);
};

export const validateUserNode = async (context: UiDataContext, input: WorkflowUserNodeInput): Promise<WorkflowNodeValidation> => {
    assertCanPerform(context.policy, 'Node', 'create');
    return validateWorkflowUserNodeOperation(context.policy.scope, input);
};


const graphqlHeaders = (): Record<string, string> => ({ 'content-type': 'application/json' });

export const exportNodePackage = async (context: UiDataContext, id: string): Promise<string> => {
    assertCanPerform(context.policy, 'Node', 'read');
    const response = await fetch(import.meta.env.VITE_GRAPHQL_API_URL, {
        method: 'POST',
        headers: graphqlHeaders(),
        body: JSON.stringify({ query: 'query NodesExportPackage($id: ID!) { nodesExportPackage(id: $id) }', variables: { id } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(JSON.stringify(payload.errors || payload));
    return JSON.parse(payload.data.nodesExportPackage || '""') as string;
};

export const importNodePackage = async (context: UiDataContext, content: string): Promise<UserNodeRecord> => {
    assertCanPerform(context.policy, 'Node', 'create');
    const response = await fetch(import.meta.env.VITE_GRAPHQL_API_URL, {
        method: 'POST',
        headers: graphqlHeaders(),
        body: JSON.stringify({ query: 'mutation NodesImportPackage($content: String!) { nodesImportPackage(content: $content) { id name description status createdAt updatedAt } }', variables: { content } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(JSON.stringify(payload.errors || payload));
    return payload.data.nodesImportPackage as UserNodeRecord;
};
