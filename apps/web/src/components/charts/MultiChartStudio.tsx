import React, { useState, useMemo } from 'react';
import type { ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import { CorrelationHeatmapView } from '@/components/eda/CorrelationHeatmapView';
import { computeHistogramBins } from '@/engine/localAnalytics';

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
  const categoricalCols = useMemo(
    () => columns.filter((c) => !c.isNumeric && !c.isPrimaryKeyCandidate),
    [columns],
  );

  // Store user overrides; derive effective values so async column arrivals never leave blank charts
  const [selectedNumericCol, setSelectedNumericCol] = useState<string>('');
  const [selectedScatterX, setSelectedScatterX] = useState<string>('');
  const [selectedScatterY, setSelectedScatterY] = useState<string>('');
  const [selectedCatCol, setSelectedCatCol] = useState<string>('');

  const effectiveNumericCol = useMemo(() => {
    if (numericCols.some((c) => c.columnName === selectedNumericCol)) return selectedNumericCol;
    return numericCols[0]?.columnName ?? '';
  }, [numericCols, selectedNumericCol]);

  const effectiveScatterX = useMemo(() => {
    if (numericCols.some((c) => c.columnName === selectedScatterX)) return selectedScatterX;
    return numericCols[0]?.columnName ?? '';
  }, [numericCols, selectedScatterX]);

  const effectiveScatterY = useMemo(() => {
    if (numericCols.some((c) => c.columnName === selectedScatterY)) return selectedScatterY;
    return numericCols[1]?.columnName ?? numericCols[0]?.columnName ?? '';
  }, [numericCols, selectedScatterY]);

  const effectiveCatCol = useMemo(() => {
    if (categoricalCols.some((c) => c.columnName === selectedCatCol)) return selectedCatCol;
    return categoricalCols[0]?.columnName ?? '';
  }, [categoricalCols, selectedCatCol]);

  const [dashboardFilter, setDashboardFilter] = useState<
    'all' | 'distributions' | 'correlations' | 'categories'
  >('all');

  const selectedNumericSummary = useMemo(() => {
    return numericCols.find((c) => c.columnName === effectiveNumericCol) ?? numericCols[0];
  }, [numericCols, effectiveNumericCol]);

  const activeCatFrequencies = useMemo(() => {
    if (!effectiveCatCol) return [];
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const val = r[effectiveCatCol];
      const key = val !== null && val !== undefined && String(val).trim() !== '' ? String(val) : '(Missing)';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows, effectiveCatCol]);

  const scatterPoints = useMemo(() => {
    if (!effectiveScatterX || !effectiveScatterY) return [];
    return rows
      .map((r) => ({
        x: Number(r[effectiveScatterX]),
        y: Number(r[effectiveScatterY]),
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [rows, effectiveScatterX, effectiveScatterY]);

  const targetCandidate = useMemo(() => {
    return columns.find(
      (c) =>
        c.columnName.toLowerCase().includes('churn') ||
        c.columnName.toLowerCase().includes('renewed') ||
        c.columnName.toLowerCase().includes('returned') ||
        c.columnName.toLowerCase().includes('survived') ||
        c.columnName.toLowerCase().includes('target') ||
        c.columnName.toLowerCase().includes('label'),
    );
  }, [columns]);

  const targetFrequencies = useMemo(() => {
    if (!targetCandidate) return [];
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const v = r[targetCandidate.columnName];
      const key = v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '(Missing)';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        pct: rows.length > 0 ? (count / rows.length) * 100 : 0,
      }));
  }, [rows, targetCandidate]);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#eaecf0] bg-white p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Exploratory Data Analysis
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Interactive distributions, IQR spread, bivariate scatter, and Pearson correlations for {datasetName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100 p-1 text-xs font-semibold">
          {(
            [
              { id: 'all', label: 'All Views' },
              { id: 'distributions', label: 'Distributions' },
              { id: 'correlations', label: 'Correlations' },
              { id: 'categories', label: 'Categoricals' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDashboardFilter(item.id)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 whitespace-nowrap transition ${
                dashboardFilter === item.id
                  ? 'bg-white text-[#3b5bf6] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Grid: Target Distribution & Correlation Heatmap */}
      {(dashboardFilter === 'all' || dashboardFilter === 'correlations') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {targetCandidate && (
            <div className="flex flex-col justify-between rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-4">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Target Balance</span>
                    <span className="font-mono text-[11px] font-semibold text-[#3b5bf6]">
                      {targetCandidate.columnName}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Classes
                  </span>
                </div>
                <p className="mb-4 text-xs leading-relaxed text-slate-500">
                  Class balance for supervised splits in {datasetName}. Inspect minority class ratios before splitting.
                </p>

                <div className="space-y-3">
                  {targetFrequencies.map((tf, idx) => (
                    <div key={tf.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-slate-800">
                          Value: {tf.label}
                        </span>
                        <span className="font-mono font-semibold text-slate-500 tabular-nums">
                          {tf.count.toLocaleString()} ({tf.pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-3.5 w-full overflow-hidden rounded-md bg-slate-100">
                        <div
                          className={`h-full rounded-md ${idx === 0 ? 'bg-[#3b5bf6]' : 'bg-slate-400'}`}
                          style={{ width: `${Math.max(2, tf.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span className="font-mono tabular-nums">{rows.length.toLocaleString()} sampled rows</span>
                <span className="font-semibold text-emerald-700">Stratified split ready</span>
              </div>
            </div>
          )}

          <div className={targetCandidate ? 'lg:col-span-8' : 'lg:col-span-12'}>
            <CorrelationHeatmapView data={correlationData} loading={loading} />
          </div>
        </div>
      )}

      {/* Middle Grid: Histogram + Boxplot */}
      {(dashboardFilter === 'all' || dashboardFilter === 'distributions') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Feature Distribution</span>
                <span className="text-xs text-slate-400">· 10-bin frequency histogram</span>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="num-hist-select" className="text-xs font-semibold text-slate-500">
                  Feature:
                </label>
                <select
                  id="num-hist-select"
                  value={effectiveNumericCol}
                  onChange={(e) => setSelectedNumericCol(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
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

          <div className="flex flex-col justify-between rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-5">
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">Spread &amp; Outliers</span>
                  <span className="text-xs text-slate-400">· 1.5× IQR</span>
                </div>
                <span className="font-mono text-xs font-bold text-rose-600 tabular-nums">
                  {selectedNumericSummary && 'outlierCount' in selectedNumericSummary.stats
                    ? selectedNumericSummary.stats.outlierCount
                    : 0}{' '}
                  outliers
                </span>
              </div>

              {selectedNumericSummary ? (
                <MultiBoxPlotRenderer column={selectedNumericSummary} />
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">No numeric column selected.</div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span>Tukey whiskers from Q1 to Q3</span>
              <span className="font-mono font-semibold text-slate-700">
                {selectedNumericSummary?.columnName ?? '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Grid: Bivariate Scatter + Categorical Frequency */}
      {(dashboardFilter === 'all' ||
        dashboardFilter === 'categories' ||
        dashboardFilter === 'distributions') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Bivariate Scatter</span>
                <span className="text-xs text-slate-400">· 2D numeric interaction</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="scatter-x-select" className="text-xs font-medium text-slate-500">
                  X:
                </label>
                <select
                  id="scatter-x-select"
                  value={effectiveScatterX}
                  onChange={(e) => setSelectedScatterX(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-800"
                >
                  {numericCols.map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName}
                    </option>
                  ))}
                </select>

                <label htmlFor="scatter-y-select" className="ml-1 text-xs font-medium text-slate-500">
                  Y:
                </label>
                <select
                  id="scatter-y-select"
                  value={effectiveScatterY}
                  onChange={(e) => setSelectedScatterY(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-800"
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
              xCol={effectiveScatterX}
              yCol={effectiveScatterY}
              points={scatterPoints}
            />
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-5">
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-sm font-bold text-slate-900">Categorical Distribution</span>

                {categoricalCols.length > 0 && (
                  <select
                    aria-label="Categorical feature"
                    value={effectiveCatCol}
                    onChange={(e) => setSelectedCatCol(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-800"
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
                          <span className="max-w-[180px] truncate font-medium text-slate-700">
                            {cat.label}
                          </span>
                          <span className="font-mono font-semibold text-slate-600 tabular-nums">
                            {cat.count.toLocaleString()} rows
                          </span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-md bg-slate-100">
                          <div
                            className="h-full rounded-md bg-[#3b5bf6]"
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

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span className="font-mono tabular-nums">
                Cardinality: {activeCatFrequencies.length} unique values
              </span>
              <span className="font-semibold text-[#3b5bf6]">One-hot ready</span>
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

  const { mean, median, stddev, outlierCount } = column.stats;
  const bins = computeHistogramBins(rows, column.columnName, 10);

  if (bins.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-slate-400">
        No finite values available for {column.columnName}.
      </div>
    );
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 24, bottom: 35, left: 36 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = (chartWidth / bins.length) * 0.82;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-2">
          <div className="text-[10px] font-semibold uppercase text-slate-500">Mean</div>
          <div className="font-mono font-bold text-slate-900 tabular-nums">
            {mean?.toFixed(1) ?? 'N/A'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-2">
          <div className="text-[10px] font-semibold uppercase text-slate-500">Median</div>
          <div className="font-mono font-bold text-[#3b5bf6] tabular-nums">
            {median?.toFixed(1) ?? 'N/A'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-2">
          <div className="text-[10px] font-semibold uppercase text-slate-500">Std Dev</div>
          <div className="font-mono font-bold text-slate-900 tabular-nums">
            {stddev?.toFixed(1) ?? 'N/A'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-2">
          <div className="text-[10px] font-semibold uppercase text-slate-500">Outliers</div>
          <div className="font-mono font-bold text-rose-600 tabular-nums">{outlierCount}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Histogram of ${column.columnName}`}>
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          {bins.map((b, i) => {
            const x =
              padding.left +
              i * (chartWidth / bins.length) +
              (chartWidth / bins.length - barWidth) / 2;
            const barH = b.count === 0 ? 0 : Math.max(2, (b.count / maxCount) * chartHeight);
            const y = padding.top + chartHeight - barH;
            return (
              <g key={`${b.rangeLabel}-${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  className="fill-[#3b5bf6]/80 transition-colors hover:fill-[#3b5bf6]"
                >
                  <title>{`${b.rangeLabel}: ${b.count} rows`}</title>
                </rect>
                <text
                  x={x + barWidth / 2}
                  y={padding.top + chartHeight + 16}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono text-[9px]"
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

  const width = 450;
  const height = 148;
  const padding = { left: 45, right: 45, top: 28, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;

  const range = maxVal - minVal || 1;
  const getX = (val: number) => padding.left + ((val - minVal) / range) * plotWidth;

  const xMin = getX(minVal);
  const xQ25 = getX(q25Val);
  const xMed = getX(medVal);
  const xQ75 = getX(q75Val);
  const xMax = getX(maxVal);
  const boxY = 44;
  const boxHeight = 44;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600 tabular-nums">
        <span>Min {minVal.toFixed(1)}</span>
        <span>Q1 {q25Val.toFixed(1)}</span>
        <span className="font-bold text-[#3b5bf6]">Med {medVal.toFixed(1)}</span>
        <span>Q3 {q75Val.toFixed(1)}</span>
        <span>Max {maxVal.toFixed(1)}</span>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Boxplot of ${column.columnName}`}>
          <line x1={xMin} y1={boxY + boxHeight / 2} x2={xMax} y2={boxY + boxHeight / 2} stroke="#94a3b8" strokeWidth={2} />
          <line x1={xMin} y1={boxY + 8} x2={xMin} y2={boxY + boxHeight - 8} stroke="#64748b" strokeWidth={2} />
          <line x1={xMax} y1={boxY + 8} x2={xMax} y2={boxY + boxHeight - 8} stroke="#64748b" strokeWidth={2} />

          <rect
            x={xQ25}
            y={boxY}
            width={Math.max(xQ75 - xQ25, 3)}
            height={boxHeight}
            fill="#dbeafe"
            stroke="#3b5bf6"
            strokeWidth={2}
            rx={3}
          />
          <line x1={xMed} y1={boxY} x2={xMed} y2={boxY + boxHeight} stroke="#1d4ed8" strokeWidth={3} />

          <text x={xMin} y={boxY + boxHeight + 18} textAnchor="middle" className="fill-slate-500 font-mono text-[9px]">
            {minVal.toFixed(1)}
          </text>
          <text x={xMed} y={boxY - 8} textAnchor="middle" className="fill-[#3b5bf6] font-mono text-[9px] font-bold">
            {medVal.toFixed(1)}
          </text>
          <text x={xMax} y={boxY + boxHeight + 18} textAnchor="middle" className="fill-slate-500 font-mono text-[9px]">
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
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        No numeric pairs available for {xCol || 'X'} vs {yCol || 'Y'}.
      </div>
    );
  }

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const minX = Math.min(...xVals);
  const maxX = Math.max(...xVals);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 25, bottom: 40, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const getX = (val: number) => padding.left + ((val - minX) / rangeX) * plotWidth;
  const getY = (val: number) => padding.top + plotHeight - ((val - minY) / rangeY) * plotHeight;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
        <span>{points.length.toLocaleString()} points</span>
        <span>
          X [{minX.toFixed(1)}..{maxX.toFixed(1)}] · Y [{minY.toFixed(1)}..{maxY.toFixed(1)}]
        </span>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Scatter plot of ${xCol} vs ${yCol}`}>
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={padding.left + plotWidth}
            y2={padding.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />

          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={getX(p.x)}
              cy={getY(p.y)}
              r={3}
              fill="#3b5bf6"
              fillOpacity={0.62}
              stroke="#1d4ed8"
              strokeWidth={0.5}
            />
          ))}

          <text
            x={padding.left + plotWidth / 2}
            y={padding.top + plotHeight + 30}
            textAnchor="middle"
            className="fill-slate-700 font-mono text-[10px] font-semibold"
          >
            {xCol}
          </text>
          <text
            x={-padding.top - plotHeight / 2}
            y={15}
            transform="rotate(-90)"
            textAnchor="middle"
            className="fill-slate-700 font-mono text-[10px] font-semibold"
          >
            {yCol}
          </text>
        </svg>
      </div>
    </div>
  );
};
