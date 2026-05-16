import { randomUUID } from 'crypto';
import { toOptionalString, toSafeString } from 'giga-ai-helper';
import { USER_NODE_MODEL_PREFIX } from '../contracts/constants';
import { rowScope } from '../auth/scope';

export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `node-${randomUUID().slice(0, 8)}`;

const isSafeSourcePath = (fileName: string) => fileName && !fileName.startsWith('/') && !fileName.includes('..') && /\.(ts|json)$/.test(fileName);

export const normalizeSourceFiles = (value: unknown): { 'worker.ts': string; 'validate.ts'?: string; [fileName: string]: string | undefined } => {
  const source = record(value);
  const workerTs = toSafeString(source['worker.ts']);
  const validateTs = toSafeString(source['validate.ts']);
  if (!workerTs) throw new Error('worker.ts is required for custom workflow nodes.');
  if (!/\bexport\s+(const|async function|function)\s+execute\b/.test(workerTs)) throw new Error('worker.ts must export execute.');
  if (validateTs && !/\bexport\s+(const|async function|function)\s+validate\b/.test(validateTs)) throw new Error('validate.ts must export validate.');
  const files = Object.entries(source).reduce<{ 'worker.ts': string; 'validate.ts'?: string; [fileName: string]: string | undefined }>(
    (acc, [fileName, body]) => {
      const content = toSafeString(body);
      if (content && isSafeSourcePath(fileName)) acc[fileName] = content;
      return acc;
    },
    { 'worker.ts': workerTs },
  );
  if (validateTs) files['validate.ts'] = validateTs;
  return files;
};

export const validateNodeSchema = (value: unknown, slug: string) => {
  const schema = record(value);
  const schemaId = toSafeString(schema.id);
  if (Object.keys(schema).length && !schemaId) throw new Error('nodeSchema.id is required for custom workflow nodes.');
  if (schemaId && slug && schemaId !== slug) throw new Error('nodeSchema.id must match the node slug.');
  return schema;
};

export const parseUserNodeDefinitionId = (modelId: string): string | null => {
  const normalized = toSafeString(modelId);
  if (!normalized.startsWith(USER_NODE_MODEL_PREFIX)) return null;
  const definitionId = normalized.slice(USER_NODE_MODEL_PREFIX.length).trim();
  return definitionId || null;
};

export const normalizeRow = (row: Record<string, unknown>, access?: { canDelete?: boolean; canExport?: boolean; canUpdate?: boolean }) => {
  const scope = rowScope(row);
  return {
    id: toSafeString(row.id),
    userId: toSafeString(row.created_by),
    createdBy: toSafeString(row.created_by),
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    name: toSafeString(row.name),
    slug: toSafeString(row.slug),
    description: toOptionalString(row.description),
    groupName: toOptionalString(row.group_name),
    nodeSchema: record(row.node_schema),
    sourceFiles: normalizeSourceFiles(row.source_files),
    isActive: row.is_active !== false,
    createdAt: toSafeString(row.created_at),
    updatedAt: toSafeString(row.updated_at),
    modelId: `${USER_NODE_MODEL_PREFIX}${toSafeString(row.id)}`,
    canUpdate: access?.canUpdate === true,
    canDelete: access?.canDelete === true,
    canExport: access?.canExport !== false,
    scopeLabel: scope.scopeType === 'GLOBAL' ? 'Global' : scope.scopeType === 'ORGANIZATION' ? 'Organisation' : 'User',
  };
};
