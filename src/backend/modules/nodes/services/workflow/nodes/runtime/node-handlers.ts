import {
  callDeepSeekModel,
  callMistralModel,
  callOpenAIModel,
  callPerplexityModel,
  callClaudeModel,
  callGeminiModel,
  callGroqModel,
  parseNumberValue,
  parseRecordValue,
  parseStringList,
  parseStringValue,
} from 'giga-ai-helper/workflow';
import { searchSerpWeb } from 'giga-ai-helper/serp-search';
import { executeWorkflowMcpCapabilitiesNode, executeWorkflowMcpRuntimeNode, getWorkflowMcpRuntimeManager } from '@workflow/executor';
import { EnvLoader } from '@giga/shared/lib/env';
import { buildAgentContext } from '@connectingmatrix/chat/services/chat/runtime/context';
import { resolveChatScopeContext } from '@connectingmatrix/chat/services/chat/auth/scope';
import { executeAction } from '@connectingmatrix/chat/services/chat/runtime/action';
import { compactActionValue } from '@connectingmatrix/chat/services/chat/runtime/action-value';
import { TREE_ACTION_NAMES } from '@giga/tree/services/giga/tree/integration/mcp';
import { WorkflowNodeHandler, WorkflowNodeStatusEnum, WorkflowRemoteNodeIdEnum } from '@connectingmatrix/workflows/services/workflow/contracts/types';
import { executeCurrentChatNode } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/current-chat';
import {
  executeWorkflowArtifactPublishNode,
  executeWorkflowFileDownloadNode,
  executeWorkflowFileInspectNode,
} from '@connectingmatrix/nodes/services/workflow/nodes/io/workflow-file-io';
import { executeSharedSpaceNode } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/shared-space-node';
import { executeScopedNodeManagerNode } from '@connectingmatrix/nodes/services/workflow/nodes/auth/scoped-node-manager-node';
import { executeAgentRuntimeNode } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/agent-runtime-node';
import { WORKFLOW_GROUPED_ACTION_NODE_IDS, groupedActionAllowed } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/action-node-registry';
import type { WorkflowNodeHandlerResult } from '@connectingmatrix/workflows/services/workflow/contracts/types';
import type { AgentActionName, AgentActionResult } from '@giga/shared/types/contracts/agent.types';

export const START_MODEL_ID = 'start';
export const END_MODEL_ID = 'respond-end';

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_PERPLEXITY_MODEL = 'sonar';
const DEFAULT_MISTRAL_MODEL = 'mistral-large-latest';
const rcmTool =
  (label: string): WorkflowNodeHandler =>
  async (context) => {
    const properties = parseRecordValue(context.node.properties);
    return {
      output: {
        action: label,
        input: {
          ...properties,
          ...parseRecordValue(context.input),
        },
        message: `${label} completed.`,
      },
      status: WorkflowNodeStatusEnum.Passed,
    };
  };
const credentialServiceId = (context: Parameters<WorkflowNodeHandler>[0]): string =>
  parseStringValue(parseRecordValue(parseRecordValue(context.workflow.nodeModels)[String(context.node.modelId || '')]).useCredentials).trim();
const contextFreeActions = TREE_ACTION_NAMES;

const parseParameterRecord = (value: unknown): Record<string, unknown> => {
  const assignPath = (target: Record<string, unknown>, key: string, entry: unknown) => {
    const parts = key
      .split('.')
      .map((value) => parseStringValue(value).trim())
      .filter(Boolean);
    if (!parts.length) return;
    if (parts.length === 1) {
      target[parts[0]] = entry;
      return;
    }
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const current = parseRecordValue(cursor[part]);
      cursor[part] = current;
      cursor = current;
    }
    cursor[parts[parts.length - 1]] = entry;
  };
  const source = parseRecordValue(value);
  if (Object.keys(source).length) {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) assignPath(normalized, parseStringValue(key).trim(), entry);
    return normalized;
  }
  if (!Array.isArray(value)) return {};
  const next: Record<string, unknown> = {};
  for (const entry of value) {
    const item = parseRecordValue(entry);
    const key = parseStringValue(item.key).trim();
    if (!key) continue;
    assignPath(next, key, item.value);
  }
  return next;
};

const isTemplateValue = (value: string): boolean => value.includes('{{') && value.includes('}}');
const firstNonTemplateText = (...values: unknown[]): string => {
  for (const value of values) {
    const entry = parseStringValue(value).trim();
    if (!entry || isTemplateValue(entry)) continue;
    return entry;
  }
  return '';
};

