import assert from 'node:assert/strict';
import test from 'node:test';
import { Executor } from '@workflow/executor';
import { executeWorkflow } from '@connectingmatrix/nodes/services/workflow/executor';

const cypher = [
  '(start:start {"name":"Start","runtime":{}})',
  '(code:code {"name":"Code","runtime":{"code":"return \\"hello world\\";"}})',
  '(end:respond-end {"name":"Respond End","runtime":{"response":"{{code.output}}"}})',
  '(start)-[:CONNECT {"source":"out:output","target":"in:input"}]->(code)',
  '(code)-[:CONNECT {"source":"out:output","target":"in:input"}]->(end)',
].join('\n');

test('executeWorkflow runs slim built-in workflows without embedded executors', async () => {
  const compiled = Executor.compileWorkflowCypher({ cypher, name: 'Slim Workflow' });
  delete (compiled.workflow as any).NODE_EXECUTORS;
  delete (compiled.workflow as any).NODE_EXECUTOR_SIGNATURES;
  const result = await executeWorkflow(
    compiled.workflow as any,
    {
      settings: { graphqlUrl: '', authMode: 'none', manualHeaders: {} },
      hostContext: {},
      logger: { entries: [], push() {} },
      requestContext: { request: { headers: {} } as any, supabase: {} as any, userId: 'test-user' },
    } as any,
  );
  const endNode = result.workflow.nodes.find((node: any) => node.modelId === 'respond-end') as any;
  assert.equal(endNode?.ports?.out?.output, 'hello world');
});
