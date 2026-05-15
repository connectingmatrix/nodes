import { GraphQLClient } from './ui/graphql-client.js';
import { InMemoryRepository, type BaseRecord } from './entity/repository.js';
import { makeId, nowIso, type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';

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

const repo = new InMemoryRepository<NodeRecord>('nodes');
const client = new GraphQLClient();
let endpoint = '/graphql';

function contextFromUnknown(args: unknown): RequestContext {
  return (args && typeof args === 'object' && 'context' in args ? (args as { context?: RequestContext }).context : undefined) ?? {};
}

export const Nodes = {
  bindWithServer(url: string) { endpoint = url.replace(/\/$/, ''); client.bindWithServer(endpoint); return Nodes; },
  create(input: NodeInput, context: RequestContext = {}) { return repo.create({ ...input, status: 'active' }, context); },
  getObject(id: string, context: RequestContext = {}) { return repo.get(id, context); },
  getList(pagination: PaginationOptions = {}, context: RequestContext = {}): ListResult<NodeRecord> { return repo.list(context, pagination); },
  search(term: string, context: RequestContext = {}) { return repo.search(term, context, ['name', 'description']); },
  update(id: string, patch: Partial<NodeRecord>, context: RequestContext = {}) { return repo.update(id, patch, context); },
  delete(id: string, context: RequestContext = {}) { return repo.delete(id, context); },
  health(): PackageHealth { return { name: '@connectingmatrix/nodes', status: 'ok', checkedAt: nowIso(), details: { endpoint, count: repo.list({ root: true }).total } }; },
};

export const graphql = {
  namespace: 'nodes',
  typeDefs: `
    scalar JSON
    type Node { id: ID!, name: String!, description: String, status: String, createdAt: String!, updatedAt: String! }
    input NodeInput { name: String!, description: String }
    type NodeList { items: [Node!]!, total: Int! }
    type Query {
      nodesHealth: String!
      nodesList(limit: Int, offset: Int): NodeList!
      nodesGet(id: ID!): Node
      nodesSearch(term: String!): [Node!]!
    }
    type Mutation {
      nodesCreate(input: NodeInput!): Node!
      nodesUpdate(id: ID!, input: NodeInput!): Node!
      nodesDelete(id: ID!): Boolean!
    }
  `,
  resolvers: {
    Query: {
      nodesHealth: () => Nodes.health().status,
      nodesList: (parent: unknown, args: { limit?: number; offset?: number }, ctx: RequestContext) => Nodes.getList(args, ctx),
      nodesGet: (parent: unknown, args: { id: string }, ctx: RequestContext) => Nodes.getObject(args.id, ctx),
      nodesSearch: (parent: unknown, args: { term: string }, ctx: RequestContext) => Nodes.search(args.term, ctx),
    },
    Mutation: {
      nodesCreate: (parent: unknown, args: { input: NodeInput }, ctx: RequestContext) => Nodes.create(args.input, ctx),
      nodesUpdate: (parent: unknown, args: { id: string; input: Partial<NodeRecord> }, ctx: RequestContext) => Nodes.update(args.id, args.input, ctx),
      nodesDelete: (parent: unknown, args: { id: string }, ctx: RequestContext) => Nodes.delete(args.id, ctx),
    },
  },
  migrations: ['migrations/0001_init.sql'],
};

export function createPackage(): PackageModule {
  return {
    name: '@connectingmatrix/nodes',
    version: '0.1.0',
    health: () => Nodes.health(),
    graphql,
    migrations: graphql.migrations,
    routes: [
      { method: 'GET', path: '/nodes/health', handler: () => Nodes.health() },
      { method: 'GET', path: '/nodes', handler: (request) => Nodes.getList({}, contextFromUnknown(request)) },
    ],
  };
}

export * from './contracts.js';