const buildActionRuntime = async (
  context: Parameters<WorkflowNodeHandler>[0],
  properties: Record<string, unknown>,
  fallbackMessage: string,
  loadContext = true,
): Promise<{
  runtime: {
    supabase: any;
    userId: string;
    chatId: string;
    message: string;
    context: Awaited<ReturnType<typeof buildAgentContext>>;
    topK: number;
    request?: unknown;
    resultsById?: Record<string, AgentActionResult>;
    scopeId?: string | null;
    scopeType?: 'channel' | 'category' | 'subject' | 'post' | null;
  };
  actionInput: Record<string, unknown>;
}> => {
  const runtimeValues = { ...parseRecordValue(context.node.runtime), ...properties };
  const workflowInput = parseRecordValue(context.workflow.input);
  const chatId = firstNonTemplateText(runtimeValues.chatId, context.workflow.metadata.chatId, workflowInput.chatId);

  if (!chatId) {
    throw new Error('chatId is required for this node.');
  }

  const message = parseStringValue(runtimeValues.message ?? context.workflow.metadata.message ?? fallbackMessage).trim() || fallbackMessage;
  const topK = parseNumberValue(runtimeValues.topK, 10);
  let subjectIds = parseStringList(runtimeValues.subjectIds ?? context.workflow.metadata.subjectIds);
  let postIds = parseStringList(runtimeValues.postIds ?? context.workflow.metadata.postIds);
  const tagSlugs = parseStringList(runtimeValues.tagSlugs ?? context.workflow.metadata.tagSlugs);
  const workflowScope = context.workflow.metadata.scope as
    | { type?: 'channel' | 'category' | 'subject' | 'post'; id?: string; organizationId?: string | null }
    | undefined;
  const scopeType = parseStringValue(workflowScope?.type).trim();
  const scopeId = parseStringValue(workflowScope?.id).trim();
  const scopeOrganizationId = parseStringValue(workflowScope?.organizationId).trim() || null;
  if ((!subjectIds.length || !postIds.length) && scopeType && scopeId) {
    const resolvedScope = await resolveChatScopeContext(context.requestContext.supabase, context.requestContext.userId, {
      type: scopeType as 'channel' | 'category' | 'subject' | 'post',
      id: scopeId,
      organizationId: scopeOrganizationId,
    });
    if (!subjectIds.length) subjectIds = resolvedScope.subject_ids;
    if (!postIds.length) postIds = resolvedScope.post_ids;
  }

  const runtimeContext = loadContext
    ? await buildAgentContext({
        supabase: context.requestContext.supabase,
        userId: context.requestContext.userId,
        chatId,
        scopeType: workflowScope?.type || null,
        scopeId: workflowScope?.id || null,
        subjectIds,
        postIds,
        tagSlugs,
      })
    : ({
        scope: {
          scope_type: workflowScope?.type || null,
          scope_id: workflowScope?.id || null,
          subject_ids: subjectIds,
          post_ids: postIds,
          tag_slugs: tagSlugs,
        },
        chat_agent_state: {},
        subjects: [],
        posts: [],
        recent_chat_messages: [],
      } as Awaited<ReturnType<typeof buildAgentContext>>);

  return {
    runtime: {
      supabase: context.requestContext.supabase,
      userId: context.requestContext.userId,
      chatId,
      message,
      context: runtimeContext,
      topK,
      request: context.requestContext.request,
      resultsById: parseRecordValue(runtimeValues.resultsById) as Record<string, AgentActionResult>,
      scopeId: (workflowScope?.id as string | undefined) || null,
      scopeType: (workflowScope?.type as 'channel' | 'category' | 'subject' | 'post' | undefined) || null,
    },
    actionInput: parseParameterRecord(runtimeValues.parameters),
  };
};

