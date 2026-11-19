import { useState } from 'react';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';

interface DatasetProfileViewProps {
  profile: DatasetProfileSummary;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function DatasetProfileView({
  profile,
  onRefresh,
  refreshing,
}: DatasetProfileViewProps) {
  const [selectedColumnName, setSelectedColumnName] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'numeric' | 'categorical'>('all');

  const filteredColumns = profile.columns.filter((c) => {
    if (filterType === 'numeric') return c.isNumeric;
    if (filterType === 'categorical') return !c.isNumeric;
    return true;
  });

  const activeColumn =
    profile.columns.find((c) => c.columnName === selectedColumnName) ??
    filteredColumns[0] ??
    profile.columns[0] ??
    null;

  return (
    <div className="space-y-6">
      {/* Overview Metric Cards in Light Mode */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Rows</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{profile.rowCount.toLocaleString()}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Columns</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{profile.columnCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Duplicate Rows
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              profile.duplicateRowsCount > 0 ? 'text-amber-500' : 'text-emerald-600'
            }`}
          >
            {profile.duplicateRowsCount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Constant Columns
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              profile.constantColumnsCount > 0 ? 'text-amber-500' : 'text-slate-700'
            }`}
          >
            {profile.constantColumnsCount}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Overall Missing
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              profile.overallMissingRate > 0 ? 'text-amber-500' : 'text-emerald-600'
            }`}
          >
            {profile.overallMissingRate}%
          </p>
        </div>
      </div>

      {/* Quality Findings Banner */}
      {(profile.duplicateRowsCount > 0 ||
        profile.overallMissingRate > 0 ||
        profile.constantColumnsCount > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Quality Observations
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {profile.duplicateRowsCount > 0 && (
              <li>
                • Found <span className="font-semibold">{profile.duplicateRowsCount}</span> exact
                duplicate rows in the dataset.
              </li>
            )}
            {profile.overallMissingRate > 0 && (
              <li>
                • Missing values detected ({profile.overallMissingRate}% of all data cells).
              </li>
            )}
            {profile.constantColumnsCount > 0 && (
              <li>
                • Detected {profile.constantColumnsCount} constant column(s) with no variation.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Main Profiling Section: Columns Table + Column Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Columns Table */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-slate-900">Columns Breakdown</h3>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`rounded-md px-2.5 py-1 transition ${
                    filterType === 'all' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  All ({profile.columns.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('numeric')}
                  className={`rounded-md px-2.5 py-1 transition ${
                    filterType === 'numeric' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Numeric
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('categorical')}
                  className={`rounded-md px-2.5 py-1 transition ${
                    filterType === 'categorical' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Categorical
                </button>
              </div>
            </div>

            {onRefresh && (
              <button
                type="button"
                disabled={refreshing}
                onClick={onRefresh}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {refreshing ? 'Profiling...' : '↻ Re-Profile'}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                <tr>
                  <th className="pb-2.5 font-semibold">Column</th>
                  <th className="pb-2.5 font-semibold">Type</th>
                  <th className="pb-2.5 font-semibold">Missing</th>
                  <th className="pb-2.5 font-semibold">Distinct</th>
                  <th className="pb-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredColumns.map((col) => {
                  const isSelected = activeColumn?.columnName === col.columnName;
                  return (
                    <tr
                      key={col.columnName}
                      onClick={() => setSelectedColumnName(col.columnName)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 font-medium text-slate-900">
                        {col.columnName}
                        {col.isPrimaryKeyCandidate && (
                          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                            PK
                          </span>
                        )}
                        {col.isConstant && (
                          <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                            Constant
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                          {col.inferredType}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={
                            col.missingCount > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'
                          }
                        >
                          {col.missingPercent}% ({col.missingCount})
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {col.distinctCount.toLocaleString()} ({col.uniquenessPercent}%)
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedColumnName(col.columnName);
                          }}
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Detailed Column Inspector */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Inspector Details
          </h3>

          {activeColumn ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-base font-bold text-slate-900">{activeColumn.columnName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 border border-blue-100">
                    {activeColumn.inferredType}
                  </span>
                  <span className="text-xs text-slate-400">
                    {activeColumn.isNumeric ? 'Numeric Variable' : 'Categorical Variable'}
                  </span>
                </div>
              </div>

              {/* Statistics Breakdown */}
              {activeColumn.isNumeric && 'min' in activeColumn.stats && (
                <div className="space-y-3 border-t border-slate-100 pt-3 text-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Summary Statistics
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <StatItem label="Min" value={activeColumn.stats.min} />
                    <StatItem label="Max" value={activeColumn.stats.max} />
                    <StatItem
                      label="Mean"
                      value={activeColumn.stats.mean ? activeColumn.stats.mean.toFixed(2) : null}
                    />
                    <StatItem
                      label="Std Dev"
                      value={activeColumn.stats.stddev ? activeColumn.stats.stddev.toFixed(2) : null}
                    />
                    <StatItem label="Median (Q2)" value={activeColumn.stats.median} />
                    <StatItem label="Q1 (25%)" value={activeColumn.stats.q25} />
                    <StatItem label="Q3 (75%)" value={activeColumn.stats.q75} />
                    <StatItem
                      label="IQR"
                      value={activeColumn.stats.iqr ? activeColumn.stats.iqr.toFixed(2) : null}
                    />
                  </div>

                  {activeColumn.stats.outlierCount > 0 && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                      ⚠ <span className="font-semibold">{activeColumn.stats.outlierCount}</span>{' '}
                      potential outliers detected using IQR bounds (&lt; Q1 - 1.5×IQR or &gt; Q3 +
                      1.5×IQR).
                    </div>
                  )}
                </div>
              )}

              {/* Top Frequencies Breakdown */}
              {!activeColumn.isNumeric && 'topFrequencies' in activeColumn.stats && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Top Frequencies
                  </p>
                  <div className="space-y-2">
                    {activeColumn.stats.topFrequencies.map((f) => (
                      <div key={f.value} className="text-xs">
                        <div className="flex justify-between text-slate-700">
                          <span className="font-medium truncate max-w-[150px]">{f.value}</span>
                          <span className="text-slate-400 font-mono">
                            {f.count.toLocaleString()} ({f.percent.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                          <div
                            className="h-1.5 rounded-full bg-blue-600"
                            style={{ width: `${Math.min(100, f.percent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-400">Select a column from the list to inspect.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className="font-mono font-bold text-slate-800 mt-0.5">{value ?? '—'}</p>
    </div>
  );
}
