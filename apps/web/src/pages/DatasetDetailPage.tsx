import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth, supabase } from '@/integrations/supabase';
import { getDuckDB } from '@/engine/duckdb/duckdbClient';
import {
  profileTable,
  saveProfileToDatabase,
  sanitizeJson,
  type DatasetProfileSummary,
} from '@/engine/profiling/datasetProfiler';
import {
  computeCorrelationMatrix,
  type CorrelationMatrixResult,
} from '@/engine/eda/correlationMatrix';
import { getSavedCredentials, type AiCredentials } from '@/integrations/ai/byokStorage';
import { ApiKeyModal } from '@/components/copilot/ApiKeyModal';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { ExportModal } from '@/components/export/ExportModal';
import { DatasetOverviewTab } from '@/components/explorer/DatasetOverviewTab';
import { AnalyzeTab } from '@/components/analyze/AnalyzeTab';
import { MultiChartStudio } from '@/components/charts/MultiChartStudio';
import { PreprocessingStudio } from '@/components/preprocessing/PreprocessingStudio';
import { AuditAndExportTab } from '@/components/audit/AuditAndExportTab';
import { askAiCopilot } from '@/integrations/ai/aiCopilotService';
import {
  extractPlanFromResponse,
  stripPlanFromResponse,
} from '@/engine/preprocessing/preprocessingPlan';
import {
  executePreprocessingPlan,
  type PreprocessingPlan,
  type PreprocessingResult,
} from '@/engine/preprocessing/preprocessingEngine';
import type { Dataset, DatasetVersion, Json } from '@/types/database';

export type DetailTab = 'overview' | 'eda' | 'quality' | 'preprocessing' | 'features';

function isParquetBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const h = new Uint8Array(buf, 0, 4);
  return h[0] === 0x50 && h[1] === 0x41 && h[2] === 0x52 && h[3] === 0x31;
}

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const tabFromUrl = searchParams.get('tab') as DetailTab | null;
  const pipelineStepFromUrl = searchParams.get('pipelineStep');

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [activeVersion, setActiveVersion] = useState<DatasetVersion | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [profileSummary, setProfileSummary] = useState<DatasetProfileSummary | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationMatrixResult | null>(null);

  // Active Tab matching 03 — DATA EXPLORER (defaults to URL tab if provided)
  const [activeTab, setActiveTab] = useState<DetailTab>(() => {
    if (tabFromUrl && ['overview', 'eda', 'quality', 'preprocessing', 'features'].includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return 'overview';
  });

  useEffect(() => {
    if (tabFromUrl && ['overview', 'eda', 'quality', 'preprocessing', 'features'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // BYOK AI Copilot states
  const [credentials, setCredentials] = useState<AiCredentials | null>(getSavedCredentials);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  // Embedded Preprocessing Copilot Messages State
  const [copilotMessages, setCopilotMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; plan?: PreprocessingPlan }>
  >([]);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [profilingInProgress, setProfilingInProgress] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDuckDBProfiling = useCallback(
    async (ds: Dataset, ver: DatasetVersion) => {
      setProfilingInProgress(true);
      try {
        // 1. Download dataset buffer from Supabase Storage
        const { data: blob, error: downloadError } = await supabase.storage
          .from('datasets')
          .download(ver.storage_path);

        if (downloadError) throw downloadError;

        // 2. Initialize DuckDB-Wasm in Web Worker
        const db = await getDuckDB();
        const conn = await db.connect();
        const tableName = `dataset_${ver.id.replace(/-/g, '_')}`;
        const buffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        // 3. Register and load table with bulletproof Parquet & CSV fallback
        const isParquet =
          isParquetBuffer(buffer) ||
          ver.storage_path.endsWith('.parquet') ||
          ds.source_format === ('parquet' as unknown);

        if (isParquet) {
          await db.registerFileBuffer(`${tableName}.parquet`, uint8);
          await conn.query(
            `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${tableName}.parquet')`,
          );
        } else if (ds.source_format === 'xlsx') {
          const wb = XLSX.read(buffer, { type: 'array' });
          const firstSheet = wb.SheetNames[0];
          if (!firstSheet) throw new Error('No sheet found in workbook');
          const sheet = wb.Sheets[firstSheet];
          if (!sheet) throw new Error('Could not read sheet');
          const csvText = XLSX.utils.sheet_to_csv(sheet);
          await db.registerFileText(`${tableName}.csv`, csvText);
          await conn.query(
            `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv('${tableName}.csv', auto_detect=true, ignore_errors=true, null_padding=true)`,
          );
        } else if (ds.source_format === 'json') {
          await db.registerFileBuffer(`${tableName}.json`, uint8);
          await conn.query(
            `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_json_auto('${tableName}.json')`,
          );
        } else {
          // CSV / TSV with robust multi-stage fallback
          await db.registerFileBuffer(`${tableName}.csv`, uint8);
          try {
            await conn.query(
              `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv('${tableName}.csv', auto_detect=true, ignore_errors=true, null_padding=true)`,
            );
          } catch {
            try {
              await conn.query(
                `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${tableName}.csv', ignore_errors=true)`,
              );
            } catch {
              await conn.query(
                `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv('${tableName}.csv', delim=',', header=true, ignore_errors=true, null_padding=true, all_varchar=true)`,
              );
            }
          }
        }

        // 4. Run profiling computations
        const summary = await profileTable(conn, tableName);
        setProfileSummary(summary);

        // 5. Compute Correlation Heatmap matrix for numeric columns
        const numericCols = summary.columns.filter((c) => c.isNumeric).map((c) => c.columnName);
        let computedCorrelation: CorrelationMatrixResult | null = null;
        if (numericCols.length > 1) {
          try {
            computedCorrelation = await computeCorrelationMatrix(conn, tableName, numericCols);
            setCorrelationData(computedCorrelation);
          } catch (corrErr) {
            console.warn('Correlation computation warning:', corrErr);
          }
        }

        // 6. Save Profile to Supabase Database (if user is authenticated)
        if (user) {
          try {
            await saveProfileToDatabase(
              ver.id,
              summary,
              computedCorrelation?.matrix ?? null,
            );
          } catch {
            // Ignore non-critical persistence errors
          }
        }

        // 7. Fetch Preview Rows (first 100 rows)
        const previewResult = await conn.query(`SELECT * FROM ${tableName} LIMIT 100`);
        const rows: Record<string, unknown>[] = [];
        const fields = previewResult.schema.fields.map((f) => f.name);

        for (let i = 0; i < previewResult.numRows; i++) {
          const rowObj: Record<string, unknown> = {};
          for (const field of fields) {
            const val = previewResult.getChild(field)?.get(i);
            rowObj[field] = typeof val === 'bigint' ? Number(val) : val;
          }
          rows.push(rowObj);
        }
        setPreviewRows(rows);
        await conn.close();
      } catch (err) {
        console.error('Profiling error:', err);
      } finally {
        setProfilingInProgress(false);
      }
    },
    [user],
  );

  const fetchDatasetData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const { data: dsData, error: dsErr } = await supabase
        .from('datasets')
        .select('*')
        .eq('id', id)
        .single();

      if (dsErr) throw dsErr;
      setDataset(dsData);

      const { data: verData, error: verErr } = await supabase
        .from('dataset_versions')
        .select('*')
        .eq('dataset_id', id)
        .order('version_number', { ascending: false });

      if (verErr) throw verErr;
      setVersions(verData ?? []);

      let activeVer: DatasetVersion | null = null;
      if (dsData.active_version_id) {
        activeVer = verData?.find((v) => v.id === dsData.active_version_id) ?? null;
      }
      if (!activeVer && verData && verData.length > 0) {
        activeVer = verData[0] ?? null;
      }
      setActiveVersion(activeVer);

      if (activeVer) {
        void runDuckDBProfiling(dsData, activeVer);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load dataset');
    } finally {
      setLoading(false);
    }
  }, [id, runDuckDBProfiling]);

  useEffect(() => {
    void fetchDatasetData();
  }, [fetchDatasetData]);

  const handleSelectVersion = async (v: DatasetVersion) => {
    setActiveVersion(v);
    setProfileSummary(null);
    setCorrelationData(null);
    setPreviewRows([]);

    if (dataset) {
      await supabase.from('datasets').update({ active_version_id: v.id }).eq('id', dataset.id);
      void runDuckDBProfiling(dataset, v);
    }
  };

  const executePipeline = async (
    plan: PreprocessingPlan,
  ): Promise<PreprocessingResult> => {
    if (!dataset || !activeVersion || !user) {
      throw new Error('Dataset or user context unavailable');
    }

    const db = await getDuckDB();
    const conn = await db.connect();

    try {
      const sourceTableName = `dataset_${activeVersion.id.replace(/-/g, '_')}`;
      const tablesResult = await conn.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='main'`,
      );
      const existingTables: string[] = [];
      const nameVec = tablesResult.getChild('table_name');
      if (nameVec) {
        for (let i = 0; i < tablesResult.numRows; i++) {
          existingTables.push(String(nameVec.get(i)));
        }
      }

      if (!existingTables.includes(sourceTableName)) {
        const { data: blob, error: downloadError } = await supabase.storage
          .from('datasets')
          .download(activeVersion.storage_path);
        if (downloadError) throw downloadError;

        const buffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const isParquet =
          isParquetBuffer(buffer) ||
          activeVersion.storage_path.endsWith('.parquet') ||
          dataset.source_format === ('parquet' as unknown);

        if (isParquet) {
          await db.registerFileBuffer(`${sourceTableName}.parquet`, uint8);
          await conn.query(
            `CREATE OR REPLACE TABLE ${sourceTableName} AS SELECT * FROM read_parquet('${sourceTableName}.parquet')`,
          );
        } else if (dataset.source_format === 'xlsx') {
          const wb = XLSX.read(buffer, { type: 'array' });
          const firstSheet = wb.SheetNames[0];
          const sheet = wb.Sheets[firstSheet ?? ''];
          const csvText = sheet ? XLSX.utils.sheet_to_csv(sheet) : '';
          await db.registerFileText(`${sourceTableName}.csv`, csvText);
          await conn.query(
            `CREATE OR REPLACE TABLE ${sourceTableName} AS SELECT * FROM read_csv('${sourceTableName}.csv', auto_detect=true, ignore_errors=true, null_padding=true)`,
          );
        } else if (dataset.source_format === 'csv') {
          await db.registerFileBuffer(`${sourceTableName}.csv`, uint8);
          try {
            await conn.query(
              `CREATE OR REPLACE TABLE ${sourceTableName} AS SELECT * FROM read_csv('${sourceTableName}.csv', auto_detect=true, ignore_errors=true, null_padding=true)`,
            );
          } catch {
            await conn.query(
              `CREATE OR REPLACE TABLE ${sourceTableName} AS SELECT * FROM read_csv_auto('${sourceTableName}.csv', ignore_errors=true)`,
            );
          }
        } else {
          await db.registerFileBuffer(`${sourceTableName}.json`, uint8);
          await conn.query(
            `CREATE OR REPLACE TABLE ${sourceTableName} AS SELECT * FROM read_json_auto('${sourceTableName}.json')`,
          );
        }
      }

      const targetTableName = `dataset_prep_${Date.now()}`;
      const result = await executePreprocessingPlan(
        db,
        conn,
        sourceTableName,
        targetTableName,
        plan,
      );

      const { data: maxVerData } = await supabase
        .from('dataset_versions')
        .select('version_number')
        .eq('dataset_id', dataset.id)
        .order('version_number', { ascending: false })
        .limit(1);

      const nextVersionNum = (maxVerData?.[0]?.version_number ?? activeVersion.version_number) + 1;
      const newVersionId = crypto.randomUUID();
      const newStoragePath = `${user.id}/${dataset.workspace_id}/${dataset.id}/${newVersionId}/prepared_v${nextVersionNum}.parquet`;

      const { error: storageErr } = await supabase.storage
        .from('datasets')
        .upload(newStoragePath, result.exportedBuffer, {
          contentType: 'application/octet-stream',
          upsert: true,
        });

      if (storageErr) {
        throw new Error(`Failed to upload version file: ${storageErr.message}`);
      }

      const hashBuf = await crypto.subtle.digest(
        'SHA-256',
        result.exportedBuffer.buffer as ArrayBuffer,
      );
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const previewLimit = Math.min(result.transformedRowCount, 10);
      const previewTableRes = await conn.query(
        `SELECT * FROM ${targetTableName} LIMIT ${previewLimit}`,
      );
      const previewFields = previewTableRes.schema.fields.map((f) => f.name);
      const schemaSummary = previewFields.map((col) => {
        const colVec = previewTableRes.getChild(col);
        const samples: unknown[] = [];
        for (let i = 0; i < previewLimit; i++) {
          const v: unknown = colVec?.get(i);
          const cleanVal =
            typeof v === 'bigint'
              ? Number(v)
              : v !== undefined && v !== null
                ? v
                : null;
          samples.push(cleanVal);
        }
        return { name: col, sampleValues: samples };
      });

      const { data: newVerData, error: verErr } = await supabase
        .from('dataset_versions')
        .insert({
          id: newVersionId,
          dataset_id: dataset.id,
          version_number: nextVersionNum,
          parent_version_id: activeVersion.id,
          bucket_id: 'datasets',
          storage_path: newStoragePath,
          content_sha256: hashHex,
          row_count: result.transformedRowCount,
          column_count: result.transformedColumnCount,
          file_size_bytes: result.exportedBuffer.byteLength,
          schema_json: sanitizeJson(schemaSummary) as Json,
          created_by: user.id,
        })
        .select()
        .single();

      if (verErr) {
        throw new Error(`Failed to register version: ${verErr.message}`);
      }

      await supabase
        .from('datasets')
        .update({ active_version_id: newVersionId })
        .eq('id', dataset.id);

      const newSummary = await profileTable(conn, targetTableName);
      setProfileSummary(newSummary);

      const numericCols = newSummary.columns.filter((c) => c.isNumeric).map((c) => c.columnName);
      let newCorrelation: CorrelationMatrixResult | null = null;
      if (numericCols.length > 1) {
        try {
          newCorrelation = await computeCorrelationMatrix(conn, targetTableName, numericCols);
          setCorrelationData(newCorrelation);
        } catch (corrErr) {
          console.warn('Correlation computation warning:', corrErr);
        }
      }

      try {
        await saveProfileToDatabase(
          newVersionId,
          newSummary,
          newCorrelation?.matrix ?? null,
        );
      } catch {
        // Non-critical
      }

      const prev100 = await conn.query(`SELECT * FROM ${targetTableName} LIMIT 100`);
      const updatedRows: Record<string, unknown>[] = [];
      const upFields = prev100.schema.fields.map((f) => f.name);
      for (let i = 0; i < prev100.numRows; i++) {
        const rowObj: Record<string, unknown> = {};
        for (const field of upFields) {
          const val = prev100.getChild(field)?.get(i);
          rowObj[field] = typeof val === 'bigint' ? Number(val) : val;
        }
        updatedRows.push(rowObj);
      }
      setPreviewRows(updatedRows);

      if (newVerData) {
        setVersions((prev) => [newVerData, ...prev]);
        setActiveVersion(newVerData);
      }

      return result;
    } finally {
      await conn.close();
    }
  };

  const handleSendCopilotMessage = async (msg: string) => {
    if (!credentials) {
      setIsKeyModalOpen(true);
      return;
    }
    if (!dataset || !activeVersion) return;

    setCopilotLoading(true);
    setCopilotMessages((prev) => [...prev, { role: 'user', content: msg }]);

    try {
      const context = {
        datasetName: dataset.name,
        sourceFormat: dataset.source_format,
        rowCount: activeVersion.row_count,
        columnCount: activeVersion.column_count,
        columns: rawColumns,
        previewRows,
        profileSummary,
        correlationData,
      };

      const rawResponse = await askAiCopilot(
        credentials,
        context,
        copilotMessages.map((m) => ({
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content,
          timestamp: '',
        })),
        msg,
      );

      const plan = extractPlanFromResponse(rawResponse);
      const textOnly = stripPlanFromResponse(rawResponse);

      setCopilotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: textOnly,
          plan: plan ?? undefined,
        },
      ]);
    } catch (err) {
      setCopilotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Error: ${err instanceof Error ? err.message : 'AI request failed'}.`,
        },
      ]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleDownloadCleanData = async (format: 'parquet' | 'csv') => {
    if (!activeVersion || !dataset) return;
    try {
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from('datasets')
        .download(activeVersion.storage_path);
      if (dlErr) throw new Error(dlErr.message);

      let downloadBlob = fileBlob;
      const isSourceParquet = activeVersion.storage_path.endsWith('.parquet');

      if (format === 'csv' && isSourceParquet) {
        const db = await getDuckDB();
        const conn = await db.connect();
        const tempTable = `temp_dl_${Date.now()}`;
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

      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v${activeVersion.version_number}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const rawColumns = useMemo(() => {
    return activeVersion && Array.isArray(activeVersion.schema_json)
      ? (activeVersion.schema_json as Array<{ name: string }>).map((c) => c.name)
      : [];
  }, [activeVersion]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-500">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm font-medium">Loading dataset workspace...</span>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="min-h-screen bg-[#f8fafc] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-rose-600">{error ?? 'Dataset not found'}</p>
          <Link
            to="/dashboard"
            className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const userDisplayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Mukul';
  const avatarLetter = userDisplayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased">
      {/* Sidebar Navigation */}
      <AppSidebar
        activeItem="datasets"
        onNewDatasetClick={() => setIsUploadModalOpen(true)}
      />

      <div className="pl-60 min-h-screen flex flex-col">
        {/* Top Header matching 03 — DATA EXPLORER */}
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#eaecf0] bg-white px-8">
          <div className="flex items-center gap-4">
            {/* Large File Icon */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Link to="/dashboard" className="hover:text-slate-700">Datasets</Link>
                <span>›</span>
                <span className="text-slate-600 font-semibold">{dataset.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  {dataset.name}
                </h1>
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 font-mono">
                  v{activeVersion?.version_number ?? 1}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Customer churn dataset for subscription business
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Version Switcher if multiple versions */}
            {versions.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <span className="text-[10px] text-slate-500 font-medium px-1">Ver:</span>
                {versions.slice(0, 3).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => void handleSelectVersion(v)}
                    className={`px-2 py-0.5 text-xs rounded font-mono font-bold transition cursor-pointer ${
                      activeVersion?.id === v.id
                        ? 'bg-[#3b5bf6] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    v{v.version_number}
                  </button>
                ))}
              </div>
            )}

            {/* Run Agent button -> routes to Pipelines */}
            <button
              type="button"
              onClick={() => navigate(`/pipelines?datasetId=${dataset.id}`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
            >
              <span className="text-[#3b5bf6]">✨</span>
              Run Agent
            </button>

            {/* Create Pipeline button */}
            <button
              type="button"
              onClick={() => navigate(`/pipelines?datasetId=${dataset.id}`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b5bf6] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Create Pipeline
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Notification bell */}
            <button
              type="button"
              className="relative p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
            </button>

            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f46e5] text-white font-bold text-xs shadow-xs">
              {avatarLetter}
            </div>
          </div>
        </header>

        {/* Pipeline Stage Guidance Banner when routed from Pipeline Runner */}
        {pipelineStepFromUrl && dataset && (
          <div className="bg-[#eef2ff] border-b border-[#c7d2fe] px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3b5bf6] text-white font-bold text-xs shadow-xs">
                {pipelineStepFromUrl}
              </span>
              <div>
                <span className="font-bold text-slate-900">
                  Pipeline Stage {pipelineStepFromUrl} Workspace Active:
                </span>{' '}
                <span className="text-slate-600">
                  Perform your inspections, EDA, or data preprocessing in this tab. When satisfied, return to the pipeline to mark it completed.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  navigate(`/pipelines?datasetId=${dataset.id}&completedStep=${pipelineStepFromUrl}`)
                }
                className="rounded-lg bg-[#3b5bf6] px-3.5 py-1.5 font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer flex items-center gap-1.5"
              >
                <span>✓</span>
                <span>Mark Stage {pipelineStepFromUrl} Done & Return</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/pipelines?datasetId=${dataset.id}`)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
              >
                ← Return to Pipeline
              </button>
            </div>
          </div>
        )}

        {/* 5 Horizontal Tabs matching 03 — DATA EXPLORER */}
        <div className="bg-white border-b border-[#eaecf0] px-8 flex items-center gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3.5 text-xs font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'overview'
                ? 'border-[#3b5bf6] text-[#3b5bf6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('eda')}
            className={`py-3.5 text-xs font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'eda'
                ? 'border-[#3b5bf6] text-[#3b5bf6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            EDA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quality')}
            className={`py-3.5 text-xs font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'quality'
                ? 'border-[#3b5bf6] text-[#3b5bf6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Data Quality
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preprocessing')}
            className={`py-3.5 text-xs font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'preprocessing'
                ? 'border-[#3b5bf6] text-[#3b5bf6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Preprocessing
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`py-3.5 text-xs font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'features'
                ? 'border-[#3b5bf6] text-[#3b5bf6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Feature Insights
          </button>
        </div>

        {/* Main Workspace Body */}
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          {/* TAB 1: OVERVIEW matching 03 — DATA EXPLORER */}
          {activeTab === 'overview' && (
            <DatasetOverviewTab
              dataset={dataset}
              activeVersion={activeVersion}
              profile={profileSummary}
              correlationData={correlationData}
              onApplySuggestion={(actionType, column) => {
                if (column) {
                  void handleSendCopilotMessage(`Please ${actionType} the column "${column}"`);
                }
                setActiveTab('preprocessing');
              }}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}

          {/* TAB 2: EDA (Interactive Multi-Chart Studio) */}
          {activeTab === 'eda' && (
            <MultiChartStudio
              columns={profileSummary?.columns ?? []}
              rows={previewRows}
              correlationData={correlationData}
              datasetName={dataset.name}
              loading={profilingInProgress}
            />
          )}

          {/* TAB 3: DATA QUALITY (Column Inspector & Detailed Anomaly Breakdown) */}
          {activeTab === 'quality' && (
            <AnalyzeTab
              datasetName={dataset.name}
              sourceFormat={dataset.source_format}
              activeVersion={activeVersion}
              profile={profileSummary}
              onRefreshProfiling={
                activeVersion ? () => void runDuckDBProfiling(dataset, activeVersion) : undefined
              }
              profilingInProgress={profilingInProgress}
            />
          )}

          {/* TAB 4: PREPROCESSING (Live DuckDB Transformations + Copilot Chat) */}
          {activeTab === 'preprocessing' && (
            <PreprocessingStudio
              datasetName={dataset.name}
              versions={versions}
              activeVersion={activeVersion}
              columns={profileSummary?.columns ?? []}
              rows={previewRows}
              totalRows={activeVersion?.row_count ?? (profileSummary?.rowCount ?? 0)}
              onSelectVersion={(v) => void handleSelectVersion(v)}
              onApplyPlan={(plan) => executePipeline(plan)}
              onSendCopilotMessage={handleSendCopilotMessage}
              copilotLoading={copilotLoading}
              copilotMessages={copilotMessages}
            />
          )}

          {/* TAB 5: FEATURE INSIGHTS & EXPORT (ML Split & Sklearn Python Script) */}
          {activeTab === 'features' && (
            <AuditAndExportTab
              datasetName={dataset.name}
              versions={versions}
              activeVersion={activeVersion}
              columns={profileSummary?.columns ?? []}
              onDownloadParquet={() => void handleDownloadCleanData('parquet')}
              onDownloadCsv={() => void handleDownloadCleanData('csv')}
            />
          )}
        </main>
      </div>

      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onSaved={(creds) => setCredentials(creds)}
      />

      {activeVersion && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          activeVersion={activeVersion}
          dataset={dataset}
          profile={profileSummary}
        />
      )}

      <DatasetUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={(ds) => {
          setIsUploadModalOpen(false);
          navigate(`/datasets/${ds.id}`);
        }}
      />
    </div>
  );
}
