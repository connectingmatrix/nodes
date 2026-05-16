import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowNodeStatusEnum } from '@connectingmatrix/workflows/services/workflow/contracts/types';
import { WORKFLOW_NODE_HANDLERS } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/node-handlers';
import { createBackendNodeHandler } from '../../../../src/services/workflow/executor/runtime/backend-node-handler';

const createContext = () =>
  ({
    node: {
      id: 'openai_1',
      gigaId: 'openai_1',
      modelId: 'openai',
      type: 'workflowStep',
      name: 'OpenAI',
      description: '',
      kind: 'process',
      status: WorkflowNodeStatusEnum.Stopped,
      position: { x: 0, y: 0 },
      runtime: { prompt: 'Hello' },
      ports: { in: {}, out: {} },
    },
    workflow: {
      metadata: { id: 'workflow_1', name: 'Workflow 1' },
      nodes: [],
      connections: [],
    },
    settings: { graphqlUrl: '', authMode: 'none', manualHeaders: {} },
    input: { input: { query: 'Iran news' } },
    hostContext: {
      request: { headers: {} },
      supabase: {},
      userId: 'user_1',
    },
  } as any);

test('createBackendNodeHandler returns null for all nodes so every node runs through the worker sandbox', () => {
  assert.equal(createBackendNodeHandler('openai'), null);
  assert.equal(createBackendNodeHandler('claude'), null);
  assert.equal(createBackendNodeHandler('run-channel-action'), null);
  assert.equal(createBackendNodeHandler('run-category-action'), null);
  assert.equal(createBackendNodeHandler('serp-search'), null);
});

test('createBackendNodeHandler keeps AI Governor on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('ai-governor'), null);
});

test('createBackendNodeHandler keeps AI Agent on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('ai-agent'), null);
});

test('createBackendNodeHandler bridges Current Chat through the backend request context', () => {
  assert.equal(typeof createBackendNodeHandler('current-chat'), 'function');
});

test('createBackendNodeHandler keeps Text Analysis on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('text-analysis'), null);
});

test('createBackendNodeHandler keeps Action Router on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('action-router'), null);
});

test('createBackendNodeHandler keeps Planner on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('chat-plan-policy'), null);
});

test('createBackendNodeHandler keeps Validate Workflow Cypher on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('validate-workflow-cypher'), null);
});

test('createBackendNodeHandler keeps Workflow on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('workflow'), null);
});

test('createBackendNodeHandler keeps Execute Workflow on the worker execution path', () => {
  assert.equal(createBackendNodeHandler('execute-workflow'), null);
});

test('worker-owned utility nodes are not registered as backend handlers', () => {
  assert.equal(createBackendNodeHandler('merge'), null);
  assert.equal(createBackendNodeHandler('if-else'), null);
  assert.equal(createBackendNodeHandler('respond-end'), null);
  assert.equal(WORKFLOW_NODE_HANDLERS.merge, undefined);
  assert.equal(WORKFLOW_NODE_HANDLERS['if-else'], undefined);
  assert.equal(WORKFLOW_NODE_HANDLERS['respond-end'], undefined);
});
