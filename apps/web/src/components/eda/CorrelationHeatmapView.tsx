import React, { useState } from 'react';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';

interface CorrelationHeatmapProps {
  data: CorrelationMatrixResult | null;
  loading?: boolean;
}

export const CorrelationHeatmapView: React.FC<CorrelationHeatmapProps> = ({ data, loading }) => {
  const [hoveredCell, setHoveredCell] = useState<{
    colA: string;
    colB: string;
    val: number;
  } | null>(null);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-[#eaecf0] bg-white p-6">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b5bf6] border-t-transparent" />
          <span className="text-xs font-medium">Computing Pearson correlation matrix...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-[#eaecf0] bg-white p-6 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M4 5h4v4H4V5zm6 0h4v4h-4V5zm6 0h4v4h-4V5zM4 11h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 17h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"
            />
          </svg>
        </div>
        <p className="text-xs font-semibold text-slate-800">Correlation Matrix Pending</p>
        <p className="mt-1 max-w-xs text-[11px] text-slate-500">
          Profile the dataset to compute pairwise Pearson coefficients across numeric columns.
        </p>
      </div>
    );
  }

  if (data.columns.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-[#eaecf0] bg-white p-6">
        <p className="text-xs text-slate-500">
          At least two numeric columns are required to compute a correlation matrix.
        </p>
      </div>
    );
  }

  const { columns, matrix } = data;

  const getCellColor = (val: number): { bg: string; text: string } => {
    if (val >= 0.99) return { bg: '#1d4ed8', text: '#ffffff' };
    if (val >= 0.7) return { bg: '#2563eb', text: '#ffffff' };
    if (val >= 0.4) return { bg: '#60a5fa', text: '#ffffff' };
    if (val >= 0.15) return { bg: '#93c5fd', text: '#1e3a8a' };
    if (val >= 0) return { bg: '#dbeafe', text: '#1e3a8a' };
    if (val >= -0.2) return { bg: '#fee2e2', text: '#991b1b' };
    if (val >= -0.5) return { bg: '#fca5a5', text: '#7f1d1d' };
    return { bg: '#ef4444', text: '#ffffff' };
  };

  return (
    <div className="relative rounded-2xl border border-[#eaecf0] bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Correlation Matrix</h3>
          <p className="text-[11px] text-slate-500">Pairwise Pearson r across numeric features</p>
        </div>
        <span className="font-mono text-[11px] font-medium text-slate-500">r ∈ [-1.0, 1.0]</span>
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        <div className="min-w-[320px] flex-1">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-[11px] font-medium text-slate-400" />
                {columns.map((col) => (
                  <th
                    key={col}
                    title={col}
                    className="max-w-[76px] truncate p-1.5 font-mono text-[10px] font-semibold text-slate-600"
                  >
                    {col.length > 9 ? `${col.slice(0, 8)}…` : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIdx) => {
                const rowCol = columns[rowIdx] ?? `Col ${rowIdx}`;
                return (
                  <tr key={rowCol}>
                    <td
                      title={rowCol}
                      className="max-w-[92px] truncate pr-2 text-left font-mono text-[10px] font-medium text-slate-600"
                    >
                      {rowCol.length > 11 ? `${rowCol.slice(0, 10)}…` : rowCol}
                    </td>
                    {row.map((val, colIdx) => {
                      const colName = columns[colIdx] ?? `Col ${colIdx}`;
                      const colors = getCellColor(val);
                      return (
                        <td
                          key={colName}
                          onMouseEnter={() =>
                            setHoveredCell({
                              colA: rowCol,
                              colB: colName,
                              val,
                            })
                          }
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                          className="h-8 cursor-pointer select-none border border-white/80 p-1 font-mono text-[11px] font-semibold tabular-nums transition-opacity hover:opacity-90"
                        >
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 pl-2 font-mono text-[10px] text-slate-500 tabular-nums">
          <span>+1.0</span>
          <div
            className="h-36 w-3 rounded-full"
            style={{
              background:
                'linear-gradient(to bottom, #1d4ed8, #60a5fa, #dbeafe, #fee2e2, #ef4444)',
            }}
          />
          <span>0.0</span>
          <span className="mt-auto">-1.0</span>
        </div>
      </div>

      {hoveredCell && (
        <div className="pointer-events-none mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white">
          <span className="font-mono font-semibold text-sky-300">{hoveredCell.colA}</span>
          <span className="text-slate-400">vs</span>
          <span className="font-mono font-semibold text-sky-300">{hoveredCell.colB}</span>
          <span className="font-mono font-bold tabular-nums">r = {hoveredCell.val.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
};
