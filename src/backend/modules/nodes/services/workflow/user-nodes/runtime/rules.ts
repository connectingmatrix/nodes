import { toSafeString } from 'giga-ai-helper';

export type NodeRuleIssue = {
  code: string;
  fileName?: string;
  message: string;
  severity: 'error' | 'warning';
};

export type NodeRuleReport = {
  errors: NodeRuleIssue[];
  ok: boolean;
  rules: typeof NODE_SOURCE_RULES;
  warnings: NodeRuleIssue[];
};

export const NODE_SOURCE_RULES = [
  { code: 'missing_worker', enforced: true, severity: 'error', rule: 'Every node package must include worker.ts.' },
  { code: 'missing_execute', enforced: true, severity: 'error', rule: 'worker.ts must export execute.' },
  { code: 'bad_validate', enforced: true, severity: 'error', rule: 'validate.ts must export validate when present.' },
  {
    code: 'blocked_import',
    enforced: true,
    severity: 'error',
    rule: 'Workers cannot import raw fs, child_process, vm, module, worker_threads, cluster, or inspector APIs.',
  },
  { code: 'drive_import', enforced: true, severity: 'error', rule: 'Workers cannot import or execute code from /drive.' },
  {
    code: 'giga_query_in_worker',
    enforced: true,
    severity: 'error',
    rule: 'Workers cannot embed Giga GraphQL table queries or Supabase env access.',
  },
  {
    code: 'legacy_backend_descriptor',
    enforced: true,
    severity: 'error',
    rule: 'Backend calls must use descriptor keys, not service/function descriptors.',
  },
  {
    code: 'inline_llm_client',
    enforced: true,
    severity: 'error',
    rule: 'LLM work must use cmd:llm or an approved backend descriptor, not inline SDK clients.',
  },
  {
    code: 'raw_port_access',
    enforced: true,
    severity: 'error',
    rule: 'Workers must read inspector/runtime properties, not raw PORTS input payloads.',
  },
  { code: 'llm_port_missing', enforced: true, severity: 'error', rule: 'Workers that call LLM peers must declare a cmd:llm command port.' },
  {
    code: 'mode_field_not_select',
    enforced: true,
    severity: 'error',
    rule: 'Fields used for operation, action, or mode branching must be select or multi-select inspector fields.',
  },
  {
    code: 'json_inspector_field',
    enforced: false,
    severity: 'warning',
    rule: 'JSON fields should be avoided unless multi-file/package data makes them unavoidable.',
  },
  {
    code: 'hardcoded_uuid',
    enforced: false,
    severity: 'warning',
    rule: 'Org/user/file/model ids should come from inspector properties or runtime input.',
  },
  {
    code: 'hardcoded_host_path',
    enforced: false,
    severity: 'warning',
    rule: 'Host paths should be replaced with /drive paths or inspector properties.',
  },
] as const;

const issue = (severity: NodeRuleIssue['severity'], code: string, message: string, fileName?: string): NodeRuleIssue => ({
  code,
  fileName,
  message,
  severity,
});

const importPattern = (name: string) => new RegExp(`(?:from\\s+['"]|import\\s*\\(\\s*['"]|require\\s*\\(\\s*['"])(?:node:)?${name}['"]`);

const blockedImports = ['child_process', 'worker_threads', 'cluster', 'vm', 'module', 'inspector', 'fs', 'fs/promises'];
const gigaQueryPattern =
  /\b(ai_workflowsCollection|ai_chat_messagesCollection|insertIntoai_|updateai_|deleteFromai_|graphql\/v1|SUPABASE_(?:URL|ANON|SERVICE))/;
