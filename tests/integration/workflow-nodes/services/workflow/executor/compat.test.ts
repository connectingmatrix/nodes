import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowLogLevelEnum, WorkflowRunLogEvent } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import { createCompatWorkflowLogger, resolveExecutionLogEvents } from '../../../../src/services/workflow/executor/runtime/compat';

test('createCompatWorkflowLogger forwards events to target logger', () => {
  const entries: WorkflowRunLogEvent[] = [];
  const target = {
    entries,
    push: (event: Omit<WorkflowRunLogEvent, 'timestamp'>) => {
      entries.push({
        ...event,
        timestamp: new Date().toISOString(),
      });
    },
  };
  const compat = createCompatWorkflowLogger(target);

  compat.push({
    workflowId: 'wf_1',
    runId: 'run_1',
    event: 'node.started',
    level: WorkflowLogLevelEnum.Info,
    nodeId: 'node_1',
    message: 'Running Start',
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.workflowId, 'wf_1');
  assert.equal(entries[0]?.event, 'node.started');
  assert.equal(entries[0]?.level, WorkflowLogLevelEnum.Info);
});

test('resolveExecutionLogEvents prefers result.events', () => {
  const fallback: WorkflowRunLogEvent[] = [];
  const events = resolveExecutionLogEvents(
    {
      events: [
        {
          workflowId: 'wf_1',
          runId: 'run_1',
          event: 'node.finished',
          level: WorkflowLogLevelEnum.Info,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    fallback,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, 'node.finished');
});

test('resolveExecutionLogEvents falls back to result.logs then fallback entries', () => {
  const fromLogs = resolveExecutionLogEvents(
    {
      logs: [
        {
          workflowId: 'wf_2',
          runId: 'run_2',
          event: 'node.failed',
          level: WorkflowLogLevelEnum.Error,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    [],
  );
  assert.equal(fromLogs.length, 1);
  assert.equal(fromLogs[0]?.event, 'node.failed');

  const fallback: WorkflowRunLogEvent[] = [
    {
      workflowId: 'wf_3',
      runId: 'run_3',
      event: 'workflow.completed',
      level: WorkflowLogLevelEnum.Info,
      timestamp: new Date().toISOString(),
    },
  ];
  const fromFallback = resolveExecutionLogEvents({}, fallback);
  assert.equal(fromFallback.length, 1);
  assert.equal(fromFallback[0]?.event, 'workflow.completed');
});
