import test from 'node:test';
import assert from 'node:assert/strict';
import { Nodes } from './index.js';
test('nodes expose node package contract and sanctioned modules', () => {
    const Runtime = Nodes;
    assert.equal(Runtime.nodePackageContract().extension, '.node');
    assert.ok(Runtime.sanctionedModules().includes('zod'));
});
