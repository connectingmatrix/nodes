import { isCurrentUserRootUser } from '@giga/shared/lib/helper';
import { resolveRuntimeCredentialAccess } from '@giga/general/services/credentials/auth/access';
import { resolveCredentialForExecution } from '@giga/general/services/credentials/runtime/service';
import {
  WorkflowExecutionRequestContext,
  WorkflowNodeHandlerContext,
  WorkflowNodeHandlerResult,
} from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
// Existing workflow reference bridge imports the executor runtime; keep this dispatch edge explicit.
// eslint-disable-next-line import/no-cycle
import { executeWorkflowReferenceBackendRequest } from '@connectingmatrix/workflow-driver/services/workflow/contracts/execution-reference';
import {
  executeWorkflowManagementBackendRequest,
  getWorkflowExecutionRequestContext,
} from '@connectingmatrix/workflow-driver/services/workflow/runtime/credential-host-context';
import { WORKFLOW_GROUPED_ACTION_NODE_IDS } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/action-node-registry';
import { WORKFLOW_NODE_HANDLERS } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/node-handlers';
import type { WorkflowBackendDescriptor, WorkflowBackendRequest } from '@giga/shared/types/contracts/workflow.types';

export type { WorkflowBackendDescriptor, WorkflowBackendRequest } from '@giga/shared/types/contracts/workflow.types';

const WORKFLOW_NODE_HANDLER_SERVICE = 'services/workflow/nodes/node-handlers.ts';
const WORKFLOW_MANAGEMENT_SERVICE = 'services/workflow/executor/backend-dispatch.ts';
const WORKFLOW_EXECUTION_REFERENCE_SERVICE = 'services/workflow/execution-reference.ts';
const WORKFLOW_MANAGEMENT_KEY = 'executeWorkflowManagementBackendRequest';
const WORKFLOW_EXECUTION_REFERENCE_KEY = 'executeWorkflowReferenceBackendRequest';
const USER_NODE_MODEL_PREFIX = 'user-node:';
const USER_NODE_BACKEND_KEYS = new Set([
  'executeRcmCsvStreamProfilerNode',
  'executeRcmDecisionTreeTrainerNode',
  'executeRcmFeatureBuilderNode',
  'executeRcmKnowledgePublisherNode',
  'executeRcmModelScorerNode',
  'executeRcmNeuralNetTrainerNode',
]);
const USER_NODE_HANDLER_MODEL_ID_BY_KEY: Record<string, string> = {
  executeRcmCsvStreamProfilerNode: 'rcmCsvStreamProfiler',
  executeRcmDecisionTreeTrainerNode: 'rcmDecisionTreeTrainer',
  executeRcmFeatureBuilderNode: 'rcmFeatureBuilder',
  executeRcmKnowledgePublisherNode: 'rcmKnowledgePublisher',
  executeRcmModelScorerNode: 'rcmModelScorer',
  executeRcmNeuralNetTrainerNode: 'rcmNeuralNetTrainer',
};

const nodeHandlerDescriptor = (fn: string): WorkflowBackendDescriptor => ({ key: fn });

const buildGroupedActionNodeDescriptors = (): Record<string, WorkflowBackendDescriptor> => {
  const descriptors: Record<string, WorkflowBackendDescriptor> = {};
  for (const modelId of WORKFLOW_GROUPED_ACTION_NODE_IDS) {
    descriptors[modelId] = {
      key: 'executeGroupedActionNode',
    };
  }
  return descriptors;
};

export const WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID: Record<string, WorkflowBackendDescriptor> = {
  'analyze-text-with-model': nodeHandlerDescriptor('executeAnalyzeTextWithModelNode'),
  claude: nodeHandlerDescriptor('executeClaudeNode'),
  deepseek: nodeHandlerDescriptor('executeDeepSeekNode'),
  gemini: nodeHandlerDescriptor('executeGeminiNode'),
  groq: nodeHandlerDescriptor('executeGroqNode'),
  'current-chat': nodeHandlerDescriptor('executeCurrentChatNode'),
  'mcp-capabilities': nodeHandlerDescriptor('executeMcpCapabilitiesNode'),
  'mcp-runtime': nodeHandlerDescriptor('executeMcpRuntimeNode'),
  mistral: nodeHandlerDescriptor('executeMistralNode'),
  openai: nodeHandlerDescriptor('executeOpenAINode'),
  perplexity: nodeHandlerDescriptor('executePerplexityNode'),
  workflow: {
    key: WORKFLOW_MANAGEMENT_KEY,
  },
  'execute-workflow': {
    key: WORKFLOW_EXECUTION_REFERENCE_KEY,
  },
  ...buildGroupedActionNodeDescriptors(),
  'serp-search': nodeHandlerDescriptor('executeSerpSearchNode'),
  'workflow-file-download': nodeHandlerDescriptor('executeWorkflowFileDownloadNode'),
  'workflow-file-inspect': nodeHandlerDescriptor('executeWorkflowFileInspectNode'),
  'workflow-artifact-publish': nodeHandlerDescriptor('executeWorkflowArtifactPublishNode'),
  'shared-space': nodeHandlerDescriptor('executeSharedSpaceNode'),
  'scoped-node-manager': nodeHandlerDescriptor('executeScopedNodeManagerNode'),
  'ai-agent': nodeHandlerDescriptor('executeAgentRuntimeTool'),
  'ai-governor': nodeHandlerDescriptor('executeAgentRuntimeTool'),
};

