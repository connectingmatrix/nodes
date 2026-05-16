import { getWorkflowExecutionRequestContext } from '@connectingmatrix/workflow-driver/services/workflow/runtime/credential-host-context';
import { executeCurrentChatNode } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/current-chat';
import type { WorkflowNodeHandler } from '@workflow/executor';

export const createBackendNodeHandler = (modelId: string | undefined): WorkflowNodeHandler | null => {
  const normalizedModelId = String(modelId ?? '').trim();
  if (normalizedModelId === 'current-chat') {
    return (async (context) => {
      const requestContext =
        (context as unknown as { requestContext?: unknown }).requestContext ||
        getWorkflowExecutionRequestContext((context as unknown as { hostContext?: unknown }).hostContext);
      if (!requestContext) {
        throw new Error('Workflow request context is required for current-chat execution.');
      }
      const next = {
        ...(context as Record<string, unknown>),
        requestContext,
      };
      return executeCurrentChatNode(next as unknown as Parameters<typeof executeCurrentChatNode>[0]);
    }) as unknown as WorkflowNodeHandler;
  }
  return null;
};
