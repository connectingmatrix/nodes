import { WorkflowLogLevelEnum, WorkflowRunLogEvent } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import type { CompatWorkflowLogger, WorkflowExecutionLoggerTarget } from '@giga/shared/types/contracts/workflow.types';

export type { CompatWorkflowLogger, WorkflowExecutionLoggerTarget } from '@giga/shared/types/contracts/workflow.types';

const normalizeWorkflowRunLogEvent = (value: unknown): WorkflowRunLogEvent | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<WorkflowRunLogEvent>;
  if (typeof candidate.workflowId !== 'string') return null;
  if (typeof candidate.runId !== 'string') return null;
  if (typeof candidate.event !== 'string') return null;

  const level =
    candidate.level === WorkflowLogLevelEnum.Warn ||
    candidate.level === WorkflowLogLevelEnum.Error ||
    candidate.level === WorkflowLogLevelEnum.Debug ||
    candidate.level === WorkflowLogLevelEnum.Info
      ? candidate.level
      : WorkflowLogLevelEnum.Info;

  return {
    timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : new Date().toISOString(),
    workflowId: candidate.workflowId,
    runId: candidate.runId,
    event: candidate.event,
    level,
    nodeId: typeof candidate.nodeId === 'string' ? candidate.nodeId : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
    data: candidate.data,
  };
};

const normalizeWorkflowRunLogEvents = (source: unknown): WorkflowRunLogEvent[] => {
  if (!Array.isArray(source)) return [];
  return source.map((event) => normalizeWorkflowRunLogEvent(event)).filter((event): event is WorkflowRunLogEvent => Boolean(event));
};

export const createCompatWorkflowLogger = (target: WorkflowExecutionLoggerTarget): CompatWorkflowLogger => ({
  entries: target.entries,
  push: (event) => {
    const normalized = normalizeWorkflowRunLogEvent(event);
    if (!normalized) return;
    target.push({
      workflowId: normalized.workflowId,
      runId: normalized.runId,
      event: normalized.event,
      level: normalized.level,
      nodeId: normalized.nodeId,
      message: normalized.message,
      data: normalized.data,
    });
  },
});

export const resolveExecutionLogEvents = (result: unknown, fallback: WorkflowRunLogEvent[]): WorkflowRunLogEvent[] => {
  const candidate = result && typeof result === 'object' && !Array.isArray(result) ? (result as { events?: unknown; logs?: unknown }) : {};
  const fromResult = normalizeWorkflowRunLogEvents(
    Array.isArray(candidate.events) ? candidate.events : Array.isArray(candidate.logs) ? candidate.logs : [],
  );
  if (fromResult.length > 0) return fromResult;
  return normalizeWorkflowRunLogEvents(fallback);
};
