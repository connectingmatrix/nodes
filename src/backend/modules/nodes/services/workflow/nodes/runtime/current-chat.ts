import { buildAgentContext } from '@connectingmatrix/chat/services/chat/runtime/context';
import { getLegacySessionScope, getSessionScope, resolveChatScopeContext } from '@connectingmatrix/chat/services/chat/auth/scope';
import { ChatEntity, ChatMessageEntity, MessageChunkEntity, SubjectTagEntity, TagEntity } from '@connectingmatrix/orm/repositories/entities';
import { Subject } from '@connectingmatrix/orm/repositories/entities/tree/Subject';
import { WorkflowNodeHandler, WorkflowNodeStatusEnum } from '@connectingmatrix/workflows/services/workflow/contracts/types';

const record = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
const text = (value: unknown): string => String(value || '').trim();
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : []);
const withoutAll = (value: unknown): string[] => list(value).filter((entry) => entry !== '__all__');
const jsonRecord = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    return record(JSON.parse(text(value) || '{}'));
  } catch {
    return {};
  }
};
const optionalText = (value: unknown): string => {
  if (value == null) return '';
  const normalized = text(value).toLowerCase();
  if (normalized === 'null' || normalized === 'undefined') return '';
  return text(value);
};
const isTemplateValue = (value: string): boolean => value.includes('{{') && value.includes('}}');
const nonTemplateText = (...values: unknown[]): string => {
  for (const value of values) {
    const entry = optionalText(value);
    if (!entry || isTemplateValue(entry)) continue;
    return entry;
  }
  return '';
};
const runtimeUserId = (runtime: Record<string, any>, handler: Parameters<WorkflowNodeHandler>[0]): string =>
  optionalText(runtime.operationUserId) || optionalText(handler.requestContext.userId);
const planValue = (value: unknown): Record<string, any> => {
  const entry = record(value);
  const plans = [
    record(entry.plan),
    record(record(entry.input).plan),
    record(record(record(entry.input).agent).plan),
    record(record(record(record(entry.trueBranch).value).agent).plan),
    record(record(record(record(entry.falseBranch).value).agent).plan),
    record(record(entry.agent).plan),
    record(entry.pendingPlan),
  ];
  for (const plan of plans) if (Array.isArray(plan.actions)) return { intent: text(plan.intent), actions: plan.actions };
  if (Array.isArray(record(entry.input).actions)) return { intent: text(record(entry.input).intent), actions: record(entry.input).actions };
  if (Array.isArray(record(record(entry.input).agent).actions))
    return { intent: text(record(record(entry.input).agent).intent), actions: record(record(entry.input).agent).actions };
  if (Array.isArray(entry.actions)) return { intent: text(entry.intent), actions: entry.actions };
  return {};
};
const modes = (value: unknown) => (list(value).length ? list(value) : ['history']);
const fail = (message: string) => ({
  output: { error: message, __activeOutputs: ['output'] },
  status: WorkflowNodeStatusEnum.Failed,
  logs: [message],
});

const readSession = async (handler: Parameters<WorkflowNodeHandler>[0], chatId: string, limit: number, offset: number, includeMessages: boolean) => {
  const session = await ChatEntity.getScopedSession({ userId: handler.requestContext.userId, chatId });
  if (!session) return { chat: {}, messages: [] };
  const [chat, messages] = await Promise.all([
    Promise.resolve(session.payload),
    includeMessages
      ? ChatMessageEntity.listForChat({ chatId, first: limit, offset }).then((result) => result.records.map((record) => record.payload))
      : Promise.resolve([]),
  ]);
  return { chat: record(chat), messages };
};

const writeSession = async (handler: Parameters<WorkflowNodeHandler>[0], chatId: string, metadata: Record<string, unknown>) => {
  const session = await ChatEntity.getScopedSession({ userId: handler.requestContext.userId, chatId });
  if (!session) throw new Error('Chat session not found.');
  await session.update({ metadata });
};

const resolveSubjectIds = async (handler: Parameters<WorkflowNodeHandler>[0], input: Record<string, any>) => {
  const ids = new Set(withoutAll(input.subjectIds));
  const tagSlugs = withoutAll(input.tagSlugs);
  if (tagSlugs.length) {
    const tagIds = await TagEntity.findIdsBySlugs(tagSlugs);
    if (tagIds.length) {
      const relations = await SubjectTagEntity.findSubjectIdsByTagIds(tagIds);
      for (const entry of relations) if (text(entry.subject_id)) ids.add(text(entry.subject_id));
    }
  }
  if (text(input.subjectQuery)) {
    const matches = await Subject.searchIdsByQuery(text(input.subjectQuery));
    for (const entry of matches) if (text(entry.id)) ids.add(text(entry.id));
  }
  return Array.from(ids);
};

