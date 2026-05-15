import { type BaseRecord } from './entity/repository.js';
import { type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';
export interface NodeRecord extends BaseRecord {
    name: string;
    description?: string;
    status?: string;
    metadata?: Record<string, unknown>;
}
export interface NodeInput {
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
}
export declare const Nodes: {
    bindWithServer(url: string): /*elided*/ any;
    create(input: NodeInput, context?: RequestContext): NodeRecord;
    getObject(id: string, context?: RequestContext): NodeRecord | undefined;
    getList(pagination?: PaginationOptions, context?: RequestContext): ListResult<NodeRecord>;
    search(term: string, context?: RequestContext): NodeRecord[];
    update(id: string, patch: Partial<NodeRecord>, context?: RequestContext): NodeRecord;
    delete(id: string, context?: RequestContext): boolean;
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
            }, ctx: RequestContext) => NodeRecord | undefined;
            nodesSearch: (parent: unknown, args: {
                term: string;
            }, ctx: RequestContext) => NodeRecord[];
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
        };
    };
    migrations: string[];
};
export declare function createPackage(): PackageModule;
export * from './contracts.js';
