import React, { useState, useMemo } from 'react';
import type { ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import { CorrelationHeatmapView } from '@/components/eda/CorrelationHeatmapView';

export type ChartType = 'histogram' | 'boxplot' | 'scatter' | 'bar' | 'correlation';

interface InteractiveChartStudioProps {
  columns: ColumnProfileSummary[];
  rows: Record<string, unknown>[];
  correlationData: CorrelationMatrixResult | null;
  datasetName: string;
  loading?: boolean;
}

interface SuggestedPlot {
  id: string;
  title: string;
  description: string;
  type: ChartType;
  xCol: string;
  yCol?: string;
  badge: string;
}

export const InteractiveChartStudio: React.FC<InteractiveChartStudioProps> = ({
  columns,
  rows,
  correlationData,
  datasetName,
  loading = false,
}) => {
  const numericCols = useMemo(() => columns.filter((c) => c.isNumeric), [columns]);
  const allCols = useMemo(() => columns.map((c) => c.columnName), [columns]);

  // Chart state
  const [selectedType, setSelectedType] = useState<ChartType>('histogram');
  const [selectedX, setSelectedX] = useState<string>(numericCols[0]?.columnName || allCols[0] || '');
  const [selectedY, setSelectedY] = useState<string>(numericCols[1]?.columnName || '');

  // Generate Agent Recommendations based on dataset properties
  const suggestedPlots = useMemo<SuggestedPlot[]>(() => {
    const list: SuggestedPlot[] = [];

    // 1. Target or binary classification column (e.g., Survived)
    const targetCandidate = columns.find(
      (c) =>
        c.columnName.toLowerCase().includes('survived') ||
        c.columnName.toLowerCase().includes('target') ||
        c.columnName.toLowerCase().includes('label') ||
        c.columnName.toLowerCase().includes('churn') ||
        (c.distinctCount === 2 && !c.isNumeric),
    );
    if (targetCandidate) {
      list.push({
        id: 'target_dist',
        title: `Target Distribution: ${targetCandidate.columnName}`,
        description: 'Class balance & outcome ratio recommended for classification',
        type: 'bar',
        xCol: targetCandidate.columnName,
        badge: 'Recommended Target',
      });
    }

    // 2. High variance / skewed numeric column with outliers (e.g., Fare or Age)
    const outlierCol = numericCols.find((c) => c.stats && 'outlierCount' in c.stats && (c.stats.outlierCount ?? 0) > 0);
    if (outlierCol) {
      list.push({
        id: 'outlier_box',
        title: `Boxplot Spread & Outliers: ${outlierCol.columnName}`,
        description: `${outlierCol.stats && 'outlierCount' in outlierCol.stats ? outlierCol.stats.outlierCount : 0} outliers detected outside 1.5× IQR boundary`,
        type: 'boxplot',
        xCol: outlierCol.columnName,
        badge: 'Outlier Analysis',
      });
    }

    // 3. Pairwise scatter for two numeric features (e.g., Age vs Fare)
    if (numericCols.length >= 2) {
      const colA = numericCols[0]!.columnName;
      const colB = numericCols[1]!.columnName;
      list.push({
        id: 'numeric_scatter',
        title: `${colA} vs ${colB} Relationship`,
        description: 'Inspect bivariate trend, clusters, and interaction patterns',
        type: 'scatter',
        xCol: colA,
        yCol: colB,
        badge: 'Bivariate Trend',
      });
    }

    // 4. Correlation Heatmap
    if (correlationData && correlationData.columns.length > 1) {
      list.push({
        id: 'corr_heatmap',
        title: 'Full Pearson Correlation Matrix',
        description: `${correlationData.columns.length} numeric columns cross-analyzed for multi-collinearity`,
        type: 'correlation',
        xCol: correlationData.columns[0] || '',
        badge: 'Collinearity Check',
      });
    }

    // Fallback if none found
    if (list.length === 0 && numericCols.length > 0) {
      list.push({
        id: 'default_hist',
        title: `${numericCols[0]!.columnName} Distribution`,
        description: 'Frequency spread & density estimation',
        type: 'histogram',
        xCol: numericCols[0]!.columnName,
        badge: 'Feature Spread',
      });
    }

    return list;
  }, [columns, numericCols, correlationData]);

  // Handle clicking a suggested plot
  const handleApplySuggestion = (suggestion: SuggestedPlot) => {
    setSelectedType(suggestion.type);
    setSelectedX(suggestion.xCol);
    if (suggestion.yCol) setSelectedY(suggestion.yCol);
  };

  const activeColSummary = columns.find((c) => c.columnName === selectedX);

  // Extract values for X and Y from preview rows
  const xValues = useMemo(() => {
    return rows
      .map((r) => r[selectedX])
      .filter((v): v is number | string => v !== null && v !== undefined);
  }, [rows, selectedX]);

  const numericXValues = useMemo(() => {
    return xValues.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  }, [xValues]);

  const scatterPoints = useMemo(() => {
    if (selectedType !== 'scatter' || !selectedY) return [];
    return rows
      .map((r) => ({
        x: Number(r[selectedX]),
        y: Number(r[selectedY]),
      }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
  }, [rows, selectedX, selectedY, selectedType]);

  // Compute category counts for bar chart
  const categoryCounts = useMemo(() => {
    if (selectedType !== 'bar') return [];
    const counts: Record<string, number> = {};
    xValues.forEach((v) => {
      const key = String(v);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [xValues, selectedType]);

  return (
    <div className="space-y-6">
      {/* 1. Agent Suggested Visualizations Section */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xs">
              ✨
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">AI Recommended Visualizations</h3>
              <p className="text-[11px] text-slate-500">
                Curated based on data quality, cardinality, and statistical distribution in {datasetName}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/60 px-2.5 py-1 rounded-full border border-blue-200">
            {suggestedPlots.length} Suggested Insights
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {suggestedPlots.map((s) => {
            const isCurrent =
              selectedType === s.type &&
              selectedX === s.xCol &&
              (!s.yCol || selectedY === s.yCol);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleApplySuggestion(s)}
                className={`flex flex-col justify-between rounded-xl p-3.5 text-left transition cursor-pointer border ${
                  isCurrent
                    ? 'border-blue-500 bg-white shadow-md ring-2 ring-blue-500/20'
                    : 'border-slate-200/80 bg-white/80 hover:bg-white hover:border-blue-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {s.badge}
                    </span>
                    <span className="text-xs text-slate-400 font-mono capitalize">
                      {s.type}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{s.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                  <span>Plot Chart</span>
                  <span>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Interactive Chart Studio Controls */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Interactive Chart Builder</h3>
            <p className="text-xs text-slate-400">
              Select any chart type and columns to inspect distributions and relationships
            </p>
          </div>

          {/* Chart Type Selector Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/60">
            <button
              type="button"
              onClick={() => setSelectedType('histogram')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                selectedType === 'histogram'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📊</span> Histogram
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('boxplot')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                selectedType === 'boxplot'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📦</span> Box Plot
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('scatter')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                selectedType === 'scatter'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🔵</span> Scatter (2D)
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('bar')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                selectedType === 'bar'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📶</span> Bar Chart
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('correlation')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                selectedType === 'correlation'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🗺️</span> Heatmap
            </button>
          </div>
        </div>

        {/* Column Selectors Toolbar */}
        {selectedType !== 'correlation' && (
          <div className="mt-4 flex flex-wrap items-center gap-4 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/60">
            {/* Primary Column (X-Axis) */}
            <div className="flex items-center gap-2">
              <label htmlFor="chart-x-select" className="text-xs font-bold text-slate-700">
                {selectedType === 'scatter' ? 'X-Axis Feature:' : 'Column:'}
              </label>
              <select
                id="chart-x-select"
                value={selectedX}
                onChange={(e) => setSelectedX(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                {allCols.map((c) => (
                  <option key={c} value={c}>
                    {c} {numericCols.some((nc) => nc.columnName === c) ? '(123)' : '(ABC)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Secondary Column (Y-Axis) for Scatter */}
            {selectedType === 'scatter' && (
              <div className="flex items-center gap-2">
                <label htmlFor="chart-y-select" className="text-xs font-bold text-slate-700">
                  Y-Axis Feature:
                </label>
                <select
                  id="chart-y-select"
                  value={selectedY}
                  onChange={(e) => setSelectedY(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  {numericCols.map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Stats Pill */}
            {activeColSummary && (
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="text-slate-400">Type:</span>
                <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {activeColSummary.inferredType}
                </span>
                <span className="text-slate-400">Nulls:</span>
                <span className={`font-bold px-2 py-0.5 rounded border ${
                  activeColSummary.missingPercent > 0
                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                }`}>
                  {activeColSummary.missingPercent.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3. Visualization Canvas Render */}
        <div className="mt-6">
          {selectedType === 'correlation' ? (
            <CorrelationHeatmapView data={correlationData} loading={loading} />
          ) : selectedType === 'histogram' ? (
            <HistogramView column={activeColSummary} values={numericXValues} />
          ) : selectedType === 'boxplot' ? (
            <BoxPlotView column={activeColSummary} values={numericXValues} />
          ) : selectedType === 'scatter' ? (
            <ScatterPlotView
              xColName={selectedX}
              yColName={selectedY}
              points={scatterPoints}
            />
          ) : (
            <BarChartView colName={selectedX} data={categoryCounts} />
          )}
        </div>
      </div>
    </div>
  );
};

/* --- SUB-COMPONENTS FOR HIGH-FIDELITY SVG RENDERING --- */

// 1. Histogram / Density View
const HistogramView: React.FC<{
  column?: ColumnProfileSummary;
  values: number[];
}> = ({ column, values }) => {
  if (!column || !column.isNumeric || !('min' in column.stats)) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="text-xs">Select a numeric column to view its histogram distribution.</p>
      </div>
    );
  }

  const { min, max, mean, median, stddev, outlierCount } = column.stats;
  const minVal = min ?? 0;
  const maxVal = max ?? 100;

  // Approximate 10 histogram bins
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
  const width = 700;
  const height = 280;
  const padding = { top: 30, right: 40, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = (chartWidth / binCount) * 0.85;

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Min Value</div>
          <div className="text-sm font-bold text-slate-800">{minVal.toFixed(2)}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Mean</div>
          <div className="text-sm font-bold text-slate-800">{mean?.toFixed(2) ?? 'N/A'}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Median</div>
          <div className="text-sm font-bold text-blue-600">{median?.toFixed(2) ?? 'N/A'}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Std Dev</div>
          <div className="text-sm font-bold text-slate-800">{stddev?.toFixed(2) ?? 'N/A'}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Max Value</div>
          <div className="text-sm font-bold text-slate-800">{maxVal.toFixed(2)}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Outliers (IQR)</div>
          <div className="text-sm font-bold text-rose-600">{outlierCount ?? 0}</div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative rounded-xl border border-slate-100 bg-slate-50/40 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padding.top + chartHeight * (1 - pct);
            return (
              <g key={pct}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartWidth}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 10}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-400 font-mono"
                >
                  {Math.round(maxCount * pct)}
                </text>
              </g>
            );
          })}

          {/* Histogram Bars */}
          {bins.map((b, i) => {
            const x = padding.left + i * (chartWidth / binCount) + (chartWidth / binCount - barWidth) / 2;
            const barH = (b.count / maxCount) * chartHeight;
            const y = padding.top + chartHeight - barH;
            return (
              <g key={b.label} className="group">
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={3}
                  className="fill-blue-500 hover:fill-blue-600 transition"
                />
                {/* X axis tick */}
                <text
                  x={x + barWidth / 2}
                  y={padding.top + chartHeight + 16}
                  textAnchor="middle"
                  className="text-[9px] fill-slate-500 font-mono"
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

// 2. Box Plot View
const BoxPlotView: React.FC<{
  column?: ColumnProfileSummary;
  values: number[];
}> = ({ column }) => {
  if (!column || !column.isNumeric || !('min' in column.stats)) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="text-xs">Select a numeric column to view its box plot.</p>
      </div>
    );
  }

  const minVal = column.stats.min ?? 0;
  const maxVal = column.stats.max ?? 100;
  const medVal = column.stats.median ?? (minVal + maxVal) / 2;
  const q25Val = column.stats.q25 ?? minVal + (maxVal - minVal) * 0.25;
  const q75Val = column.stats.q75 ?? minVal + (maxVal - minVal) * 0.75;
  const outlierCount = column.stats.outlierCount ?? 0;

  const width = 600;
  const height = 180;
  const padding = { left: 60, right: 60, top: 40, bottom: 40 };
  const plotWidth = width - padding.left - padding.right;

  const range = maxVal - minVal || 1;
  const getX = (val: number) => padding.left + ((val - minVal) / range) * plotWidth;

  const xMin = getX(minVal);
  const xQ25 = getX(q25Val);
  const xMed = getX(medVal);
  const xQ75 = getX(q75Val);
  const xMax = getX(maxVal);
  const boxY = 70;
  const boxHeight = 50;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
        <div><strong>Min:</strong> {minVal.toFixed(2)}</div>
        <div><strong>Q1 (25%):</strong> {q25Val.toFixed(2)}</div>
        <div className="text-blue-600 font-bold"><strong>Median:</strong> {medVal.toFixed(2)}</div>
        <div><strong>Q3 (75%):</strong> {q75Val.toFixed(2)}</div>
        <div><strong>Max:</strong> {maxVal.toFixed(2)}</div>
        <div className="text-rose-600 font-bold"><strong>Outliers:</strong> {outlierCount}</div>
      </div>

      <div className="relative rounded-xl border border-slate-100 bg-slate-50/40 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Whisker Line */}
          <line
            x1={xMin}
            y1={boxY + boxHeight / 2}
            x2={xMax}
            y2={boxY + boxHeight / 2}
            stroke="#94a3b8"
            strokeWidth={2}
          />

          {/* Min Whisker Cap */}
          <line
            x1={xMin}
            y1={boxY + 10}
            x2={xMin}
            y2={boxY + boxHeight - 10}
            stroke="#64748b"
            strokeWidth={2}
          />
          {/* Max Whisker Cap */}
          <line
            x1={xMax}
            y1={boxY + 10}
            x2={xMax}
            y2={boxY + boxHeight - 10}
            stroke="#64748b"
            strokeWidth={2}
          />

          {/* IQR Box (Q25 to Q75) */}
          <rect
            x={xQ25}
            y={boxY}
            width={Math.max(xQ75 - xQ25, 2)}
            height={boxHeight}
            fill="#dbeafe"
            stroke="#2563eb"
            strokeWidth={2}
            rx={4}
          />

          {/* Median Line */}
          <line
            x1={xMed}
            y1={boxY}
            x2={xMed}
            y2={boxY + boxHeight}
            stroke="#1d4ed8"
            strokeWidth={3}
          />

          {/* Value Labels */}
          <text x={xMin} y={boxY + boxHeight + 20} textAnchor="middle" className="text-[10px] fill-slate-500 font-mono">
            {minVal.toFixed(1)}
          </text>
          <text x={xMed} y={boxY - 10} textAnchor="middle" className="text-[10px] fill-blue-600 font-bold font-mono">
            Med: {medVal.toFixed(1)}
          </text>
          <text x={xMax} y={boxY + boxHeight + 20} textAnchor="middle" className="text-[10px] fill-slate-500 font-mono">
            {maxVal.toFixed(1)}
          </text>
        </svg>
      </div>
    </div>
  );
};

// 3. Scatter Plot View (2D)
const ScatterPlotView: React.FC<{
  xColName: string;
  yColName: string;
  points: { x: number; y: number }[];
}> = ({ xColName, yColName, points }) => {
  if (points.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="text-xs">No numeric pairs available for {xColName} vs {yColName}.</p>
      </div>
    );
  }

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const minX = Math.min(...xVals);
  const maxX = Math.max(...xVals);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);

  const width = 700;
  const height = 320;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const getX = (val: number) => padding.left + ((val - minX) / rangeX) * plotWidth;
  const getY = (val: number) => padding.top + plotHeight - ((val - minY) / rangeY) * plotHeight;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Plotting <strong>{points.length}</strong> data points</span>
        <span>X: [{minX.toFixed(1)} – {maxX.toFixed(1)}] | Y: [{minY.toFixed(1)} – {maxY.toFixed(1)}]</span>
      </div>

      <div className="relative rounded-xl border border-slate-100 bg-slate-50/40 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Axes */}
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#cbd5e1" strokeWidth={1.5} />
          <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} stroke="#cbd5e1" strokeWidth={1.5} />

          {/* Scatter Points */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={getX(p.x)}
              cy={getY(p.y)}
              r={3.5}
              fill="#3b82f6"
              fillOpacity={0.65}
              stroke="#1d4ed8"
              strokeWidth={0.5}
            />
          ))}

          {/* Axis Labels */}
          <text
            x={padding.left + plotWidth / 2}
            y={padding.top + plotHeight + 35}
            textAnchor="middle"
            className="text-[11px] font-bold fill-slate-700"
          >
            {xColName}
          </text>
          <text
            x={-padding.top - plotHeight / 2}
            y={20}
            transform="rotate(-90)"
            textAnchor="middle"
            className="text-[11px] font-bold fill-slate-700"
          >
            {yColName}
          </text>
        </svg>
      </div>
    </div>
  );
};

// 4. Bar Chart View (Categorical Frequencies)
const BarChartView: React.FC<{
  colName: string;
  data: { label: string; count: number }[];
}> = ({ colName, data }) => {
  if (data.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="text-xs">No categorical frequencies found for {colName}.</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        Top {data.length} categories for <strong>{colName}</strong>
      </div>

      <div className="space-y-2.5">
        {data.map((item) => {
          const pct = (item.count / maxCount) * 100;
          return (
            <div key={item.label} className="flex items-center gap-3 text-xs">
              <span className="w-28 truncate font-medium text-slate-700 text-right">
                {item.label}
              </span>
              <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
                <div
                  className="h-full bg-blue-500 rounded-md transition-all duration-300"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="w-12 font-mono font-bold text-slate-700 text-right">
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