const resolveSessionScope = async (payload: Record<string, any>, handler: Parameters<WorkflowNodeHandler>[0]) => {
  const { session } = payload;
  const { requestedScope } = payload;
  const { requestedResolvedScope } = payload;
  const legacyScope = getLegacySessionScope(session);
  if (legacyScope) return legacyScope;
  const sessionScope = getSessionScope(session);
  if (!sessionScope) throw new Error('Chat session scope could not be resolved.');
  if (
    requestedResolvedScope &&
    requestedScope &&
    requestedScope.type === sessionScope.type &&
    requestedScope.id === sessionScope.id &&
    (requestedScope.organizationId || null) === (sessionScope.organizationId || null)
  ) {
    return requestedResolvedScope;
  }
  return resolveChatScopeContext(handler.requestContext.supabase, handler.requestContext.userId, sessionScope);
};

const executeOperation = async (handler: Parameters<WorkflowNodeHandler>[0], operation: string, runtime: Record<string, any>) => {
  if (operation === 'get_or_create_chat') {
    const metadata = record(runtime.operationMetadata);
    const scope = record(runtime.operationScope);
    const scopeSnapshot = record(runtime.operationScopeSnapshot);
    const chatId = nonTemplateText(runtime.chatId);
    const userId = runtimeUserId(runtime, handler);
    if (chatId) {
      const session = await ChatEntity.getScopedSession({ userId, chatId });
      if (!session) throw new Error('Chat session not found.');
      return { session: session.payload, created: false };
    }
    if (!scope.type || !scope.id) throw new Error('scope.type and scope.id are required when creating a chat session.');
    const session = await ChatEntity.ensureSession({
      userId,
      title: text(runtime.operationTitleFromMessage),
      systemPrompt: optionalText(runtime.operationSystemPrompt) || null,
      scopeType: text(scope.type) || null,
      scopeId: text(scope.id) || null,
      scopeSnapshot: Object.keys(scopeSnapshot).length ? scopeSnapshot : null,
      metadata: Object.keys(metadata).length ? metadata : null,
    });
    return { session: session.payload, created: true };
  }
  if (operation === 'update_chat_metadata') {
    const session = await ChatEntity.getScopedSession({ userId: handler.requestContext.userId, chatId: nonTemplateText(runtime.chatId) });
    if (!session) throw new Error('Chat session not found.');
    await session.update({ metadata: record(runtime.operationMetadata) });
    return { updated: true };
  }
  if (operation === 'get_chat_context') {
    return resolveSessionScope(
      {
        requestedResolvedScope: record(runtime.operationRequestedResolvedScope),
        requestedScope: record(runtime.operationRequestedScope),
        session: record(runtime.operationSession),
      },
      handler,
    );
  }
  if (operation === 'resolve_subject_filter') {
    const operationSubjectIds = withoutAll(runtime.operationSubjectIds);
    const operationTagSlugs = withoutAll(runtime.operationTagSlugs);
    const subjectIds = await resolveSubjectIds(handler, {
      subjectIds: operationSubjectIds,
      tagSlugs: operationTagSlugs,
      subjectQuery: runtime.operationSubjectQuery,
    });
    return {
      filterApplied: operationTagSlugs.length > 0 || text(runtime.operationSubjectQuery).length > 0,
      subjectIds,
    };
  }
  if (operation === 'save_message') {
    const chatId = nonTemplateText(runtime.chatId);
    const message = await ChatMessageEntity.saveMessage({
      chatId,
      userId: handler.requestContext.userId,
      content: text(runtime.operationContent),
      role: text(runtime.operationRole) || 'assistant',
      sourceRefs: Array.isArray(runtime.operationSourceRefs) ? runtime.operationSourceRefs : [],
    });
    if (Array.isArray(runtime.operationRetrievedChunks) && runtime.operationRetrievedChunks.length > 0) {
      await MessageChunkEntity.saveUsage({
        messageId: Number(message.id || 0),
        chunks: runtime.operationRetrievedChunks as Array<{ chunk_id: number; rank?: number | null; similarity?: number | null }>,
      });
    }
    if (chatId) {
      const session = await ChatEntity.getScopedSession({ userId: handler.requestContext.userId, chatId });
      if (session) await session.touch();
    }
    return message.payload;
  }
  throw new Error(`Unsupported current-chat operation: ${operation}`);
};

