import React from 'react';
import type { DatasetVersion } from '@/types/database';

interface FileHeaderCardProps {
  filename: string;
  filesize: string;
  rowCount: number;
  sourceFormat: string;
  versions?: DatasetVersion[];
  activeVersionId?: string;
  onSelectVersion?: (version: DatasetVersion) => void;
}

export const DatasetFileHeaderCard: React.FC<FileHeaderCardProps> = ({
  filename,
  filesize,
  rowCount,
  sourceFormat,
  versions = [],
  activeVersionId,
  onSelectVersion,
}) => {
  const normalizedFormat =
    sourceFormat.toLowerCase() === 'xlsx' || sourceFormat.toLowerCase() === 'xls'
      ? 'Excel'
      : sourceFormat.toUpperCase();

  const formats = [
    { label: 'CSV', color: 'emerald' },
    { label: 'Excel', color: 'emerald' },
    { label: 'JSON', color: 'purple' },
    { label: 'TSV', color: 'blue' },
  ];

  const currentVersion = versions.find((v) => v.id === activeVersionId) ?? versions[0];
  const versionNum = currentVersion?.version_number ?? 1;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold text-lg">
            📑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 truncate max-w-[200px]" title={filename}>
                {filename}
              </h2>
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                v{versionNum}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {filesize} · {rowCount.toLocaleString()} rows
            </p>
          </div>
        </div>

        {/* Format Tags */}
        <div className="flex items-center gap-1.5">
          {formats.map((fmt) => {
            const isCurrent = fmt.label.toLowerCase() === normalizedFormat.toLowerCase();
            return (
              <span
                key={fmt.label}
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold border transition ${
                  isCurrent
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
              >
                {fmt.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Version Selector Lineage */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px]">
            ✓
          </span>
          <span>Version Lineage</span>
        </div>

        {versions.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-400 mr-1">Switch Version:</span>
            {versions.map((v) => {
              const isSelected = v.id === activeVersionId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVersion?.(v)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  v{v.version_number}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
