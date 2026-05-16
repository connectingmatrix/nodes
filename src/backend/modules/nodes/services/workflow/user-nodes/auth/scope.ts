import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

export type WorkflowNodeScopeType = 'USER' | 'ORGANIZATION' | 'GLOBAL';
export type WorkflowNodeScope = { scopeType: WorkflowNodeScopeType; scopeId: string | null };
export type WorkflowNodeAction = 'create' | 'read' | 'update' | 'delete';

export const normalizeScopeType = (value: unknown): WorkflowNodeScopeType => {
  const scopeType = toSafeString(value).trim().toUpperCase();
  if (scopeType === 'GLOBAL' || scopeType === 'ORGANIZATION') return scopeType;
  return 'USER';
};

export const inputScope = (input: Record<string, unknown>, currentUserId: string): WorkflowNodeScope => {
  const scopeType = normalizeScopeType(input.scopeType);
  if (scopeType === 'GLOBAL') return { scopeType, scopeId: null };
  const scopeId = scopeType === 'ORGANIZATION' ? toSafeString(input.scopeId || input.organizationId) : currentUserId;
  if (!scopeId) throw new BadRequestError(`${scopeType.toLowerCase()} scope_id is required.`);
  return { scopeType, scopeId };
};

export const rowScope = (row: Record<string, unknown>): WorkflowNodeScope => {
  const scopeType = normalizeScopeType(row.scope_type);
  return { scopeType, scopeId: scopeType === 'GLOBAL' ? null : toSafeString(row.scope_id) };
};

export const assertScopeAccess = async (params: {
  action: WorkflowNodeAction;
  currentUserId: string;
  effectiveRoot?: boolean;
  scope: WorkflowNodeScope;
  supabase: any;
  context?: GraphqlResolverContext;
}) => {
  if (params.effectiveRoot === true) return;
  if (params.scope.scopeType === 'GLOBAL') {
    throw new BadRequestError('Global workflow node changes require root access.');
  }
  if (params.scope.scopeType === 'USER') {
    if (params.scope.scopeId === params.currentUserId) return;
    throw new BadRequestError('User workflow node scope is not accessible.');
  }
  const access = await OrganisationEntity.accessContext({
    supabase: params.supabase,
    userId: params.currentUserId,
    organizationId: params.scope.scopeId,
    context: params.context,
  });
  OrganisationEntity.requirePermission(access, { module: 'NODE_DESIGNER', action: params.action });
};

export const canReadRow = async (params: {
  currentUserId: string;
  effectiveRoot?: boolean;
  row: Record<string, unknown>;
  supabase: any;
  context?: GraphqlResolverContext;
}) => {
  if (params.effectiveRoot === true) return true;
  const scope = rowScope(params.row);
  if (scope.scopeType === 'USER') return scope.scopeId === params.currentUserId;
  if (scope.scopeType === 'GLOBAL') return true;
  const access = await OrganisationEntity.accessContext({
    supabase: params.supabase,
    userId: params.currentUserId,
    organizationId: scope.scopeId,
    context: params.context,
  });
  try {
    OrganisationEntity.requirePermission(access, { module: 'NODE_DESIGNER', action: 'read' });
  } catch {
    return false;
  }
  return !OrganisationEntity.isNodeRestricted(access, toSafeString(params.row.id));
};

export const canChangeRow = async (params: {
  action: Exclude<WorkflowNodeAction, 'read'>;
  currentUserId: string;
  effectiveRoot?: boolean;
  row: Record<string, unknown>;
  supabase: any;
  context?: GraphqlResolverContext;
}) => {
  try {
    await assertScopeAccess({
      action: params.action,
      currentUserId: params.currentUserId,
      effectiveRoot: params.effectiveRoot,
      scope: rowScope(params.row),
      supabase: params.supabase,
      context: params.context,
    });
    return true;
  } catch {
    return false;
  }
};