const executeBundleOperation: WorkflowNodeHandler = async (handler) => {
  const runtime = record(handler.node.runtime);
  const metadata = record(handler.workflow.metadata);
  const workflowInput = record(handler.workflow.input);
  const state = {
    chatId: nonTemplateText(runtime.chatId, metadata.chatId, workflowInput.chatId),
    message: text(runtime.message || metadata.message),
    scopeType: text(runtime.scopeType || record(metadata.scope).type) || null,
    scopeId: text(runtime.scopeId || record(metadata.scope).id) || null,
    subjectIds: list(runtime.subjectIds || metadata.subjectIds),
    postIds: list(runtime.postIds || metadata.postIds),
    tagSlugs: list(runtime.tagSlugs || metadata.tagSlugs),
    subjectQuery: text(runtime.subjectQuery || metadata.subjectQuery),
    topK: Number(runtime.topK || metadata.topK || 10),
    systemPrompt: text(runtime.systemPrompt || metadata.systemPrompt) || null,
  };
  if (!state.chatId) return fail('workflow.input.chatId is required for Current Chat node.');

  const selectedModes = modes(runtime.mode);
  const pendingMode = text(runtime.pendingAction || 'none') || 'none';
  const output: Record<string, any> = { context: {}, pendingPlan: null, hasPendingPlan: false, __activeOutputs: ['output'] };
  if (selectedModes.includes('input')) Object.assign(output, { ...state });

  let session: { chat: Record<string, any>; messages: any[] } = { chat: {}, messages: [] };
  let metadataState: Record<string, any> = {};
  const needsSessionRead = selectedModes.some((entry) => entry === 'history' || entry === 'context' || entry === 'pending') || pendingMode !== 'none';
  if (needsSessionRead) {
    session = await readSession(
      handler,
      state.chatId,
      Math.max(1, Math.min(200, Number(runtime.limit || 200))),
      Math.max(0, Number(runtime.offset || 0)),
      selectedModes.includes('history'),
    );
    metadataState = jsonRecord(session.chat.metadata);
  }

  if (selectedModes.includes('history')) Object.assign(output, { messages: session.messages, count: session.messages.length });
  if (selectedModes.includes('pending') || pendingMode !== 'none') {
    const pending = record(metadataState.pending_agent_actions);
    Object.assign(output, {
      pendingPlan: Array.isArray(pending.actions) ? { intent: text(pending.intent || 'Execute pending actions.'), actions: pending.actions } : null,
      hasPendingPlan: Array.isArray(pending.actions) && pending.actions.length > 0,
    });
  }

  const needsContext = selectedModes.includes('context');
  const needsResolvedScope = needsContext && state.scopeType && state.scopeId && (!state.subjectIds.length || !state.postIds.length);
  const resolvedScope = needsResolvedScope
    ? await resolveChatScopeContext(handler.requestContext.supabase, handler.requestContext.userId, {
        type: state.scopeType as 'channel' | 'category' | 'subject' | 'post',
        id: state.scopeId,
        organizationId: text(record(metadata.scope).organizationId) || null,
      })
    : null;
  const subjectIds = needsContext
    ? await resolveSubjectIds(handler, {
        ...state,
        subjectIds: state.subjectIds.length ? state.subjectIds : resolvedScope?.subject_ids || [],
      })
    : state.subjectIds;
  const postIds = needsContext ? (state.postIds.length ? state.postIds : resolvedScope?.post_ids || []) : state.postIds;
  if (needsContext) {
    Object.assign(output, {
      context: await buildAgentContext({
        supabase: handler.requestContext.supabase,
        userId: handler.requestContext.userId,
        chatId: state.chatId,
        scopeType: (state.scopeType || session.chat.scope_type || null) as any,
        scopeId: state.scopeId || session.chat.scope_id || null,
        subjectIds,
        postIds,
        tagSlugs: state.tagSlugs,
      }),
      resolvedScope: { subject_ids: subjectIds, post_ids: postIds, tag_slugs: state.tagSlugs },
    });
  }

  if (pendingMode === 'clear') {
    const next = { ...metadataState };
    delete next.pending_agent_actions;
    await writeSession(handler, state.chatId, next);
    return {
      output: { ...output, cleared: true, pendingPlan: null, hasPendingPlan: false, __activeOutputs: ['output'] },
      status: WorkflowNodeStatusEnum.Passed,
    };
  }

  if (pendingMode === 'store') {
    const plan = planValue({ plan: runtime.plan, input: handler.input, ...record(handler.input) });
    if (!Array.isArray(plan.actions) || !plan.actions.length) return fail('Pending Action = Store requires a plan with actions.');
    await writeSession(handler, state.chatId, {
      ...metadataState,
      pending_agent_actions: { intent: plan.intent, actions: plan.actions, requested_message: state.message, created_at: new Date().toISOString() },
    });
    return {
      output: { ...output, stored: true, pendingPlan: plan, hasPendingPlan: true, __activeOutputs: ['output'] },
      status: WorkflowNodeStatusEnum.Passed,
    };
  }

  return { output, status: WorkflowNodeStatusEnum.Passed };
};

export const executeCurrentChatNode: WorkflowNodeHandler = async (handler) => {
  try {
    const runtime = record(handler.node.runtime);
    const operation = text(runtime.operation || 'bundle') || 'bundle';
    if (operation !== 'bundle') {
      return {
        output: await executeOperation(handler, operation, runtime),
        status: WorkflowNodeStatusEnum.Passed,
      };
    }
    return executeBundleOperation(handler);
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error || '');
    return fail(message || 'Current Chat node execution failed.');
  }
};
