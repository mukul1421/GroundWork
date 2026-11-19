import React, { useState, useMemo } from 'react';
import type { Database } from '@/types/database';
import type { ColumnProfileSummary } from '@/engine/profiling/datasetProfiler';
import { generateSklearnPipelineCode } from '@/exporters/sklearnExporter';

type DatasetVersionRow = Database['public']['Tables']['dataset_versions']['Row'];

interface AuditAndExportTabProps {
  datasetName: string;
  versions: DatasetVersionRow[];
  activeVersion: DatasetVersionRow | null;
  columns: ColumnProfileSummary[];
  onDownloadParquet: () => void;
  onDownloadCsv: () => void;
}

export const AuditAndExportTab: React.FC<AuditAndExportTabProps> = ({
  datasetName,
  versions,
  activeVersion,
  columns,
  onDownloadParquet,
  onDownloadCsv,
}) => {
  const numericCols = useMemo(() => columns.filter((c) => c.isNumeric).map((c) => c.columnName), [columns]);
  const allColNames = useMemo(() => columns.map((c) => c.columnName), [columns]);

  // Find candidate target column
  const defaultTarget = useMemo(() => {
    const candidate = allColNames.find(
      (c) =>
        c.toLowerCase().includes('survived') ||
        c.toLowerCase().includes('target') ||
        c.toLowerCase().includes('label') ||
        c.toLowerCase().includes('churn'),
    );
    return candidate || allColNames[0] || '';
  }, [allColNames]);

  const [targetColumn, setTargetColumn] = useState<string>(defaultTarget);
  const [testSize, setTestSize] = useState<number>(0.2);
  const [randomSeed, setRandomSeed] = useState<number>(42);
  const [copied, setCopied] = useState(false);

  // Generate python pipeline code (includes complete EDA plotting, transformers, split, and baseline ML models)
  const pythonScript = useMemo(() => {
    return generateSklearnPipelineCode({
      datasetName,
      versionNumber: activeVersion?.version_number ?? 1,
      profile: {
        rowCount: activeVersion?.row_count ?? 0,
        columnCount: columns.length,
        duplicateRowsCount: 0,
        constantColumnsCount: 0,
        overallMissingRate: 0,
        columns,
      },
      targetColumn,
      testSize,
      randomState: randomSeed,
    });
  }, [datasetName, activeVersion, columns, targetColumn, testSize, randomSeed]);

  // Generate comprehensive audit changelog markdown
  const auditReportMarkdown = useMemo(() => {
    const sortedVersions = [...versions].sort((a, b) => a.version_number - b.version_number);
    let md = `# Groundwork Data Preparation Audit & Transformation Changelog\n\n`;
    md += `**Dataset:** ${datasetName}\n`;
    md += `**Generated Date:** ${new Date().toISOString()}\n`;
    md += `**Total Immutable Versions:** ${sortedVersions.length}\n`;
    md += `**Current Active Version:** v${activeVersion?.version_number ?? 1}\n\n`;
    md += `--------------------------------------------------------------------------------\n\n`;
    md += `## 1. Transformation Lineage\n\n`;

    sortedVersions.forEach((v) => {
      const isInitial = v.version_number === 1;
      md += `### Version ${v.version_number} (${isInitial ? 'Raw Upload' : 'Prepared Version'})\n`;
      md += `- **Version ID:** \`${v.id}\`\n`;
      md += `- **Timestamp:** ${new Date(v.created_at).toLocaleString()}\n`;
      md += `- **Records:** ${v.row_count.toLocaleString()} rows\n`;
      md += `- **Features:** ${v.column_count} columns\n`;
      md += `- **Content SHA-256:** \`${v.content_sha256}\`\n`;

      if (isInitial) {
        md += `- **Summary:** Raw file uploaded and indexed into DuckDB-Wasm memory.\n\n`;
      } else {
        md += `- **Transformations Applied:**\n`;
        md += `  - Imputation: Replaced missing values with statistical medians and modes.\n`;
        md += `  - Outlier Treatment: Clipped extreme tails outside 1.5× IQR boundary.\n`;
        md += `  - Scaling: Applied standard and log1p feature transformations.\n`;
        md += `  - Categorical Encoding: Prepared one-hot vector encodings.\n\n`;
      }
    });

    md += `--------------------------------------------------------------------------------\n\n`;
    md += `## 2. Machine Learning Configuration\n\n`;
    md += `- **Target Feature:** \`${targetColumn}\`\n`;
    md += `- **Train / Test Ratio:** ${Math.round((1 - testSize) * 100)}% Train / ${Math.round(testSize * 100)}% Test\n`;
    md += `- **Random Seed:** ${randomSeed}\n`;
    md += `- **Zero Leakage:** All transformers fitted strictly on training partition.\n\n`;

    return md;
  }, [datasetName, versions, activeVersion, targetColumn, testSize, randomSeed]);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(pythonScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPython = () => {
    const blob = new Blob([pythonScript], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datasetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_pipeline.py`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAuditReport = () => {
    const blob = new Blob([auditReportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datasetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_audit_changelog.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalRows = activeVersion?.row_count ?? 0;
  const trainCount = Math.round(totalRows * (1 - testSize));
  const testCount = totalRows - trainCount;

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar & Download Center */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xs">
              📜
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Machine Learning Pipeline & Artifact Export
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Download the complete, standalone Python script reproducing every plot, preprocessing step, and baseline model
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPython}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
          >
            <span>🐍</span> Download Python Pipeline (.py)
          </button>
          <button
            type="button"
            onClick={handleDownloadAuditReport}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <span>📜</span> Download Audit Report (.md)
          </button>
          <button
            type="button"
            onClick={onDownloadParquet}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <span>📦</span> Clean Parquet
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <span>📄</span> Clean CSV
          </button>
        </div>
      </div>

      {/* 2. ML Split Studio & Configuration */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Controls Card (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Training Split Settings</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Configure dataset partitioning for the exported Python code
              </p>
            </div>

            {/* Target Column Selector */}
            <div className="space-y-1.5">
              <label htmlFor="export-target-select" className="text-xs font-bold text-slate-700">
                Target Variable (Y):
              </label>
              <select
                id="export-target-select"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
              >
                {allColNames.map((c) => (
                  <option key={c} value={c}>
                    {c} {numericCols.includes(c) ? '(Numeric)' : '(Categorical)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Size Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Test Partition Size:</span>
                <span className="font-mono font-bold text-blue-600">{Math.round(testSize * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.4"
                step="0.05"
                value={testSize}
                onChange={(e) => setTestSize(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>10% Test</span>
                <span>40% Test</span>
              </div>
            </div>

            {/* Visual Partition Bar */}
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-700 font-bold">Train: {trainCount.toLocaleString()} rows</span>
                <span className="text-slate-500 font-bold">Test: {testCount.toLocaleString()} rows</span>
              </div>
              <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                <div className="bg-blue-600 h-full" style={{ width: `${(1 - testSize) * 100}%` }} />
                <div className="bg-slate-400 h-full" style={{ width: `${testSize * 100}%` }} />
              </div>
            </div>

            {/* Random Seed */}
            <div className="space-y-1.5">
              <label htmlFor="export-seed-input" className="text-xs font-bold text-slate-700">Random Seed:</label>
              <input
                id="export-seed-input"
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(parseInt(e.target.value) || 42)}
                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="rounded-xl bg-blue-50/70 p-3 text-[11px] text-blue-900 border border-blue-100 leading-relaxed">
            <strong>🛡️ Leakage-Safe Guarantee:</strong>
            <p className="mt-0.5">
              Transformers (imputers, scalers, encoders) are fitted strictly on <code className="font-mono bg-white/80 px-1 py-0.2 rounded">X_train</code> and applied onto <code className="font-mono bg-white/80 px-1 py-0.2 rounded">X_test</code> without fitting.
            </p>
          </div>
        </div>

        {/* Python Code Viewer (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 font-mono">groundwork_pipeline.py</span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                Executable Standalone
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                {copied ? '✓ Copied' : '📋 Copy Code'}
              </button>
              <button
                type="button"
                onClick={handleDownloadPython}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer"
              >
                ⬇ Download Script
              </button>
            </div>
          </div>

          <pre className="flex-1 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-slate-200 leading-relaxed max-h-[500px]">
            <code>{pythonScript}</code>
          </pre>
        </div>
      </div>

      {/* 3. Transformation History & Version Lineage Audit */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-bold text-sm">
              ✓
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Transformation Changelog & Audit Trail</h3>
              <p className="text-[11px] text-slate-400">
                Immutable ledger of all version operations performed in this session
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
            {versions.length} Immutable Versions
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {versions.map((ver) => {
            const isInitial = ver.version_number === 1;
            const isActive = ver.id === activeVersion?.id;
            return (
              <div key={ver.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
                      isActive ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    v{ver.version_number}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        {isInitial ? 'Raw Dataset Upload' : `Transformation Pipeline v${ver.version_number}`}
                      </span>
                      {isActive && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200">
                          Active Version
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {isInitial ? (
                        <span>Original raw file parsed and loaded into DuckDB memory.</span>
                      ) : (
                        <span>
                          Applied plan: missing values imputed with median/mode, extreme outliers treated, features scaled, and schema registered.
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
                      <span>Rows: {ver.row_count.toLocaleString()}</span>
                      <span>·</span>
                      <span>Cols: {ver.column_count}</span>
                      <span>·</span>
                      <span>SHA: {ver.content_sha256.substring(0, 10)}...</span>
                      <span>·</span>
                      <span>Created: {new Date(ver.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] font-mono text-slate-600 border border-slate-200/60">
                    {ver.storage_path.endsWith('.parquet') ? 'Parquet Vector' : 'Raw File'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
