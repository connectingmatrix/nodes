import { executeBackendAgentTool } from '@connectingmatrix/workflow-driver/services/workflow/agent';
import { WorkflowNodeStatusEnum } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import type { WorkflowNodeHandlerContext, WorkflowNodeHandlerResult } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const executeAgentRuntimeTool = async (context: WorkflowNodeHandlerContext): Promise<WorkflowNodeHandlerResult> => {
  const input = record(context.input);
  const tool = record(input.tool) as never;
  const action = record(input.action) as never;
  const previousResults = Array.isArray(input.previousResults) ? (input.previousResults as never) : [];
  const result = await executeBackendAgentTool({ action, tool, context, previousResults });
  return {
    output: { output: result.output, files: result.files || [], logs: result.logs || [], error: result.error || null },
    status:
      result.status === 'failed'
        ? WorkflowNodeStatusEnum.Failed
        : result.status === 'confirmation_required'
        ? WorkflowNodeStatusEnum.Warning
        : WorkflowNodeStatusEnum.Passed,
    logs: result.logs || [],
  };
};