const uuidPattern = /['"][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]/i;
const hostPathPattern = /['"](?:\/Users\/|\/home\/|[A-Za-z]:\\)/;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const reviewFile = (fileName: string, source: string): NodeRuleIssue[] => {
  const issues: NodeRuleIssue[] = [];
  for (const name of blockedImports)
    if (importPattern(name).test(source)) issues.push(issue('error', 'blocked_import', `Worker source cannot import ${name}.`, fileName));
  if (/['"]\/drive(?:\/|['"])/.test(source)) issues.push(issue('error', 'drive_import', 'Worker source cannot import code from /drive.', fileName));
  if (gigaQueryPattern.test(source))
    issues.push(
      issue('error', 'giga_query_in_worker', 'Worker source must use backend descriptors instead of Giga queries or Supabase env values.', fileName),
    );
  if (/executeBackend\s*\([^)]*\b(service|function)\s*:/.test(source))
    issues.push(
      issue('error', 'legacy_backend_descriptor', 'Backend execution must use descriptor keys, not service/function descriptors.', fileName),
    );
  if (/new\s+OpenAI|@google\/generative-ai|anthropic|groq-sdk/.test(source))
    issues.push(issue('error', 'inline_llm_client', 'LLM calls must use a connected LLM port or approved backend descriptor.', fileName));
  if (/\bPORTS\b|\.ports\.in\b/.test(source))
    issues.push(issue('error', 'raw_port_access', 'Worker source must read inspector/runtime properties instead of raw input ports.', fileName));
  if (uuidPattern.test(source))
    issues.push(issue('warning', 'hardcoded_uuid', 'Source contains a hardcoded UUID; use inspector properties or runtime input.', fileName));
  if (hostPathPattern.test(source))
    issues.push(issue('warning', 'hardcoded_host_path', 'Source contains a host path; use /drive or inspector properties.', fileName));
  return issues;
};

export const reviewWorkflowNodeSourceRules = (files: Record<string, unknown>): NodeRuleReport => {
  const issues: NodeRuleIssue[] = [];
  const worker = toSafeString(files['worker.ts']);
  if (!worker) issues.push(issue('error', 'missing_worker', 'worker.ts is required.'));
  if (worker && !/\bexport\s+(const|async function|function)\s+execute\b/.test(worker))
    issues.push(issue('error', 'missing_execute', 'worker.ts must export execute.', 'worker.ts'));
  const validate = toSafeString(files['validate.ts']);
  if (validate && !/\bexport\s+(const|async function|function)\s+validate\b/.test(validate))
    issues.push(issue('error', 'bad_validate', 'validate.ts must export validate.', 'validate.ts'));
  for (const [fileName, body] of Object.entries(files)) {
    const source = toSafeString(body);
    if (source && /\.ts$/.test(fileName)) issues.push(...reviewFile(fileName, source));
  }
  const errors = issues.filter((entry) => entry.severity === 'error');
  const warnings = issues.filter((entry) => entry.severity === 'warning');
  return { ok: errors.length === 0, errors, rules: NODE_SOURCE_RULES, warnings };
};

export const reviewWorkflowNodePackageRules = (input: { nodeSchema?: unknown; sourceFiles?: unknown }): NodeRuleReport => {
  const report = reviewWorkflowNodeSourceRules(record(input.sourceFiles));
  const schema = record(input.nodeSchema);
  const fields = record(schema.fields);
  for (const [name, field] of Object.entries(fields)) {
    const item = record(field);
    if (item.type === 'json')
      report.warnings.push(issue('warning', 'json_inspector_field', `JSON inspector field "${name}" should be avoided unless unavoidable.`));
    if ((name === 'operation' || name === 'action' || name === 'mode') && item.type !== 'select' && item.type !== 'multi-select')
      report.errors.push(issue('error', 'mode_field_not_select', `Branching field "${name}" must be select or multi-select.`));
  }
  const worker = toSafeString(record(input.sourceFiles)['worker.ts']);
  if (/\b(askLlm|llmPeers)\b/.test(worker) && !record(schema.commands).llm)
    report.errors.push(issue('error', 'llm_port_missing', 'LLM worker helpers require a cmd:llm command port.', 'worker.ts'));
  report.ok = report.errors.length === 0;
  return report;
};

export const assertWorkflowNodeSourceRules = (files: Record<string, unknown>) => {
  const report = reviewWorkflowNodeSourceRules(files);
  if (!report.ok) throw new Error(report.errors.map((entry) => (entry.fileName ? `${entry.fileName}: ${entry.message}` : entry.message)).join(' '));
  return report;
};

export const assertWorkflowNodePackageRules = (input: { nodeSchema?: unknown; sourceFiles?: unknown }) => {
  const report = reviewWorkflowNodePackageRules(input);
  if (!report.ok) throw new Error(report.errors.map((entry) => (entry.fileName ? `${entry.fileName}: ${entry.message}` : entry.message)).join(' '));
  return report;
};
