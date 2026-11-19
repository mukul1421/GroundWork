import React, { useState } from 'react';
import type { CorrelationMatrixResult } from '../../engine/eda/correlationMatrix';

interface CorrelationHeatmapProps {
  data: CorrelationMatrixResult | null;
  loading?: boolean;
}

export const CorrelationHeatmapView: React.FC<CorrelationHeatmapProps> = ({ data, loading }) => {
  const [hoveredCell, setHoveredCell] = useState<{
    colA: string;
    colB: string;
    val: number;
    x: number;
    y: number;
  } | null>(null);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-xs font-medium">Computing Pearson correlation matrix...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs text-center">
        <span className="text-xl mb-2">⚡</span>
        <p className="text-xs font-semibold text-slate-700">Correlation Matrix Pending</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
          Computing in-browser via DuckDB-Wasm or click &ldquo;⚡ Run Profiling&rdquo; to analyze.
        </p>
      </div>
    );
  }

  if (data.columns.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <p className="text-xs text-slate-400">Dataset does not contain enough numeric columns for correlation.</p>
      </div>
    );
  }

  const { columns, matrix } = data;

  /**
   * Returns background color gradient matching the reference mockup:
   * 1.0 -> deep vibrant blue (#2563eb / #1d4ed8)
   * 0.5 -> soft sky blue (#93c5fd)
   * 0.0 -> white / light blue (#f0f9ff)
   * -0.5 -> pale orange (#fed7aa)
   * -1.0 -> coral (#f87171)
   */
  const getCellColor = (val: number): { bg: string; text: string } => {
    if (val === 1) return { bg: '#2563eb', text: '#ffffff' };
    if (val >= 0.7) return { bg: '#3b82f6', text: '#ffffff' };
    if (val >= 0.4) return { bg: '#60a5fa', text: '#ffffff' };
    if (val >= 0.15) return { bg: '#93c5fd', text: '#1e3a8a' };
    if (val >= 0) return { bg: '#dbeafe', text: '#1e3a8a' };
    if (val >= -0.2) return { bg: '#fee2e2', text: '#991b1b' };
    return { bg: '#fca5a5', text: '#7f1d1d' };
  };

  return (
    <div className="relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Correlation Heatmap</h3>
        <span className="text-[11px] font-medium text-slate-400">Pearson (r)</span>
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {/* Heatmap Matrix Table */}
        <div className="flex-1 min-w-[340px]">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-[11px] font-medium text-slate-400"></th>
                {columns.map((col) => (
                  <th
                    key={col}
                    title={col}
                    className="max-w-[70px] truncate p-1.5 text-[11px] font-medium text-slate-600"
                  >
                    {col.length > 8 ? `${col.slice(0, 7)}…` : col}
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
                      className="max-w-[80px] truncate pr-2 text-left text-[11px] font-medium text-slate-600"
                    >
                      {rowCol.length > 9 ? `${rowCol.slice(0, 8)}…` : rowCol}
                    </td>
                    {row.map((val, colIdx) => {
                      const colName = columns[colIdx] ?? `Col ${colIdx}`;
                      const colors = getCellColor(val);
                      return (
                        <td
                          key={colName}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredCell({
                              colA: rowCol,
                              colB: colName,
                              val,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8,
                            });
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                          className="h-8 border border-white/60 p-1 text-[11px] font-medium transition hover:scale-105 cursor-pointer select-none"
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

        {/* Legend Scale Bar matching reference mockup */}
        <div className="flex flex-col items-center gap-1 pl-2">
          <span className="text-[10px] font-medium text-slate-500">1.0</span>
          <div
            className="h-36 w-3.5 rounded-full"
            style={{
              background: 'linear-gradient(to bottom, #2563eb, #60a5fa, #dbeafe, #fee2e2, #fca5a5)',
            }}
          />
          <span className="text-[10px] font-medium text-slate-500">0</span>
          <span className="text-[10px] font-medium text-slate-500 mt-auto">-1.0</span>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredCell && (
        <div className="pointer-events-none absolute bottom-4 left-6 rounded-md bg-slate-900/95 px-2.5 py-1 text-xs text-white shadow-lg backdrop-blur-xs">
          <span className="font-semibold text-sky-400">{hoveredCell.colA}</span>
          <span className="text-slate-400"> vs </span>
          <span className="font-semibold text-sky-400">{hoveredCell.colB}</span>:
          <span className="ml-1.5 font-bold">{hoveredCell.val.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
};
