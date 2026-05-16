import { randomUUID } from 'crypto';
import { toOptionalString, toSafeString } from 'giga-ai-helper';
import { NodeEntity } from '@connectingmatrix/orm/repositories/entities/runtime/NodeEntity';
import { assertScopeAccess, canChangeRow, inputScope, rowScope, WorkflowNodeAction } from '../auth/scope';
import { normalizeRow, normalizeSourceFiles, record, slugify, validateNodeSchema } from '../io/normalize';
import { assertWorkflowNodePackageRules } from '../runtime/rules';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

const uniqueSlug = async (params: { requestedSlug: string; scopeType: string; scopeId: string | null; excludeId?: string; supabase: any }) => {
  const baseSlug = slugify(params.requestedSlug);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    let query = NodeEntity.find({ scope_type: params.scopeType, scope_id: params.scopeId, slug, is_active: true }).select('id');
    if (params.excludeId) query = query.where({ neq: { id: params.excludeId } });
    const existing = await query.single();
    if (!existing?.id) return slug;
  }
  throw new Error('Could not generate a unique slug for workflow node.');
};

export const assertMutableRow = async (params: {
  action: WorkflowNodeAction;
  currentUserId: string;
  id: string;
  supabase: any;
  effectiveRoot?: boolean;
  context?: GraphqlResolverContext;
}) => {
  const data = await NodeEntity.single(params.id);
  if (!data) throw new Error('Workflow node not found.');
  const row = record(data);
  await assertScopeAccess({ ...params, scope: rowScope(row) });
  return row;
};

export const createUserWorkflowNode = async (params: {
  currentUserId: string;
  input: Record<string, unknown>;
  supabase: any;
  effectiveRoot?: boolean;
  context?: GraphqlResolverContext;
}) => {
  const name = toSafeString(params.input.name);
  if (!name) throw new Error('name is required.');
  const scope = inputScope(params.input, params.currentUserId);
  await assertScopeAccess({ ...params, action: 'create', scope });
  const now = new Date().toISOString();
  const slug = await uniqueSlug({ supabase: params.supabase, requestedSlug: toSafeString(params.input.slug) || name, ...scope });
  const nodeSchema = validateNodeSchema(params.input.nodeSchema, slug);
  const sourceFiles = normalizeSourceFiles(params.input.sourceFiles);
  assertWorkflowNodePackageRules({ nodeSchema, sourceFiles });
  const row = {
    id: randomUUID(),
    created_by: params.currentUserId,
    scope_type: scope.scopeType,
    scope_id: scope.scopeId,
    name,
    slug,
    description: toOptionalString(params.input.description),
    group_name: toOptionalString(params.input.groupName) || 'User Nodes',
    node_schema: nodeSchema,
    source_files: sourceFiles,
    is_active: params.input.isActive !== false,
    created_at: now,
    updated_at: now,
  };
  const saved = record(await NodeEntity.create(row));
  return normalizeRow(saved, {
    canDelete: await canChangeRow({ ...params, action: 'delete', row: saved }),
    canExport: true,
    canUpdate: await canChangeRow({ ...params, action: 'update', row: saved }),
  });
};

export const updateUserWorkflowNode = async (params: {
  currentUserId: string;
  id: string;
  input: Record<string, unknown>;
  supabase: any;
  effectiveRoot?: boolean;
  context?: GraphqlResolverContext;
}) => {
  const existing = await assertMutableRow({ ...params, action: 'update' });
  const scope = rowScope(existing);
  const name = toSafeString(params.input.name) || toSafeString(existing.name);
  const requestedSlug = toSafeString(params.input.slug);
  const slug =
    requestedSlug || Object.prototype.hasOwnProperty.call(params.input, 'name')
      ? await uniqueSlug({ supabase: params.supabase, requestedSlug: requestedSlug || name, excludeId: params.id, ...scope })
      : toSafeString(existing.slug);
  const patch = {
    name,
    slug,
    description: Object.prototype.hasOwnProperty.call(params.input, 'description')
      ? toOptionalString(params.input.description)
      : existing.description,
    group_name: Object.prototype.hasOwnProperty.call(params.input, 'groupName') ? toOptionalString(params.input.groupName) : existing.group_name,
    node_schema: Object.prototype.hasOwnProperty.call(params.input, 'nodeSchema')
      ? validateNodeSchema(params.input.nodeSchema, slug)
      : existing.node_schema,
    source_files: Object.prototype.hasOwnProperty.call(params.input, 'sourceFiles')
      ? normalizeSourceFiles(params.input.sourceFiles)
      : existing.source_files,
    is_active: Object.prototype.hasOwnProperty.call(params.input, 'isActive') ? params.input.isActive !== false : existing.is_active,
    updated_at: new Date().toISOString(),
  };
  assertWorkflowNodePackageRules({ nodeSchema: patch.node_schema, sourceFiles: patch.source_files });
  const node = await NodeEntity.single(params.id);
  if (!node) throw new Error('Workflow node not found.');
  const saved = record(await node.update(patch));
  return normalizeRow(saved, {
    canDelete: await canChangeRow({ ...params, action: 'delete', row: saved }),
    canExport: true,
    canUpdate: await canChangeRow({ ...params, action: 'update', row: saved }),
  });
};
