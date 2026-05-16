import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type NodeSourceManifest = {
  nodes?: Record<string, { sha?: string }>;
};

const sourceFileCache = new Map<string, Record<string, string> | null>();
const manifestShaCache = new Map<string, string | null>();

const workflowNodesRoots = () => [
  path.resolve(process.cwd(), '../../../mcp/tools/nodes'),
  path.resolve(process.cwd(), '../../../mcp/tools/nodes'),
  path.resolve(process.cwd(), '../../../mcp/tools/nodes'),
  path.resolve(process.cwd(), 'node_modules/@workflow/nodes/src/nodes'),
];

const readManifestSha = (root: string, modelId: string) => {
  const manifestFile = path.resolve(root, '..', 'generated', 'node-source-shas.json');
  const cacheKey = `${manifestFile}:${modelId}`;
  if (manifestShaCache.has(cacheKey)) return manifestShaCache.get(cacheKey) || null;
  if (!existsSync(manifestFile)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as NodeSourceManifest;
    const sha = manifest.nodes?.[modelId]?.sha || null;
    manifestShaCache.set(cacheKey, sha);
    return sha;
  } catch {
    manifestShaCache.set(cacheKey, null);
    return null;
  }
};

const readNodeSourceFiles = (root: string, modelId: string) => {
  const nodeRoot = path.join(root, modelId);
  if (!existsSync(nodeRoot)) return null;
  const files: Record<string, string> = {};
  const visit = (directory: string, prefix = '') => {
    for (const entry of readdirSync(directory)) {
      const filePath = path.join(directory, entry);
      const relativePath = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(filePath).isDirectory()) {
        visit(filePath, relativePath);
        continue;
      }
      if (/\.(ts|json)$/.test(entry)) files[relativePath] = readFileSync(filePath, 'utf8');
    }
  };
  visit(nodeRoot);
  return files['worker.ts'] || files['validate.ts'] ? files : null;
};

export const resolveBuiltInNodeSourceFiles = (modelId: string, expectedSha?: string | null): Record<string, string> | null => {
  const cacheKey = `${modelId}:${expectedSha || ''}`;
  if (sourceFileCache.has(cacheKey)) return sourceFileCache.get(cacheKey) || null;
  for (const root of workflowNodesRoots()) {
    const manifestSha = readManifestSha(root, modelId);
    if (expectedSha && manifestSha !== expectedSha) continue;
    const files = readNodeSourceFiles(root, modelId);
    if (files) {
      sourceFileCache.set(cacheKey, files);
      return files;
    }
  }
  if (expectedSha) {
    sourceFileCache.set(cacheKey, null);
    return null;
  }
  for (const root of workflowNodesRoots()) {
    const files = readNodeSourceFiles(root, modelId);
    if (files) {
      sourceFileCache.set(cacheKey, files);
      return files;
    }
  }
  sourceFileCache.set(cacheKey, null);
  return null;
};
