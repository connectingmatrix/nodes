import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm/orm';

export type NodeRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  group_name?: string | null;
  node_schema?: Record<string, unknown> | null;
  source_files?: Record<string, unknown> | null;
  is_active?: boolean | null;
  scope_type?: string | null;
  scope_id?: string | null;
  organization_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PaginationInput = { first?: number | null; offset?: number | null };
type PageResult<T> = { records: T[]; hasNextPage: boolean; returnedCount: number; totalCount?: number };

const pageBounds = (input?: PaginationInput) => {
  const first = Math.max(0, Math.floor(Number(input?.first ?? 50)));
  const offset = Math.max(0, Math.floor(Number(input?.offset ?? 0)));
  return { first, offset };
};

@ENTITY({ table: 'workflow_user_nodes', label: 'Node', store: 'dual', primaryKey: 'id', graph: { mirror: true } })
@PERMISSIONS({ read: 'NODE_READ', list: 'NODE_LIST', create: 'NODE_CREATE', update: 'NODE_UPDATE', delete: 'NODE_DELETE' })
export class NodeEntity extends Entity<NodeRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare name: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare slug: string | null;

  @FIELD({ type: 'string' }) public declare description: string | null;

  @FIELD({ type: 'string' }) public declare group_name: string | null;

  @FIELD({ type: 'object', default: {} }) public declare node_schema: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare source_files: Record<string, unknown> | null;

  @FIELD({ type: 'boolean', default: true }) public declare is_active: boolean | null;

  @FIELD({ type: 'string', index: true }) public declare scope_type: string | null;

  @FIELD({ type: 'string', index: true }) public declare scope_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare organization_id: string | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;

  public static async listForUser(
    input: PaginationInput & {
      userId: string;
      organizationId?: string | null;
      type?: string | null;
    },
  ): Promise<PageResult<NodeEntity>> {
    const { first, offset } = pageBounds(input);
    let query = this.find({ scope_id: input.userId });
    if (input.organizationId) query = query.where({ organization_id: input.organizationId });
    if (input.type) query = query.where({ scope_type: input.type });
    const result = await query.orderBy('updated_at', 'desc').limit(first).offset(offset).manyWithCount();
    return {
      records: result.records,
      hasNextPage: offset + result.records.length < result.count,
      returnedCount: result.records.length,
      totalCount: result.count,
    };
  }

  public static async getNode(id: string): Promise<NodeEntity | null> {
    return this.single(id);
  }

  public static async createNode(input: Record<string, unknown>): Promise<NodeEntity> {
    return this.create(input);
  }

  public static async updateNode(id: string, patch: Record<string, unknown>): Promise<NodeEntity> {
    const node = await this.single(id);
    if (!node) throw new Error(`Node ${id} was not found.`);
    return node.update(patch);
  }

  public static async deleteNode(id: string): Promise<void> {
    const node = await this.single(id);
    if (node) await node.delete();
  }
}
