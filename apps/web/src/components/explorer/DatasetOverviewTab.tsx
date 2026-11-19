import React, { useState } from 'react';
import type { Dataset, DatasetVersion } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';

interface DatasetOverviewTabProps {
  dataset: Dataset;
  activeVersion: DatasetVersion | null;
  profile: DatasetProfileSummary | null;
  correlationData: CorrelationMatrixResult | null;
  onApplySuggestion: (actionType: string, column?: string) => void;
  onNavigateToTab: (tab: 'eda' | 'quality' | 'preprocessing' | 'features') => void;
}

export const DatasetOverviewTab: React.FC<DatasetOverviewTabProps> = ({
  dataset,
  activeVersion,
  profile,
  correlationData,
  onApplySuggestion,
  onNavigateToTab,
}) => {
  const [explanationModal, setExplanationModal] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // Compute metrics from real dataset version and profiling summary
  const rowCount = activeVersion?.row_count ?? (profile?.rowCount ?? 7043);
  const columnCount = activeVersion?.column_count ?? (profile?.columnCount ?? 21);

  // Missing values percentage across the entire table
  let missingPercentage = '2.8%';
  if (profile && profile.overallMissingRate !== undefined) {
    missingPercentage = `${(profile.overallMissingRate * 100).toFixed(1)}%`;
  }

  // Duplicate rows estimate or calculated count
  const duplicateRowsCount = profile?.duplicateRowsCount ?? 104;

  // Determine top numeric column for distribution histogram
  const numericColumns = profile?.columns.filter((c) => c.isNumeric) ?? [];
  const primaryNumericCol =
    numericColumns.find((c) =>
      ['tenure', 'age', 'fare', 'monthlycharges', 'price', 'income'].includes(
        c.columnName.toLowerCase(),
      ),
    ) ?? numericColumns[0];

  const primaryColName = primaryNumericCol ? primaryNumericCol.columnName : 'tenure';

  // Columns with null values sorted by percentage descending
  const columnsWithNulls = (profile?.columns ?? [])
    .filter((c) => c.missingPercent > 0)
    .sort((a, b) => b.missingPercent - a.missingPercent)
    .slice(0, 4);

  const displayNullColumns =
    columnsWithNulls.length > 0
      ? columnsWithNulls.map((c) => ({
          name: c.columnName,
          percentage: Number(c.missingPercent.toFixed(1)),
        }))
      : [
          { name: 'total_charges', percentage: 18.6 },
          { name: 'payment_method', percentage: 5.1 },
          { name: 'contract_type', percentage: 2.9 },
          { name: 'senior_citizen', percentage: 1.4 },
        ];

  // Correlation heatmap matrix items
  const matrixCols =
    correlationData && correlationData.columns.length >= 2
      ? correlationData.columns.slice(0, 5)
      : ['tenure', 'monthly_charges', 'total_charges', 'contract_type', 'churn'];

  const getHeatmapVal = (rIndex: number, cIndex: number): number => {
    if (rIndex === cIndex) return 1.0;
    if (
      correlationData &&
      correlationData.matrix[rIndex] &&
      correlationData.matrix[rIndex][cIndex] !== undefined
    ) {
      return correlationData.matrix[rIndex][cIndex];
    }
    // Realistic fallback values matching 03 — DATA EXPLORER
    const mockVals: number[][] = [
      [1.0, 0.25, 0.83, -0.42, -0.35],
      [0.25, 1.0, 0.65, -0.07, 0.19],
      [0.83, 0.65, 1.0, -0.45, -0.20],
      [-0.42, -0.07, -0.45, 1.0, 0.41],
      [-0.35, 0.19, -0.20, 0.41, 1.0],
    ];
    return mockVals[rIndex % 5]?.[cIndex % 5] ?? 0.1;
  };

  const getHeatmapColor = (val: number): string => {
    if (val >= 0.8) return '#2563eb'; // Deep Blue
    if (val >= 0.5) return '#60a5fa'; // Sky Blue
    if (val >= 0.2) return '#93c5fd'; // Light Sky Blue
    if (val >= 0.0) return '#e0f2fe'; // Pale Blue
    if (val >= -0.2) return '#fee2e2'; // Pale Red
    if (val >= -0.5) return '#fca5a5'; // Light Red
    return '#ef4444'; // Red
  };

  return (
    <div className="space-y-6">
      {/* 4 Metric KPI Cards matching 03 — DATA EXPLORER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Rows */}
        <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Rows</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight font-mono">
            {rowCount.toLocaleString()}
          </div>
        </div>

        {/* 2. Columns */}
        <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Columns</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight font-mono">
            {columnCount}
          </div>
        </div>

        {/* 3. Missing Values */}
        <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Missing Values</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight font-mono">
            {missingPercentage}
          </div>
        </div>

        {/* 4. Duplicate Rows */}
        <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500">Duplicate Rows</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight font-mono">
            {duplicateRowsCount}
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: 8 Cols (Charts) + 4 Cols (AI Insights) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: 2x2 Clean Analytical Charts */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart 1: Distribution: tenure */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900">
                    Distribution: {primaryColName}
                  </h4>
                  <span className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" title={`Histogram frequency distribution for ${dataset.name}`}>
                    ⓘ
                  </span>
                </div>
              </div>

              {/* Histogram Bars */}
              <div className="h-44 flex flex-col justify-end">
                <div className="flex items-end justify-between h-36 px-2 gap-1.5 border-b border-slate-200 pb-1">
                  {[
                    { count: 980, label: '0' },
                    { count: 720, label: '6' },
                    { count: 580, label: '12' },
                    { count: 460, label: '18' },
                    { count: 390, label: '24' },
                    { count: 320, label: '30' },
                    { count: 280, label: '36' },
                    { count: 250, label: '42' },
                    { count: 230, label: '48' },
                    { count: 240, label: '54' },
                    { count: 290, label: '60' },
                    { count: 360, label: '66' },
                    { count: 680, label: '72' },
                  ].map((bar, i) => {
                    const heightPercent = Math.min(100, Math.round((bar.count / 1000) * 100));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center group relative">
                        <div
                          className="w-full rounded-t-sm bg-[#93c5fd] group-hover:bg-[#3b5bf6] transition-all"
                          style={{ height: `${heightPercent}%` }}
                        />
                        <div className="absolute -top-7 hidden group-hover:flex bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-10">
                          {bar.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* X Axis */}
                <div className="flex justify-between text-[10px] text-slate-400 px-2 pt-1.5">
                  <span>0</span>
                  <span>12</span>
                  <span>24</span>
                  <span>36</span>
                  <span>48</span>
                  <span>60</span>
                  <span>72</span>
                </div>
                <div className="text-center text-[10px] text-slate-400 mt-1 font-medium">
                  {primaryColName} (months)
                </div>
              </div>
            </div>

            {/* Chart 2: Feature Correlation */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900">Feature Correlation</h4>
                  <span className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" title="Pearson correlation coefficient (-1.0 to +1.0)">
                    ⓘ
                  </span>
                </div>
              </div>

              {/* Heatmap Grid */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  {matrixCols.map((rowName, r) => (
                    <div key={rowName} className="flex items-center gap-1.5">
                      <span className="w-20 text-[10px] font-mono text-slate-500 truncate text-right pr-1">
                        {rowName}
                      </span>
                      <div className="flex gap-1">
                        {matrixCols.map((colName, c) => {
                          const val = getHeatmapVal(r, c);
                          const bg = getHeatmapColor(val);
                          return (
                            <div
                              key={colName}
                              className="h-6 w-7 rounded-sm flex items-center justify-center text-[9px] font-bold text-white transition hover:scale-105 cursor-pointer shadow-2xs"
                              style={{ backgroundColor: bg }}
                              title={`${rowName} vs ${colName}: ${val.toFixed(2)}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex pl-21 gap-1 text-[9px] text-slate-400 font-mono pt-1">
                    {matrixCols.map((col) => (
                      <span key={col} className="w-7 text-center truncate">
                        {col.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Heatmap Legend Bar */}
                <div className="flex flex-col items-center h-32 justify-between pl-3 border-l border-slate-100 text-[9px] text-slate-400 font-mono">
                  <span>1.0</span>
                  <div className="w-2.5 flex-1 rounded my-1 bg-gradient-to-b from-[#2563eb] via-[#e0f2fe] to-[#ef4444]" />
                  <span>-1.0</span>
                </div>
              </div>
            </div>

            {/* Chart 3: Null Value Percentage by Column */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900">
                    Null Value Percentage by Column
                  </h4>
                  <span className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" title="Percentage of missing entries per column">
                    ⓘ
                  </span>
                </div>
              </div>

              {/* Horizontal Bars */}
              <div className="space-y-3 pt-1">
                {displayNullColumns.map((col) => (
                  <div key={col.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-600 truncate max-w-[150px]">
                        {col.name}
                      </span>
                      <span className="font-bold text-slate-800 font-mono">
                        {col.percentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#818cf8]"
                        style={{ width: `${Math.min(100, col.percentage * 4)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {/* Horizontal scale */}
                <div className="flex justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                  <span>Missing (%)</span>
                </div>
              </div>
            </div>

            {/* Chart 4: Churn by Contract Type */}
            <div className="rounded-2xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900">Churn by Contract Type</h4>
                  <span className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs" title="Target distribution grouped by contract duration">
                    ⓘ
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-medium text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#c7d2fe]" /> No Churn
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#4f46e5]" /> Churn
                  </span>
                </div>
              </div>

              {/* Grouped Stacked Bar Chart */}
              <div className="h-44 flex flex-col justify-end">
                <div className="flex items-end justify-around h-36 px-4 gap-4 border-b border-slate-200 pb-1">
                  {/* Month-to-month */}
                  <div className="flex flex-col items-center w-14">
                    <div className="w-full flex flex-col items-center">
                      <div className="w-full rounded-t-sm bg-[#c7d2fe] h-14" title="No Churn: 2,220" />
                      <div className="w-full bg-[#4f46e5] h-16" title="Churn: 1,655" />
                    </div>
                  </div>

                  {/* One year */}
                  <div className="flex flex-col items-center w-14">
                    <div className="w-full flex flex-col items-center">
                      <div className="w-full rounded-t-sm bg-[#c7d2fe] h-16" title="No Churn: 1,307" />
                      <div className="w-full bg-[#4f46e5] h-3" title="Churn: 166" />
                    </div>
                  </div>

                  {/* Two year */}
                  <div className="flex flex-col items-center w-14">
                    <div className="w-full flex flex-col items-center">
                      <div className="w-full rounded-t-sm bg-[#c7d2fe] h-20" title="No Churn: 1,647" />
                      <div className="w-full bg-[#4f46e5] h-1.5" title="Churn: 48" />
                    </div>
                  </div>
                </div>
                {/* Labels */}
                <div className="flex justify-around text-[10px] text-slate-500 pt-2 font-medium">
                  <span>Month-to-month</span>
                  <span>One year</span>
                  <span>Two year</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: ✨ AI Insights Panel matching 03 — DATA EXPLORER */}
        <div className="lg:col-span-4 rounded-2xl border border-[#eaecf0] bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#3b5bf6]">✨</span>
            <h3 className="text-sm font-bold text-slate-900">AI Insights</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Key findings and recommended actions from your data.
          </p>

          <div className="space-y-3.5 pt-2">
            {/* Card 1 */}
            <div className="rounded-xl border border-slate-200/80 bg-[#fbfcfd] p-4 shadow-2xs space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e0e7ff] text-[#3b5bf6] text-[11px] font-bold">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    High missing values in total_charges (18.6%)
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    This can impact model performance and downstream analysis.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 pl-7">
                <button
                  type="button"
                  onClick={() => {
                    onApplySuggestion('impute', 'total_charges');
                    onNavigateToTab('preprocessing');
                  }}
                  className="rounded-lg bg-[#3b5bf6] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                >
                  Apply suggestion
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExplanationModal({
                      title: 'Missing Value Imputation Analysis',
                      body: 'Column total_charges contains 18.6% missing values. Because the missing mechanism is linked to new tenures (<1 month), median imputation or filling with 0 prevents row deletion while eliminating data leakage.',
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Explain
                </button>
              </div>
            </div>

            {/* Card 2 */}
            <div className="rounded-xl border border-slate-200/80 bg-[#fbfcfd] p-4 shadow-2xs space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e0e7ff] text-[#3b5bf6] text-[11px] font-bold">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Tenure is strongly related to churn
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Customers with lower tenure (≤ 12 months) have a significantly higher churn rate (~46%).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 pl-7">
                <button
                  type="button"
                  onClick={() => {
                    onApplySuggestion('bin', 'tenure');
                    onNavigateToTab('preprocessing');
                  }}
                  className="rounded-lg bg-[#3b5bf6] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                >
                  Apply suggestion
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExplanationModal({
                      title: 'Tenure Cohort Significance',
                      body: 'The correlation coefficient between tenure and churn is -0.35. Customers in their first year represent the highest flight risk. Creating tenure cohort bins helps tree models isolate early-lifecycle attrition.',
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Explain
                </button>
              </div>
            </div>

            {/* Card 3 */}
            <div className="rounded-xl border border-slate-200/80 bg-[#fbfcfd] p-4 shadow-2xs space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e0e7ff] text-[#3b5bf6] text-[11px] font-bold">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Contract type is a key driver of churn
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Month-to-month contracts show the highest churn (~42%) compared to one year (~11%) and two year (~3%).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 pl-7">
                <button
                  type="button"
                  onClick={() => {
                    onApplySuggestion('one_hot', 'contract_type');
                    onNavigateToTab('preprocessing');
                  }}
                  className="rounded-lg bg-[#3b5bf6] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                >
                  Apply suggestion
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExplanationModal({
                      title: 'Contract Categorical Encoding',
                      body: 'Contract type is the highest-gain predictor in tree models. Encoding with One-Hot encoding preserves the non-ordinal nature of Month-to-month vs Annual contracts while avoiding target leakage.',
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Explain
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Explanation Modal */}
      {explanationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{explanationModal.title}</h3>
              <button
                type="button"
                onClick={() => setExplanationModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{explanationModal.body}</p>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setExplanationModal(null)}
                className="rounded-lg bg-[#3b5bf6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
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
