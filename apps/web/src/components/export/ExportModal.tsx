import React, { useState } from 'react';
import type { Dataset, DatasetVersion } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import { generateSklearnPipelineCode } from '@/exporters/sklearnExporter';
import { supabase } from '@/integrations/supabase';
import { getDuckDB } from '@/engine/duckdb/duckdbClient';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset;
  activeVersion: DatasetVersion;
  profile: DatasetProfileSummary | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dataset,
  activeVersion,
  profile,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'data' | 'split'>('code');
  const [copied, setCopied] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'parquet' | 'csv' | null>(null);

  // Configuration options for ML export
  const defaultTarget =
    profile?.columns.find((c) => c.columnName.toLowerCase().includes('survive'))?.columnName ??
    profile?.columns[0]?.columnName ??
    'target';

  const [targetColumn, setTargetColumn] = useState<string>(defaultTarget);
  const [testSize, setTestSize] = useState<number>(0.2);
  const [randomState, setRandomState] = useState<number>(42);

  if (!isOpen) return null;

  const generatedCode = generateSklearnPipelineCode({
    datasetName: dataset.name,
    versionNumber: activeVersion.version_number,
    profile,
    targetColumn,
    testSize,
    randomState,
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadScript = () => {
    const blob = new Blob([generatedCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline_${dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v${activeVersion.version_number}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadData = async (format: 'parquet' | 'csv') => {
    setDownloadingFormat(format);
    try {
      // 1. Download active version blob from storage
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from('datasets')
        .download(activeVersion.storage_path);

      if (dlErr) throw new Error(dlErr.message);

      let downloadBlob = fileBlob;
      const isSourceParquet = activeVersion.storage_path.endsWith('.parquet');

      // Convert format if necessary using DuckDB in-memory
      if (format === 'csv' && isSourceParquet) {
        const db = await getDuckDB();
        const conn = await db.connect();
        const tempTable = `temp_export_${Date.now()}`;
        const buffer = await fileBlob.arrayBuffer();

        await db.registerFileBuffer(`${tempTable}.parquet`, new Uint8Array(buffer));
        await conn.query(
          `CREATE OR REPLACE TABLE ${tempTable} AS SELECT * FROM read_parquet('${tempTable}.parquet')`,
        );
        await conn.query(`COPY ${tempTable} TO '${tempTable}.csv' (HEADER, DELIMITER ',')`);
        const csvBytes = await db.copyFileToBuffer(`${tempTable}.csv`);
        downloadBlob = new Blob([csvBytes.buffer as ArrayBuffer], { type: 'text/csv' });
        await conn.close();
      }

      // Trigger native browser download
      const safeName = dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const filename = `${safeName}_v${activeVersion.version_number}.${format}`;
      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold text-lg">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">ML Export & Pipelines</h3>
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                  Version {activeVersion.version_number}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Generate reproducible Scikit-Learn pipelines or download clean dataset files.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 px-5 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'code'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            🐍 Scikit-Learn Pipeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'data'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            💾 Download Clean Data
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('split')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'split'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            ⚙️ ML Split Configuration
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Python Scikit-Learn Script</h4>
                  <p className="text-[11px] text-slate-400">
                    Pre-configured ColumnTransformer with leakage-free train/test fitting.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyCode()}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span>{copied ? '✓' : '📋'}</span>
                    <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadScript}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
                  >
                    <span>⬇</span>
                    <span>Download .py</span>
                  </button>
                </div>
              </div>

              {/* Code display block */}
              <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-[11px] font-mono text-slate-100 overflow-x-auto max-h-[400px] leading-relaxed shadow-inner">
                <pre>{generatedCode}</pre>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6 py-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Download Processed Dataset</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Export Version {activeVersion.version_number} directly to your machine. All imputations,
                  encodings, and transformations are embedded.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Parquet Card */}
                <div className="rounded-2xl border border-slate-200 p-5 bg-white hover:border-blue-400 transition shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 text-sm font-bold">
                        ⚡
                      </span>
                      <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-100">
                        Recommended
                      </span>
                    </div>
                    <h5 className="mt-3 text-sm font-bold text-slate-900">Apache Parquet (.parquet)</h5>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      High-performance columnar storage. Ideal for Pandas, Polars, DuckDB, PyTorch, and
                      production ML pipelines.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingFormat === 'parquet'}
                    onClick={() => void handleDownloadData('parquet')}
                    className="mt-5 w-full rounded-xl bg-purple-600 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {downloadingFormat === 'parquet' ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Exporting...</span>
                      </>
                    ) : (
                      <>
                        <span>⬇</span>
                        <span>Download Parquet</span>
                      </>
                    )}
                  </button>
                </div>

                {/* CSV Card */}
                <div className="rounded-2xl border border-slate-200 p-5 bg-white hover:border-blue-400 transition shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-sm font-bold">
                        📄
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        Universal
                      </span>
                    </div>
                    <h5 className="mt-3 text-sm font-bold text-slate-900">Standard CSV (.csv)</h5>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Comma-separated text format compatible with Excel, Google Sheets, Tableau, PowerBI,
                      and standard BI tools.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingFormat === 'csv'}
                    onClick={() => void handleDownloadData('csv')}
                    className="mt-5 w-full rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {downloadingFormat === 'csv' ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Exporting...</span>
                      </>
                    ) : (
                      <>
                        <span>⬇</span>
                        <span>Download CSV</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'split' && (
            <div className="space-y-5 py-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Machine Learning Parameters</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure your target variable and train/test ratio for the generated pipeline script.
                </p>
              </div>

              {/* Target column selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Target Feature ($y$ variable)
                </label>
                <select
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 bg-white focus:border-blue-500 focus:outline-hidden"
                >
                  {profile?.columns.map((c) => (
                    <option key={c.columnName} value={c.columnName}>
                      {c.columnName} ({c.inferredType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Test Split Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Test Split Ratio</span>
                  <span className="font-mono text-blue-600 font-bold">
                    {Math.round(testSize * 100)}% Test / {Math.round((1 - testSize) * 100)}% Train
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.4"
                  step="0.05"
                  value={testSize}
                  onChange={(e) => setTestSize(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Random Seed */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Random State (Reproducibility Seed)
                </label>
                <input
                  type="number"
                  value={randomState}
                  onChange={(e) => setRandomState(parseInt(e.target.value, 10) || 42)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 bg-white focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-800 leading-relaxed">
                💡 Groundwork generates <strong>stratified splits</strong> automatically when your target
                feature contains discrete classification classes.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-end rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
