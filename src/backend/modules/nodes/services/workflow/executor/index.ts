import { createRunId, WorkflowLogLevelEnum, WorkflowDefinition as SharedWorkflowDefinition } from '@workflow/executor';
import {
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowExecutionRunOptions,
  WorkflowNodeHandlerResult,
  WorkflowNodeModel,
  WorkflowStepExecutionArgs,
  WorkflowStepExecutionResult,
} from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
// eslint-disable-next-line import/no-cycle
import { createWorkflowExecutorHostContext } from '@connectingmatrix/workflow-driver/services/workflow/runtime/credential-host-context';
import { workflowExecutor } from './runtime/runtime';
import { createCompatWorkflowLogger, resolveExecutionLogEvents } from './runtime/compat';

const emitWorkflowStarted = (options: WorkflowExecutionRunOptions, workflow: WorkflowDefinition, runId: string): void => {
  options.logger.push({
    workflowId: workflow.metadata.id,
    runId,
    event: 'workflow.started',
    level: WorkflowLogLevelEnum.Info,
  });
};

export const executeWorkflow = async (workflow: WorkflowDefinition, options: WorkflowExecutionRunOptions): Promise<WorkflowExecutionResult> => {
  const runId = options.runId || createRunId('run');
  emitWorkflowStarted(options, workflow, runId);
  const initialLogCount = options.logger.entries.length;
  const compatLogger = createCompatWorkflowLogger(options.logger);
  let receivedOnEvent = false;

  const result = await workflowExecutor.executeWorkflow(
    workflow as unknown as SharedWorkflowDefinition,
    {
      signal: options.signal,
      settings: options.settings,
      hostContext: options.hostContext || createWorkflowExecutorHostContext(options.requestContext),
      onNodeStart: options.onNodeStart,
      onNodeFinish: options.onNodeFinish ? (node) => options.onNodeFinish?.(node as unknown as WorkflowNodeModel) : undefined,
      onEvent: (event) => {
        receivedOnEvent = true;
        compatLogger.push(event);
      },
      logger: compatLogger,
    } as Parameters<typeof workflowExecutor.executeWorkflow>[1],
  );

  const normalizedLogs = resolveExecutionLogEvents(result, compatLogger.entries);
  if (!receivedOnEvent && options.logger.entries.length === initialLogCount) {
    normalizedLogs.forEach((event) => compatLogger.push(event));
  }

  return {
    workflow: result.workflow as unknown as WorkflowDefinition,
    logs: normalizedLogs,
    stopped: result.stopped,
    runId,
  };
};

export const executeWorkflowStep = async (args: WorkflowStepExecutionArgs): Promise<WorkflowStepExecutionResult> => {
  const runId = args.runId || createRunId('step');
  const initialLogCount = args.logger.entries.length;
  const compatLogger = createCompatWorkflowLogger(args.logger);
  let receivedOnEvent = false;

  const result = await workflowExecutor.executeNodeStep({
    workflow: args.workflow as unknown as SharedWorkflowDefinition,
    nodeId: args.nodeId,
    settings: args.settings,
    signal: args.signal,
    hostContext: args.hostContext || createWorkflowExecutorHostContext(args.requestContext),
    overrides: args.overrides,
    onPreviewLogLine: args.onPreviewLogLine,
    onPreviewState: args.onPreviewState,
    onEvent: (event) => {
      receivedOnEvent = true;
      compatLogger.push(event);
    },
    logger: compatLogger,
  } as Parameters<typeof workflowExecutor.executeNodeStep>[0]);

  if (!receivedOnEvent && args.logger.entries.length === initialLogCount) {
    const fallbackLogs = resolveExecutionLogEvents(result, compatLogger.entries);
    fallbackLogs.forEach((event) => compatLogger.push(event));
  }

  return {
    workflow: result.workflow as unknown as WorkflowDefinition,
    node: result.node as unknown as WorkflowStepExecutionResult['node'],
    result: result.result as WorkflowNodeHandlerResult,
    runId,
  };
};
