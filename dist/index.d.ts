import { type BaseRecord } from './entity/repository.js';
import { type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';
import { createPackageStatusPanel } from './services/package-status.service.js';
export interface NodeSourceFile {
    path: string;
    content: string;
}
export interface NodeRecord extends BaseRecord {
    name: string;
    description?: string;
    status?: string;
    slug?: string;
    nodeSchema?: Record<string, unknown>;
    sourceFiles?: Record<string, string>;
    metadata?: Record<string, unknown>;
}
export interface NodeInput {
    name: string;
    description?: string;
    slug?: string;
    nodeSchema?: Record<string, unknown>;
    sourceFiles?: Record<string, string>;
    metadata?: Record<string, unknown>;
    source?: string;
    code?: string;
}
export interface NodeValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
    entrypoint?: string;
    fileCount: number;
}
export interface NodeExecution extends BaseRecord {
    nodeId: string;
    status: 'queued' | 'running' | 'success' | 'error' | 'aborted';
    input?: unknown;
    output?: unknown;
    logs: string[];
    processId: string;
}
export type NodeDebugMode = 'create' | 'create-node' | 'debug' | 'execute';
export interface NodeDebugSession extends BaseRecord {
    nodeId?: string;
    mode: NodeDebugMode;
    browserContext: Record<string, unknown>;
    messages: number;
}
export interface NodeDebugEvent extends BaseRecord {
    sessionId: string;
    nodeId?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
}
export interface NodePackageFile {
    fileName: string;
    extension: '.node';
    mimeType: 'application/x-connectingmatrix-node';
    content: Uint8Array;
    manifest: Record<string, unknown>;
}
export interface NodeAIAgent {
    run(input: {
        message: string;
        node?: NodeRecord;
        mode: NodeDebugMode;
        validation?: NodeValidation;
        execute: (input?: unknown) => Promise<NodeExecution>;
        browserContext: Record<string, unknown>;
    }, context: RequestContext): Promise<{
        output: string;
        actions: string[];
        patch?: Partial<NodeRecord>;
        execution?: NodeExecution;
        nodePackage?: NodePackageFile;
    }>;
}
export type NodeExecutorAdapter = (node: NodeRecord, input: unknown, context: RequestContext) => Promise<{
    output?: unknown;
    logs?: string[];
}> | {
    output?: unknown;
    logs?: string[];
};
export interface ProcessMonitoringLike {
    start?: (input: {
        kind: string;
        packageName: string;
        title: string;
        targetId?: string;
        context?: RequestContext;
        metadata?: Record<string, unknown>;
    }) => {
        id?: string;
        processId?: string;
    };
    register?: (input: {
        processId?: string;
        id?: string;
        kind?: string;
        packageName?: string;
        name?: string;
        title?: string;
        targetId?: string;
        metadata?: Record<string, unknown>;
    }, context?: RequestContext) => {
        id?: string;
        processId?: string;
    };
    heartbeat?: (processId: string, input?: {
        status?: string;
        message?: string;
        metadata?: Record<string, unknown>;
    }) => unknown;
    appendLog?: (processId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => unknown;
    complete?: (processId: string, metadata?: Record<string, unknown>) => unknown;
    fail?: (processId: string, error: unknown, metadata?: Record<string, unknown>) => unknown;
    abort?: (processId: string, reason?: string) => unknown;
}
export interface FileModuleLike {
    createNodePackageAdapter?: (provider?: string) => {
        createNodePackage: (manifest: Record<string, unknown>) => Promise<Uint8Array>;
        extractNodePackage: (archive: Uint8Array | string) => Promise<Record<string, unknown>>;
        uploadNodePackage?: (name: string, archive: Uint8Array, context?: RequestContext) => Promise<unknown>;
    };
    createSourceArchiveAdapter?: (provider?: string) => {
        createArchive: (entries: NodeSourceFile[]) => Promise<Uint8Array>;
        extractArchive: (archive: Uint8Array | string) => Promise<NodeSourceFile[]>;
    };
}
declare let debugSink: ((event: NodeDebugEvent, context: RequestContext) => Promise<void> | void) | undefined;
export declare const Nodes: {
    bindWithServer(url: string): /*elided*/ any;
    bindLogger(logger: unknown): /*elided*/ any;
    bindSockets(sockets: unknown): /*elided*/ any;
    bindProcessMonitor(monitor: ProcessMonitoringLike): /*elided*/ any;
    bindProcessMonitoring(monitor: ProcessMonitoringLike): /*elided*/ any;
    useFileModule(api: FileModuleLike, provider?: string): /*elided*/ any;
    setExecutorAdapter(adapter: NodeExecutorAdapter): /*elided*/ any;
    bindNodeAgent(agent: NodeAIAgent): /*elided*/ any;
    setAIAssistantAdapter(agent: NodeAIAgent): /*elided*/ any;
    setNodeAgent(agent: NodeAIAgent): /*elided*/ any;
    setDebugSink(sink: typeof debugSink): /*elided*/ any;
    create(input: NodeInput, context?: RequestContext): NodeRecord;
    getObject(id: string, context?: RequestContext): NodeRecord;
    getList(pagination?: PaginationOptions, context?: RequestContext): ListResult<NodeRecord>;
    search(term: string, context?: RequestContext): NodeRecord[];
    update(id: string, patch: Partial<NodeRecord>, context?: RequestContext): NodeRecord;
    delete(id: string, context?: RequestContext): boolean;
    validate(target: string | NodeInput, context?: RequestContext): NodeValidation;
    execute(id: string, input?: unknown, context?: RequestContext): Promise<NodeExecution>;
    abortExecution(executionId: string, reason?: string, context?: RequestContext): NodeExecution;
    executions: {
        list(nodeId?: string, context?: RequestContext): NodeExecution[];
    };
    onNodeExecute(handler: (execution: NodeExecution) => void | Promise<void>): () => void;
    startDebugSession(input?: {
        nodeId?: string;
        mode?: NodeDebugMode;
        browserContext?: Record<string, unknown>;
        clearContext?: boolean;
    }, context?: RequestContext): NodeDebugSession;
    createWithAI(input: {
        prompt: string;
        nodeType?: string;
    }, context?: RequestContext): Promise<{
        execution: NodeExecution;
        nodePackage: NodePackageFile;
        node: NodeRecord;
        output: string;
        actions: string[];
        patch?: Partial<NodeRecord>;
    }>;
    debugWithAI(arg1?: {
        sessionId?: string;
        nodeId?: string;
        message: string;
        mode?: NodeDebugMode;
        browserContext?: Record<string, unknown>;
        clearContext?: boolean;
    } | string, arg2?: string | RequestContext, arg3?: RequestContext): Promise<{
        execution: NodeExecution;
        nodePackage: NodePackageFile;
        node: NodeRecord;
        output: string;
        actions: string[];
        patch?: Partial<NodeRecord>;
    }>;
    debugEvents(sessionId?: string, context?: RequestContext): NodeDebugEvent[];
    exportNodePackage(id: string, context?: RequestContext): Promise<NodePackageFile>;
    downloadNodePackage(id: string, context?: RequestContext): Promise<NodePackageFile>;
    importDraggedNode(input: string | Uint8Array | NodePackageFile | Record<string, unknown>, context?: RequestContext): Promise<NodeRecord>;
    importNodePackage(input: string | Uint8Array | NodePackageFile | Record<string, unknown>, context?: RequestContext): Promise<NodeRecord>;
    launcher: typeof createPackageStatusPanel;
    health(): PackageHealth;
};
export declare const graphql: {
    namespace: string;
    typeDefs: string;
    resolvers: {
        Query: {
            nodesHealth: () => "ok" | "degraded" | "down";
            nodesList: (parent: unknown, args: {
                limit?: number;
                offset?: number;
            }, ctx: RequestContext) => ListResult<NodeRecord>;
            nodesGet: (parent: unknown, args: {
                id: string;
            }, ctx: RequestContext) => NodeRecord;
            nodesSearch: (parent: unknown, args: {
                term: string;
            }, ctx: RequestContext) => NodeRecord[];
            nodesValidate: (_: unknown, args: {
                id: string;
            }, ctx: RequestContext) => NodeValidation;
            nodesExecutions: (_: unknown, args: {
                nodeId?: string;
            }, ctx: RequestContext) => NodeExecution[];
            nodesDebugEvents: (_: unknown, args: {
                sessionId?: string;
            }, ctx: RequestContext) => string;
        };
        Mutation: {
            nodesCreate: (parent: unknown, args: {
                input: NodeInput;
            }, ctx: RequestContext) => NodeRecord;
            nodesUpdate: (parent: unknown, args: {
                id: string;
                input: Partial<NodeRecord>;
            }, ctx: RequestContext) => NodeRecord;
            nodesDelete: (parent: unknown, args: {
                id: string;
            }, ctx: RequestContext) => boolean;
            nodesExecute: (_: unknown, args: {
                id: string;
            }, ctx: RequestContext) => Promise<NodeExecution>;
            nodesStartDebug: (_: unknown, args: {
                nodeId?: string;
                mode?: NodeDebugMode;
            }, ctx: RequestContext) => NodeDebugSession;
            nodesDebugWithAI: (_: unknown, args: {
                sessionId?: string;
                nodeId?: string;
                message: string;
            }, ctx: RequestContext) => Promise<string>;
            nodesImportPackage: (_: unknown, args: {
                content: string;
            }, ctx: RequestContext) => Promise<NodeRecord>;
        };
    };
    migrations: string[];
};
export declare function createPackage(): PackageModule;
export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './services/package-status.service.js';