const executeActionNode = async (
  context: Parameters<WorkflowNodeHandler>[0],
  actionName: AgentActionName,
  runtimeValues?: Record<string, unknown>,
): Promise<{
  output: unknown;
  status: WorkflowNodeStatusEnum;
  logs: string[];
}> => {
  const properties = Object.keys(runtimeValues || {}).length ? (runtimeValues as Record<string, unknown>) : parseRecordValue(context.node.properties);
  const fallbackMessage = parseStringValue(properties.message ?? context.workflow.metadata.message ?? 'Workflow action execution');
  const actionReason = parseStringValue(properties.reason ?? `Workflow node executed ${actionName}`);

  const { runtime, actionInput } = await buildActionRuntime(context, properties, fallbackMessage, !contextFreeActions.has(actionName));

  const execution = await executeAction(
    {
      id: `workflow_${context.node.id}`,
      name: actionName,
      reason: actionReason,
      input: actionInput,
    },
    runtime,
  );

  const { result } = execution;
  const compactResult = compactActionValue(result) as AgentActionResult;
  const compactChunks = compactActionValue(execution.retrievedChunks);

  return {
    output: {
      action: compactResult,
      retrievedChunks: compactChunks,
      runtime: {
        chatId: runtime.chatId,
        userId: runtime.userId,
        topK: runtime.topK,
      },
    },
    status: compactResult.status === 'failed' || compactResult.status === 'skipped' ? WorkflowNodeStatusEnum.Warning : WorkflowNodeStatusEnum.Passed,
    logs: [compactResult.summary, parseStringValue(compactResult.error || '').trim()].filter(Boolean),
  };
};

const executeGroupedActionNode: WorkflowNodeHandler = async (context) => {
  const properties = {
    ...parseRecordValue(context.node.properties),
    ...parseRecordValue((context.node as unknown as Record<string, unknown>).runtime),
  };
  const modelId = parseStringValue(context.node.modelId).trim();
  const actionName = parseStringValue(properties.action).trim() as AgentActionName;

  if (!actionName) {
    return {
      output: { error: 'action is required.' },
      status: WorkflowNodeStatusEnum.Failed,
      logs: ['action is required.'],
    };
  }

  if (!groupedActionAllowed(modelId, actionName)) {
    const message = `${actionName} is not allowed for ${modelId}.`;
    return {
      output: { error: message },
      status: WorkflowNodeStatusEnum.Failed,
      logs: [message],
    };
  }

  return executeActionNode(context, actionName, properties);
};

const buildGroupedActionNodeHandlers = (): Record<string, WorkflowNodeHandler> => {
  const handlers: Record<string, WorkflowNodeHandler> = {};
  for (const modelId of WORKFLOW_GROUPED_ACTION_NODE_IDS) {
    handlers[modelId] = executeGroupedActionNode;
  }
  return handlers;
};

const executeSerpSearchNode: WorkflowNodeHandler = async (context) => {
  const properties = parseRecordValue(context.node.properties);
  const query = parseStringValue(properties.query).trim();

  if (!query) {
    return {
      output: { error: 'query is required.' },
      status: WorkflowNodeStatusEnum.Failed,
      logs: ['query is required.'],
    };
  }

  const maxResults = parseNumberValue(properties.max_results, 6);
  const result = await searchSerpWeb({
    query,
    num: Math.max(1, Math.min(12, maxResults)),
    location: parseStringValue(properties.location || 'United States'),
    hl: parseStringValue(properties.language || 'en'),
  });

  return {
    output: result,
    status: WorkflowNodeStatusEnum.Passed,
  };
};

const executeAnalyzeTextWithModelNode: WorkflowNodeHandler = async (context) => {
  const properties = parseRecordValue(context.node.properties);
  const model = parseStringValue(properties.model || 'gpt-4.1-mini');
  const prompt = parseStringValue(properties.prompt || JSON.stringify(context.input, null, 2));
  const response = await callOpenAIModel(model, prompt, {
    temperature: parseNumberValue(properties.temperature, 0.2),
  });

  return {
    output: response,
    status: WorkflowNodeStatusEnum.Passed,
  };
};

const buildProviderPrompt = (context: Parameters<WorkflowNodeHandler>[0], properties: Record<string, unknown>): string =>
  parseStringValue(properties.prompt || JSON.stringify(context.input, null, 2));

const compactProviderResponse = (value: unknown): unknown => {
  const record = parseRecordValue(value);
  const raw = parseRecordValue(record.raw);
  if (!Object.keys(raw).length) return value;

  return {
    ...record,
    raw: {
      id: raw.id ?? null,
      model: raw.model ?? null,
      status: raw.status ?? null,
      output_text: raw.output_text ?? null,
      usage: raw.usage ?? null,
    },
  };
};

const ENV_API_KEY_BY_SERVICE_ID: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY', 'CHATGPT_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  claude: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
};

const resolveProviderEnvApiKey = (serviceId: string): string => {
  const envNames = ENV_API_KEY_BY_SERVICE_ID[serviceId] || [];
  for (const envName of envNames) {
    const value = EnvLoader.get(envName);
    if (value) return value;
  }
  return '';
};

