import React, { useState } from 'react';

interface DataPreviewCardProps {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export const DataPreviewCard: React.FC<DataPreviewCardProps> = ({
  columns,
  rows,
  totalRows,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 7;

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const currentRows = rows.slice(startIndex, startIndex + pageSize);

  const formatCellValue = (val: unknown): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return `${val}`;
    return JSON.stringify(val);
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Data Preview</h3>
          <span className="text-[11px] font-medium text-slate-400">
            {columns.length} columns
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                {columns.slice(0, 6).map((col) => (
                  <th key={col} className="pb-2.5 pr-4 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-normal text-slate-700">
              {currentRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 transition">
                  {columns.slice(0, 6).map((col) => {
                    const displayVal = formatCellValue(row[col]);
                    return (
                      <td key={col} className="py-2.5 pr-4 whitespace-nowrap max-w-[120px] truncate">
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer matching reference */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span>
          Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalRows)} of{' '}
          {totalRows.toLocaleString()} rows
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
};
