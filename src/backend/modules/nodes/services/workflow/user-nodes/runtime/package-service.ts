import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { createUserWorkflowNode, updateUserWorkflowNode } from '../write/mutations';
import { buildWorkflowNodePackage } from '../io/package-export';
import { readWorkflowNodePackage } from '../io/package-parse';
import { getUserWorkflowNodeById, listUserWorkflowNodes } from './queries';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

const packageInput = (pkg: Awaited<ReturnType<typeof readWorkflowNodePackage>>, args: Record<string, unknown>) => ({
  name: args.name || pkg.manifest.name,
  slug: args.slug || pkg.manifest.slug,
  description: args.description || pkg.manifest.description,
  groupName: args.groupName || pkg.manifest.groupName,
  nodeSchema: pkg.manifest.nodeSchema,
  sourceFiles: pkg.sourceFiles,
  scopeType: args.scopeType,
  scopeId: args.scopeId,
  organizationId: args.organizationId,
  isActive: args.isActive,
});

const sameScopeNodes = async (params: {
  args: Record<string, unknown>;
  context?: GraphqlResolverContext;
  currentUserId: string;
  effectiveRoot?: boolean;
  slug: string;
  supabase: any;
}) =>
  (
    await listUserWorkflowNodes({
      currentUserId: params.currentUserId,
      effectiveRoot: params.effectiveRoot,
      organizationId: toSafeString(params.args.organizationId || params.args.scopeId) || null,
      scopeType: toSafeString(params.args.scopeType) || null,
      supabase: params.supabase,
      context: params.context,
    })
  ).filter((node: any) => node.slug === params.slug);

const uniqueCopySlug = async (params: Parameters<typeof sameScopeNodes>[0], baseSlug: string) => {
  const nodes = await listUserWorkflowNodes({
    currentUserId: params.currentUserId,
    effectiveRoot: params.effectiveRoot,
    organizationId: toSafeString(params.args.organizationId || params.args.scopeId) || null,
    scopeType: toSafeString(params.args.scopeType) || null,
    supabase: params.supabase,
    context: params.context,
  });
  const slugs = new Set(nodes.map((node: any) => node.slug));
  let counter = 1;
  let slug = `${baseSlug}-copy`;
  while (slugs.has(slug)) {
    counter += 1;
    slug = `${baseSlug}-copy-${counter}`;
  }
  return slug;
};

export const validateWorkflowNodePackage = async (packageBase64: string, fileName?: string) => {
  const pkg = await readWorkflowNodePackage(packageBase64, fileName);
  return {
    fileName: pkg.fileName || null,
    files: Object.keys(pkg.sourceFiles).sort(),
    manifest: pkg.manifest,
    report: pkg.report,
  };
};

export const importWorkflowNodePackage = async (params: {
  currentUserId: string;
  input: Record<string, unknown>;
  supabase: any;
  effectiveRoot?: boolean;
  context?: GraphqlResolverContext;
}) => {
  const packageBase64 = toSafeString(params.input.packageBase64);
  const pkg = await readWorkflowNodePackage(packageBase64, toSafeString(params.input.fileName));
  if (!pkg.report.ok) throw new BadRequestError(pkg.report.errors.map((entry) => entry.message).join(' '));
  const input = packageInput(pkg, params.input);
  const existing = await sameScopeNodes({ ...params, args: input, slug: toSafeString(input.slug) });
  if (params.input.dryRun === true)
    return { action: existing.length ? 'duplicate' : 'create', existing, ...(await validateWorkflowNodePackage(packageBase64)) };
  if (existing.length && params.input.duplicateStrategy === 'update') {
    return updateUserWorkflowNode({ ...params, id: existing[0].id, input });
  }
  if (existing.length && params.input.duplicateStrategy === 'copy') {
    const slug = await uniqueCopySlug({ ...params, args: input, slug: toSafeString(input.slug) }, toSafeString(input.slug));
    return createUserWorkflowNode({
      ...params,
      input: {
        ...input,
        slug,
        nodeSchema: { ...(input.nodeSchema as Record<string, unknown>), id: slug },
      },
    });
  }
  if (existing.length && params.input.duplicateStrategy !== 'copy')
    throw new BadRequestError('A node with this slug already exists in the selected scope.');
  return createUserWorkflowNode({ ...params, input });
};

export const exportWorkflowNodePackage = async (params: {
  currentUserId: string;
  id: string;
  supabase: any;
  effectiveRoot?: boolean;
  context?: GraphqlResolverContext;
}) => {
  const node = await getUserWorkflowNodeById(params);
  if (!node) throw new BadRequestError('Workflow node was not found.');
  return { nodeId: params.id, ...(await buildWorkflowNodePackage(node as any)) };
};
