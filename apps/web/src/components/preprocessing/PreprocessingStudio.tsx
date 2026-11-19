import React, { useState } from 'react';
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

  // Filter rows based on search term
  const filteredRows = rows.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(r).some((val) => String(val ?? '').toLowerCase().includes(term));
  });

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || copilotLoading) return;
    onSendCopilotMessage?.(chatInput.trim());
    setChatInput('');
  };

  const handleQuickPrompt = (prompt: string) => {
    onSendCopilotMessage?.(prompt);
  };

  const colNames = columns.map((c) => c.columnName);

  return (
    <div className="space-y-6">
      {/* 1. Version Lineage & Transformation Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold text-sm border border-blue-100">
            v{activeVersion?.version_number ?? 1}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{datasetName}</h3>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                Active Version
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {totalRows} rows · {columns.length} columns · Immutable WebAssembly memory table
            </p>
          </div>
        </div>

        {/* Version Switcher Pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Switch Version:</span>
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 border border-slate-200/60">
            {versions.map((ver) => {
              const isActive = ver.id === activeVersion?.id;
              return (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => onSelectVersion(ver)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/40'
                  }`}
                >
                  v{ver.version_number}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Actionable AI Recommendations Banner */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xs">
              ✨
            </span>
            <span className="text-xs font-bold text-slate-900">AI Recommendations for Preprocessing</span>
          </div>
          <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
            1-Click Guided Transformation
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => handleQuickPrompt('Impute missing values in numeric and categorical columns')}
            className="flex flex-col text-left p-3 rounded-xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 uppercase mb-1">
              <span>Imputation</span>
              <span>⚡</span>
            </div>
            <div className="text-xs font-bold text-slate-800">Handle Missing Values</div>
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">Median for numeric, mode for categories</p>
          </button>

          <button
            type="button"
            onClick={() => handleQuickPrompt('Drop columns with high missing rates such as Cabin')}
            className="flex flex-col text-left p-3 rounded-xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-rose-700 uppercase mb-1">
              <span>Columns</span>
              <span>✂</span>
            </div>
            <div className="text-xs font-bold text-slate-800">Drop High-Null Columns</div>
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">Remove features with &gt;50% missingness</p>
          </button>

          <button
            type="button"
            onClick={() => handleQuickPrompt('Scale skewed numeric features with log1p or standard scaling')}
            className="flex flex-col text-left p-3 rounded-xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-indigo-700 uppercase mb-1">
              <span>Scaling</span>
              <span>📏</span>
            </div>
            <div className="text-xs font-bold text-slate-800">Scale Skewed Features</div>
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">Normalize variance across numerical columns</p>
          </button>

          <button
            type="button"
            onClick={() => handleQuickPrompt('One-hot encode categorical features like Sex and Embarked')}
            className="flex flex-col text-left p-3 rounded-xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-purple-700 uppercase mb-1">
              <span>Encoding</span>
              <span>🏷️</span>
            </div>
            <div className="text-xs font-bold text-slate-800">Encode Categoricals</div>
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">Convert text categories into binary vectors</p>
          </button>
        </div>
      </div>

      {/* 2. Main Studio Grid: Data Table (Left) + Copilot Chat (Right) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column: Interactive Data Table (7 cols) */}
        <div className="xl:col-span-7 flex flex-col space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex-1 flex flex-col">
            {/* Table Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Live Data Table</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing {paginatedRows.length} of {filteredRows.length} rows (sampled)
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search table values..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />

                {/* Page Size */}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                </select>
              </div>
            </div>

            {/* Scrollable Table */}
            <div className="mt-4 flex-1 overflow-x-auto rounded-xl border border-slate-200/60 max-h-[520px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase w-12">
                      #
                    </th>
                    {colNames.map((c) => {
                      const colMeta = columns.find((col) => col.columnName === c);
                      return (
                        <th key={c} className="py-2.5 px-3 text-slate-700 font-semibold whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{c}</span>
                            {colMeta && (
                              <span className="rounded bg-slate-200/80 px-1 py-0.2 text-[9px] font-mono text-slate-600">
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
                      <td colSpan={colNames.length + 1} className="py-12 text-center text-slate-400">
                        No rows matching &quot;{searchTerm}&quot;
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, rIdx) => {
                      const absoluteIdx = (currentPage - 1) * pageSize + rIdx + 1;
                      return (
                        <tr key={rIdx} className="hover:bg-blue-50/40 transition">
                          <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                            {absoluteIdx}
                          </td>
                          {colNames.map((c) => {
                            const val = row[c];
                            const isNull = val === null || val === undefined;
                            return (
                              <td key={c} className="py-2 px-3 whitespace-nowrap text-slate-800 font-mono text-[11px]">
                                {isNull ? (
                                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 border border-amber-200/60">
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

            {/* Pagination Controls */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <div>
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Preprocessing Copilot & Transformation Studio (5 cols) */}
        <div className="xl:col-span-5 flex flex-col space-y-4">
          <div className="rounded-2xl border border-blue-200/80 bg-white p-5 shadow-xs flex-1 flex flex-col">
            {/* Copilot Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xs">
                  ✨
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Transformation Copilot</h4>
                  <p className="text-[11px] text-slate-400">
                    Instruct AI to clean, impute, encode, or scale your dataset
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                DuckDB-Wasm
              </span>
            </div>

            {/* Quick Action Suggestion Chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickPrompt('Impute missing values in numeric and categorical columns')}
                className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 transition cursor-pointer"
              >
                ⚡ Impute Nulls
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('Clip extreme outliers using 1.5 IQR boundary')}
                className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 transition cursor-pointer"
              >
                📦 Clip Outliers
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('Scale numeric features with standard scaling')}
                className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 transition cursor-pointer"
              >
                📏 Scale Features
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt('One-hot encode categorical features')}
                className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 transition cursor-pointer"
              >
                🏷️ One-Hot Encode
              </button>
            </div>

            {/* Chat Messages Log */}
            <div className="mt-3 flex-1 overflow-y-auto space-y-3 p-1 max-h-[420px]">
              {copilotMessages.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-lg">
                    💬
                  </div>
                  <p className="text-xs font-semibold text-slate-600">How would you like to prepare this data?</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                    Try asking: &quot;Impute missing values with median and mode&quot; or &quot;Drop columns with high null rates&quot;.
                  </p>
                </div>
              ) : (
                copilotMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {/* If this message contains an executable transformation plan, render the approval card right here! */}
                    {msg.plan && (
                      <div className="mt-2 w-full">
                        <TransformationPlanCard
                          plan={msg.plan}
                          onApply={onApplyPlan}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}

              {copilotLoading && (
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span>AI Copilot is formulating transformation plan...</span>
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendMessage} className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-100">
              <input
                type="text"
                placeholder="Ask AI to clean, impute, or transform..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={copilotLoading}
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || copilotLoading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
