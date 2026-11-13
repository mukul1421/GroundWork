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
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-center text-xs text-slate-500">
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
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/90 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-mono text-[10px] text-slate-500">#</th>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 font-semibold text-slate-200">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {displayRows.map((row, idx) => (
              <tr key={idx} className="transition hover:bg-slate-800/40">
                <td className="px-3 py-1.5 text-[10px] text-slate-500">{idx + 1}</td>
                {columns.map((col) => {
                  const val = row[col];
                  const isNull = val === null || val === undefined || val === '';
                  return (
                    <td
                      key={col}
                      className={`max-w-[200px] truncate px-3 py-1.5 ${
                        isNull ? 'italic text-slate-600' : 'text-slate-200'
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

      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500">
        <span>
          Showing {displayRows.length} of {totalRowsEstimate ?? rows.length} estimated rows
        </span>
        <span>{columns.length} columns</span>
      </div>
    </div>
  );
}
