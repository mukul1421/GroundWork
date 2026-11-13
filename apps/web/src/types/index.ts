/**
 * Shared TypeScript types for Groundwork V1.
 *
 * These types represent the core domain model as defined in the spec.
 * They will be expanded as milestones progress.
 */

/** Dataset status lifecycle */
export type DatasetStatus =
  'UPLOADING' | 'UPLOADED' | 'PROFILING' | 'READY' | 'PROCESSING' | 'ERROR';

/** Pipeline run status */
export type RunStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'PREVIEWED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REVALIDATED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'EXPIRED';

/** AI agent intent classification */
export type AgentIntent = 'ask' | 'recommend' | 'plan' | 'undo' | 'export';

/** Supported preprocessing operations */
export type OperationType =
  | 'impute'
  | 'remove_duplicates'
  | 'encode'
  | 'scale'
  | 'remove_columns'
  | 'remove_rows'
  | 'handle_outliers'
  | 'extract_datetime'
  | 'select_features'
  | 'split_dataset';

/** Supported file formats for upload */
export type SupportedFormat = 'csv' | 'xlsx' | 'json' | 'jsonl';

/** BYOK AI provider */
export type AIProvider = 'openai' | 'gemini';

/** Approval status */
export type ApprovalStatus = 'pending' | 'approved' | 'consumed' | 'expired' | 'rejected';
