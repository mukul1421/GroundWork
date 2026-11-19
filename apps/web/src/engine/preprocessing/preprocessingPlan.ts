import type { PreprocessingPlan } from './preprocessingEngine';

const PLAN_REGEX = /```(?:json:groundwork-plan|groundwork-plan)\s*([\s\S]*?)```/i;

/**
 * Extracts a structured Groundwork Preprocessing Plan from AI response text.
 */
export function extractPlanFromResponse(text: string): PreprocessingPlan | null {
  const match = PLAN_REGEX.exec(text);
  if (!match?.[1]) return null;

  try {
    const raw = JSON.parse(match[1].trim()) as Partial<PreprocessingPlan>;
    if (Array.isArray(raw.operations) && raw.operations.length > 0) {
      return {
        title: raw.title ?? 'Data Preparation Plan',
        description: raw.description,
        operations: raw.operations,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Strips the plan JSON code block from AI text so user reads clean explanation.
 */
export function stripPlanFromResponse(text: string): string {
  return text.replace(PLAN_REGEX, '').trim();
}

/**
 * Returns a human-friendly description of an individual operation.
 */
export function describeOperation(op: PreprocessingPlan['operations'][number]): string {
  switch (op.type) {
    case 'impute':
      return `Impute nulls in [${op.columns.join(', ')}] with ${op.strategy}${
        op.constantValue !== undefined ? ` (${String(op.constantValue)})` : ''
      }`;
    case 'drop_columns':
      return `Drop column${op.columns.length > 1 ? 's' : ''}: [${op.columns.join(', ')}]`;
    case 'outlier_treatment':
      return `${op.strategy === 'clip_iqr' ? 'Clip' : 'Remove'} outliers in [${op.columns.join(
        ', ',
      )}] using IQR (${op.multiplier ?? 1.5}x)`;
    case 'scale':
      return `Scale [${op.columns.join(', ')}] using ${op.strategy.toUpperCase()}`;
    case 'encode':
      return `${op.strategy === 'one_hot' ? 'One-Hot Encode' : 'Label Encode'} [${op.columns.join(
        ', ',
      )}]`;
    case 'deduplicate':
      return `Remove exact duplicate rows across ${op.columns ? `[${op.columns.join(', ')}]` : 'all columns'}`;
    default:
      return 'Data transformation';
  }
}
