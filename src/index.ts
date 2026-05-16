import { GraphQLClient } from './client/graphql-client.js';
import { InMemoryRepository, type BaseRecord } from './entity/repository.js';
import { LocalEventBus, makeId, nowIso, type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';
import { createStubLauncher } from './launcher.js';
import { PackageObservability } from './observability.js';

export interface NodeSourceFile { path: string; content: string; }
export interface NodeRecord extends BaseRecord { name: string; description?: string; status?: string; slug?: string; nodeSchema?: Record<string, unknown>; sourceFiles?: Record<string, string>; metadata?: Record<string, unknown>; }
export interface NodeInput { name: string; description?: string; slug?: string; nodeSchema?: Record<string, unknown>; sourceFiles?: Record<string, string>; metadata?: Record<string, unknown>; source?: string; code?: string; }
export interface NodeValidation { valid: boolean; errors: string[]; warnings: string[]; entrypoint?: string; fileCount: number; }
export interface NodeExecution extends BaseRecord { nodeId: string; status: 'queued'|'running'|'success'|'error'|'aborted'; input?: unknown; output?: unknown; logs: string[]; processId: string; }
export type NodeDebugMode = 'create'|'create-node'|'debug'|'execute';
export interface NodeDebugSession extends BaseRecord { nodeId?: string; mode: NodeDebugMode; browserContext: Record<string, unknown>; messages: number; }
export interface NodeDebugEvent extends BaseRecord { sessionId: string; nodeId?: string; role: 'user'|'assistant'|'system'; content: string; metadata?: Record<string, unknown>; }
export interface NodePackageFile { fileName: string; extension: '.node'; mimeType: 'application/x-connectingmatrix-node'; content: Uint8Array; manifest: Record<string, unknown>; }
export interface NodeAIAgent { run(input: { message: string; node?: NodeRecord; mode: NodeDebugMode; validation?: NodeValidation; execute: (input?: unknown) => Promise<NodeExecution>; browserContext: Record<string, unknown> }, context: RequestContext): Promise<{ output: string; actions: string[]; patch?: Partial<NodeRecord>; execution?: NodeExecution; nodePackage?: NodePackageFile }>; }
export type NodeExecutorAdapter = (node: NodeRecord, input: unknown, context: RequestContext) => Promise<{ output?: unknown; logs?: string[] }> | { output?: unknown; logs?: string[] };
export interface ProcessMonitoringLike {
  start?: (input: { kind: string; packageName: string; title: string; targetId?: string; context?: RequestContext; metadata?: Record<string, unknown> }) => { id?: string; processId?: string };
  register?: (input: { processId?: string; id?: string; kind?: string; packageName?: string; name?: string; title?: string; targetId?: string; metadata?: Record<string, unknown> }, context?: RequestContext) => { id?: string; processId?: string };
  heartbeat?: (processId: string, input?: { status?: string; message?: string; metadata?: Record<string, unknown> }) => unknown;
  appendLog?: (processId: string, level: 'debug'|'info'|'warn'|'error', message: string, data?: unknown) => unknown;
  complete?: (processId: string, metadata?: Record<string, unknown>) => unknown;
  fail?: (processId: string, error: unknown, metadata?: Record<string, unknown>) => unknown;
  abort?: (processId: string, reason?: string) => unknown;
}

export interface FileModuleLike { createNodePackageAdapter?: (provider?: string) => { createNodePackage: (manifest: Record<string, unknown>) => Promise<Uint8Array>; extractNodePackage: (archive: Uint8Array|string) => Promise<Record<string, unknown>>; uploadNodePackage?: (name: string, archive: Uint8Array, context?: RequestContext) => Promise<unknown> }; createSourceArchiveAdapter?: (provider?: string) => { createArchive: (entries: NodeSourceFile[]) => Promise<Uint8Array>; extractArchive: (archive: Uint8Array|string) => Promise<NodeSourceFile[]> }; }

const repo = new InMemoryRepository<NodeRecord>('nodes');
const executions = new InMemoryRepository<NodeExecution>('node_execution');
const debugSessions = new InMemoryRepository<NodeDebugSession>('node_debug_session');
const debugEvents = new InMemoryRepository<NodeDebugEvent>('node_debug_event');
const client = new GraphQLClient();
const bus = new LocalEventBus();
let endpoint = '/graphql';
let executorAdapter: NodeExecutorAdapter | undefined;
let nodeAgent: NodeAIAgent | undefined;
let debugSink: ((event: NodeDebugEvent, context: RequestContext) => Promise<void>|void) | undefined;
let processMonitoring: ProcessMonitoringLike | undefined;
let fileModule: FileModuleLike | undefined;
let nodePackageProvider = 'memory';

function processIdOf(row: unknown, fallback: string) { const value = row && typeof row === 'object' ? row as { id?: string; processId?: string } : undefined; return value?.id ?? value?.processId ?? fallback; }
function contextFromUnknown(args: unknown): RequestContext { return (args && typeof args === 'object' && 'context' in args ? (args as { context?: RequestContext }).context : undefined) ?? {}; }
function slugify(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node'; }
function normalizeInput(input: NodeInput): NodeInput { const sourceFiles = input.sourceFiles ?? ((input.source ?? input.code) ? { 'index.ts': input.source ?? input.code ?? '' } : undefined); return { ...input, sourceFiles }; }
function sourceFiles(node: NodeRecord | NodeInput): Record<string, string> { return node.sourceFiles ?? { 'index.ts': `export default async function ${slugify(node.name).replace(/-/g, '_')}(input: unknown) { return { ok: true, input }; }` }; }
function nodeManifest(node: NodeRecord): Record<string, unknown> { return { format: 'connectingmatrix-node-package-v1', version: 1, exportedAt: nowIso(), node: { name: node.name, description: node.description, slug: node.slug ?? slugify(node.name), nodeSchema: node.nodeSchema ?? {}, sourceFiles: sourceFiles(node), metadata: node.metadata ?? {} } }; }
async function encodeNodePackage(node: NodeRecord): Promise<NodePackageFile> {
  const manifest = nodeManifest(node);
  const adapter = fileModule?.createNodePackageAdapter?.(nodePackageProvider);
  const archiveAdapter = fileModule?.createSourceArchiveAdapter?.(nodePackageProvider);
  let content: Uint8Array;
  if (adapter) content = await adapter.createNodePackage(manifest);
  else if (archiveAdapter) content = await archiveAdapter.createArchive([{ path: 'node.json', content: JSON.stringify(manifest, null, 2) }, ...Object.entries(sourceFiles(node)).map(([path, content]) => ({ path: `src/${path}`, content }))]);
  else throw new Error('@connectingmatrix/file node package or source archive adapter is required');
  return { fileName: `${String((manifest.node as { slug?: string }).slug ?? slugify(node.name))}.node`, extension: '.node', mimeType: 'application/x-connectingmatrix-node', content, manifest };
}
async function decodeNodePackage(input: string | Uint8Array | NodePackageFile | Record<string, unknown>): Promise<NodeInput> {
  let raw: unknown;
  const adapter = fileModule?.createNodePackageAdapter?.(nodePackageProvider);
  const archiveAdapter = fileModule?.createSourceArchiveAdapter?.(nodePackageProvider);
  if (input instanceof Uint8Array) {
    if (adapter) raw = await adapter.extractNodePackage(input);
    else if (archiveAdapter) { const entries = await archiveAdapter.extractArchive(input); const manifest = entries.find((entry) => entry.path === 'node.json' || entry.path.endsWith('/node.json')); if (!manifest) throw new Error('Invalid .node package: node.json not found'); raw = JSON.parse(manifest.content); }
    else throw new Error('@connectingmatrix/file node package or source archive adapter is required');
  } else if (typeof input === 'string') {
    const clean = input.replace(/^data:.*?;base64,/, '');
    try { raw = JSON.parse(Buffer.from(clean, 'base64').toString('utf8')); } catch { raw = JSON.parse(input); }
  } else if ('manifest' in input) raw = (input as NodePackageFile).manifest;
  else raw = input;
  const node = (raw as { node?: NodeInput }).node ?? raw as NodeInput;
  if (!node.name) throw new Error('.node package is missing node.name');
  return node;
}
async function logDebug(input: Omit<NodeDebugEvent,'id'|'createdAt'|'updatedAt'|'userId'|'organizationId'>, context: RequestContext) { const event = debugEvents.create(input, context); await debugSink?.(event, context); await PackageObservability.emit('info','node-debug-event',{ processId: `node-debug:${event.sessionId}`, nodeId: event.nodeId, role: event.role }, context); return event; }
const defaultNodeAgent: NodeAIAgent = { async run(input, context) {
  const lower = input.message.toLowerCase();
  const actions: string[] = [];
  let patch: Partial<NodeRecord> | undefined;
  let execution: NodeExecution | undefined;
  let nodePackage: NodePackageFile | undefined;
  if (!input.node || lower.includes('create')) { const name = (input.message.match(/name:\s*([^,\n]+)/i)?.[1] ?? input.node?.name ?? (input.message.replace(/^(create|build)\s+/i,'').slice(0,80) || 'Generated Node')).trim(); patch = { name, slug: slugify(name), description: `Generated by Node Creator AI: ${input.message}`, nodeSchema: { input: 'unknown', output: 'unknown' }, sourceFiles: { 'index.ts': 'export default async function run(input) { return { ok: true, input }; }' } }; actions.push('create-node'); }
  if (lower.includes('validate') || lower.includes('debug')) actions.push('validate-node');
  if (lower.includes('execute') || lower.includes('run')) { try { execution = await input.execute({ source: 'node-ai' }); actions.push('execute-node'); } catch { actions.push('execute-node-pending'); } }
  if (lower.includes('download') || lower.includes('.node') || lower.includes('package')) { if (input.node) nodePackage = await encodeNodePackage(input.node); actions.push('export-node-package'); }
  return { output: [`Node AI ${input.mode}`, `Validation: ${input.validation?.valid ?? 'pending'}`, `Actions: ${actions.join(', ') || 'inspect'}`].join('\n'), actions, patch, execution, nodePackage };
} };

export const Nodes = {
  bindWithServer(url: string) { endpoint = url.replace(/\/$/, ''); client.bindWithServer(endpoint); return Nodes; },
  bindLogger(logger: unknown) { PackageObservability.bind({ logger: logger as never }); return Nodes; },
  bindSockets(sockets: unknown) { PackageObservability.bind({ sockets: sockets as never }); return Nodes; },
  bindProcessMonitor(monitor: ProcessMonitoringLike) { processMonitoring = monitor; return Nodes; },
  bindProcessMonitoring(monitor: ProcessMonitoringLike) { processMonitoring = monitor; return Nodes; },
  useFileModule(api: FileModuleLike, provider = 'memory') { fileModule = api; nodePackageProvider = provider; return Nodes; },
  setExecutorAdapter(adapter: NodeExecutorAdapter) { executorAdapter = adapter; return Nodes; },
  bindNodeAgent(agent: NodeAIAgent) { nodeAgent = agent; return Nodes; },
  setAIAssistantAdapter(agent: NodeAIAgent) { nodeAgent = agent; return Nodes; },
  setNodeAgent(agent: NodeAIAgent) { nodeAgent = agent; return Nodes; },
  setDebugSink(sink: typeof debugSink) { debugSink = sink; return Nodes; },
  create(input: NodeInput, context: RequestContext = {}) { const normalized = normalizeInput(input); return repo.create({ ...normalized, slug: normalized.slug ?? slugify(normalized.name), sourceFiles: normalized.sourceFiles ?? sourceFiles(normalized), nodeSchema: normalized.nodeSchema ?? {}, status: 'active' }, context); },
  getObject(id: string, context: RequestContext = {}) { return repo.get(id, context); },
  getList(pagination: PaginationOptions = {}, context: RequestContext = {}): ListResult<NodeRecord> { return repo.list(context, pagination); },
  search(term: string, context: RequestContext = {}) { return repo.search(term, context, ['name', 'description', 'slug']); },
  update(id: string, patch: Partial<NodeRecord>, context: RequestContext = {}) { return repo.update(id, patch, context); },
  delete(id: string, context: RequestContext = {}) { return repo.delete(id, context); },
  validate(target: string | NodeInput, context: RequestContext = {}): NodeValidation {
    const node = typeof target === 'string' ? repo.get(target, context) : ({ id: 'draft', createdAt: nowIso(), updatedAt: nowIso(), ...normalizeInput(target) } as NodeRecord);
    if (!node) throw new Error('Node not found');
    const files = sourceFiles(node); const errors: string[] = []; const warnings: string[] = [];
    if (!node.name?.trim()) errors.push('Node name is required');
    if (!Object.keys(files).length) errors.push('Node must include at least one source file');
    const entrypoint = files['index.ts'] ? 'index.ts' : files['index.js'] ? 'index.js' : Object.keys(files)[0];
    if (!entrypoint) errors.push('Node package has no entrypoint');
    if (entrypoint && !/export\s+default|module\.exports|exports\./.test(files[entrypoint] ?? '')) warnings.push('Entrypoint does not obviously export a runnable handler');
    return { valid: errors.length === 0, errors, warnings, entrypoint, fileCount: Object.keys(files).length };
  },
  async execute(id: string, input?: unknown, context: RequestContext = {}) {
    const node = repo.get(id, context); if (!node) throw new Error('Node not found');
    const validation = Nodes.validate(id, context); if (!validation.valid) throw new Error(`Node validation failed: ${validation.errors.join('; ')}`);
    const executionId = makeId('node_execution'); const fallbackPid = `node:${executionId}`;
    const proc = processMonitoring?.start?.({ kind: 'Nodes', packageName: '@connectingmatrix/nodes', title: `Node ${node.name}`, targetId: fallbackPid, context, metadata: { nodeId: id, executionId } });
    const processId = processIdOf(proc, fallbackPid);
    const execution = executions.create({ id: executionId, nodeId: id, status: 'running', input, logs: ['Node execution started'], processId }, context);
    PackageObservability.track(processId, { label: `Node ${node.name}`, status: 'running', progress: 20, kind: 'node', context: { nodeId: id, executionId } }, context); processMonitoring?.appendLog?.(processId, 'info', 'Node execution started', { nodeId: id, executionId });
    try {
      const result = executorAdapter ? await executorAdapter(node, input, context) : { output: { ok: true, nodeId: id, input, entrypoint: validation.entrypoint }, logs: ['No node executor adapter configured; static validation execution completed'] };
      const done = executions.update(execution.id, { status: 'success', output: result.output, logs: ['Node execution started', ...(result.logs ?? []), 'Node execution completed'] }, context);
      processMonitoring?.complete?.(processId, { nodeId: id, executionId }); PackageObservability.track(processId, { label: `Node ${node.name}`, status: 'completed', progress: 100, kind: 'node', completedAt: nowIso(), context: { nodeId: id, executionId } }, context);
      await bus.emit('node:execute', done); return done;
    } catch (error) {
      const failed = executions.update(execution.id, { status: 'error', logs: ['Node execution started', error instanceof Error ? error.message : String(error)] }, context);
      processMonitoring?.fail?.(processId, error, { nodeId: id, executionId }); PackageObservability.track(processId, { label: `Node ${node.name}`, status: 'failed', progress: 100, kind: 'node', completedAt: nowIso(), context: { nodeId: id, executionId } }, context);
      await bus.emit('node:execute', failed); throw error;
    }
  },
  abortExecution(executionId: string, reason = 'aborted by user', context: RequestContext = {}) { const execution = executions.get(executionId, context); if (!execution) throw new Error(`Node execution not found: ${executionId}`); const aborted = executions.update(executionId, { status: 'aborted', logs: [...execution.logs, reason] }, context); processMonitoring?.abort?.(execution.processId, reason); PackageObservability.abort(execution.processId, reason, context); return aborted; },
  executions: { list(nodeId?: string, context: RequestContext = {}) { const list = executions.list(context, { limit: 500 }).items; return nodeId ? list.filter((item) => item.nodeId === nodeId) : list; } },
  onNodeExecute(handler: (execution: NodeExecution) => void | Promise<void>) { return bus.on('node:execute', handler); },
  startDebugSession(input: { nodeId?: string; mode?: NodeDebugMode; browserContext?: Record<string, unknown>; clearContext?: boolean } = {}, context: RequestContext = {}) { if (input.nodeId) repo.get(input.nodeId, context); const session = debugSessions.create({ nodeId: input.nodeId, mode: input.mode ?? (input.nodeId ? 'debug' : 'create'), browserContext: input.clearContext ? {} : (input.browserContext ?? {}), messages: 0 }, context); const pid = `node-debug:${session.id}`; processMonitoring?.register?.({ processId: pid, kind: 'Nodes', packageName: '@connectingmatrix/nodes', name: `Node AI ${session.mode}`, targetId: session.id, metadata: { nodeId: input.nodeId } }, context); PackageObservability.track(pid, { label: `Node AI ${session.mode}`, status: 'running', progress: 1, kind: 'node', context: { nodeId: input.nodeId, sessionId: session.id } }, context); return session; },
  async createWithAI(input: { prompt: string; nodeType?: string }, context: RequestContext = {}) { const session = Nodes.startDebugSession({ mode: 'create', browserContext: { nodeType: input.nodeType } }, context); return Nodes.debugWithAI({ sessionId: session.id, message: `create node: ${input.prompt}`, mode: 'create' }, context); },
  async debugWithAI(arg1: { sessionId?: string; nodeId?: string; message: string; mode?: NodeDebugMode; browserContext?: Record<string, unknown>; clearContext?: boolean } | string = { message: 'debug node' }, arg2?: string | RequestContext, arg3: RequestContext = {}) {
    const input = typeof arg1 === 'string' ? { sessionId: arg1, ...(arg2 && typeof arg2 === 'object' ? arg2 as { message?: string; mode?: NodeDebugMode; browserContext?: Record<string, unknown>; clearContext?: boolean } : { message: String(arg2 ?? 'debug node') }), message: arg2 && typeof arg2 === 'object' && 'message' in arg2 ? String((arg2 as { message?: unknown }).message ?? 'debug node') : String(arg2 ?? 'debug node') } : arg1;
    const context = typeof arg1 === 'string' ? arg3 : (arg2 as RequestContext | undefined) ?? {};
    const session = input.sessionId ? debugSessions.get(input.sessionId, context) : Nodes.startDebugSession({ nodeId: input.nodeId, mode: input.mode, browserContext: input.browserContext, clearContext: input.clearContext }, context);
    if (!session) throw new Error(`Node debug session not found: ${input.sessionId}`);
    const node = session.nodeId ? repo.get(session.nodeId, context) : undefined; const processId = `node-debug:${session.id}`;
    processMonitoring?.heartbeat?.(processId, { status: 'ok', message: 'Node AI debug running', metadata: { nodeId: session.nodeId } });
    await logDebug({ sessionId: session.id, nodeId: session.nodeId, role: 'user', content: input.message }, context);
    const validation = node ? Nodes.validate(node.id, context) : undefined; const agent = nodeAgent ?? defaultNodeAgent;
    const result = await agent.run({ message: input.message, node, mode: session.mode, validation, execute: async (runInput) => { if (!node) throw new Error('No node exists yet to execute'); return Nodes.execute(node.id, runInput, context); }, browserContext: session.browserContext }, context);
    let updatedNode = node;
    if (result.patch) updatedNode = node ? Nodes.update(node.id, result.patch, context) : Nodes.create(result.patch as NodeInput, context);
    let execution = result.execution;
    if (!execution && updatedNode && result.actions.some((a) => a.includes('execute'))) execution = await Nodes.execute(updatedNode.id, { source: 'node-ai-post-create' }, context);
    let nodePackage = result.nodePackage;
    if (!nodePackage && updatedNode && /download|\.node|package/i.test(input.message)) nodePackage = await Nodes.exportNodePackage(updatedNode.id, context);
    debugSessions.update(session.id, { nodeId: updatedNode?.id ?? session.nodeId, messages: session.messages + 2 }, context);
    await logDebug({ sessionId: session.id, nodeId: updatedNode?.id ?? session.nodeId, role: 'assistant', content: result.output, metadata: { actions: result.actions } }, context);
    processMonitoring?.complete?.(processId, { nodeId: updatedNode?.id, actions: result.actions }); PackageObservability.track(processId, { label: `Node AI ${session.mode}`, status: 'completed', progress: 100, kind: 'node', completedAt: nowIso(), context: { nodeId: updatedNode?.id ?? session.nodeId, actions: result.actions } }, context);
    return { ...result, execution, nodePackage, node: updatedNode };
  },
  debugEvents(sessionId?: string, context: RequestContext = {}) { const all = debugEvents.list(context, { limit: 1000 }).items; return sessionId ? all.filter((event) => event.sessionId === sessionId) : all; },
  async exportNodePackage(id: string, context: RequestContext = {}) { const node = repo.get(id, context); if (!node) throw new Error('Node not found'); return encodeNodePackage(node); },
  downloadNodePackage(id: string, context: RequestContext = {}) { return Nodes.exportNodePackage(id, context); },
  async importDraggedNode(input: string | Uint8Array | NodePackageFile | Record<string, unknown>, context: RequestContext = {}) { return Nodes.importNodePackage(input, context); },
  async importNodePackage(input: string | Uint8Array | NodePackageFile | Record<string, unknown>, context: RequestContext = {}) { return Nodes.create(await decodeNodePackage(input), context); },
  launcher: createStubLauncher,
  health(): PackageHealth { return { name: '@connectingmatrix/nodes', status: 'ok', checkedAt: nowIso(), details: { endpoint, count: repo.list({ root: true }).total, executions: executions.list({ root: true }).total, debugSessions: debugSessions.list({ root: true }).total, executorAdapter: Boolean(executorAdapter), nodeAgent: Boolean(nodeAgent), nodePackageProvider: fileModule ? '@connectingmatrix/file' : 'local-fallback', processMonitoring: Boolean(processMonitoring), ...PackageObservability.healthDetails() } }; },
};

export const graphql = {
  namespace: 'nodes',
  typeDefs: `scalar JSON type Node { id: ID!, name: String!, description: String, status: String, createdAt: String!, updatedAt: String! } input NodeInput { name: String!, description: String } type NodeList { items: [Node!]!, total: Int! } type NodeValidation { valid: Boolean!, errors: [String!]!, warnings: [String!]!, entrypoint: String, fileCount: Int! } type NodeExecution { id: ID!, nodeId: ID!, status: String!, logs: [String!]! } type NodeDebugSession { id: ID!, nodeId: ID, mode: String!, messages: Int! } type Query { nodesHealth: String!, nodesList(limit: Int, offset: Int): NodeList!, nodesGet(id: ID!): Node, nodesSearch(term: String!): [Node!]!, nodesValidate(id: ID!): NodeValidation!, nodesExecutions(nodeId: ID): [NodeExecution!]!, nodesDebugEvents(sessionId: ID): String! } type Mutation { nodesCreate(input: NodeInput!): Node!, nodesUpdate(id: ID!, input: NodeInput!): Node!, nodesDelete(id: ID!): Boolean!, nodesExecute(id: ID!): NodeExecution!, nodesStartDebug(nodeId: ID, mode: String): NodeDebugSession!, nodesDebugWithAI(sessionId: ID, nodeId: ID, message: String!): String!, nodesImportPackage(content: String!): Node! }`,
  resolvers: { Query: { nodesHealth: () => Nodes.health().status, nodesList: (parent: unknown, args: { limit?: number; offset?: number }, ctx: RequestContext) => Nodes.getList(args, ctx), nodesGet: (parent: unknown, args: { id: string }, ctx: RequestContext) => Nodes.getObject(args.id, ctx), nodesSearch: (parent: unknown, args: { term: string }, ctx: RequestContext) => Nodes.search(args.term, ctx), nodesValidate: (_: unknown, args: { id: string }, ctx: RequestContext) => Nodes.validate(args.id, ctx), nodesExecutions: (_: unknown, args: { nodeId?: string }, ctx: RequestContext) => Nodes.executions.list(args.nodeId, ctx), nodesDebugEvents: (_: unknown, args: { sessionId?: string }, ctx: RequestContext) => JSON.stringify(Nodes.debugEvents(args.sessionId, ctx)) }, Mutation: { nodesCreate: (parent: unknown, args: { input: NodeInput }, ctx: RequestContext) => Nodes.create(args.input, ctx), nodesUpdate: (parent: unknown, args: { id: string; input: Partial<NodeRecord> }, ctx: RequestContext) => Nodes.update(args.id, args.input, ctx), nodesDelete: (parent: unknown, args: { id: string }, ctx: RequestContext) => Nodes.delete(args.id, ctx), nodesExecute: (_: unknown, args: { id: string }, ctx: RequestContext) => Nodes.execute(args.id, undefined, ctx), nodesStartDebug: (_: unknown, args: { nodeId?: string; mode?: NodeDebugMode }, ctx: RequestContext) => Nodes.startDebugSession(args, ctx), nodesDebugWithAI: async (_: unknown, args: { sessionId?: string; nodeId?: string; message: string }, ctx: RequestContext) => JSON.stringify(await Nodes.debugWithAI(args, ctx)), nodesImportPackage: async (_: unknown, args: { content: string }, ctx: RequestContext) => Nodes.importNodePackage(args.content, ctx) } },
  migrations: ['migrations/0001_init.sql'],
};

export function createPackage(): PackageModule {
  return { name: '@connectingmatrix/nodes', version: '0.3.0', health: () => Nodes.health(), graphql, migrations: graphql.migrations, launcher: createStubLauncher, routes: [{ method: 'GET', path: '/nodes/health', handler: () => Nodes.health() }, { method: 'GET', path: '/nodes', handler: (request) => Nodes.getList({}, contextFromUnknown(request)) }, { method: 'POST', path: '/nodes/debug', handler: (request) => Nodes.debugWithAI((request as { body?: { sessionId?: string; nodeId?: string; message?: string }, context?: RequestContext }).body ? { ...(request as { body: { sessionId?: string; nodeId?: string; message?: string } }).body, message: (request as { body: { message?: string } }).body.message ?? 'debug node' } : { message: 'debug node' }, (request as { context?: RequestContext }).context ?? {}) }, { method: 'POST', path: '/nodes/package/import', handler: (request) => Nodes.importNodePackage((request as { body?: { content?: string } }).body?.content ?? '', (request as { context?: RequestContext }).context ?? {}) }], runtime: { Nodes, observability: PackageObservability } };
}

export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './launcher.js';