const resolveProviderCredentialApiKey = (context: Parameters<WorkflowNodeHandler>[0]): string => {
  const runtimeValues = parseRecordValue(context.node.runtime);
  const properties = parseRecordValue(context.node.properties);
  const runtimeApiKey = parseStringValue(runtimeValues.apiKey || runtimeValues.api_key || properties.apiKey || properties.api_key).trim();
  if (runtimeApiKey) return runtimeApiKey;

  const serviceId = credentialServiceId(context) || 'provider';
  if (!context.credential) {
    const envApiKey = resolveProviderEnvApiKey(serviceId);
    if (envApiKey) return envApiKey;
    throw new Error(`Node "${context.node.name}" requires an attached credential, runtime API key, or ${serviceId} env API key.`);
  }

  const values = parseRecordValue(context.credential.values);
  const apiKey = parseStringValue(values.api_key ?? values.apiKey).trim();
  if (apiKey) return apiKey;

  const envApiKey = resolveProviderEnvApiKey(serviceId);
  if (envApiKey) return envApiKey;
  throw new Error(`Credential "${context.credential.credentialName}" does not contain an API key.`);
};

const toProviderFailureResult = (error: unknown, fallbackMessage: string): WorkflowNodeHandlerResult => {
  const message = error instanceof Error ? error.message : fallbackMessage;
  return {
    output: { error: message },
    status: WorkflowNodeStatusEnum.Failed,
    logs: [message],
  };
};

const executeOpenAINode: WorkflowNodeHandler = async (context) => {
  try {
    const properties = parseRecordValue(context.node.properties);
    const model = parseStringValue(properties.model || DEFAULT_OPENAI_MODEL);
    const prompt = buildProviderPrompt(context, properties);
    const response = await callOpenAIModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
      temperature: parseNumberValue(properties.temperature, 0.2),
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    return toProviderFailureResult(error, 'OpenAI request failed.');
  }
};

const executeClaudeNode: WorkflowNodeHandler = async (context) => {
  try {
    const properties = parseRecordValue(context.node.properties);
    const model = parseStringValue(properties.model || DEFAULT_CLAUDE_MODEL);
    const prompt = buildProviderPrompt(context, properties);
    const response = await callClaudeModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
      signal: context.signal,
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    return toProviderFailureResult(error, 'Claude request failed.');
  }
};

const executeGeminiNode: WorkflowNodeHandler = async (context) => {
  try {
    const properties = parseRecordValue(context.node.properties);
    const model = parseStringValue(properties.model || DEFAULT_GEMINI_MODEL);
    const prompt = buildProviderPrompt(context, properties);
    const response = await callGeminiModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    return toProviderFailureResult(error, 'Gemini request failed.');
  }
};

const executeGroqNode: WorkflowNodeHandler = async (context) => {
  try {
    const properties = parseRecordValue(context.node.properties);
    const model = parseStringValue(properties.model || DEFAULT_GROQ_MODEL);
    const prompt = buildProviderPrompt(context, properties);
    const response = await callGroqModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
      signal: context.signal,
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    return toProviderFailureResult(error, 'Groq request failed.');
  }
};

const executeDeepSeekNode: WorkflowNodeHandler = async (context) => {
  const properties = parseRecordValue(context.node.properties);
  const model = parseStringValue(properties.model || DEFAULT_DEEPSEEK_MODEL);
  const prompt = buildProviderPrompt(context, properties);
  try {
    const response = await callDeepSeekModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
      temperature: parseNumberValue(properties.temperature, 0.2),
      signal: context.signal,
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek request failed.';

    return {
      output: { error: message },
      status: WorkflowNodeStatusEnum.Failed,
      logs: [message],
    };
  }
};

const executePerplexityNode: WorkflowNodeHandler = async (context) => {
  const properties = parseRecordValue(context.node.properties);
  const model = parseStringValue(properties.model || DEFAULT_PERPLEXITY_MODEL);
  const prompt = buildProviderPrompt(context, properties);
  try {
    const response = await callPerplexityModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
      temperature: parseNumberValue(properties.temperature, 0.2),
      signal: context.signal,
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Perplexity request failed.';

    return {
      output: { error: message },
      status: WorkflowNodeStatusEnum.Failed,
      logs: [message],
    };
  }
};

