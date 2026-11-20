import React, { useState } from 'react';
import type {
  PreprocessingPlan,
  PreprocessingResult,
} from '@/engine/preprocessing/preprocessingEngine';
import { describeOperation } from '@/engine/preprocessing/preprocessingPlan';

interface PlanCardProps {
  plan: PreprocessingPlan;
  onApply: (plan: PreprocessingPlan) => Promise<PreprocessingResult>;
  onAppliedSuccess?: (result: PreprocessingResult) => void;
}

export const TransformationPlanCard: React.FC<PlanCardProps> = ({
  plan,
  onApply,
  onAppliedSuccess,
}) => {
  const [applying, setApplying] = useState(false);
  const [appliedResult, setAppliedResult] = useState<PreprocessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      const result = await onApply(plan);
      setAppliedResult(result);
      onAppliedSuccess?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transformation execution failed');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mt-2 rounded-2xl border border-blue-200 bg-white p-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900">{plan.title}</h4>
          <span className="text-[11px] text-slate-500">
            {plan.operations.length} step{plan.operations.length > 1 ? 's' : ''} · Human approval required
          </span>
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#3b5bf6]">
          {appliedResult ? 'Applied' : 'Pending Gate'}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {plan.operations.map((op, idx) => (
          <div
            key={`${op.type}-${idx}`}
            className="flex items-start gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 text-xs"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 font-mono text-[10px] font-bold text-slate-700 tabular-nums">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {op.type.replace(/_/g, ' ')}
              </div>
              <div className="mt-0.5 font-medium text-slate-800">{describeOperation(op)}</div>
            </div>
          </div>
        ))}
      </div>

      {appliedResult && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <p className="font-bold">New immutable version created</p>
          <p className="mt-0.5 font-mono text-[11px] text-emerald-800 tabular-nums">
            {appliedResult.sourceRowCount.toLocaleString()} →{' '}
            {appliedResult.transformedRowCount.toLocaleString()} rows ·{' '}
            {appliedResult.sourceColumnCount} → {appliedResult.transformedColumnCount} cols ·{' '}
            {appliedResult.durationMs}ms
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {!appliedResult && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-500">Original version remains untouched.</p>
          <button
            type="button"
            disabled={applying}
            onClick={() => void handleApply()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#3b5bf6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {applying ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Applying...</span>
              </>
            ) : (
              <span>Approve &amp; Apply Plan</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
