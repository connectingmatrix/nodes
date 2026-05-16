import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getActionCatalog } from '@connectingmatrix/chat/services/chat/runtime/action';
import { GIGA_ACTION_NAMES } from '@connectingmatrix/chat/services/chat/actions/telemetry/catalog';
import { WorkflowAuthModeEnum, WorkflowNodeStatusEnum } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import { WORKFLOW_NODE_HANDLERS } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/node-handlers';
import { WORKFLOW_GROUPED_ACTION_NODE_ACTIONS } from '@connectingmatrix/nodes/services/workflow/nodes/runtime/action-node-registry';
import {
  executeWorkflowBackendRequest,
  validateWorkflowBackendDescriptor,
  WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID,
} from '../../../../src/services/workflow/executor/runtime/backend-dispatch';
import type { WorkflowBackendRequest } from '@giga/shared/types/contracts/workflow.types';

const SPECIALIZED_WORKFLOW_ACTIONS = new Set([
  'fetch_all_workflows',
  'fetch_workflow',
  'fetch_workflow_runs',
  'fetch_workflow_revisions',
  'fetch_workflow_node_catalog',
  'fetch_workflow_node_details',
  'validate_workflow_cypher',
  'create_workflow_from_cypher',
  'update_workflow_from_cypher',
  'create_workflow',
  'update_workflow',
  'delete_workflow',
  'execute_workflow',
  'get_workflow_output',
  'create_chart',
]);

const createRequest = (params: {
  modelId: string;
  descriptor?: WorkflowBackendRequest['descriptor'];
  runtime?: Record<string, unknown>;
  payloadRuntime?: Record<string, unknown>;
  credential?: Record<string, unknown>;
  input?: Record<string, unknown>;
}): WorkflowBackendRequest => ({
  context: {
    node: {
      id: 'node_1',
      gigaId: 'node_1',
      modelId: params.modelId,
      type: 'workflowStep',
      name: 'Node 1',
      description: '',
      kind: 'process',
      status: WorkflowNodeStatusEnum.Stopped,
      position: { x: 0, y: 0 },
      runtime: params.runtime ?? {},
      ports: {
        in: {},
        out: {},
      },
    },
    workflow: {
      metadata: {
        id: 'wf_backend_dispatch',
        name: 'Backend Dispatch Test',
      },
      nodes: [],
      connections: [],
    },
    settings: {
      graphqlUrl: '',
      authMode: WorkflowAuthModeEnum.None,
      manualHeaders: {},
    },
    input: params.input ?? {},
    hostContext: {
      request: {
        headers: {},
      },
      supabase: {},
      userId: 'user_1',
    },
  },
  descriptor: params.descriptor,
  payload: {
    NODE: {
      id: 'node_1',
      gigaId: 'node_1',
      modelId: params.modelId,
      type: 'workflowStep',
      name: 'Node 1',
      description: '',
      kind: 'process',
      status: WorkflowNodeStatusEnum.Stopped,
      position: { x: 0, y: 0 },
      runtime: params.payloadRuntime ?? params.runtime ?? {},
      ports: {
        in: {},
        out: {},
      },
      PORTS: {
        IN: {},
        OUT: {},
      },
      PROPERTIES: params.payloadRuntime ?? params.runtime ?? {},
      OUTPUT: null,
      CREDENTIAL: params.credential ?? null,
    },
  },
  args: [],
});

const createResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(body ? JSON.stringify(body) : '', { status, headers });

test('validateWorkflowBackendDescriptor rejects local-only workflow models', () => {
  assert.throws(
    () =>
      validateWorkflowBackendDescriptor('start', {
        key: 'executeStartNode',
      }),
    /not allowed/,
  );
});

test('validateWorkflowBackendDescriptor rejects worker-local utility nodes that no longer bridge to backend handlers', () => {
  assert.throws(
    () =>
      validateWorkflowBackendDescriptor('graphql', {
        key: 'executeGraphqlNode',
      }),
    /not allowed/,
  );
  assert.throws(
    () =>
      validateWorkflowBackendDescriptor('ai-governor', {
        key: 'executeAiGovernorNode',
      }),
    /not allowed|descriptor mismatch/i,
  );
  assert.throws(
    () =>
      validateWorkflowBackendDescriptor('chat-plan-policy', {
        key: 'executeChatPlanPolicyNode',
      }),
    /not allowed/,
  );
});

test('validateWorkflowBackendDescriptor allows current-chat node backend bridge', () => {
  const descriptor = validateWorkflowBackendDescriptor('current-chat', {
    key: 'executeCurrentChatNode',
  });
  assert.deepEqual(descriptor, {
    key: 'executeCurrentChatNode',
  });
});

test('validateWorkflowBackendDescriptor allows scoped node manager backend bridge', () => {
  assert.deepEqual(validateWorkflowBackendDescriptor('scoped-node-manager', { key: 'executeScopedNodeManagerNode' }), {
    key: 'executeScopedNodeManagerNode',
  });
  assert.equal(typeof WORKFLOW_NODE_HANDLERS['scoped-node-manager'], 'function');
});