const HANDLER_MODEL_ID_BY_KEY = Object.entries(WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID).reduce<Record<string, string>>(
  (acc, [modelId, descriptor]) => {
    const key = String(descriptor.key || '').trim();
    if (key && WORKFLOW_NODE_HANDLERS[modelId]) acc[key] = modelId;
    return acc;
  },
  {},
);

const parseRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const buildHandlerInput = (input: unknown): Record<string, unknown> => {
  const record = parseRecord(input);
  return parseRecord(record.input ?? input);
};

const resolvePayloadNode = (request: WorkflowBackendRequest): Record<string, unknown> | null => {
  const payloadNode = parseRecord(parseRecord(request.payload).NODE);
  if (Object.keys(payloadNode).length === 0) return null;
  if (String(payloadNode.id ?? '') !== String(request.context.node.id ?? '')) return null;
  if (String(payloadNode.modelId ?? '') !== String(request.context.node.modelId ?? '')) return null;
  return payloadNode;
};

const buildHandlerNode = (request: WorkflowBackendRequest): WorkflowNodeHandlerContext['node'] => {
  const payloadNode = resolvePayloadNode(request);
  const contextNode = request.context.node;
  const source = payloadNode ?? (contextNode as unknown as Record<string, unknown>);
  const properties = parseRecord(source.PROPERTIES);
  const runtime = parseRecord(source.runtime);
  const normalizedRuntime = Object.keys(runtime).length > 0 ? runtime : properties;
  const normalizedProperties = Object.keys(properties).length > 0 ? properties : normalizedRuntime;
  const portsSource = parseRecord(source.ports);
  const portsFacade = parseRecord(source.PORTS);
  const normalizedPorts = {
    in: parseRecord(portsSource.in ?? portsFacade.IN) as WorkflowNodeHandlerContext['node']['ports']['in'],
    out: parseRecord(portsSource.out ?? portsFacade.OUT),
  };

  return {
    ...contextNode,
    ...(source as Partial<WorkflowNodeHandlerContext['node']>),
    runtime: normalizedRuntime,
    ports: normalizedPorts,
    properties: normalizedProperties,
    input: buildHandlerInput(request.context.input),
    output: Object.prototype.hasOwnProperty.call(normalizedPorts.out, 'output') ? normalizedPorts.out.output : source.OUTPUT ?? contextNode.output,
  };
};

const buildHandlerWorkflow = (request: WorkflowBackendRequest): WorkflowNodeHandlerContext['workflow'] => {
  const { metadata } = request.context.workflow;
  return {
    ...request.context.workflow,
    metadata: {
      ...metadata,
      runtime: {
        ...parseRecord(metadata.runtime),
        settings: request.context.settings,
      },
    },
  };
};

const resolveSchemaCredentialServiceId = (request: WorkflowBackendRequest): string => {
  const modelId = String(request.context.node.modelId ?? '').trim();
  const schema = parseRecord(parseRecord(request.context.workflow.nodeModels)[modelId]);
  return typeof schema.useCredentials === 'string' ? schema.useCredentials.trim() : '';
};

const resolveSelectedCredentialId = (request: WorkflowBackendRequest): string => {
  const payloadNode = resolvePayloadNode(request);
  const source = payloadNode ?? (request.context.node as unknown as Record<string, unknown>);
  const properties = parseRecord(source.PROPERTIES);
  const runtime = parseRecord(source.runtime);
  const value = properties.credentialId ?? runtime.credentialId ?? source.credentialId;
  return typeof value === 'string' ? value.trim() : '';
};

const resolvePayloadCredential = (request: WorkflowBackendRequest) => {
  const payloadNode = resolvePayloadNode(request);
  const candidate = parseRecord(payloadNode?.CREDENTIAL ?? request.context.credential);
  const credentialId = typeof candidate.credentialId === 'string' ? candidate.credentialId.trim() : '';
  return credentialId ? (candidate as unknown as WorkflowNodeHandlerContext['credential']) : null;
};

