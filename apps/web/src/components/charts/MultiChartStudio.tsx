import React, { useState, useMemo } from 'react';
import type { ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import { CorrelationHeatmapView } from '@/components/eda/CorrelationHeatmapView';

interface MultiChartStudioProps {
  columns: ColumnProfileSummary[];
  rows: Record<string, unknown>[];
  correlationData: CorrelationMatrixResult | null;
  datasetName: string;
  loading?: boolean;
}

export const MultiChartStudio: React.FC<MultiChartStudioProps> = ({
  columns,
  rows,
  correlationData,
  datasetName,
  loading = false,
}) => {
  const numericCols = useMemo(() => columns.filter((c) => c.isNumeric), [columns]);
  const categoricalCols = useMemo(() => columns.filter((c) => !c.isNumeric), [columns]);

  // Primary interactive selection states
  const [activeNumericCol, setActiveNumericCol] = useState<string>(
    numericCols[0]?.columnName || '',
  );
  const [activeScatterX, setActiveScatterX] = useState<string>(
    numericCols[0]?.columnName || '',
  );
  const [activeScatterY, setActiveScatterY] = useState<string>(
    numericCols[1]?.columnName || numericCols[0]?.columnName || '',
  );
  const [activeCatCol, setActiveCatCol] = useState<string>(
    categoricalCols[0]?.columnName || '',
  );

  // Filter tab for the dashboard
  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'distributions' | 'correlations' | 'categories'>('all');

  // Selected column profile summary
  const selectedNumericSummary = useMemo(() => {
    return numericCols.find((c) => c.columnName === activeNumericCol) ?? numericCols[0];
  }, [numericCols, activeNumericCol]);

  // Categorical frequencies for active categorical column
  const activeCatFrequencies = useMemo(() => {
    if (!activeCatCol) return [];
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const val = r[activeCatCol];
      const key = val !== null && val !== undefined ? String(val) : '(Missing)';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows, activeCatCol]);

  // Scatter points
  const scatterPoints = useMemo(() => {
    if (!activeScatterX || !activeScatterY) return [];
    return rows
      .map((r) => ({
        x: Number(r[activeScatterX]),
        y: Number(r[activeScatterY]),
      }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
  }, [rows, activeScatterX, activeScatterY]);

  // Target candidate (e.g. Survived)
  const targetCandidate = useMemo(() => {
    return columns.find(
      (c) =>
        c.columnName.toLowerCase().includes('survived') ||
        c.columnName.toLowerCase().includes('target') ||
        c.columnName.toLowerCase().includes('label') ||
        c.columnName.toLowerCase().includes('churn'),
    );
  }, [columns]);

  const targetFrequencies = useMemo(() => {
    if (!targetCandidate) return [];
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const v = r[targetCandidate.columnName];
      const key = v !== null && v !== undefined ? String(v) : '(Missing)';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([label, count]) => ({
      label,
      count,
      pct: rows.length > 0 ? (count / rows.length) * 100 : 0,
    }));
  }, [rows, targetCandidate]);

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar with Chart View Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xs">
              📈
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Exploratory Data Analysis Dashboard
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Multi-panel visual dashboard displaying distributions, relationships, correlations, and outliers simultaneously
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 border border-slate-200/60 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setDashboardFilter('all')}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              dashboardFilter === 'all'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Visualizations
          </button>
          <button
            type="button"
            onClick={() => setDashboardFilter('distributions')}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              dashboardFilter === 'distributions'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Distributions
          </button>
          <button
            type="button"
            onClick={() => setDashboardFilter('correlations')}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              dashboardFilter === 'correlations'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Correlation Heatmap
          </button>
          <button
            type="button"
            onClick={() => setDashboardFilter('categories')}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              dashboardFilter === 'categories'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Categoricals
          </button>
        </div>
      </div>

      {/* 2. Top Grid: Target Distribution & Correlation Heatmap */}
      {(dashboardFilter === 'all' || dashboardFilter === 'correlations') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Target Distribution Card (4 cols) */}
          {targetCandidate && (
            <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800">🎯 Target Distribution</span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      {targetCandidate.columnName}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Class Balance</span>
                </div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Outcome ratio for supervised modeling in {datasetName}. Check for severe class imbalance.
                </p>

                <div className="space-y-3">
                  {targetFrequencies.map((tf) => (
                    <div key={tf.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">
                          Class {tf.label === '1' ? '1 (Positive / Survived)' : tf.label === '0' ? '0 (Negative)' : tf.label}
                        </span>
                        <span className="font-mono text-slate-500 font-semibold">
                          {tf.count} rows ({tf.pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-4 w-full bg-slate-100 rounded-md overflow-hidden">
                        <div
                          className={`h-full rounded-md transition-all ${
                            tf.label === '1' ? 'bg-blue-600' : 'bg-slate-400'
                          }`}
                          style={{ width: `${tf.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Total Samples: {rows.length}</span>
                <span className="text-emerald-600 font-bold">✓ Stratification Recommended</span>
              </div>
            </div>
          )}

          {/* Correlation Matrix Heatmap (8 cols) */}
          <div className={targetCandidate ? 'lg:col-span-8' : 'lg:col-span-12'}>
            <CorrelationHeatmapView data={correlationData} loading={loading} />
          </div>
        </div>
      )}

      {/* 3. Middle Grid: Numerical Feature Histogram + Outlier Boxplot Side-by-Side */}
      {(dashboardFilter === 'all' || dashboardFilter === 'distributions') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Histogram Card (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Feature Distribution</span>
                <span className="text-xs text-slate-400">· Density & Frequency Bins</span>
              </div>

              {/* Column Switcher */}
              <div className="flex items-center gap-2">
                <label htmlFor="num-hist-select" className="text-xs font-semibold text-slate-500">Feature:</label>
                <select
                  id="num-hist-select"
                  value={activeNumericCol}
                  onChange={(e) => setActiveNumericCol(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {numericCols.map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedNumericSummary ? (
              <MultiHistogramRenderer column={selectedNumericSummary} rows={rows} />
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">No numeric features found.</div>
            )}
          </div>

          {/* Outlier Boxplot Card (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">Spread & Outliers</span>
                  <span className="text-xs text-slate-400">· 1.5× IQR Boundary</span>
                </div>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-100">
                  {selectedNumericSummary && 'outlierCount' in selectedNumericSummary.stats
                    ? selectedNumericSummary.stats.outlierCount
                    : 0} Outliers
                </span>
              </div>

              {selectedNumericSummary ? (
                <MultiBoxPlotRenderer column={selectedNumericSummary} />
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">No numeric column selected.</div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Whiskers extend to min/max within 1.5× IQR</span>
              <span className="font-semibold text-blue-600">Hover for quartiles</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bottom Grid: Bivariate Scatter (2D) + Categorical Frequency Distribution */}
      {(dashboardFilter === 'all' || dashboardFilter === 'categories' || dashboardFilter === 'distributions') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Bivariate 2D Scatter Plot (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Bivariate Scatter & Interaction</span>
                <span className="text-xs text-slate-400">· 2D Correlation</span>
              </div>

              {/* X and Y Selectors */}
              <div className="flex items-center gap-2">
                <label htmlFor="scatter-x-select" className="text-xs text-slate-400">X:</label>
                <select
                  id="scatter-x-select"
                  value={activeScatterX}
                  onChange={(e) => setActiveScatterX(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  {numericCols.map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName}
                    </option>
                  ))}
                </select>

                <label htmlFor="scatter-y-select" className="text-xs text-slate-400 ml-1">Y:</label>
                <select
                  id="scatter-y-select"
                  value={activeScatterY}
                  onChange={(e) => setActiveScatterY(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  {numericCols.map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <MultiScatterRenderer
              xCol={activeScatterX}
              yCol={activeScatterY}
              points={scatterPoints}
            />
          </div>

          {/* Categorical Breakdown Card (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">Categorical Distribution</span>
                </div>

                {categoricalCols.length > 0 && (
                  <select
                    value={activeCatCol}
                    onChange={(e) => setActiveCatCol(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800"
                  >
                    {categoricalCols.map((c) => (
                      <option key={c.columnName} value={c.columnName}>
                        {c.columnName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {activeCatFrequencies.length > 0 ? (
                <div className="space-y-2.5">
                  {activeCatFrequencies.map((cat) => {
                    const maxCount = Math.max(...activeCatFrequencies.map((f) => f.count), 1);
                    const pct = (cat.count / maxCount) * 100;
                    return (
                      <div key={cat.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 truncate max-w-[180px]">
                            {cat.label}
                          </span>
                          <span className="font-mono text-slate-500 font-bold">
                            {cat.count} rows
                          </span>
                        </div>
                        <div className="h-3.5 w-full bg-slate-100 rounded-md overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-md transition-all"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  No categorical features found in this version.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Cardinality: {activeCatFrequencies.length} unique values</span>
              <span className="text-blue-600 font-semibold">One-Hot Encoding Ready</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* --- SPECIALIZED SUB-RENDERERS --- */

const MultiHistogramRenderer: React.FC<{
  column: ColumnProfileSummary;
  rows: Record<string, unknown>[];
}> = ({ column, rows }) => {
  if (!column.isNumeric || !('min' in column.stats)) return null;

  const { min, max, mean, median, stddev, outlierCount } = column.stats;
  const minVal = min ?? 0;
  const maxVal = max ?? 100;

  const values = rows
    .map((r) => Number(r[column.columnName]))
    .filter((v) => !isNaN(v));

  const binCount = 10;
  const step = (maxVal - minVal) / binCount || 1;
  const bins: { label: string; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    const low = minVal + i * step;
    const high = low + step;
    const count = values.filter((v) => v >= low && (i === binCount - 1 ? v <= high : v < high)).length;
    bins.push({ label: `${Math.round(low)}`, count: count || 1 });
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 30, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = (chartWidth / binCount) * 0.85;

  return (
    <div className="space-y-3">
      {/* Quick Stats Badges */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/60">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Mean</div>
          <div className="font-bold text-slate-800">{mean?.toFixed(1) ?? 'N/A'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/60">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Median</div>
          <div className="font-bold text-blue-600">{median?.toFixed(1) ?? 'N/A'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/60">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Std Dev</div>
          <div className="font-bold text-slate-800">{stddev?.toFixed(1) ?? 'N/A'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/60">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Outliers</div>
          <div className="font-bold text-rose-600">{outlierCount}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Bars */}
          {bins.map((b, i) => {
            const x = padding.left + i * (chartWidth / binCount) + (chartWidth / binCount - barWidth) / 2;
            const barH = (b.count / maxCount) * chartHeight;
            const y = padding.top + chartHeight - barH;
            return (
              <g key={b.label}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  className="fill-blue-500 hover:fill-blue-600 transition"
                />
                <text
                  x={x + barWidth / 2}
                  y={padding.top + chartHeight + 14}
                  textAnchor="middle"
                  className="text-[9px] fill-slate-400 font-mono"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const MultiBoxPlotRenderer: React.FC<{
  column: ColumnProfileSummary;
}> = ({ column }) => {
  if (!column.isNumeric || !('min' in column.stats)) return null;

  const minVal = column.stats.min ?? 0;
  const maxVal = column.stats.max ?? 100;
  const medVal = column.stats.median ?? (minVal + maxVal) / 2;
  const q25Val = column.stats.q25 ?? minVal + (maxVal - minVal) * 0.25;
  const q75Val = column.stats.q75 ?? minVal + (maxVal - minVal) * 0.75;
  const outlierCount = column.stats.outlierCount ?? 0;

  const width = 450;
  const height = 150;
  const padding = { left: 45, right: 45, top: 30, bottom: 35 };
  const plotWidth = width - padding.left - padding.right;

  const range = maxVal - minVal || 1;
  const getX = (val: number) => padding.left + ((val - minVal) / range) * plotWidth;

  const xMin = getX(minVal);
  const xQ25 = getX(q25Val);
  const xMed = getX(medVal);
  const xQ75 = getX(q75Val);
  const xMax = getX(maxVal);
  const boxY = 45;
  const boxHeight = 45;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
        <div><strong>Min:</strong> {minVal.toFixed(1)}</div>
        <div><strong>Q1:</strong> {q25Val.toFixed(1)}</div>
        <div className="text-blue-600 font-bold"><strong>Med:</strong> {medVal.toFixed(1)}</div>
        <div><strong>Q3:</strong> {q75Val.toFixed(1)}</div>
        <div><strong>Max:</strong> {maxVal.toFixed(1)}</div>
        <div><strong className="text-rose-600 font-bold">Outliers:</strong> {outlierCount}</div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Whisker */}
          <line x1={xMin} y1={boxY + boxHeight / 2} x2={xMax} y2={boxY + boxHeight / 2} stroke="#94a3b8" strokeWidth={2} />
          <line x1={xMin} y1={boxY + 8} x2={xMin} y2={boxY + boxHeight - 8} stroke="#64748b" strokeWidth={2} />
          <line x1={xMax} y1={boxY + 8} x2={xMax} y2={boxY + boxHeight - 8} stroke="#64748b" strokeWidth={2} />

          {/* Box */}
          <rect
            x={xQ25}
            y={boxY}
            width={Math.max(xQ75 - xQ25, 3)}
            height={boxHeight}
            fill="#dbeafe"
            stroke="#2563eb"
            strokeWidth={2}
            rx={3}
          />
          {/* Median */}
          <line x1={xMed} y1={boxY} x2={xMed} y2={boxY + boxHeight} stroke="#1d4ed8" strokeWidth={3} />

          {/* Labels */}
          <text x={xMin} y={boxY + boxHeight + 18} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono">
            {minVal.toFixed(1)}
          </text>
          <text x={xMed} y={boxY - 8} textAnchor="middle" className="text-[9px] fill-blue-600 font-bold font-mono">
            {medVal.toFixed(1)}
          </text>
          <text x={xMax} y={boxY + boxHeight + 18} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono">
            {maxVal.toFixed(1)}
          </text>
        </svg>
      </div>
    </div>
  );
};

const MultiScatterRenderer: React.FC<{
  xCol: string;
  yCol: string;
  points: { x: number; y: number }[];
}> = ({ xCol, yCol, points }) => {
  if (points.length === 0) {
    return <div className="py-12 text-center text-xs text-slate-400">No data points for {xCol} vs {yCol}.</div>;
  }

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const minX = Math.min(...xVals);
  const maxX = Math.max(...xVals);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 25, bottom: 40, left: 45 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const getX = (val: number) => padding.left + ((val - minX) / rangeX) * plotWidth;
  const getY = (val: number) => padding.top + plotHeight - ((val - minY) / rangeY) * plotHeight;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{points.length} points plotted</span>
        <span>X: [{minX.toFixed(1)}..{maxX.toFixed(1)}] | Y: [{minY.toFixed(1)}..{maxY.toFixed(1)}]</span>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Axes */}
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#cbd5e1" strokeWidth={1.5} />
          <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#cbd5e1" strokeWidth={1.5} />

          {/* Points */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={getX(p.x)}
              cy={getY(p.y)}
              r={3}
              fill="#3b82f6"
              fillOpacity={0.65}
              stroke="#1d4ed8"
              strokeWidth={0.5}
            />
          ))}

          {/* Labels */}
          <text x={padding.left + plotWidth / 2} y={padding.top + plotHeight + 30} textAnchor="middle" className="text-[10px] font-bold fill-slate-700">
            {xCol}
          </text>
          <text x={-padding.top - plotHeight / 2} y={15} transform="rotate(-90)" textAnchor="middle" className="text-[10px] font-bold fill-slate-700">
            {yCol}
          </text>
        </svg>
      </div>
    </div>
  );
};
