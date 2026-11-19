import React from 'react';
import type { DatasetProfileSummary } from '../../engine/profiling/datasetProfiler';

interface StatisticsCardProps {
  profile: DatasetProfileSummary | null;
  totalRows: number;
  totalColumns: number;
}

export const DatasetStatisticsCard: React.FC<StatisticsCardProps> = ({
  profile,
  totalRows,
  totalColumns,
}) => {
  const rows = profile?.rowCount ?? totalRows;
  const cols = profile?.columnCount ?? totalColumns;
  const missingRate = profile?.overallMissingRate ?? 0;

  const numericCols = profile?.columns.filter((c) => c.isNumeric).length ?? 0;
  const textCols = profile?.columns.filter((c) => !c.isNumeric && !c.inferredType.includes('DATE')).length ?? 0;
  const dateCols = profile?.columns.filter((c) => c.inferredType.includes('DATE') || c.inferredType.includes('TIME')).length ?? 0;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Statistics</h3>

        <div className="grid grid-cols-3 gap-y-5 gap-x-4">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Rows</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">
              {rows.toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Columns</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{cols}</span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Missing Values</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">
              {missingRate.toFixed(1)}%
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Numeric Columns</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{numericCols}</span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Text Columns</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{textCols}</span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Date Columns</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{dateCols}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-3 border-t border-slate-100 text-center">
        <button
          type="button"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
        >
          View detailed statistics →
        </button>
      </div>
    </div>
  );
};
