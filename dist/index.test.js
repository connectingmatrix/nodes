import test from 'node:test';
import assert from 'node:assert/strict';
import { Nodes } from './index.js';
test('@connectingmatrix/nodes crud, debug AI, executor, and .node packages work', async () => {
    const ctx = { userId: 'u1' };
    Nodes.useFileModule({
        createSourceArchiveAdapter: () => ({
            async createArchive(entries) { return new TextEncoder().encode(JSON.stringify(entries)); },
            async extractArchive(archive) {
                const text = archive instanceof Uint8Array ? new TextDecoder().decode(archive) : archive;
                return JSON.parse(text);
            }
        })
    });
    const row = Nodes.create({ name: 'demo', sourceFiles: { 'index.ts': 'export default async function run(input) { return input; }' } }, ctx);
    assert.equal(Nodes.getObject(row.id, ctx)?.name, 'demo');
    assert.equal(Nodes.getList({}, ctx).total >= 1, true);
    assert.equal(Nodes.validate(row.id, ctx).valid, true);
    const execution = await Nodes.execute(row.id, { hello: true }, ctx);
    assert.equal(execution.status, 'success');
    const debug = await Nodes.debugWithAI({ nodeId: row.id, message: 'debug execute download .node package', mode: 'debug' }, ctx);
    assert.equal(typeof debug.output, 'string');
    assert.equal(debug.execution?.status, 'success');
    assert.equal(debug.nodePackage?.extension, '.node');
    const pkg = await Nodes.downloadNodePackage(row.id, ctx);
    assert.equal(pkg.extension, '.node');
    const imported = await Nodes.importDraggedNode(pkg, ctx);
    assert.equal(imported.name, 'demo');
});
