interface DatasetPreviewTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRowsEstimate?: number;
  maxDisplayRows?: number;
}

export function DatasetPreviewTable({
  columns,
  rows,
  totalRowsEstimate,
  maxDisplayRows = 10,
}: DatasetPreviewTableProps) {
  const displayRows = rows.slice(0, maxDisplayRows);

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
        No columns found in this preview.
      </div>
    );
  }

  const formatCellValue = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return 'null';
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-mono text-[11px] text-slate-400">#</th>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-slate-700 tabular-nums">
            {displayRows.map((row, idx) => (
              <tr key={idx} className="transition hover:bg-slate-50">
                <td className="px-3 py-1.5 text-[11px] text-slate-400">{idx + 1}</td>
                {columns.map((col) => {
                  const val = row[col];
                  const isNull = val === null || val === undefined || val === '';
                  return (
                    <td
                      key={col}
                      className={`max-w-[180px] truncate px-3 py-1.5 ${
                        isNull ? 'italic text-amber-600' : 'text-slate-700'
                      }`}
                    >
                      {formatCellValue(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 font-mono tabular-nums">
        <span>
          Showing {displayRows.length} of {(totalRowsEstimate ?? rows.length).toLocaleString()} rows
        </span>
        <span>{columns.length} columns</span>
      </div>
    </div>
  );
}
