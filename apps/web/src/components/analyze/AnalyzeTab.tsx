import React, { useState } from 'react';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { Database } from '@/types/database';

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
      <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 text-xl font-bold">
          ⚡
        </div>
        <h3 className="text-base font-bold text-slate-800">DuckDB Profiling Required</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
          Run in-browser WebAssembly profiling to compute exact column statistics, null rates, IQR outliers, and quality score.
        </p>
        {onRefreshProfiling && (
          <button
            type="button"
            disabled={profilingInProgress}
            onClick={onRefreshProfiling}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
          >
            {profilingInProgress ? 'Analyzing in WebAssembly...' : '⚡ Run Deep Profiling'}
          </button>
        )}
      </div>
    );
  }

  // Filter columns
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

  // Quality score formula
  const missingPenalty = Math.min(profile.overallMissingRate * 2, 50);
  const duplicatePenalty = Math.min((profile.duplicateRowsCount / (profile.rowCount || 1)) * 100 * 2, 30);
  const qualityScore = Math.max(0, Math.min(100, Math.round(100 - missingPenalty - duplicatePenalty)));

  return (
    <div className="space-y-6">
      {/* 1. Quality & Health Executive Overview */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">
                ✓
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Data Quality & Health Audit
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Automated in-browser evaluation of integrity, completeness, and machine-learning readiness
            </p>
          </div>

          {/* Quality Score Badge */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400">Quality Score</div>
              <div className="text-sm font-bold text-slate-800">
                {qualityScore >= 90 ? '🟢 Production Ready' : qualityScore >= 70 ? '🟡 Needs Preparation' : '🔴 Poor Quality'}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 font-bold text-base border border-blue-100">
              {qualityScore}%
            </div>
          </div>
        </div>

        {/* 4 Crisp KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/60">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Records</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{profile.rowCount.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{datasetName} ({sourceFormat.toUpperCase()})</div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/60">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Features</div>
            <div className="mt-1 text-xl font-bold text-blue-600">{profile.columnCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {profile.columns.filter((c) => c.isNumeric).length} numeric · {profile.columns.filter((c) => !c.isNumeric).length} categorical
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/60">
            <div className="text-[10px] uppercase font-bold text-slate-400">Missing Values Rate</div>
            <div className={`mt-1 text-xl font-bold ${profile.overallMissingRate > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {profile.overallMissingRate.toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {profile.overallMissingRate === 0 ? 'Zero missing values' : 'Requires imputation'}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/60">
            <div className="text-[10px] uppercase font-bold text-slate-400">Duplicate Rows</div>
            <div className={`mt-1 text-xl font-bold ${profile.duplicateRowsCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {profile.duplicateRowsCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {profile.duplicateRowsCount === 0 ? 'Unique observations' : 'Duplicates detected'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Column Inspector (Primary Feature) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Column Inspector</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any column to view distributions, quantiles, and outlier boundaries
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Filter columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />

            {/* Filter Pills */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold border border-slate-200/60">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`rounded-md px-2.5 py-1 transition cursor-pointer ${
                  filterType === 'all' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500'
                }`}
              >
                All ({profile.columns.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('numeric')}
                className={`rounded-md px-2.5 py-1 transition cursor-pointer ${
                  filterType === 'numeric' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500'
                }`}
              >
                Numeric ({profile.columns.filter((c) => c.isNumeric).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('categorical')}
                className={`rounded-md px-2.5 py-1 transition cursor-pointer ${
                  filterType === 'categorical' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500'
                }`}
              >
                Categorical ({profile.columns.filter((c) => !c.isNumeric).length})
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Inspector: List (Left) + Detail Card (Right) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Columns Table (7 cols) */}
          <div className="lg:col-span-7 overflow-x-auto rounded-xl border border-slate-200/60 max-h-[480px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Column Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Missing</th>
                  <th className="py-2.5 px-3">Unique</th>
                  <th className="py-2.5 px-3 text-right">Outliers</th>
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
                        isSelected ? 'bg-blue-50/80 font-bold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${col.isNumeric ? 'bg-blue-500' : 'bg-indigo-500'}`} />
                          <span>{col.columnName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 font-bold">
                          {col.inferredType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${col.missingPercent > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(col.missingPercent, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-slate-500">
                            {col.missingPercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">
                        {col.distinctCount}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {outlierCount > 0 ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-600 border border-rose-100 text-[10px]">
                            {outlierCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Active Column Detail Inspector Panel (5 cols) */}
          <div className="lg:col-span-5 rounded-xl border border-blue-100 bg-slate-50/70 p-4 flex flex-col justify-between">
            {activeCol ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                      Feature Details
                    </span>
                    <h4 className="text-base font-bold text-slate-900">{activeCol.columnName}</h4>
                  </div>
                  <span className="rounded-lg bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-800">
                    {activeCol.inferredType}
                  </span>
                </div>

                {/* Numeric Statistics Breakdown */}
                {activeCol.isNumeric && 'min' in activeCol.stats ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-white p-2 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Min</span>
                        <div className="font-bold text-slate-800">{activeCol.stats.min?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Max</span>
                        <div className="font-bold text-slate-800">{activeCol.stats.max?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Mean</span>
                        <div className="font-bold text-slate-800">{activeCol.stats.mean?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Median</span>
                        <div className="font-bold text-blue-600">{activeCol.stats.median?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Std Dev</span>
                        <div className="font-bold text-slate-800">{activeCol.stats.stddev?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="rounded-lg bg-white p-2 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">IQR Spread</span>
                        <div className="font-bold text-slate-800">{activeCol.stats.iqr?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white p-3 border border-slate-200/60 text-xs">
                      <div className="flex items-center justify-between mb-1.5 font-semibold text-slate-700">
                        <span>Outlier Analysis:</span>
                        <span className={activeCol.stats.outlierCount > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                          {activeCol.stats.outlierCount} outliers
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Values outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]. Recommended for clipping or winsorization.
                      </p>
                    </div>
                  </div>
                ) : 'topFrequencies' in activeCol.stats ? (
                  /* Categorical Frequencies Breakdown */
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700">Top Categories</span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {activeCol.stats.topFrequencies.map((f) => (
                        <div key={f.value} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200/60">
                          <span className="font-medium text-slate-800 truncate max-w-[140px]">{f.value || '(empty)'}</span>
                          <span className="font-mono text-slate-500 font-semibold">{f.count} ({f.percent.toFixed(1)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">Select a column to inspect.</div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400">
              Storage: {activeVersion?.storage_path.endsWith('.parquet') ? 'Parquet Vector' : 'Raw File'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
