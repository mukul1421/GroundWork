import React, { useState } from 'react';
import type { PreprocessingPlan, PreprocessingResult } from '@/engine/preprocessing/preprocessingEngine';
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

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'impute':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'drop_columns':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'outlier_treatment':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'scale':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'encode':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-xs font-bold">
            ⚡
          </span>
          <div>
            <h4 className="text-xs font-bold text-slate-900">{plan.title}</h4>
            <span className="text-[10px] text-slate-400">
              {plan.operations.length} transformation step{plan.operations.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
          Requires Approval
        </span>
      </div>

      {/* Operation Steps List */}
      <div className="mt-3 space-y-2">
        {plan.operations.map((op, idx) => (
          <div
            key={`${op.type}-${idx}`}
            className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
              {idx + 1}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${getBadgeStyle(
                    op.type,
                  )}`}
                >
                  {op.type.replace('_', ' ')}
                </span>
                <span className="font-medium text-slate-800">{describeOperation(op)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Result Status / Error Alert */}
      {appliedResult && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-bold flex items-center gap-1.5">
            <span>✓</span> Transformation applied successfully!
          </p>
          <p className="text-[11px] mt-0.5 text-emerald-700">
            Created new immutable version with {appliedResult.transformedRowCount.toLocaleString()} rows and{' '}
            {appliedResult.transformedColumnCount} columns in {appliedResult.durationMs}ms.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {/* Action Button */}
      {!appliedResult && (
        <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">
            Original dataset version remains unchanged.
          </p>
          <button
            type="button"
            disabled={applying}
            onClick={() => void handleApply()}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
          >
            {applying ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Executing in DuckDB...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Approve & Apply Plan</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