const resolveHandlerCredential = async (
  request: WorkflowBackendRequest,
  requestContext: WorkflowExecutionRequestContext,
): Promise<WorkflowNodeHandlerContext['credential']> => {
  const fromPayload = resolvePayloadCredential(request);
  if (fromPayload) {
    return fromPayload;
  }

  const serviceId = resolveSchemaCredentialServiceId(request);
  if (!serviceId) {
    return null;
  }

  const credentialId = resolveSelectedCredentialId(request);
  if (!credentialId) {
    return null;
  }

  const effectiveRoot = await isCurrentUserRootUser(requestContext.supabase);
  return resolveCredentialForExecution(requestContext.supabase, credentialId, async (scope) =>
    resolveRuntimeCredentialAccess({
      supabase: requestContext.supabase,
      currentUserId: requestContext.userId,
      effectiveRoot,
      scope: scope.scope,
      organizationId: scope.organizationId,
    }),
  );
};

export const validateWorkflowBackendDescriptor = (modelId: string | undefined, descriptor?: WorkflowBackendDescriptor): WorkflowBackendDescriptor => {
  const normalizedModelId = String(modelId ?? '').trim();
  if (!normalizedModelId) {
    throw new Error('Workflow backend execution requires a node model ID.');
  }

  const userNode = normalizedModelId.startsWith(USER_NODE_MODEL_PREFIX);
  const expected = WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID[normalizedModelId];
  if (!expected) {
    if (!userNode) throw new Error(`Workflow backend execution is not allowed for model "${normalizedModelId}".`);
    const descriptorKey = String(descriptor?.key || descriptor?.function || '').trim();
    const handlerModelId = HANDLER_MODEL_ID_BY_KEY[descriptorKey];
    if (!handlerModelId && !USER_NODE_BACKEND_KEYS.has(descriptorKey))
      throw new Error(`Workflow backend execution is not allowed for model "${normalizedModelId}".`);
    return { key: descriptorKey };
  }

  if (!descriptor) {
    throw new Error(`Workflow backend descriptor is required for model "${normalizedModelId}".`);
  }

  const expectedKey = String(expected.key || expected.function || '').trim();
  const descriptorKey = String(descriptor.key || descriptor.function || '').trim();
  const legacyService = String(descriptor.service || '').trim();
  const legacyServiceMatches =
    legacyService === WORKFLOW_NODE_HANDLER_SERVICE ||
    legacyService === WORKFLOW_MANAGEMENT_SERVICE ||
    legacyService === WORKFLOW_EXECUTION_REFERENCE_SERVICE;
  if (!descriptorKey || descriptorKey !== expectedKey || (legacyService && !legacyServiceMatches)) {
    throw new Error(`Workflow backend descriptor mismatch for model "${normalizedModelId}". Expected backend key ${expectedKey}.`);
  }

  return expected;
};

const executeNodeHandlerBackendRequest = async (request: WorkflowBackendRequest): Promise<WorkflowNodeHandlerResult> => {
  const modelId = String(request.context.node.modelId ?? '').trim();
  const descriptorKey = String(request.descriptor?.key || request.descriptor?.function || '').trim();
  const handlerModelId = WORKFLOW_NODE_HANDLERS[modelId]
    ? modelId
    : HANDLER_MODEL_ID_BY_KEY[descriptorKey] || USER_NODE_HANDLER_MODEL_ID_BY_KEY[descriptorKey];
  const handler = WORKFLOW_NODE_HANDLERS[handlerModelId];
  if (typeof handler !== 'function') {
    throw new Error(`No backend workflow handler is registered for model "${modelId}".`);
  }
  const requestContext = getWorkflowExecutionRequestContext(request.context.hostContext);
  if (!requestContext) {
    throw new Error('Workflow backend execution requires a backend request context.');
  }

  return handler({
    node: buildHandlerNode(request),
    workflow: buildHandlerWorkflow(request),
    settings: request.context.settings,
    input: buildHandlerInput(request.context.input),
    signal: request.context.signal,
    hostContext: request.context.hostContext,
    credential: await resolveHandlerCredential(request, requestContext),
    requestContext,
  });
};

export const executeWorkflowBackendRequest = async (request: WorkflowBackendRequest): Promise<WorkflowNodeHandlerResult> => {
  const modelId = String(request.context.node.modelId ?? '').trim();
  const descriptor = validateWorkflowBackendDescriptor(modelId, request.descriptor);
  if (descriptor.key === WORKFLOW_MANAGEMENT_KEY) return executeWorkflowManagementBackendRequest(request);
  if (descriptor.key === WORKFLOW_EXECUTION_REFERENCE_KEY) return executeWorkflowReferenceBackendRequest(request);
  if (descriptor.key) return executeNodeHandlerBackendRequest(request);
  throw new Error(`No backend workflow bridge is registered for model "${modelId}".`);
};

export { executeWorkflowManagementBackendRequest, getWorkflowExecutionRequestContext };
