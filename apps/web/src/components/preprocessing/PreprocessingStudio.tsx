import React, { useState, useMemo } from 'react';
import type { Database } from '@/types/database';
import type { ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';
import type {
  PreprocessingPlan,
  PreprocessingResult,
} from '@/engine/preprocessing/preprocessingEngine';
import { TransformationPlanCard } from '@/components/copilot/TransformationPlanCard';

type DatasetVersionRow = Database['public']['Tables']['dataset_versions']['Row'];

interface PreprocessingStudioProps {
  datasetName: string;
  versions: DatasetVersionRow[];
  activeVersion: DatasetVersionRow | null;
  columns: ColumnProfileSummary[];
  rows: Record<string, unknown>[];
  totalRows: number;
  onSelectVersion: (version: DatasetVersionRow) => void;
  onApplyPlan: (plan: PreprocessingPlan) => Promise<PreprocessingResult>;
  onSendCopilotMessage?: (msg: string) => void;
  copilotLoading?: boolean;
  copilotMessages?: Array<{ role: 'user' | 'assistant'; content: string; plan?: PreprocessingPlan }>;
}

export const PreprocessingStudio: React.FC<PreprocessingStudioProps> = ({
  datasetName,
  versions,
  activeVersion,
  columns,
  rows,
  totalRows,
  onSelectVersion,
  onApplyPlan,
  onSendCopilotMessage,
  copilotLoading = false,
  copilotMessages = [],
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [chatInput, setChatInput] = useState('');

  // Dynamic schema-aware recommendations built from actual columns (zero hardcoded Titanic references)
  const quickActions = useMemo(() => {
    const nullCols = columns.filter((c) => c.missingCount > 0).map((c) => c.columnName);
    const outlierCols = columns
      .filter((c) => c.isNumeric && 'outlierCount' in c.stats && c.stats.outlierCount > 0)
      .map((c) => c.columnName);
    const catCols = columns
      .filter((c) => !c.isNumeric && !c.isPrimaryKeyCandidate && c.distinctCount >= 2 && c.distinctCount <= 10)
      .map((c) => c.columnName);
    const numCols = columns
      .filter((c) => c.isNumeric && !c.isPrimaryKeyCandidate)
      .map((c) => c.columnName);
    const idCols = columns
      .filter((c) => c.isPrimaryKeyCandidate && c.columnName.toLowerCase().includes('id'))
      .map((c) => c.columnName);

    return [
      {
        category: 'Imputation',
        title: 'Impute Missing Values',
        subtitle:
          nullCols.length > 0
            ? `Fill nulls in ${nullCols.slice(0, 2).join(', ')}`
            : 'Median for numeric, mode for categoricals',
        prompt:
          nullCols.length > 0
            ? `Impute missing values in ${nullCols.join(', ')}`
            : 'Impute missing values in numeric and categorical columns',
      },
      {
        category: 'Deduplication',
        title: 'Remove Duplicate Rows',
        subtitle: 'Drop exact repeated observations cleanly',
        prompt: 'Remove exact duplicate rows from the dataset',
      },
      {
        category: 'Outliers',
        title: 'Clip 1.5× IQR Outliers',
        subtitle:
          outlierCols.length > 0
            ? `Bound extreme tails in ${outlierCols.slice(0, 2).join(', ')}`
            : numCols.length > 0
              ? `Stabilize tails in ${numCols.slice(0, 2).join(', ')}`
              : 'Winsorize extreme numeric tails',
        prompt:
          outlierCols.length > 0
            ? `Clip extreme outliers in ${outlierCols.join(', ')} using 1.5 IQR`
            : 'Clip extreme outliers using 1.5 IQR boundary',
      },
      {
        category: catCols.length > 0 ? 'Encoding' : 'Cleanup',
        title: catCols.length > 0 ? 'One-Hot Encode Categories' : 'Drop Identifier Columns',
        subtitle:
          catCols.length > 0
            ? `Encode ${catCols.slice(0, 2).join(', ')}`
            : idCols.length > 0
              ? `Drop ${idCols.join(', ')}`
              : 'Convert nominal labels to binary vectors',
        prompt:
          catCols.length > 0
            ? `One-hot encode categorical columns ${catCols.slice(0, 2).join(', ')}`
            : idCols.length > 0
              ? `Drop identifier column ${idCols[0]}`
              : 'Scale numeric features with standard scaling',
      },
    ];
  }, [columns]);

  const filteredRows = rows.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(r).some((val) => String(val ?? '').toLowerCase().includes(term));
  });

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || copilotLoading) return;
    onSendCopilotMessage?.(chatInput.trim());
    setChatInput('');
  };

  const colNames = columns.map((c) => c.columnName);

  return (
    <div className="space-y-6">
      {/* Version Lineage Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#eaecf0] bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 font-mono text-sm font-bold text-[#3b5bf6]">
            v{activeVersion?.version_number ?? 1}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{datasetName}</h3>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
              {totalRows.toLocaleString()} rows · {columns.length} columns · Immutable version lineage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Version:</span>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/70 bg-slate-100 p-1">
            {versions.map((ver) => {
              const isActive = ver.id === activeVersion?.id;
              return (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => onSelectVersion(ver)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 font-mono text-xs font-bold transition ${
                    isActive
                      ? 'bg-[#3b5bf6] text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  v{ver.version_number}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Schema-Aware Recommended Actions */}
      <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-900">Recommended Transformations</h4>
            <p className="text-[11px] text-slate-500">
              Click any card to generate an inspectable plan tailored to this dataset&apos;s schema
            </p>
          </div>
          <span className="font-mono text-[11px] text-slate-400">Approval-gated</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => onSendCopilotMessage?.(item.prompt)}
              className="flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-left transition hover:border-[#3b5bf6] hover:bg-white"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#3b5bf6]">
                {item.category}
              </span>
              <span className="mt-1 text-xs font-bold text-slate-900">{item.title}</span>
              <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{item.subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Studio Grid: Live Table + Transformation Planner */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Live Data Table */}
        <div className="flex flex-col rounded-2xl border border-[#eaecf0] bg-white p-5 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Live Data Table</h4>
              <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                Showing {paginatedRows.length} of {filteredRows.length.toLocaleString()} rows
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="text"
                placeholder="Search rows..."
                aria-label="Search table rows"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-44 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
              />

              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
              </select>
            </div>
          </div>

          <div className="mt-4 max-h-[520px] flex-1 overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="w-12 px-3 py-2.5 font-mono text-[10px] font-bold uppercase text-slate-400">
                    #
                  </th>
                  {colNames.map((c) => {
                    const colMeta = columns.find((col) => col.columnName === c);
                    return (
                      <th key={c} className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px]">{c}</span>
                          {colMeta && (
                            <span className="font-mono text-[9px] font-normal text-slate-400">
                              {colMeta.inferredType}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(colNames.length + 1, 1)} className="py-12 text-center text-slate-400">
                      No rows matching &ldquo;{searchTerm}&rdquo;
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, rIdx) => {
                    const absoluteIdx = (safePage - 1) * pageSize + rIdx + 1;
                    return (
                      <tr key={absoluteIdx} className="transition hover:bg-blue-50/30">
                        <td className="px-3 py-2 font-mono text-[10px] text-slate-400 tabular-nums">
                          {absoluteIdx}
                        </td>
                        {colNames.map((c) => {
                          const val = row[c];
                          const isNull = val === null || val === undefined || val === '';
                          return (
                            <td
                              key={c}
                              className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-800 tabular-nums"
                            >
                              {isNull ? (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  null
                                </span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="font-mono tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="cursor-pointer rounded-md border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="cursor-pointer rounded-md border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* Transformation Planner Panel */}
        <div className="flex flex-col rounded-2xl border border-[#eaecf0] bg-white p-5 xl:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Transformation Planner</h4>
              <p className="text-[11px] text-slate-500">
                Describe cleaning steps to inspect &amp; approve before execution
              </p>
            </div>
            <span className="font-mono text-[10px] font-semibold text-slate-500">
              Deterministic Engine
            </span>
          </div>

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto p-1 max-h-[440px]">
            {copilotMessages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <p className="text-xs font-semibold text-slate-700">
                  Ready to plan transformations
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
                  Select a recommended card above or type an instruction such as &ldquo;Impute missing values and remove duplicates&rdquo;.
                </p>
              </div>
            ) : (
              copilotMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#3b5bf6] text-white'
                        : 'border border-slate-200/80 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {msg.plan && (
                    <div className="mt-2 w-full">
                      <TransformationPlanCard plan={msg.plan} onApply={onApplyPlan} />
                    </div>
                  )}
                </div>
              ))
            )}

            {copilotLoading && (
              <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-[#3b5bf6]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#3b5bf6] border-t-transparent" />
                <span>Drafting transformation plan...</span>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSendMessage}
            className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3"
          >
            <input
              type="text"
              placeholder="e.g. Impute nulls, clip outliers, remove duplicates..."
              aria-label="Transformation instruction"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={copilotLoading}
              className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || copilotLoading}
              className="cursor-pointer rounded-xl bg-[#3b5bf6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Plan
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
