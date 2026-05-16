import type { NodeRuleReport } from '../runtime/rules';

export const NODE_PACKAGE_TYPE = 'giga.workflow.node';
export const NODE_PACKAGE_VERSION = 1;
export const NODE_PACKAGE_MAX_BYTES = 2 * 1024 * 1024;

export type WorkflowNodePackageManifest = {
  packageType: typeof NODE_PACKAGE_TYPE;
  version: typeof NODE_PACKAGE_VERSION;
  name: string;
  slug: string;
  description?: string | null;
  groupName?: string | null;
  nodeSchema: Record<string, unknown>;
  sourceFiles: string[];
};

export type WorkflowNodePackage = {
  fileName?: string;
  manifest: WorkflowNodePackageManifest;
  report: NodeRuleReport;
  sourceFiles: Record<string, string>;
};
