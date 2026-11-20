import React, { useState, useMemo } from 'react';
import type { Dataset, DatasetVersion } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import {
  computeHistogramBins,
  generateDataInsights,
  type DataInsight,
} from '@/engine/localAnalytics';

interface DatasetOverviewTabProps {
  dataset: Dataset;
  activeVersion: DatasetVersion | null;
  profile: DatasetProfileSummary | null;
  correlationData: CorrelationMatrixResult | null;
  rows: Record<string, unknown>[];
  onApplySuggestion: (prompt: string) => void;
  onNavigateToTab: (tab: 'eda' | 'quality' | 'preprocessing' | 'features') => void;
}

export const DatasetOverviewTab: React.FC<DatasetOverviewTabProps> = ({
  dataset,
  activeVersion,
  profile,
  correlationData,
  rows,
  onApplySuggestion,
  onNavigateToTab,
}) => {
  const [explanationModal, setExplanationModal] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // Real metrics strictly from dataset version & profiling summary
  const rowCount = activeVersion?.row_count ?? profile?.rowCount ?? rows.length;
  const columnCount = activeVersion?.column_count ?? profile?.columnCount ?? 0;

  // FIX: profile.overallMissingRate is ALREADY on a 0..100 percentage scale (never multiply by 100 again)
  const missingPercentage =
    profile && typeof profile.overallMissingRate === 'number'
      ? `${profile.overallMissingRate.toFixed(1)}%`
      : '0.0%';

  const duplicateRowsCount = profile?.duplicateRowsCount ?? 0;

  // Primary numeric column for real histogram distribution
  const numericColumns = useMemo(
    () => (profile?.columns ?? []).filter((c) => c.isNumeric && !c.isPrimaryKeyCandidate),
    [profile],
  );
  const primaryNumericCol = useMemo(() => {
    return (
      numericColumns.find((c) =>
        ['tenure', 'age', 'mrr_usd', 'order_total', 'monthly_charges', 'price', 'income'].includes(
          c.columnName.toLowerCase(),
        ),
      ) ?? numericColumns[0]
    );
  }, [numericColumns]);

  const histogramBins = useMemo(() => {
    if (!primaryNumericCol || rows.length === 0) return [];
    return computeHistogramBins(rows, primaryNumericCol.columnName, 10);
  }, [primaryNumericCol, rows]);

  const maxBinCount = useMemo(
    () => Math.max(...histogramBins.map((b) => b.count), 1),
    [histogramBins],
  );

  // Real columns with missing values sorted descending
  const columnsWithNulls = useMemo(() => {
    return (profile?.columns ?? [])
      .filter((c) => c.missingPercent > 0)
      .sort((a, b) => b.missingPercent - a.missingPercent)
      .slice(0, 5)
      .map((c) => ({
        name: c.columnName,
        percentage: Number(c.missingPercent.toFixed(1)),
        count: c.missingCount,
      }));
  }, [profile]);

  // Real correlation sub-matrix (up to 5 columns)
  const matrixCols = useMemo(
    () => (correlationData && correlationData.columns.length >= 2 ? correlationData.columns.slice(0, 5) : []),
    [correlationData],
  );

  // Real top categorical column breakdown
  const primaryCatCol = useMemo(() => {
    return (profile?.columns ?? []).find(
      (c) => !c.isNumeric && !c.isPrimaryKeyCandidate && c.distinctCount >= 2 && c.distinctCount <= 12,
    );
  }, [profile]);

  const categoricalBreakdown = useMemo(() => {
    if (!primaryCatCol) return [];
    if ('topFrequencies' in primaryCatCol.stats && primaryCatCol.stats.topFrequencies.length > 0) {
      return primaryCatCol.stats.topFrequencies.slice(0, 5);
    }
    const counts = new Map<string, number>();
    for (const r of rows) {
      const raw = r[primaryCatCol.columnName];
      const key = raw === null || raw === undefined || String(raw).trim() === '' ? '(Missing)' : String(raw);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({
        value,
        count,
        percent: rows.length > 0 ? Number(((count / rows.length) * 100).toFixed(1)) : 0,
      }));
  }, [primaryCatCol, rows]);

  const maxCatCount = useMemo(
    () => Math.max(...categoricalBreakdown.map((c) => c.count), 1),
    [categoricalBreakdown],
  );

  // Real data-driven insights strictly computed from profile & correlation
  const insights: DataInsight[] = useMemo(
    () => generateDataInsights(profile, correlationData),
    [profile, correlationData],
  );

  const getHeatmapColor = (val: number): string => {
    if (val >= 0.8) return '#1d4ed8';
    if (val >= 0.5) return '#3b82f6';
    if (val >= 0.2) return '#93c5fd';
    if (val >= 0.0) return '#e0f2fe';
    if (val >= -0.2) return '#fee2e2';
    if (val >= -0.5) return '#fca5a5';
    return '#ef4444';
  };

  return (
    <div className="space-y-6">
      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#eaecf0] bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Rows</span>
          </div>
          <div className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {rowCount.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-[#eaecf0] bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Columns</span>
          </div>
          <div className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {columnCount}
          </div>
        </div>

        <div className="rounded-xl border border-[#eaecf0] bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Missing Values</span>
          </div>
          <div className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {missingPercentage}
          </div>
        </div>

        <div className="rounded-xl border border-[#eaecf0] bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Duplicate Rows</span>
          </div>
          <div className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {duplicateRowsCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main 2-Column Analytical Split */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left 8 Columns: 2x2 Real Analytical Charts */}
        <div className="space-y-6 lg:col-span-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Chart 1: Real Histogram Distribution */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">
                  Distribution: <span className="font-mono text-[#3b5bf6]">{primaryNumericCol?.columnName ?? 'Numeric'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('eda')}
                  className="cursor-pointer text-[11px] font-semibold text-slate-500 transition hover:text-[#3b5bf6]"
                >
                  Explore in EDA →
                </button>
              </div>

              {histogramBins.length > 0 ? (
                <div className="flex h-44 flex-col justify-end">
                  <div className="flex h-36 items-end justify-between gap-1.5 border-b border-slate-200 px-1 pb-1">
                    {histogramBins.map((bin) => {
                      const heightPct = bin.count === 0 ? 0 : Math.max(4, Math.round((bin.count / maxBinCount) * 100));
                      return (
                        <div key={bin.rangeLabel} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                          <div
                            className="w-full rounded-t-sm bg-[#93c5fd] transition-colors group-hover:bg-[#3b5bf6]"
                            style={{ height: `${heightPct}%` }}
                          />
                          <div className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums group-hover:flex">
                            {bin.rangeLabel}: {bin.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between px-1 pt-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                    <span>{histogramBins[0]?.label}</span>
                    <span>{histogramBins[Math.floor(histogramBins.length / 2)]?.label}</span>
                    <span>{histogramBins[histogramBins.length - 1]?.high.toFixed(0)}</span>
                  </div>
                  <div className="mt-1 text-center text-[10px] font-medium text-slate-400">
                    Frequency across {dataset.name}
                  </div>
                </div>
              ) : (
                <div className="flex h-44 items-center justify-center text-xs text-slate-400">
                  No numeric column available for histogram distribution.
                </div>
              )}
            </div>

            {/* Chart 2: Real Feature Correlation Matrix */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">Feature Correlation</h4>
                <span className="font-mono text-[10px] text-slate-400">Pearson r</span>
              </div>

              {matrixCols.length >= 2 && correlationData ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1 overflow-x-auto">
                    {matrixCols.map((rowName, r) => (
                      <div key={rowName} className="flex items-center gap-1.5">
                        <span
                          title={rowName}
                          className="w-20 truncate pr-1 text-right font-mono text-[10px] text-slate-500"
                        >
                          {rowName}
                        </span>
                        <div className="flex gap-1">
                          {matrixCols.map((colName, c) => {
                            const val = correlationData.matrix[r]?.[c] ?? 0;
                            return (
                              <div
                                key={colName}
                                className="flex h-6 w-7 cursor-default items-center justify-center rounded-sm font-mono text-[9px] font-semibold tabular-nums"
                                style={{
                                  backgroundColor: getHeatmapColor(val),
                                  color: Math.abs(val) >= 0.5 ? '#ffffff' : '#1e293b',
                                }}
                                title={`${rowName} vs ${colName}: ${val.toFixed(2)}`}
                              >
                                {val.toFixed(1)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-1 pl-[86px] pt-1 font-mono text-[9px] text-slate-400">
                      {matrixCols.map((col) => (
                        <span key={col} title={col} className="w-7 truncate text-center">
                          {col.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex h-32 shrink-0 flex-col items-center justify-between border-l border-slate-100 pl-3 font-mono text-[9px] text-slate-400 tabular-nums">
                    <span>1.0</span>
                    <div className="my-1 w-2.5 flex-1 rounded bg-gradient-to-b from-[#1d4ed8] via-[#e0f2fe] to-[#ef4444]" />
                    <span>-1.0</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-44 items-center justify-center text-xs text-slate-400">
                  Needs at least two numeric columns for correlation analysis.
                </div>
              )}
            </div>

            {/* Chart 3: Real Null Value Percentage by Column */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">Missing Values by Column</h4>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('quality')}
                  className="cursor-pointer text-[11px] font-semibold text-slate-500 transition hover:text-[#3b5bf6]"
                >
                  Full Audit →
                </button>
              </div>

              {columnsWithNulls.length > 0 ? (
                <div className="space-y-3 pt-1">
                  {columnsWithNulls.map((col) => (
                    <div key={col.name} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="max-w-[160px] truncate font-mono text-slate-700">
                          {col.name}
                        </span>
                        <span className="font-mono font-bold text-slate-800 tabular-nums">
                          {col.percentage.toFixed(1)}% ({col.count})
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${Math.max(2, Math.min(100, col.percentage))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-slate-100 pt-2 font-mono text-[10px] text-slate-400 tabular-nums">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100% missing</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-center">
                  <span className="text-xs font-semibold text-emerald-800">Zero missing values</span>
                  <span className="mt-1 text-[11px] text-emerald-700">
                    All {columnCount} columns in this version are 100% populated.
                  </span>
                </div>
              )}
            </div>

            {/* Chart 4: Real Top Categorical Distribution */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">
                  Category Breakdown:{' '}
                  <span className="font-mono text-[#3b5bf6]">
                    {primaryCatCol?.columnName ?? 'Categories'}
                  </span>
                </h4>
                {primaryCatCol && (
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {primaryCatCol.distinctCount} values
                  </span>
                )}
              </div>

              {categoricalBreakdown.length > 0 ? (
                <div className="space-y-3 pt-1">
                  {categoricalBreakdown.map((item) => {
                    const widthPct = Math.max(4, Math.round((item.count / maxCatCount) * 100));
                    return (
                      <div key={item.value} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="max-w-[165px] truncate font-medium text-slate-700">
                            {item.value}
                          </span>
                          <span className="font-mono font-semibold text-slate-600 tabular-nums">
                            {item.count.toLocaleString()} ({item.percent.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#3b5bf6]"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-slate-400">
                  No low-cardinality categorical columns in this version.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Real Data-Driven Recommendations Panel */}
        <div className="space-y-4 rounded-2xl border border-[#eaecf0] bg-white p-6 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Automated Findings</h3>
            <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
              {insights.length} detected
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Actionable recommendations derived strictly from this version&apos;s statistical profile.
          </p>

          {insights.length > 0 ? (
            <div className="space-y-3 pt-1">
              {insights.map((insight, index) => (
                <div
                  key={insight.id}
                  className="space-y-3 rounded-xl border border-slate-200/80 bg-[#fbfcfd] p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] font-mono text-[11px] font-bold text-[#3b5bf6] tabular-nums">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900">{insight.title}</h4>
                      <p className="mt-1 text-[11px] leading-snug text-slate-600">
                        {insight.summary}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-7">
                    <button
                      type="button"
                      onClick={() => {
                        onApplySuggestion(insight.actionPrompt);
                        onNavigateToTab('preprocessing');
                      }}
                      className="cursor-pointer rounded-lg bg-[#3b5bf6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Plan Fix
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExplanationModal({
                          title: insight.title,
                          body: insight.explanation,
                        })
                      }
                      className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Explain
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900">
              <p className="font-semibold">Dataset looks clean</p>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                No missing values, exact duplicates, or critical IQR anomalies remain in this version. You can proceed to Feature Insights to export your training pipeline.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Explanation Modal */}
      {explanationModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="insight-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h3 id="insight-modal-title" className="text-sm font-bold text-slate-900">
                {explanationModal.title}
              </h3>
              <button
                type="button"
                aria-label="Close explanation"
                onClick={() => setExplanationModal(null)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{explanationModal.body}</p>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setExplanationModal(null)}
                className="cursor-pointer rounded-lg bg-[#3b5bf6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
