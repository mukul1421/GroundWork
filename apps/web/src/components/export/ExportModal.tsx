import React, { useState, useMemo } from 'react';
import type { Dataset, DatasetVersion } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import { generateSklearnPipelineCode } from '@/exporters/sklearnExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset;
  activeVersion: DatasetVersion;
  profile: DatasetProfileSummary | null;
  onDownloadData: (format: 'parquet' | 'csv') => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dataset,
  activeVersion,
  profile,
  onDownloadData,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'data' | 'split'>('code');
  const [copied, setCopied] = useState(false);

  const allColNames = useMemo(
    () => (profile?.columns ?? []).map((c) => c.columnName),
    [profile],
  );

  const defaultTarget = useMemo(() => {
    const candidate = allColNames.find(
      (c) =>
        c.toLowerCase().includes('churn') ||
        c.toLowerCase().includes('renewed') ||
        c.toLowerCase().includes('returned') ||
        c.toLowerCase().includes('target') ||
        c.toLowerCase().includes('label'),
    );
    return candidate ?? allColNames[allColNames.length - 1] ?? 'target';
  }, [allColNames]);

  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const effectiveTarget =
    selectedTarget && allColNames.includes(selectedTarget) ? selectedTarget : defaultTarget;

  const [testSize, setTestSize] = useState<number>(0.2);
  const [randomState, setRandomState] = useState<number>(42);

  if (!isOpen) return null;

  const generatedCode = generateSklearnPipelineCode({
    datasetName: dataset.name,
    versionNumber: activeVersion.version_number,
    profile,
    targetColumn: effectiveTarget,
    testSize,
    randomState,
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = generatedCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadScript = () => {
    const blob = new Blob([generatedCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline_${dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v${activeVersion.version_number}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="export-modal-title" className="text-sm font-bold text-slate-900">
                Export Artifacts
              </h3>
              <span className="font-mono text-xs font-semibold text-[#3b5bf6]">
                v{activeVersion.version_number}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Download reproducible scikit-learn code or clean datasets for {dataset.name}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close export modal"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/70 px-5">
          {(
            [
              { id: 'code', label: 'Scikit-Learn Pipeline' },
              { id: 'data', label: 'Download Clean Data' },
              { id: 'split', label: 'Split Configuration' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer border-b-2 px-4 py-3 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'border-[#3b5bf6] text-[#3b5bf6]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Standalone Python Script</h4>
                  <p className="text-[11px] text-slate-500">
                    ColumnTransformer with leakage-free train/test partitioning
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyCode()}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? 'Copied' : 'Copy Code'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadScript}
                    className="cursor-pointer rounded-lg bg-[#3b5bf6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Download .py
                  </button>
                </div>
              </div>

              <div className="max-h-[400px] overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
                <pre>{generatedCode}</pre>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-5 py-1">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Download Prepared Version</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Export version {activeVersion.version_number} ({activeVersion.row_count.toLocaleString()} rows ×{' '}
                  {activeVersion.column_count} columns) directly to disk.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#3b5bf6]">
                      Columnar
                    </div>
                    <h5 className="mt-2 text-sm font-bold text-slate-900">Apache Parquet</h5>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Optimized for pandas, Polars, DuckDB, and PyTorch dataloaders.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownloadData('parquet')}
                    className="mt-5 w-full cursor-pointer rounded-xl bg-[#3b5bf6] py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    Download Parquet
                  </button>
                </div>

                <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Universal
                    </div>
                    <h5 className="mt-2 text-sm font-bold text-slate-900">Standard CSV</h5>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      UTF-8 comma-separated file compatible with spreadsheets and BI tools.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownloadData('csv')}
                    className="mt-5 w-full cursor-pointer rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    Download CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'split' && (
            <div className="space-y-5 py-1">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Machine Learning Parameters</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Configure your target column and train/test ratio for the exported script.
                </p>
              </div>

              <div>
                <label htmlFor="modal-target-select" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Target Feature (y variable)
                </label>
                <select
                  id="modal-target-select"
                  value={effectiveTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
                >
                  {(profile?.columns ?? []).map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName} ({c.inferredType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Test Split Ratio</span>
                  <span className="font-mono font-bold text-[#3b5bf6] tabular-nums">
                    {Math.round(testSize * 100)}% Test / {Math.round((1 - testSize) * 100)}% Train
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Test split ratio"
                  min="0.1"
                  max="0.4"
                  step="0.05"
                  value={testSize}
                  onChange={(e) => setTestSize(parseFloat(e.target.value))}
                  className="w-full cursor-pointer accent-[#3b5bf6]"
                />
              </div>

              <div>
                <label htmlFor="modal-seed-input" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Random State (Reproducibility Seed)
                </label>
                <input
                  id="modal-seed-input"
                  type="number"
                  value={randomState}
                  onChange={(e) => setRandomState(parseInt(e.target.value, 10) || 42)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-slate-700">
                Groundwork automatically stratifies splits when the selected target variable contains discrete classes.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end rounded-b-2xl border-t border-slate-100 bg-slate-50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
