import { useState } from 'react';
import type { DatasetProfileSummary, ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';

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
  const [selectedColumn, setSelectedColumn] = useState<ColumnProfileSummary | null>(
    profile.columns[0] ?? null,
  );
  const [filterType, setFilterType] = useState<'all' | 'numeric' | 'categorical'>('all');

  const filteredColumns = profile.columns.filter((c) => {
    if (filterType === 'numeric') return c.isNumeric;
    if (filterType === 'categorical') return !c.isNumeric;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Total Rows</p>
          <p className="mt-1 text-2xl font-bold text-white">{profile.rowCount.toLocaleString()}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Columns</p>
          <p className="mt-1 text-2xl font-bold text-sky-400">{profile.columnCount}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Duplicate Rows
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              profile.duplicateRowsCount > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {profile.duplicateRowsCount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Constant Columns
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              profile.constantColumnsCount > 0 ? 'text-amber-400' : 'text-slate-300'
            }`}
          >
            {profile.constantColumnsCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Overall Missing
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              profile.overallMissingRate > 0 ? 'text-amber-400' : 'text-emerald-400'
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
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Quality Observations
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
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
        <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Column Profiles</h3>
              <div className="flex rounded-md bg-slate-900 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`rounded px-2 py-1 ${
                    filterType === 'all' ? 'bg-sky-500 text-white' : 'text-slate-400'
                  }`}
                >
                  All ({profile.columns.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('numeric')}
                  className={`rounded px-2 py-1 ${
                    filterType === 'numeric' ? 'bg-sky-500 text-white' : 'text-slate-400'
                  }`}
                >
                  Numeric
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('categorical')}
                  className={`rounded px-2 py-1 ${
                    filterType === 'categorical' ? 'bg-sky-500 text-white' : 'text-slate-400'
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
                className="text-xs text-slate-400 hover:text-sky-400 disabled:opacity-50"
              >
                {refreshing ? 'Profiling...' : '↻ Re-Profile'}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-300">Column</th>
                  <th className="px-3 py-2 font-semibold text-slate-300">Type</th>
                  <th className="px-3 py-2 font-semibold text-slate-300">Missing</th>
                  <th className="px-3 py-2 font-semibold text-slate-300">Distinct</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredColumns.map((col) => {
                  const isSelected = selectedColumn?.columnName === col.columnName;
                  return (
                    <tr
                      key={col.columnName}
                      onClick={() => setSelectedColumn(col)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-white">
                        {col.columnName}
                        {col.isPrimaryKeyCandidate && (
                          <span className="ml-2 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-300">
                            PK
                          </span>
                        )}
                        {col.isConstant && (
                          <span className="ml-2 rounded bg-rose-500/20 px-1 py-0.5 text-[9px] text-rose-300">
                            Constant
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                          {col.inferredType}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            col.missingCount > 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'
                          }
                        >
                          {col.missingPercent}% ({col.missingCount})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {col.distinctCount.toLocaleString()} ({col.uniquenessPercent}%)
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedColumn(col);
                          }}
                          className={`rounded px-2 py-0.5 text-[10px] ${
                            isSelected
                              ? 'bg-sky-500 text-white'
                              : 'text-slate-400 hover:text-white'
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
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Column Inspector
          </h3>

          {selectedColumn ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-base font-bold text-white">{selectedColumn.columnName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-xs text-sky-400">
                    {selectedColumn.inferredType}
                  </span>
                  <span className="text-xs text-slate-400">
                    {selectedColumn.isNumeric ? 'Numeric Variable' : 'Categorical Variable'}
                  </span>
                </div>
              </div>

              {/* Statistics Breakdown */}
              {selectedColumn.isNumeric && 'min' in selectedColumn.stats && (
                <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Numeric Metrics
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <StatItem label="Min" value={selectedColumn.stats.min} />
                    <StatItem label="Max" value={selectedColumn.stats.max} />
                    <StatItem
                      label="Mean"
                      value={selectedColumn.stats.mean ? selectedColumn.stats.mean.toFixed(2) : null}
                    />
                    <StatItem
                      label="Std Dev"
                      value={selectedColumn.stats.stddev ? selectedColumn.stats.stddev.toFixed(2) : null}
                    />
                    <StatItem label="Median (Q2)" value={selectedColumn.stats.median} />
                    <StatItem label="Q1 (25%)" value={selectedColumn.stats.q25} />
                    <StatItem label="Q3 (75%)" value={selectedColumn.stats.q75} />
                    <StatItem
                      label="IQR"
                      value={selectedColumn.stats.iqr ? selectedColumn.stats.iqr.toFixed(2) : null}
                    />
                  </div>

                  {selectedColumn.stats.outlierCount > 0 && (
                    <div className="mt-3 rounded-lg border border-rose-800/50 bg-rose-950/20 p-2.5 text-xs text-rose-300">
                      ⚠ <span className="font-semibold">{selectedColumn.stats.outlierCount}</span>{' '}
                      potential outliers detected using IQR bounds (&lt; Q1 - 1.5×IQR or &gt; Q3 +
                      1.5×IQR).
                    </div>
                  )}
                </div>
              )}

              {/* Top Frequencies Breakdown */}
              {!selectedColumn.isNumeric && 'topFrequencies' in selectedColumn.stats && (
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Top Frequencies
                  </p>
                  <div className="space-y-1.5">
                    {selectedColumn.stats.topFrequencies.map((f) => (
                      <div key={f.value} className="text-xs">
                        <div className="flex justify-between text-slate-300">
                          <span className="font-medium truncate max-w-[150px]">{f.value}</span>
                          <span className="text-slate-400 font-mono">
                            {f.count.toLocaleString()} ({f.percent.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-sky-500"
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
            <p className="mt-4 text-xs text-slate-500">Select a column from the list to inspect.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded border border-slate-800/80 bg-slate-900/60 p-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="font-mono font-semibold text-slate-100">{value ?? '—'}</p>
    </div>
  );
}
