import { toSafeString } from 'giga-ai-helper';
import { NodeEntity } from '@connectingmatrix/orm/repositories/entities/runtime/NodeEntity';
import { canChangeRow, canReadRow, normalizeScopeType } from '../auth/scope';
import { normalizeRow, parseUserNodeDefinitionId, record } from '../io/normalize';
import { assertMutableRow } from '../write/mutations';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

const normalizeAccessibleRow = async (params: {
  currentUserId: string;
  effectiveRoot?: boolean;
  row: Record<string, unknown>;
  supabase: any;
  context?: GraphqlResolverContext;
}) =>
  normalizeRow(params.row, {
    canDelete: await canChangeRow({ ...params, action: 'delete' }),
    canExport: true,
    canUpdate: await canChangeRow({ ...params, action: 'update' }),
  });

export const listUserWorkflowNodes = async (params: {
  currentUserId: string;
  effectiveRoot?: boolean;
  includeInactive?: boolean;
  organizationId?: string | null;
  scopeType?: string | null;
  supabase: any;
  context?: GraphqlResolverContext;
}) => {
  const organizationId = toSafeString(params.organizationId);
  const scopeType = normalizeScopeType(params.scopeType);
  let query =
    scopeType === 'GLOBAL'
      ? NodeEntity.find({ scope_type: 'GLOBAL' })
      : scopeType === 'ORGANIZATION' && organizationId
      ? NodeEntity.find({ scope_type: 'ORGANIZATION', scope_id: organizationId })
      : NodeEntity.find({ scope_type: 'USER', scope_id: params.currentUserId });
  if (params.includeInactive !== true) query = query.where({ is_active: true });
  const rows = await query.many();
  const visibleRows: Record<string, unknown>[] = [];
  for (const row of rows) {
    const item = record(row);
    if (
      await canReadRow({
        currentUserId: params.currentUserId,
        effectiveRoot: params.effectiveRoot,
        row: item,
        supabase: params.supabase,
        context: params.context,
      })
    )
      visibleRows.push(item);
  }
  const normalized = [];
  for (const row of visibleRows) normalized.push(await normalizeAccessibleRow({ ...params, row }));
  return normalized;
};

export const getUserWorkflowNodeById = async (params: {
  currentUserId: string;
  effectiveRoot?: boolean;
  id: string;
  includeInactive?: boolean;
  supabase: any;
  context?: GraphqlResolverContext;
}) => {
  const data = await (params.includeInactive === true ? NodeEntity.single(params.id) : NodeEntity.find({ id: params.id, is_active: true }).single());
  if (!data) return null;
  const row = record(data);
  const canRead = await canReadRow({
    currentUserId: params.currentUserId,
    effectiveRoot: params.effectiveRoot,
    row,
    supabase: params.supabase,
    context: params.context,
  });
  return canRead ? normalizeAccessibleRow({ ...params, row }) : null;
};

export const deleteUserWorkflowNode = async (params: {
  currentUserId: string;
  id: string;
  supabase: any;
  effectiveRoot?: boolean;
  context?: GraphqlResolverContext;
}): Promise<boolean> => {
  await assertMutableRow({ ...params, action: 'delete' });
  const node = await NodeEntity.single(params.id);
  if (!node) return false;
  await node.update({ is_active: false });
  return true;
};

export const resolveUserNodeSourceFiles = async (params: {
  currentUserId: string;
  effectiveRoot?: boolean;
  modelId: string;
  supabase: any;
  context?: GraphqlResolverContext;
}): Promise<{ 'worker.ts': string; 'validate.ts'?: string; [fileName: string]: string | undefined } | null> => {
  const definitionId = parseUserNodeDefinitionId(params.modelId);
  if (!definitionId) return null;
  const definition = await getUserWorkflowNodeById({
    currentUserId: params.currentUserId,
    effectiveRoot: params.effectiveRoot,
    id: definitionId,
    supabase: params.supabase,
    context: params.context,
  });
  return definition ? definition.sourceFiles : null;
};