const executeMistralNode: WorkflowNodeHandler = async (context) => {
  const properties = parseRecordValue(context.node.properties);
  const model = parseStringValue(properties.model || DEFAULT_MISTRAL_MODEL);
  const prompt = buildProviderPrompt(context, properties);
  try {
    const response = await callMistralModel(model, prompt, {
      apiKey: resolveProviderCredentialApiKey(context),
      temperature: parseNumberValue(properties.temperature, 0.2),
      signal: context.signal,
    });

    return {
      output: compactProviderResponse(response),
      status: WorkflowNodeStatusEnum.Passed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mistral request failed.';

    return {
      output: { error: message },
      status: WorkflowNodeStatusEnum.Failed,
      logs: [message],
    };
  }
};

const executeMcpRuntimeNode: WorkflowNodeHandler = async (context) => {
  try {
    const result = await executeWorkflowMcpRuntimeNode({
      runtime: context.node.runtime,
      input: parseRecordValue(context.input).input ?? context.input,
      manager: getWorkflowMcpRuntimeManager(context.hostContext),
      credential: context.credential,
    });
    return {
      ...result,
      status: result.status === 'passed' ? WorkflowNodeStatusEnum.Passed : WorkflowNodeStatusEnum.Failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP runtime execution failed.';
    return {
      output: { error: message, __activeOutputs: ['output'] },
      status: WorkflowNodeStatusEnum.Failed,
      logs: [message],
    };
  }
};

const executeMcpCapabilitiesNode: WorkflowNodeHandler = async (context) => {
  try {
    const result = await executeWorkflowMcpCapabilitiesNode({
      runtime: context.node.properties ?? context.node.runtime,
      input: parseRecordValue(context.input).input ?? context.input,
      manager: getWorkflowMcpRuntimeManager(context.hostContext),
      credential: context.credential,
    });
    return {
      ...result,
      status: result.status === 'passed' ? WorkflowNodeStatusEnum.Passed : WorkflowNodeStatusEnum.Failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP capabilities execution failed.';
    return {
      output: { error: message, __activeOutputs: ['output'] },
      status: WorkflowNodeStatusEnum.Failed,
      logs: [message],
    };
  }
};

export const WORKFLOW_NODE_HANDLERS: Record<string, WorkflowNodeHandler> = {
  'ai-agent': executeAgentRuntimeNode,
  [WorkflowRemoteNodeIdEnum.AiGovernor]: executeAgentRuntimeNode,
  'current-chat': executeCurrentChatNode,
  [WorkflowRemoteNodeIdEnum.McpRuntime]: executeMcpRuntimeNode,
  'mcp-capabilities': executeMcpCapabilitiesNode,
  [WorkflowRemoteNodeIdEnum.SerpSearch]: executeSerpSearchNode,
  [WorkflowRemoteNodeIdEnum.AnalyzeTextWithModel]: executeAnalyzeTextWithModelNode,
  ...buildGroupedActionNodeHandlers(),
  [WorkflowRemoteNodeIdEnum.OpenAI]: executeOpenAINode,
  [WorkflowRemoteNodeIdEnum.Claude]: executeClaudeNode,
  [WorkflowRemoteNodeIdEnum.Gemini]: executeGeminiNode,
  [WorkflowRemoteNodeIdEnum.Groq]: executeGroqNode,
  [WorkflowRemoteNodeIdEnum.DeepSeek]: executeDeepSeekNode,
  [WorkflowRemoteNodeIdEnum.Perplexity]: executePerplexityNode,
  [WorkflowRemoteNodeIdEnum.Mistral]: executeMistralNode,
  'workflow-file-download': executeWorkflowFileDownloadNode,
  'workflow-file-inspect': executeWorkflowFileInspectNode,
  'workflow-artifact-publish': executeWorkflowArtifactPublishNode,
  'shared-space': executeSharedSpaceNode,
  'scoped-node-manager': executeScopedNodeManagerNode,
  rcmCsvStreamProfiler: rcmTool('RCM CSV Stream Profiler'),
  rcmDecisionTreeTrainer: rcmTool('RCM Decision Tree Trainer'),
  rcmFeatureBuilder: rcmTool('RCM Feature Analysis'),
  rcmKnowledgePublisher: rcmTool('RCM Knowledge Publisher'),
  rcmModelScorer: rcmTool('RCM Model Scorer'),
  rcmNeuralNetTrainer: rcmTool('RCM Neural Net Trainer'),
};
