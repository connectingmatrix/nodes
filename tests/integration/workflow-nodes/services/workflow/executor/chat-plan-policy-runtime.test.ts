import assert from 'node:assert/strict';
import test from 'node:test';
import { Executor } from '@workflow/executor';

const cypher = [
  '(start:start {"name":"Start","runtime":{}})',
  '(confirmed:code {"name":"Confirmed","runtime":{"code":"return { confirmed: true };"} })',
  '(pending:code {"name":"Pending","runtime":{"code":"return { pendingPlan: { intent: \\"Run pending workflow\\", actions: [{ id: \\"a1\\", name: \\"execute_workflow\\", reason: \\"Run it\\", input: {}, depends_on: [] }] } };"} })',
  '(merge:merge {"name":"Merge","runtime":{"input1Value":"{{confirmed}}","input2Value":"{{pending}}"}})',
  '(policy:chat-plan-policy {"name":"Planner","runtime":{"confirmedWithoutPendingBehavior":"fail","sourceValue":"{{merge}}"}})',
  '(end:respond-end {"name":"Respond End","runtime":{"response":"{{policy}}"}})',
  '(start)-[:CONNECT {"source":"out:output","target":"in:input"}]->(confirmed)',
  '(start)-[:CONNECT {"source":"out:output","target":"in:input"}]->(pending)',
  '(confirmed)-[:CONNECT {"source":"out:output","target":"in:input1"}]->(merge)',
  '(pending)-[:CONNECT {"source":"out:output","target":"in:input2"}]->(merge)',
  '(merge)-[:CONNECT {"source":"out:output","target":"in:input"}]->(policy)',
  '(policy)-[:CONNECT {"source":"out:execute_confirmed","target":"in:input"}]->(end)',
].join('\n');

test('chat-plan-policy cypher fails compilation while the model is unavailable in executor schemas', () => {
  assert.throws(() => Executor.compileWorkflowCypher({ cypher, name: 'Chat Plan Policy Runtime' }), /Unknown node model "chat-plan-policy"/);
});

test('chat-plan-policy execute_now route remains unsupported until executor schema ships the model', () => {
  const modelCypher = [
    '(start:start {"name":"Start","runtime":{}})',
    '(plan:code {"name":"Plan","runtime":{"code":"return { plan: { intent: \\"Greeting\\", actions: [{ id: \\"a1\\", kind: \\"model\\", nodeId: \\"openai-19\\", name: \\"Chat Model\\", reason: \\"Reply to hello\\", input: { prompt: \\"Hello\\" }, depends_on: [] }] } };"} })',
    '(policy:chat-plan-policy {"name":"Planner","runtime":{"sourceValue":"{{plan}}"}})',
    '(end:respond-end {"name":"Respond End","runtime":{"response":"{{policy}}"}})',
    '(start)-[:CONNECT {"source":"out:output","target":"in:input"}]->(plan)',
    '(plan)-[:CONNECT {"source":"out:output","target":"in:input"}]->(policy)',
    '(policy)-[:CONNECT {"source":"out:execute_now","target":"in:input"}]->(end)',
  ].join('\n');
  assert.throws(
    () => Executor.compileWorkflowCypher({ cypher: modelCypher, name: 'Chat Plan Policy Model Runtime' }),
    /Unknown node model "chat-plan-policy"/,
  );
});
