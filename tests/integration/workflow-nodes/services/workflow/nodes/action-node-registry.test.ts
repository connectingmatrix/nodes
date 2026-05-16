import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupedActionAllowed,
  WORKFLOW_GROUPED_ACTION_NODE_ACTIONS,
  WORKFLOW_GROUPED_ACTION_NODE_IDS,
} from '@connectingmatrix/nodes/services/workflow/nodes/runtime/action-node-registry';

test('grouped action registry exposes expected node ids and action extensions', () => {
  assert.equal(Array.isArray(WORKFLOW_GROUPED_ACTION_NODE_IDS), true);
  assert.deepEqual(WORKFLOW_GROUPED_ACTION_NODE_IDS.sort(), Object.keys(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS).sort());
  assert.equal(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS['run-subject-action'].includes('sync_subject_references_from_web'), true);
  assert.equal(WORKFLOW_GROUPED_ACTION_NODE_ACTIONS['run-chat-action'].includes('retrieve_db_chunks_and_analyze'), true);
});

test('groupedActionAllowed returns true only for allowed model/action pairs', () => {
  assert.equal(groupedActionAllowed('run-chat-action', 'scan_user_chats'), true);
  assert.equal(groupedActionAllowed('run-chat-action', 'create_workflow'), false);
  assert.equal(groupedActionAllowed('unknown-model', 'scan_user_chats'), false);
});