test('validateWorkflowBackendDescriptor allows approved RCM user-node backend bridge keys', () => {
  const descriptor = validateWorkflowBackendDescriptor('user-node:d83108ea-8c06-4783-a1e6-1acdf9835add', {
    key: 'executeRcmFeatureBuilderNode',
  });
  assert.deepEqual(descriptor, {
    key: 'executeRcmFeatureBuilderNode',
  });
});

test('executeWorkflowBackendRequest dispatches current-chat key descriptors', async () => {
  const result = await executeWorkflowBackendRequest(
    createRequest({
      modelId: 'current-chat',
      descriptor: { key: 'executeCurrentChatNode' },
      runtime: { chatId: 'chat-1', message: 'hello', mode: ['input'] },
    }),
  );
  assert.equal(result.status, WorkflowNodeStatusEnum.Passed);
  assert.equal((result.output as any).chatId, 'chat-1');
});

test('validateWorkflowBackendDescriptor rejects worker-owned ai-agent node', () => {
  assert.throws(
    () =>
      validateWorkflowBackendDescriptor('ai-agent', {
        key: 'executeAiAgentNode',
      }),
    /backend execution is not allowed|descriptor mismatch/i,
  );
});

test('validateWorkflowBackendDescriptor rejects worker-owned validate-workflow-cypher node', () => {
  assert.throws(
    () =>
      validateWorkflowBackendDescriptor('validate-workflow-cypher', {
        key: 'executeValidateWorkflowCypherNode',
      }),
    /backend execution is not allowed|descriptor mismatch/i,
  );
});

test('workflow-native Workflow and Execute Workflow nodes keep explicit backend bridge descriptors', () => {
  assert.deepEqual(WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID.workflow, {
    key: 'executeWorkflowManagementBackendRequest',
  });
  assert.deepEqual(WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID['execute-workflow'], {
    key: 'executeWorkflowReferenceBackendRequest',
  });
});

test('executeWorkflowBackendRequest rejects descriptor mismatches', async () => {
  await assert.rejects(
    executeWorkflowBackendRequest(
      createRequest({
        modelId: 'mcp-runtime',
        descriptor: {
          key: 'executeOpenAINode',
        },
      }),
    ),
    /descriptor mismatch/,
  );
});

test('all grouped run-* nodes have grouped descriptors and registered handlers', () => {
  const runModelIds = Object.keys(WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID).filter((modelId) => modelId.startsWith('run-'));
  assert.deepEqual(runModelIds.sort(), Object.keys(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS).sort());

  for (const modelId of runModelIds) {
    const descriptor = WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID[modelId];
    assert.equal(descriptor?.key, 'executeGroupedActionNode');
    assert.equal(typeof WORKFLOW_NODE_HANDLERS[modelId], 'function');
  }
});

test('all action catalog entries have exactly one grouped node catalog, descriptor, and handler wiring', () => {
  const workflowNodesRoot = path.resolve(process.cwd(), '../workflow-nodes/src/nodes');
  const catalogSource = readFileSync(path.resolve(process.cwd(), '../workflow-nodes/src/node-utils/node-catalog.ts'), 'utf8');

  const actionNames = new Set<string>(Array.from(GIGA_ACTION_NAMES));
  for (const action of getActionCatalog()) actionNames.add(action.name);
  actionNames.delete('analyze_chat_history_intent');

  for (const modelId of Object.keys(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS)) {
    assert.equal(existsSync(path.join(workflowNodesRoot, modelId, `${modelId}-schema.json`)), true, `${modelId} schema is missing`);
    assert.equal(existsSync(path.join(workflowNodesRoot, modelId, `${modelId}-node.ts`)), true, `${modelId} node module is missing`);
    assert.equal(existsSync(path.join(workflowNodesRoot, modelId, 'worker.ts')), true, `${modelId} worker is missing`);
    assert.equal(catalogSource.includes(`/${modelId}/${modelId}-node`), true, `${modelId} is missing from node-catalog.ts`);
    assert.equal(WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID[modelId]?.key, 'executeGroupedActionNode');
    assert.equal(typeof WORKFLOW_NODE_HANDLERS[modelId], 'function');
  }

  for (const actionName of actionNames) {
    const owners = Object.entries(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS).filter(([, actions]) => actions.some((entry) => entry === actionName));
    if (SPECIALIZED_WORKFLOW_ACTIONS.has(actionName)) {
      assert.equal(owners.length, 0, `${actionName} should stay off grouped action nodes`);
      continue;
    }
    assert.equal(owners.length, 1, `${actionName} must be owned by exactly one grouped node`);
  }

  for (const [modelId, actions] of Object.entries(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS)) {
    for (const actionName of actions) assert.equal(actionNames.has(actionName), true, `${modelId} points at an unknown action ${actionName}`);
  }
});

