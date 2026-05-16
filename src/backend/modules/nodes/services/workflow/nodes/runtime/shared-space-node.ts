import { parseRecordValue, parseStringValue } from 'giga-ai-helper/workflow';
import { isCurrentUserRootUser } from '@giga/shared/lib/helper';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities';
import { fetchChatSession } from '@connectingmatrix/chat/services/chat/auth/get-chat-session';
import { WorkflowNodeStatusEnum, type WorkflowNodeHandler } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';

const values = (context: Parameters<WorkflowNodeHandler>[0]) => ({
  ...parseRecordValue(context.input),
  ...parseRecordValue(context.node.properties),
  ...parseRecordValue(context.node.runtime),
});

const resolverContext = async (context: Parameters<WorkflowNodeHandler>[0]) =>
  ({
    effectiveRoot: await isCurrentUserRootUser(context.requestContext.supabase),
    request: context.requestContext.request,
    supabase: context.requestContext.supabase,
    userId: context.requestContext.userId,
  } as any);

const workflowOrganizationId = (context: Parameters<WorkflowNodeHandler>[0]) =>
  parseStringValue(context.workflow.metadata.organizationId || parseRecordValue(context.workflow.metadata.scope).organizationId).trim();

const sharedSpace = (organizationId: string) => (OrganisationEntity.load(organizationId) as OrganisationEntity).sharedSpace;

const attachmentToDrive = async (
  context: Parameters<WorkflowNodeHandler>[0],
  graphContext: any,
  input: Record<string, unknown>,
  organizationId: string,
  path: string,
): Promise<unknown> => {
  const attachment = parseRecordValue(input.attachment || input.file);
  const contentBase64 = parseStringValue(input.contentBase64 || attachment.contentBase64 || attachment.content_base64).trim();
  const sourceUrl = parseStringValue(input.sourceUrl || input.url || attachment.sourceUrl || attachment.source_url).trim();
  const drivePath = parseStringValue(input.drivePath || attachment.drivePath || attachment.drive_path).trim();
  if (contentBase64) return sharedSpace(organizationId).writeFile(graphContext, { path, contentBase64 });
  if (sourceUrl) return sharedSpace(organizationId).downloadUrl(graphContext, { path, url: sourceUrl });
  if (drivePath)
    return drivePath === path
      ? sharedSpace(organizationId).stat(graphContext, { path })
      : sharedSpace(organizationId).copy(graphContext, { fromPath: drivePath, toPath: path });
  const chatId = parseStringValue(input.chatId).trim();
  if (!chatId) throw new Error('Attachment contentBase64, sourceUrl, drivePath, or chatId is required.');
  const session = await fetchChatSession(context.requestContext.supabase, { chatId });
  const attachments = Array.isArray((session?.metadata as any)?.attachments) ? ((session?.metadata as any).attachments as any[]) : [];
  const index = Math.max(0, Number(input.attachmentIndex) || 0);
  return attachmentToDrive(context, graphContext, { ...input, chatId: '', attachment: attachments[index] || {} }, organizationId, path);
};

export const executeSharedSpaceNode: WorkflowNodeHandler = async (context) => {
  const input = values(context);
  const operation = parseStringValue(input.operation || input.action || 'list').trim();
  const organizationId = parseStringValue(input.organizationId || workflowOrganizationId(context)).trim();
  const path = parseStringValue(input.path || '/').trim();
  const graphContext = await resolverContext(context);
  await sharedSpace(organizationId).workflowDrive(graphContext);
  const result =
    operation === 'summary'
      ? await sharedSpace(organizationId).summary(graphContext)
      : operation === 'stat' || operation === 'checksum'
      ? await sharedSpace(organizationId).stat(graphContext, { path })
      : operation === 'mkdir'
      ? await sharedSpace(organizationId).createFolder(graphContext, { path })
      : operation === 'delete'
      ? await sharedSpace(organizationId).deletePath(graphContext, { path })
      : operation === 'copy'
      ? await sharedSpace(organizationId).copy(graphContext, {
          fromPath: parseStringValue(input.fromPath).trim(),
          toPath: parseStringValue(input.toPath).trim(),
        })
      : operation === 'move'
      ? await sharedSpace(organizationId).move(graphContext, {
          fromPath: parseStringValue(input.fromPath).trim(),
          toPath: parseStringValue(input.toPath).trim(),
        })
      : operation === 'write_json'
      ? await sharedSpace(organizationId).writeFile(graphContext, { path, json: input.json || input.payload || {} })
      : operation === 'write_file'
      ? await sharedSpace(organizationId).writeFile(graphContext, { path, contentBase64: parseStringValue(input.contentBase64).trim() })
      : operation === 'download_url' || operation === 'ensure_cached'
      ? await sharedSpace(organizationId).downloadUrl(graphContext, {
          path,
          url: parseStringValue(input.url).trim(),
          checksum: parseStringValue(input.checksum).trim(),
        })
      : operation === 'chat_attachment_to_drive'
      ? await attachmentToDrive(context, graphContext, input, organizationId, path)
      : await sharedSpace(organizationId).files(graphContext, { path });
  return { output: result, status: WorkflowNodeStatusEnum.Passed };
};
