import React, { useState } from 'react';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { Database } from '@/types/database';
import { computeQualityScore } from '@/engine/localAnalytics';

type DatasetVersionRow = Database['public']['Tables']['dataset_versions']['Row'];

interface AnalyzeTabProps {
  datasetName: string;
  sourceFormat: string;
  activeVersion: DatasetVersionRow | null;
  profile: DatasetProfileSummary | null;
  onRefreshProfiling?: () => void;
  profilingInProgress?: boolean;
}

export const AnalyzeTab: React.FC<AnalyzeTabProps> = ({
  datasetName,
  sourceFormat,
  activeVersion,
  profile,
  onRefreshProfiling,
  profilingInProgress = false,
}) => {
  const [selectedColName, setSelectedColName] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'numeric' | 'categorical'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!profile) {
    return (
      <div className="rounded-2xl border border-[#eaecf0] bg-white p-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-900">Profiling Required</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Run in-browser profiling to compute column statistics, null percentages, IQR outliers, and overall quality score.
        </p>
        {onRefreshProfiling && (
          <button
            type="button"
            disabled={profilingInProgress}
            onClick={onRefreshProfiling}
            className="mt-4 cursor-pointer rounded-xl bg-[#3b5bf6] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {profilingInProgress ? 'Profiling dataset...' : 'Run Deep Profiling'}
          </button>
        )}
      </div>
    );
  }

  const filteredColumns = profile.columns.filter((c) => {
    if (filterType === 'numeric' && !c.isNumeric) return false;
    if (filterType === 'categorical' && c.isNumeric) return false;
    if (searchQuery.trim() && !c.columnName.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
      return false;
    }
    return true;
  });

  const activeCol =
    profile.columns.find((c) => c.columnName === selectedColName) ??
    filteredColumns[0] ??
    profile.columns[0];

  const qualityScore = computeQualityScore(profile);
  const qualityStatus =
    qualityScore >= 90
      ? { label: 'Production Ready', tone: 'text-emerald-700' }
      : qualityScore >= 70
        ? { label: 'Needs Preparation', tone: 'text-amber-700' }
        : { label: 'Requires Cleanup', tone: 'text-rose-700' };

  return (
    <div className="space-y-6">
      {/* Executive Quality Summary */}
      <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Data Quality &amp; Health Audit</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              In-browser evaluation of completeness, uniqueness, and statistical anomalies
            </p>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Quality Score
              </div>
              <div className={`text-sm font-bold ${qualityStatus.tone}`}>{qualityStatus.label}</div>
            </div>
            <div className="flex h-12 w-14 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 font-mono text-base font-bold text-[#3b5bf6] tabular-nums">
              {qualityScore}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total Records
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {profile.rowCount.toLocaleString()}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500">
              {datasetName} · {sourceFormat.toUpperCase()}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total Features
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-[#3b5bf6] tabular-nums">
              {profile.columnCount}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
              {profile.columns.filter((c) => c.isNumeric).length} numeric ·{' '}
              {profile.columns.filter((c) => !c.isNumeric).length} categorical
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Missing Values Rate
            </div>
            <div
              className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                profile.overallMissingRate > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {profile.overallMissingRate.toFixed(1)}%
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {profile.overallMissingRate === 0 ? 'Complete table' : 'Imputation available'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Duplicate Rows
            </div>
            <div
              className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                profile.duplicateRowsCount > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {profile.duplicateRowsCount.toLocaleString()}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {profile.duplicateRowsCount === 0 ? 'All rows unique' : 'Deduplication advised'}
            </div>
          </div>
        </div>
      </div>

      {/* Column Inspector */}
      <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Column Inspector</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any feature to inspect quartiles, outlier fences, or category frequencies
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Filter columns..."
              aria-label="Filter columns"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
            />

            <div className="flex rounded-lg border border-slate-200/70 bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`cursor-pointer rounded-md px-2.5 py-1 transition ${
                  filterType === 'all' ? 'bg-white text-[#3b5bf6] shadow-xs' : 'text-slate-600'
                }`}
              >
                All ({profile.columns.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('numeric')}
                className={`cursor-pointer rounded-md px-2.5 py-1 transition ${
                  filterType === 'numeric' ? 'bg-white text-[#3b5bf6] shadow-xs' : 'text-slate-600'
                }`}
              >
                Numeric ({profile.columns.filter((c) => c.isNumeric).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('categorical')}
                className={`cursor-pointer rounded-md px-2.5 py-1 transition ${
                  filterType === 'categorical'
                    ? 'bg-white text-[#3b5bf6] shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Categorical ({profile.columns.filter((c) => !c.isNumeric).length})
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Columns Table */}
          <div className="max-h-[480px] overflow-x-auto rounded-xl border border-slate-200/70 lg:col-span-7">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Column Name</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Missing</th>
                  <th className="px-3 py-2.5">Unique</th>
                  <th className="px-3 py-2.5 text-right">Outliers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredColumns.map((col) => {
                  const isSelected = activeCol?.columnName === col.columnName;
                  const outlierCount =
                    col.isNumeric && 'outlierCount' in col.stats ? col.stats.outlierCount : 0;
                  return (
                    <tr
                      key={col.columnName}
                      onClick={() => setSelectedColName(col.columnName)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                        {col.columnName}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                        {col.inferredType}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full ${
                                col.missingPercent > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(col.missingPercent, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                            {col.missingPercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 tabular-nums">
                        {col.distinctCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] tabular-nums">
                        {outlierCount > 0 ? (
                          <span className="font-bold text-rose-600">{outlierCount}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Active Column Detail Inspector Panel */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-5">
            {activeCol ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b5bf6]">
                      Feature Details
                    </span>
                    <h4 className="font-mono text-base font-bold text-slate-900">
                      {activeCol.columnName}
                    </h4>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-600">
                    {activeCol.inferredType}
                  </span>
                </div>

                {activeCol.isNumeric && 'min' in activeCol.stats ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { label: 'Min', value: activeCol.stats.min?.toFixed(2) ?? 'N/A', accent: false },
                        { label: 'Max', value: activeCol.stats.max?.toFixed(2) ?? 'N/A', accent: false },
                        { label: 'Mean', value: activeCol.stats.mean?.toFixed(2) ?? 'N/A', accent: false },
                        { label: 'Median', value: activeCol.stats.median?.toFixed(2) ?? 'N/A', accent: true },
                        { label: 'Std Dev', value: activeCol.stats.stddev?.toFixed(2) ?? 'N/A', accent: false },
                        { label: 'IQR Spread', value: activeCol.stats.iqr?.toFixed(2) ?? 'N/A', accent: false },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                          <span className="text-[10px] font-semibold uppercase text-slate-500">
                            {stat.label}
                          </span>
                          <div
                            className={`font-mono text-sm font-bold tabular-nums ${
                              stat.accent ? 'text-[#3b5bf6]' : 'text-slate-900'
                            }`}
                          >
                            {stat.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-slate-200/80 bg-white p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between font-semibold text-slate-700">
                        <span>Outlier Analysis</span>
                        <span
                          className={`font-mono tabular-nums ${
                            activeCol.stats.outlierCount > 0
                              ? 'font-bold text-rose-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {activeCol.stats.outlierCount} outliers
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Observations outside [Q1 − 1.5×IQR, Q3 + 1.5×IQR] can be clipped safely in Preprocessing.
                      </p>
                    </div>
                  </div>
                ) : 'topFrequencies' in activeCol.stats ? (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700">Top Categories</span>
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {activeCol.stats.topFrequencies.map((f) => (
                        <div
                          key={f.value}
                          className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs"
                        >
                          <span className="max-w-[160px] truncate font-medium text-slate-800">
                            {f.value || '(empty)'}
                          </span>
                          <span className="font-mono font-semibold text-slate-500 tabular-nums">
                            {f.count.toLocaleString()} ({f.percent.toFixed(1)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Select a column to inspect.
              </div>
            )}

            <div className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
              Format:{' '}
              <span className="font-mono font-medium text-slate-700">
                {activeVersion?.storage_path.endsWith('.parquet') ? 'Apache Parquet' : sourceFormat.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
