import { parseRecordValue, parseStringValue } from 'giga-ai-helper/workflow';
import { executeBackendAgentTool, executeSharedAgentRuntime, toWorkflowNodeHandlerResult } from '@connectingmatrix/workflows/services/workflow/agent';
import { WorkflowNodeStatusEnum, type WorkflowNodeHandler } from '@connectingmatrix/workflows/services/workflow/contracts/types';

const readKnowledge = (value: unknown): string | string[] | null => {
  if (Array.isArray(value)) return value.map((entry) => parseStringValue(entry)).filter(Boolean);
  const text = parseStringValue(value).trim();
  return text || null;
};

export const executeAgentRuntimeNode: WorkflowNodeHandler = async (context) => {
  const properties = parseRecordValue(context.node.properties);
  const runtime = { ...parseRecordValue(context.node.runtime), ...properties };
  const input = parseRecordValue(context.input);

  if (input.tool && input.action) {
    const result = await executeBackendAgentTool({
      action: input.action as never,
      context,
      previousResults: Array.isArray(input.previousResults) ? (input.previousResults as never) : [],
      tool: input.tool as never,
    });
    return {
      output:
        result.output && typeof result.output === 'object'
          ? { ...(result.output as Record<string, unknown>), files: result.files || [] }
          : { output: result.output, files: result.files || [] },
      status:
        result.status === 'failed'
          ? WorkflowNodeStatusEnum.Failed
          : result.status === 'skipped'
          ? WorkflowNodeStatusEnum.Warning
          : WorkflowNodeStatusEnum.Passed,
      logs: result.logs || [],
    };
  }

  const metadata = parseRecordValue(context.workflow.metadata);
  const message =
    parseStringValue(input.message || runtime.message || metadata.message || context.node.name || 'Complete the workflow agent task.').trim() ||
    'Complete the workflow agent task.';
  const confirmed = input.confirmed === true || runtime.confirmed === true || metadata.confirmed === true;
  const output = await executeSharedAgentRuntime(context, {
    confirmed,
    context: { input, runtime, workflow: { id: metadata.id, name: metadata.name, metadata } },
    knowledge: readKnowledge(input.knowledge || runtime.knowledge || metadata.knowledge),
    maxActionsPerPass: Number(runtime.maxActionsPerPass || 10),
    maxPasses: Number(runtime.maxPasses || 6),
    message,
    pendingPlan: parseRecordValue(input.pendingPlan || runtime.pendingPlan) as never,
    requestId: parseStringValue(metadata.runId || metadata.requestId),
    systemPrompt: parseStringValue(runtime.systemPrompt || runtime.prompt).trim() || null,
    tools: [],
  });
  return toWorkflowNodeHandlerResult(output);
};
