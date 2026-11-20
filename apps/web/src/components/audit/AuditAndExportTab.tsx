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
  versionChangelogs?: Record<string, string>;
  onDownloadParquet: () => void;
  onDownloadCsv: () => void;
}

export const AuditAndExportTab: React.FC<AuditAndExportTabProps> = ({
  datasetName,
  versions,
  activeVersion,
  columns,
  versionChangelogs = {},
  onDownloadParquet,
  onDownloadCsv,
}) => {
  const numericCols = useMemo(
    () => columns.filter((c) => c.isNumeric).map((c) => c.columnName),
    [columns],
  );
  const allColNames = useMemo(() => columns.map((c) => c.columnName), [columns]);

  const defaultTarget = useMemo(() => {
    const candidate = allColNames.find(
      (c) =>
        c.toLowerCase().includes('churn') ||
        c.toLowerCase().includes('renewed') ||
        c.toLowerCase().includes('returned') ||
        c.toLowerCase().includes('survived') ||
        c.toLowerCase().includes('target') ||
        c.toLowerCase().includes('label'),
    );
    return candidate || allColNames[allColNames.length - 1] || '';
  }, [allColNames]);

  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const effectiveTarget = useMemo(() => {
    if (selectedTarget && allColNames.includes(selectedTarget)) return selectedTarget;
    return defaultTarget;
  }, [selectedTarget, allColNames, defaultTarget]);

  const [testSize, setTestSize] = useState<number>(0.2);
  const [randomSeed, setRandomSeed] = useState<number>(42);
  const [copied, setCopied] = useState(false);

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
      targetColumn: effectiveTarget,
      testSize,
      randomState: randomSeed,
    });
  }, [datasetName, activeVersion, columns, effectiveTarget, testSize, randomSeed]);

  const auditReportMarkdown = useMemo(() => {
    const sortedVersions = [...versions].sort((a, b) => a.version_number - b.version_number);
    let md = `# Groundwork Data Preparation Audit & Transformation Changelog\n\n`;
    md += `**Dataset:** ${datasetName}\n`;
    md += `**Generated:** ${new Date().toISOString()}\n`;
    md += `**Total Immutable Versions:** ${sortedVersions.length}\n`;
    md += `**Active Version:** v${activeVersion?.version_number ?? 1}\n\n`;
    md += `---\n\n## 1. Transformation Lineage\n\n`;

    sortedVersions.forEach((v) => {
      const isInitial = v.version_number === 1;
      const recordedSummary =
        versionChangelogs[v.id] ??
        (isInitial
          ? 'Original source dataset ingested and profiled.'
          : 'Human-approved transformation plan executed and versioned immutably.');
      md += `### Version ${v.version_number} (${isInitial ? 'Raw Source' : 'Prepared Version'})\n`;
      md += `- **Version ID:** \`${v.id}\`\n`;
      md += `- **Timestamp:** ${new Date(v.created_at).toLocaleString()}\n`;
      md += `- **Dimensions:** ${v.row_count.toLocaleString()} rows × ${v.column_count} columns\n`;
      md += `- **SHA-256:** \`${v.content_sha256}\`\n`;
      md += `- **Changelog:** ${recordedSummary}\n\n`;
    });

    md += `---\n\n## 2. Machine Learning Split Configuration\n\n`;
    md += `- **Target Variable:** \`${effectiveTarget}\`\n`;
    md += `- **Train / Test Split:** ${Math.round((1 - testSize) * 100)}% / ${Math.round(testSize * 100)}%\n`;
    md += `- **Random Seed:** ${randomSeed}\n`;
    md += `- **Leakage Prevention:** All transformers fitted strictly on training partition.\n`;

    return md;
  }, [datasetName, versions, activeVersion, versionChangelogs, effectiveTarget, testSize, randomSeed]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pythonScript);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = pythonScript;
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

  const handleDownloadPython = () => {
    const blob = new Blob([pythonScript], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datasetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_pipeline.py`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAuditReport = () => {
    const blob = new Blob([auditReportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datasetName.replace(/[^a-zA-Z0-9_-]/g, '_')}_audit_changelog.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalRows = activeVersion?.row_count ?? 0;
  const trainCount = Math.round(totalRows * (1 - testSize));
  const testCount = totalRows - trainCount;

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#eaecf0] bg-white p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            ML Pipeline &amp; Artifact Export
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Export a reproducible scikit-learn script, immutable changelog, or cleaned dataset
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPython}
            className="cursor-pointer rounded-xl bg-[#3b5bf6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Download Python (.py)
          </button>
          <button
            type="button"
            onClick={handleDownloadAuditReport}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Audit Report (.md)
          </button>
          <button
            type="button"
            onClick={onDownloadParquet}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Parquet Export
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Clean CSV
          </button>
        </div>
      </div>

      {/* ML Split Config + Standalone Python Viewer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-4">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Training Split Settings</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Updates the generated Python script dynamically
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="export-target-select" className="text-xs font-semibold text-slate-700">
                Target Variable (y)
              </label>
              <select
                id="export-target-select"
                value={effectiveTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
              >
                {allColNames.map((c) => (
                  <option key={c} value={c}>
                    {c} ({numericCols.includes(c) ? 'Numeric' : 'Categorical'})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Test Partition Size</span>
                <span className="font-mono font-bold text-[#3b5bf6] tabular-nums">
                  {Math.round(testSize * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Test partition size"
                min="0.1"
                max="0.4"
                step="0.05"
                value={testSize}
                onChange={(e) => setTestSize(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-[#3b5bf6]"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-400">
                <span>10% Test</span>
                <span>40% Test</span>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200/70 bg-slate-50 p-3">
              <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                <span className="font-bold text-[#3b5bf6]">Train: {trainCount.toLocaleString()}</span>
                <span className="font-bold text-slate-600">Test: {testCount.toLocaleString()}</span>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-[#3b5bf6]" style={{ width: `${(1 - testSize) * 100}%` }} />
                <div className="h-full bg-slate-400" style={{ width: `${testSize * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="export-seed-input" className="text-xs font-semibold text-slate-700">
                Random Seed
              </label>
              <input
                id="export-seed-input"
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(parseInt(e.target.value, 10) || 42)}
                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-[#3b5bf6] focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-relaxed text-slate-700">
            <strong className="text-slate-900">Leakage-Safe Guarantee:</strong> Imputers, scalers, and encoders fit strictly on{' '}
            <code className="rounded bg-white px-1 font-mono">X_train</code> before transforming{' '}
            <code className="rounded bg-white px-1 font-mono">X_test</code>.
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-[#eaecf0] bg-white p-5 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-900">
                groundwork_pipeline.py
              </span>
              <span className="text-[11px] text-slate-400">· Standalone scikit-learn</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {copied ? 'Copied' : 'Copy Code'}
              </button>
              <button
                type="button"
                onClick={handleDownloadPython}
                className="cursor-pointer rounded-lg bg-[#3b5bf6] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                Download .py
              </button>
            </div>
          </div>

          <pre className="max-h-[480px] flex-1 overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-200">
            <code>{pythonScript}</code>
          </pre>
        </div>
      </div>

      {/* Transformation Changelog & Version Lineage */}
      <div className="rounded-2xl border border-[#eaecf0] bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Version Lineage &amp; Audit Trail</h3>
            <p className="text-[11px] text-slate-500">
              Immutable cryptographic record of every version created for {datasetName}
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
            {versions.length} version{versions.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {versions.map((ver) => {
            const isInitial = ver.version_number === 1;
            const isActive = ver.id === activeVersion?.id;
            const changelog =
              versionChangelogs[ver.id] ??
              (isInitial
                ? 'Original source dataset ingested and profiled.'
                : 'Approved preprocessing transformations applied immutably.');

            return (
              <div
                key={ver.id}
                className="flex flex-col justify-between gap-3 py-4 md:flex-row md:items-center"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                      isActive
                        ? 'bg-[#3b5bf6] text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    v{ver.version_number}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {isInitial ? 'Raw Source Snapshot' : `Prepared Snapshot v${ver.version_number}`}
                      </span>
                      {isActive && (
                        <span className="font-mono text-[10px] font-semibold text-[#3b5bf6]">
                          · Active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">{changelog}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-400 tabular-nums">
                      <span>{ver.row_count.toLocaleString()} rows</span>
                      <span>·</span>
                      <span>{ver.column_count} cols</span>
                      <span>·</span>
                      <span>SHA {ver.content_sha256.substring(0, 10)}</span>
                      <span>·</span>
                      <span>{new Date(ver.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 font-mono text-[11px] text-slate-500">
                  {ver.storage_path.endsWith('.parquet') ? 'Parquet' : 'CSV / Tabular'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
