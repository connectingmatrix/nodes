import { BadRequestError } from 'routing-controllers';
import { parseRecordValue, parseStringValue } from 'giga-ai-helper/workflow';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { isCurrentUserRootUser } from '@giga/shared/lib/helper';
import { WorkflowNodeHandler, WorkflowNodeStatusEnum } from '@connectingmatrix/workflows/services/workflow/contracts/types';
import { createUserWorkflowNode, updateUserWorkflowNode } from '@connectingmatrix/nodes/services/workflow/user-nodes/write/mutations';
import {
  deleteUserWorkflowNode,
  getUserWorkflowNodeById,
  listUserWorkflowNodes,
} from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/queries';
import { reviewWorkflowNodeSourceRules } from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/rules';

const inputFor = (runtime: Record<string, unknown>) => ({
  name: runtime.name,
  slug: runtime.slug,
  groupName: runtime.groupName,
  nodeSchema: runtime.nodeSchema,
  sourceFiles: runtime.sourceFiles,
  scopeType: runtime.scopeType,
  scopeId: runtime.scopeId,
  organizationId: runtime.organizationId,
  isActive: runtime.isActive,
});

export const executeScopedNodeManagerNode: WorkflowNodeHandler = async (context) => {
  const runtime = { ...parseRecordValue(context.node.runtime), ...parseRecordValue(context.input) };
  const operation = parseStringValue(runtime.operation || 'list').trim();
  const currentUserId = context.requestContext.userId;
  const effectiveRoot = await isCurrentUserRootUser(context.requestContext.supabase);
  const resolverContext = { ...context.requestContext, effectiveRoot } as any;
  const common = { currentUserId, effectiveRoot, supabase: SupabaseClientAdmin(), context: resolverContext };
  if (operation === 'list') {
    const output = await listUserWorkflowNodes({
      ...common,
      organizationId: parseStringValue(runtime.organizationId) || null,
      scopeType: parseStringValue(runtime.scopeType) || null,
      includeInactive: runtime.includeInactive === true,
    });
    return { output, status: WorkflowNodeStatusEnum.Passed };
  }
  if (operation === 'get') {
    const output = await getUserWorkflowNodeById({
      ...common,
      id: parseStringValue(runtime.nodeId || runtime.id),
      includeInactive: runtime.includeInactive === true,
    });
    return { output, status: WorkflowNodeStatusEnum.Passed };
  }
  if (operation === 'review_source') {
    return { output: reviewWorkflowNodeSourceRules(parseRecordValue(runtime.sourceFiles)), status: WorkflowNodeStatusEnum.Passed };
  }
  if (runtime.dryRun === true)
    return {
      output: { action: operation, input: inputFor(runtime), nodeId: parseStringValue(runtime.nodeId || runtime.id) },
      status: WorkflowNodeStatusEnum.Passed,
    };
  if (operation === 'create')
    return { output: await createUserWorkflowNode({ ...common, input: inputFor(runtime) }), status: WorkflowNodeStatusEnum.Passed };
  if (operation === 'update')
    return {
      output: await updateUserWorkflowNode({ ...common, id: parseStringValue(runtime.nodeId || runtime.id), input: inputFor(runtime) }),
      status: WorkflowNodeStatusEnum.Passed,
    };
  if (operation === 'delete')
    return {
      output: await deleteUserWorkflowNode({ ...common, id: parseStringValue(runtime.nodeId || runtime.id) }),
      status: WorkflowNodeStatusEnum.Passed,
    };
  if (operation === 'ensure_package') {
    const slug = parseStringValue(runtime.slug).trim();
    if (!slug) throw new BadRequestError('slug is required.');
    const rows = await listUserWorkflowNodes({
      ...common,
      organizationId: parseStringValue(runtime.organizationId) || null,
      scopeType: parseStringValue(runtime.scopeType) || null,
    });
    const existing = rows.find((row: any) => row.slug === slug);
    if (existing && runtime.updateExisting === true)
      return {
        output: await updateUserWorkflowNode({ ...common, id: existing.id, input: inputFor(runtime) }),
        status: WorkflowNodeStatusEnum.Passed,
      };
    if (existing) return { output: existing, status: WorkflowNodeStatusEnum.Passed };
    return { output: await createUserWorkflowNode({ ...common, input: inputFor(runtime) }), status: WorkflowNodeStatusEnum.Passed };
  }
  throw new BadRequestError(`Unsupported scoped node operation "${operation}".`);
};
