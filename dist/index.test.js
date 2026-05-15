import test from 'node:test';
import assert from 'node:assert/strict';
import { Nodes } from './index.js';
test('@connectingmatrix/nodes crud works', () => {
    const row = Nodes.create({ name: 'demo' }, { userId: 'u1' });
    assert.equal(Nodes.getObject(row.id, { userId: 'u1' })?.name, 'demo');
    assert.equal(Nodes.getList({}, { userId: 'u1' }).total, 1);
});
