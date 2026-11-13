import { describe, it, expect } from 'vitest';
import type {
  DatasetStatus,
  RunStatus,
  AgentIntent,
  OperationType,
  SupportedFormat,
  AIProvider,
  ApprovalStatus,
} from './index';

describe('Type definitions', () => {
  it('DatasetStatus includes all lifecycle states', () => {
    const statuses: DatasetStatus[] = [
      'UPLOADING',
      'UPLOADED',
      'PROFILING',
      'READY',
      'PROCESSING',
      'ERROR',
    ];
    expect(statuses).toHaveLength(6);
  });

  it('RunStatus includes all approval lifecycle states', () => {
    const statuses: RunStatus[] = [
      'DRAFT',
      'VALIDATED',
      'PREVIEWED',
      'PENDING_APPROVAL',
      'APPROVED',
      'REVALIDATED',
      'EXECUTING',
      'VERIFYING',
      'COMPLETED',
      'FAILED',
      'REJECTED',
      'EXPIRED',
    ];
    expect(statuses).toHaveLength(12);
  });

  it('AgentIntent covers spec-defined intents', () => {
    const intents: AgentIntent[] = ['ask', 'recommend', 'plan', 'undo', 'export'];
    expect(intents).toHaveLength(5);
  });

  it('OperationType covers V1 preprocessing operations', () => {
    const ops: OperationType[] = [
      'impute',
      'remove_duplicates',
      'encode',
      'scale',
      'remove_columns',
      'remove_rows',
      'handle_outliers',
      'extract_datetime',
      'select_features',
      'split_dataset',
    ];
    expect(ops).toHaveLength(10);
  });

  it('SupportedFormat covers V1 file formats', () => {
    const formats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'jsonl'];
    expect(formats).toHaveLength(4);
  });

  it('AIProvider covers BYOK providers', () => {
    const providers: AIProvider[] = ['openai', 'gemini'];
    expect(providers).toHaveLength(2);
  });

  it('ApprovalStatus covers approval lifecycle', () => {
    const statuses: ApprovalStatus[] = ['pending', 'approved', 'consumed', 'expired', 'rejected'];
    expect(statuses).toHaveLength(5);
  });
});
