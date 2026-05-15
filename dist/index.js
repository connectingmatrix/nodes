import { GraphQLClient } from './ui/graphql-client.js';
import { InMemoryRepository } from './entity/repository.js';
import { nowIso } from './contracts.js';
const repo = new InMemoryRepository('nodes');
const client = new GraphQLClient();
let endpoint = '/graphql';
function contextFromUnknown(args) {
    return (args && typeof args === 'object' && 'context' in args ? args.context : undefined) ?? {};
}
export const Nodes = {
    bindWithServer(url) { endpoint = url.replace(/\/$/, ''); client.bindWithServer(endpoint); return Nodes; },
    create(input, context = {}) { return repo.create({ ...input, status: 'active' }, context); },
    getObject(id, context = {}) { return repo.get(id, context); },
    getList(pagination = {}, context = {}) { return repo.list(context, pagination); },
    search(term, context = {}) { return repo.search(term, context, ['name', 'description']); },
    update(id, patch, context = {}) { return repo.update(id, patch, context); },
    delete(id, context = {}) { return repo.delete(id, context); },
    health() { return { name: '@connectingmatrix/nodes', status: 'ok', checkedAt: nowIso(), details: { endpoint, count: repo.list({ root: true }).total } }; },
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
            nodesList: (parent, args, ctx) => Nodes.getList(args, ctx),
            nodesGet: (parent, args, ctx) => Nodes.getObject(args.id, ctx),
            nodesSearch: (parent, args, ctx) => Nodes.search(args.term, ctx),
        },
        Mutation: {
            nodesCreate: (parent, args, ctx) => Nodes.create(args.input, ctx),
            nodesUpdate: (parent, args, ctx) => Nodes.update(args.id, args.input, ctx),
            nodesDelete: (parent, args, ctx) => Nodes.delete(args.id, ctx),
        },
    },
    migrations: ['migrations/0001_init.sql'],
};
export function createPackage() {
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