test('executeWorkflowBackendRequest dispatches allowed MCP capability handlers using payload node properties', async () => {
  const originalFetch = globalThis.fetch;
  const descriptor = WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID['mcp-capabilities'];
  const credential = {
    id: 'cred-mcp-1',
    credentialId: 'cred-mcp-1',
    credentialName: 'Demo MCP',
    serviceId: 'mcp',
    serviceName: 'MCP',
    serviceIcon: null,
    scope: 'PERSONAL',
    values: {
      mcpServers: {
        demo: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
        },
      },
    },
  };
  try {
    const responses = [
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-1',
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'Demo MCP Server', version: '1.0.0' },
          capabilities: { tools: { list: true, call: true } },
        },
      }),
      createResponse(null, 202),
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-2',
        result: { tools: [{ name: 'GreetMe' }, { name: 'GenerateBike' }] },
      }),
    ];
    globalThis.fetch = (async () => responses.shift() as Response) as typeof fetch;

    const result = await executeWorkflowBackendRequest(
      createRequest({
        modelId: 'mcp-capabilities',
        descriptor,
        runtime: {},
        payloadRuntime: {
          credentialId: 'cred-mcp-1',
        },
        credential,
      }),
    );

    assert.equal(result.status, WorkflowNodeStatusEnum.Passed);
    assert.equal((result.output as any).protocolVersion, '2024-11-05');
    assert.equal((result.output as any).serverInfo.name, 'Demo MCP Server');
    assert.deepEqual(
      (result.output as any).tools.map((tool: Record<string, unknown>) => tool.name),
      ['GreetMe', 'GenerateBike'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeWorkflowBackendRequest dispatches MCP runtime tool calls using workflow input', async () => {
  const originalFetch = globalThis.fetch;
  const credential = {
    id: 'cred-mcp-1',
    credentialId: 'cred-mcp-1',
    credentialName: 'Demo MCP',
    serviceId: 'mcp',
    serviceName: 'MCP',
    serviceIcon: null,
    scope: 'PERSONAL',
    values: {
      mcpServers: {
        demo: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
        },
      },
    },
  };
  try {
    const responses = [
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-1',
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'Demo MCP Server', version: '1.0.0' },
          capabilities: { tools: { list: true, call: true } },
        },
      }),
      createResponse(null, 202),
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-2',
        result: { tools: [{ name: 'GreetMe' }] },
      }),
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-3',
        result: { content: [{ type: 'text', text: 'Hello Abeer!' }] },
      }),
    ];
    globalThis.fetch = (async () => responses.shift() as Response) as typeof fetch;

    const descriptor = WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID['mcp-runtime'];
    const result = await executeWorkflowBackendRequest(
      createRequest({
        modelId: 'mcp-runtime',
        descriptor,
        payloadRuntime: {
          credentialId: 'cred-mcp-1',
          capabilityQuery: 'debug tools',
        },
        credential,
        input: {
          input: {
            build_greet_request: {
              toolName: 'GreetMe',
              toolArguments: { name: 'Abeer' },
            },
          },
        },
      }),
    );

    assert.equal(result.status, WorkflowNodeStatusEnum.Passed);
    assert.equal((result.output as any).toolCall.name, 'GreetMe');
    assert.deepEqual((result.output as any).toolCall.arguments, { name: 'Abeer' });
    assert.equal((result.output as any).toolResult.content[0].text, 'Hello Abeer!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeWorkflowBackendRequest fails when multiple MCP tool calls are present', async () => {
  const originalFetch = globalThis.fetch;
  const credential = {
    id: 'cred-mcp-1',
    credentialId: 'cred-mcp-1',
    credentialName: 'Demo MCP',
    serviceId: 'mcp',
    serviceName: 'MCP',
    serviceIcon: null,
    scope: 'PERSONAL',
    values: {
      mcpServers: {
        demo: {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
        },
      },
    },
  };
  try {
    const responses = [
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-1',
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'Demo MCP Server', version: '1.0.0' },
          capabilities: { tools: { list: true, call: true } },
        },
      }),
      createResponse(null, 202),
      createResponse({
        jsonrpc: '2.0',
        id: 'mcp-2',
        result: { tools: [{ name: 'GreetMe' }, { name: 'GenerateBike' }] },
      }),
    ];
    globalThis.fetch = (async () => responses.shift() as Response) as typeof fetch;

    const descriptor = WORKFLOW_BACKEND_DESCRIPTOR_BY_MODEL_ID['mcp-runtime'];
    const result = await executeWorkflowBackendRequest(
      createRequest({
        modelId: 'mcp-runtime',
        descriptor,
        payloadRuntime: {
          credentialId: 'cred-mcp-1',
        },
        credential,
        input: {
          input: {
            first_node: { toolName: 'GreetMe', toolArguments: { name: 'Abeer' } },
            second_node: { toolName: 'GenerateBike', toolArguments: {} },
          },
        },
      }),
    );

    assert.equal(result.status, WorkflowNodeStatusEnum.Failed);
    assert.match(String((result.output as any).error || ''), /multiple MCP tool call candidates/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
