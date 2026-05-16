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
