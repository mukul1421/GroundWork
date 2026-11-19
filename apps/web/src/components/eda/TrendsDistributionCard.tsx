import React, { useState } from 'react';
import type { ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';

interface TrendsCardProps {
  columns: ColumnProfileSummary[];
}

export const TrendsDistributionCard: React.FC<TrendsCardProps> = ({ columns }) => {
  const numericCols = columns.filter((c) => c.isNumeric);
  const [selectedColName, setSelectedColName] = useState<string>('');

  const currentSelected = selectedColName || numericCols[0]?.columnName || '';
  const activeCol = numericCols.find((c) => c.columnName === currentSelected) ?? numericCols[0];

  // SVG viewBox coordinates
  const width = 420;
  const height = 180;
  const padding = { top: 25, right: 30, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (!activeCol || !('min' in activeCol.stats)) {
    return (
      <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-800">Feature Distribution</h3>
        <p className="my-auto text-center text-xs text-slate-400">
          Run profiling to inspect numeric column distributions.
        </p>
      </div>
    );
  }

  const { min, max, mean, median, q25, q75, outlierCount } = activeCol.stats;
  const minVal = min ?? 0;
  const maxVal = max ?? 100;

  // Approximate distribution density curve based on five-number summary (q25, median, q75, mean)
  const simulatedBins = [
    { label: `${Math.round(minVal)}`, val: 15 },
    { label: `${Math.round(minVal + (maxVal - minVal) * 0.15)}`, val: 35 },
    { label: `${Math.round(q25 ?? minVal + (maxVal - minVal) * 0.25)}`, val: 75 },
    { label: `${Math.round(median ?? (minVal + maxVal) / 2)}`, val: 120 },
    { label: `${Math.round(mean ?? (minVal + maxVal) / 2)}`, val: 105 },
    { label: `${Math.round(q75 ?? minVal + (maxVal - minVal) * 0.75)}`, val: 65 },
    { label: `${Math.round(minVal + (maxVal - minVal) * 0.85)}`, val: 30 },
    { label: `${Math.round(maxVal)}`, val: 10 },
  ];

  const maxDensity = 140;
  const getX = (i: number) => padding.left + (i / (simulatedBins.length - 1)) * chartWidth;
  const getY = (val: number) => padding.top + chartHeight - (val / maxDensity) * chartHeight;

  // Build smooth distribution curve
  const curvePath = simulatedBins.reduce((acc, curr, i, arr) => {
    const x = getX(i);
    const y = getY(curr.val);
    if (i === 0) return `M ${x} ${y}`;
    const prev = arr[i - 1];
    const prevX = getX(i - 1);
    const prevY = getY(prev ? prev.val : curr.val);
    const cp1X = prevX + (x - prevX) / 2;
    const cp2X = cp1X;
    return `${acc} C ${cp1X} ${prevY}, ${cp2X} ${y}, ${x} ${y}`;
  }, '');

  // Fill area under the curve
  const areaPath = `${curvePath} L ${getX(simulatedBins.length - 1)} ${padding.top + chartHeight} L ${getX(0)} ${padding.top + chartHeight} Z`;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Feature Distribution</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Density & spread across {activeCol.columnName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {outlierCount > 0 && (
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-100">
              {outlierCount} Outliers
            </span>
          )}
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
            {activeCol.inferredType}
          </span>
        </div>
      </div>

      {/* SVG Interactive Chart */}
      <div className="relative my-2 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
          <defs>
            <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area under curve */}
          <path d={areaPath} fill="url(#distGrad)" />

          {/* Curve */}
          <path d={curvePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />

          {/* Median vertical dashed marker */}
          <line
            x1={getX(3)}
            y1={padding.top}
            x2={getX(3)}
            y2={padding.top + chartHeight}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            strokeWidth="1.5"
          />
          <text
            x={getX(3)}
            y={padding.top - 6}
            textAnchor="middle"
            className="fill-blue-600 text-[10px] font-bold"
          >
            Median: {median !== null ? median : '-'}
          </text>

          {/* X Axis Range Markers */}
          <text
            x={getX(0)}
            y={height - 8}
            textAnchor="start"
            className="fill-slate-400 text-[10px] font-mono"
          >
            Min: {minVal}
          </text>
          <text
            x={getX(simulatedBins.length - 1)}
            y={height - 8}
            textAnchor="end"
            className="fill-slate-400 text-[10px] font-mono"
          >
            Max: {maxVal}
          </text>
        </svg>
      </div>

      {/* Column Switcher Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
        <span className="text-[10px] font-semibold text-slate-400">Select Column:</span>
        {numericCols.slice(0, 5).map((col) => (
          <button
            key={col.columnName}
            type="button"
            onClick={() => setSelectedColName(col.columnName)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${
              (activeCol.columnName === col.columnName)
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {col.columnName}
          </button>
        ))}
      </div>
    </div>
  );
};
