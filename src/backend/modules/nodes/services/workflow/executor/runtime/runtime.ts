import {
  createWorkerNodeHandler,
  createWorkflowExecutor,
  Executor,
  WorkerRuntimeEnvironmentEnum,
  WorkflowExecuteBackendRequest,
  WorkflowExecutorModeEnum,
  WorkflowNodeHandlerResult,
} from '@workflow/executor';
import { toSafeString } from 'giga-ai-helper';
// eslint-disable-next-line import/no-cycle
import { WorkflowExecutionRequestContext } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import { getWorkflowExecutionRequestContext } from '@connectingmatrix/workflow-driver/services/workflow/runtime/credential-host-context';
import { executeWorkflowBackendRequest } from '@connectingmatrix/nodes/services/workflow/executor/runtime/backend-dispatch';
import { resolveUserNodeSourceFiles } from '@connectingmatrix/nodes/services/workflow/user-nodes';
import { resolveBuiltInNodeSourceFiles } from '../io/built-in-node-source-files';
import { createBackendNodeHandler } from './backend-node-handler';

const executeBackendBridge = async (request: WorkflowExecuteBackendRequest): Promise<WorkflowNodeHandlerResult> =>
  executeWorkflowBackendRequest(request as unknown as Parameters<typeof executeWorkflowBackendRequest>[0]);

const compileWorkflowCypherBridge = async (input: Record<string, unknown>) => JSON.parse(JSON.stringify(Executor.compileWorkflowCypher(input)));

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const collectSourceFiles = (value: unknown): Record<string, string> | null => {
  const files = Object.entries(toRecord(value)).reduce<Record<string, string>>((acc, [key, body]) => {
    const content = toSafeString(body);
    if (content && !key.startsWith('/') && !key.includes('..')) acc[key] = content;
    return acc;
  }, {});
  return files['worker.ts'] || files['validate.ts'] ? files : null;
};

const resolvePreviewSourceFilesFromHostContext = (hostContext: unknown): Record<string, string> | null => {
  const root = toRecord(hostContext);
  const preview = toRecord(root.__workflowPreview);
  return collectSourceFiles(preview.sourceFiles);
};

const resolveRuntimeSourceFiles = async (params: { context: { hostContext?: unknown }; modelId: string }): Promise<Record<string, string> | null> => {
  const previewSourceFiles = resolvePreviewSourceFilesFromHostContext(params.context.hostContext);
  if (previewSourceFiles) return previewSourceFiles;
  const workflow = toRecord((params.context as { workflow?: unknown }).workflow);
  const metadata = toRecord(workflow.metadata);
  const expectedNodeSourceShas = toRecord(metadata.node_source_shas || workflow.NODE_SOURCE_SHAS);
  const expectedNodeSourceShaValue = expectedNodeSourceShas[params.modelId];
  const expectedNodeSourceSha = typeof expectedNodeSourceShaValue === 'string' ? expectedNodeSourceShaValue : null;
  const builtInSourceFiles = resolveBuiltInNodeSourceFiles(params.modelId, expectedNodeSourceSha);
  if (builtInSourceFiles) return builtInSourceFiles;
  const requestContext = getWorkflowExecutionRequestContext(params.context.hostContext) as WorkflowExecutionRequestContext | null;
  if (!requestContext?.supabase || !requestContext?.userId) return null;
  return resolveUserNodeSourceFiles({
    currentUserId: requestContext.userId,
    effectiveRoot: true,
    modelId: params.modelId,
    supabase: requestContext.supabase,
  });
};

const hasRelativeWorkerImports = (sourceFiles: Record<string, string>) => /from\s+['"]\.|import\(\s*['"]\./.test(sourceFiles['worker.ts'] || '');

const runtimeEnvironmentForModel = (modelId?: string | null) => {
  if (!modelId) return WorkerRuntimeEnvironmentEnum.Node;
  const sourceFiles = resolveBuiltInNodeSourceFiles(modelId);
  if (!sourceFiles || hasRelativeWorkerImports(sourceFiles)) return WorkerRuntimeEnvironmentEnum.Node;
  return WorkerRuntimeEnvironmentEnum.Browser;
};

export const workflowExecutor = createWorkflowExecutor({
  mode: WorkflowExecutorModeEnum.Server,
  adapters: {
    getNodeHandler: (modelId) =>
      createBackendNodeHandler(modelId) ??
      createWorkerNodeHandler({
        modelId: modelId ?? 'unknown-node',
        runtimeEnvironment: runtimeEnvironmentForModel(modelId),
        executeHelpers: {
          executeBackend: executeBackendBridge,
          compileWorkflowCypher: compileWorkflowCypherBridge,
          resolveNodeSourceFiles: async ({ context, modelId: nodeModelId }) =>
            resolveRuntimeSourceFiles({
              context,
              modelId: nodeModelId,
            }),
          updateNode: () => undefined,
        },
      }),
  },
});
