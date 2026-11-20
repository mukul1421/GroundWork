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
import { getSavedCredentials } from '@/integrations/ai/byokStorage';
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
import { proposePlanFromPrompt } from '@/engine/localAnalytics';
import {
  getLocalDatasetById,
  getActiveVersionOfDataset,
  selectLocalDatasetVersion,
  applyLocalPreprocessingPlan,
  serializeRowsToCsv,
  subscribeLocalWorkspace,
  type LocalDatasetRecord,
} from '@/storage/localWorkspaceStore';
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
  const { user, profile, isDemoMode } = useAuth();

  const tabFromUrl = searchParams.get('tab') as DetailTab | null;
  const pipelineStepFromUrl = searchParams.get('pipelineStep');

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetDescription, setDatasetDescription] = useState<string>('');
  const [activeVersion, setActiveVersion] = useState<DatasetVersion | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [versionChangelogs, setVersionChangelogs] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [profileSummary, setProfileSummary] = useState<DatasetProfileSummary | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationMatrixResult | null>(null);

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

  const [copilotMessages, setCopilotMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; plan?: PreprocessingPlan }>
  >([]);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [profilingInProgress, setProfilingInProgress] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Sync local sandbox dataset record cleanly
  const hydrateFromLocalDataset = useCallback((localDs: LocalDatasetRecord) => {
    setDataset(localDs);
    setDatasetDescription(localDs.description);
    setVersions(localDs.versions);
    const changelogs: Record<string, string> = {};
    localDs.versions.forEach((v) => {
      changelogs[v.id] = v.changelogSummary;
    });
    setVersionChangelogs(changelogs);

    const activeVer = getActiveVersionOfDataset(localDs);
    setActiveVersion(activeVer);
    setProfileSummary(activeVer.profile);
    setCorrelationData(activeVer.correlation);
    setPreviewRows(activeVer.rows);
    setLoading(false);
    setProfilingInProgress(false);
    setError(null);
  }, []);

  const runDuckDBProfiling = useCallback(
    async (ds: Dataset, ver: DatasetVersion) => {
      setProfilingInProgress(true);
      try {
        const { data: blob, error: downloadError } = await supabase.storage
          .from('datasets')
          .download(ver.storage_path);

        if (downloadError) throw downloadError;

        const db = await getDuckDB();
        const conn = await db.connect();
        const tableName = `dataset_${ver.id.replace(/-/g, '_')}`;
        const buffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

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

        const summary = await profileTable(conn, tableName);
        setProfileSummary(summary);

        const numericCols = summary.columns.filter((c) => c.isNumeric).map((c) => c.columnName);
        let computedCorrelation: CorrelationMatrixResult | null = null;
        if (numericCols.length > 1) {
          try {
            computedCorrelation = await computeCorrelationMatrix(conn, tableName, numericCols);
            setCorrelationData(computedCorrelation);
          } catch {
            // Non-critical correlation failure
          }
        }

        if (user) {
          try {
            await saveProfileToDatabase(ver.id, summary, computedCorrelation?.matrix ?? null);
          } catch {
            // Non-critical persistence error
          }
        }

        const previewResult = await conn.query(`SELECT * FROM ${tableName} LIMIT 200`);
        const rows: Record<string, unknown>[] = [];
        const fields = previewResult.schema.fields.map((f) => f.name);

        for (let i = 0; i < previewResult.numRows; i++) {
          const rowObj: Record<string, unknown> = {};
          for (const field of fields) {
            const val: unknown = previewResult.getChild(field)?.get(i);
            rowObj[field] = typeof val === 'bigint' ? Number(val) : val;
          }
          rows.push(rowObj);
        }
        setPreviewRows(rows);
        await conn.close();
      } catch (err) {
        setActionNotice({
          type: 'error',
          text: err instanceof Error ? err.message : 'DuckDB profiling failed.',
        });
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

    if (isDemoMode) {
      const localDs = getLocalDatasetById(id);
      if (!localDs) {
        setError('Dataset not found in workspace.');
        setLoading(false);
        return;
      }
      hydrateFromLocalDataset(localDs);
      return;
    }

    try {
      const { data: dsData, error: dsErr } = await supabase
        .from('datasets')
        .select('*')
        .eq('id', id)
        .single();

      if (dsErr) throw dsErr;
      setDataset(dsData);
      setDatasetDescription(
        `${dsData.source_format.toUpperCase()} dataset · ${dsData.source_filename}`,
      );

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
      setError(err instanceof Error ? err.message : 'Failed to load dataset');
    } finally {
      setLoading(false);
    }
  }, [id, isDemoMode, hydrateFromLocalDataset, runDuckDBProfiling]);

  useEffect(() => {
    void fetchDatasetData();
  }, [fetchDatasetData]);

  // Keep local sandbox synced if versions update
  useEffect(() => {
    if (!isDemoMode || !id) return;
    return subscribeLocalWorkspace(() => {
      const latest = getLocalDatasetById(id);
      if (latest) hydrateFromLocalDataset(latest);
    });
  }, [isDemoMode, id, hydrateFromLocalDataset]);

  const handleSelectVersion = async (v: DatasetVersion) => {
    if (isDemoMode && dataset) {
      selectLocalDatasetVersion(dataset.id, v.id);
      return;
    }

    setActiveVersion(v);
    setProfileSummary(null);
    setCorrelationData(null);
    setPreviewRows([]);

    if (dataset) {
      await supabase.from('datasets').update({ active_version_id: v.id }).eq('id', dataset.id);
      void runDuckDBProfiling(dataset, v);
    }
  };

  const executePipeline = async (plan: PreprocessingPlan): Promise<PreprocessingResult> => {
    if (!dataset || !activeVersion) {
      throw new Error('Dataset context unavailable.');
    }

    if (isDemoMode) {
      const { result } = applyLocalPreprocessingPlan(dataset.id, plan);
      setActionNotice({
        type: 'success',
        text: `Created new immutable version with ${result.transformedRowCount.toLocaleString()} rows and ${result.transformedColumnCount} columns.`,
      });
      return result;
    }

    if (!user) throw new Error('User session unavailable.');

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
        } catch {
          // Non-critical
        }
      }

      try {
        await saveProfileToDatabase(newVersionId, newSummary, newCorrelation?.matrix ?? null);
      } catch {
        // Non-critical
      }

      const prev100 = await conn.query(`SELECT * FROM ${targetTableName} LIMIT 100`);
      const updatedRows: Record<string, unknown>[] = [];
      const upFields = prev100.schema.fields.map((f) => f.name);
      for (let i = 0; i < prev100.numRows; i++) {
        const rowObj: Record<string, unknown> = {};
        for (const field of upFields) {
          const val: unknown = prev100.getChild(field)?.get(i);
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

  const rawColumns = useMemo(() => {
    if (profileSummary && profileSummary.columns.length > 0) {
      return profileSummary.columns.map((c) => c.columnName);
    }
    return activeVersion && Array.isArray(activeVersion.schema_json)
      ? (activeVersion.schema_json as Array<{ name: string }>).map((c) => c.name)
      : [];
  }, [activeVersion, profileSummary]);

  const handleSendCopilotMessage = async (msg: string) => {
    if (!dataset || !activeVersion) return;

    setCopilotLoading(true);
    setCopilotMessages((prev) => [...prev, { role: 'user', content: msg }]);

    try {
      const credentials = getSavedCredentials();
      if (!isDemoMode && credentials) {
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
      } else {
        // Built-in deterministic schema-aware planner — zero API key wall
        const proposed = proposePlanFromPrompt(msg, profileSummary);
        setCopilotMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: proposed.message,
            plan: proposed.plan ?? undefined,
          },
        ]);
      }
    } catch (err) {
      // Graceful fallback to deterministic planner if external provider fails
      const fallback = proposePlanFromPrompt(msg, profileSummary);
      setCopilotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fallback.plan
            ? fallback.message
            : `Unable to complete request: ${err instanceof Error ? err.message : 'Planning failed'}.`,
          plan: fallback.plan ?? undefined,
        },
      ]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleDownloadCleanData = async (format: 'parquet' | 'csv') => {
    if (!activeVersion || !dataset) return;
    setActionNotice(null);

    try {
      const safeName = dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

      if (isDemoMode) {
        const localDs = getLocalDatasetById(dataset.id);
        const verRecord =
          localDs?.versions.find((v) => v.id === activeVersion.id) ??
          (localDs ? getActiveVersionOfDataset(localDs) : null);
        if (!verRecord) throw new Error('Active version data unavailable.');

        const csvText = serializeRowsToCsv(verRecord.columns, verRecord.rows);
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const ext = format === 'parquet' ? 'csv' : 'csv';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}_v${activeVersion.version_number}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setActionNotice({
          type: 'success',
          text:
            format === 'parquet'
              ? `Downloaded ${safeName}_v${activeVersion.version_number}.csv (sandbox exports UTF-8 CSV; Parquet binary requires cloud storage).`
              : `Downloaded ${safeName}_v${activeVersion.version_number}.csv.`,
        });
        return;
      }

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
      a.download = `${safeName}_v${activeVersion.version_number}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Download failed.',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-500">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b5bf6] border-t-transparent" />
          <span className="text-sm font-medium">Loading dataset explorer...</span>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900">
        <AppSidebar activeItem="datasets" onNewDatasetClick={() => setIsUploadModalOpen(true)} />
        <div className="flex min-h-screen items-center justify-center px-6 py-12 lg:pl-60">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-rose-700">{error ?? 'Dataset not found'}</p>
            <Link
              to="/datasets"
              className="mt-4 inline-block text-xs font-semibold text-[#3b5bf6] hover:underline"
            >
              ← Return to Datasets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const userDisplayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Workspace User';
  const avatarLetter = userDisplayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased">
      <AppSidebar
        activeItem="datasets"
        onNewDatasetClick={() => setIsUploadModalOpen(true)}
      />

      <div className="flex min-h-screen flex-col lg:pl-60">
        {/* Top Explorer Header */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-[#eaecf0] bg-white px-4 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Link to="/datasets" className="hover:text-slate-700">
                  Datasets
                </Link>
                <span>›</span>
                <span className="truncate font-semibold text-slate-600">{dataset.name}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">
                  {dataset.name}
                </h1>
                <span className="shrink-0 font-mono text-xs font-semibold text-[#3b5bf6]">
                  v{activeVersion?.version_number ?? 1}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {datasetDescription ||
                  `${dataset.source_format.toUpperCase()} · ${(activeVersion?.row_count ?? 0).toLocaleString()} rows · ${activeVersion?.column_count ?? 0} columns`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {versions.length > 1 && (
              <div className="hidden items-center gap-1 rounded-lg bg-slate-100 p-1 sm:flex">
                {versions.slice(0, 4).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => void handleSelectVersion(v)}
                    className={`cursor-pointer rounded px-2 py-0.5 font-mono text-xs font-semibold transition ${
                      activeVersion?.id === v.id
                        ? 'bg-[#3b5bf6] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    v{v.version_number}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Export Artifacts
            </button>

            <button
              type="button"
              onClick={() => navigate(`/pipelines?datasetId=${dataset.id}`)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#3b5bf6] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Open Pipeline
            </button>

            <div className="hidden h-6 w-px bg-slate-200 sm:block" />

            <div
              title={userDisplayName}
              className="hidden h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white sm:flex"
            >
              {avatarLetter}
            </div>
          </div>
        </header>

        {/* Pipeline Stage Guidance Banner when routed from Pipeline Runner */}
        {pipelineStepFromUrl && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-xs sm:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3b5bf6] font-mono text-xs font-bold text-white">
                {pipelineStepFromUrl}
              </span>
              <div>
                <span className="font-bold text-slate-900">
                  Pipeline Stage {pipelineStepFromUrl} Active:
                </span>{' '}
                <span className="text-slate-600">
                  Inspect or transform your dataset here, then return to mark the stage complete.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  navigate(`/pipelines?datasetId=${dataset.id}&completedStep=${pipelineStepFromUrl}`)
                }
                className="cursor-pointer rounded-lg bg-[#3b5bf6] px-3.5 py-1.5 font-semibold text-white transition hover:bg-blue-700"
              >
                Mark Stage {pipelineStepFromUrl} Done
              </button>
              <button
                type="button"
                onClick={() => navigate(`/pipelines?datasetId=${dataset.id}`)}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                ← Back to Pipeline
              </button>
            </div>
          </div>
        )}

        {/* Inline Action Feedback Banner */}
        {actionNotice && (
          <div
            className={`flex items-center justify-between border-b px-4 py-2.5 text-xs sm:px-8 ${
              actionNotice.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span className="font-medium">{actionNotice.text}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="cursor-pointer font-semibold underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 5 Horizontal Tabs */}
        <div
          role="tablist"
          aria-label="Dataset explorer views"
          className="flex items-center gap-6 overflow-x-auto border-b border-[#eaecf0] bg-white px-4 sm:gap-8 sm:px-8"
        >
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'eda', label: 'EDA' },
              { id: 'quality', label: 'Data Quality' },
              { id: 'preprocessing', label: 'Preprocessing' },
              { id: 'features', label: 'Feature Insights' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 cursor-pointer whitespace-nowrap border-b-2 py-3.5 text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'border-[#3b5bf6] text-[#3b5bf6]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Workspace Body */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">
          {activeTab === 'overview' && (
            <DatasetOverviewTab
              dataset={dataset}
              activeVersion={activeVersion}
              profile={profileSummary}
              correlationData={correlationData}
              rows={previewRows}
              onApplySuggestion={(prompt) => {
                void handleSendCopilotMessage(prompt);
                setActiveTab('preprocessing');
              }}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'eda' && (
            <MultiChartStudio
              columns={profileSummary?.columns ?? []}
              rows={previewRows}
              correlationData={correlationData}
              datasetName={dataset.name}
              loading={profilingInProgress}
            />
          )}

          {activeTab === 'quality' && (
            <AnalyzeTab
              datasetName={dataset.name}
              sourceFormat={dataset.source_format}
              activeVersion={activeVersion}
              profile={profileSummary}
              onRefreshProfiling={
                activeVersion && !isDemoMode
                  ? () => void runDuckDBProfiling(dataset, activeVersion)
                  : undefined
              }
              profilingInProgress={profilingInProgress}
            />
          )}

          {activeTab === 'preprocessing' && (
            <PreprocessingStudio
              datasetName={dataset.name}
              versions={versions}
              activeVersion={activeVersion}
              columns={profileSummary?.columns ?? []}
              rows={previewRows}
              totalRows={activeVersion?.row_count ?? profileSummary?.rowCount ?? 0}
              onSelectVersion={(v) => void handleSelectVersion(v)}
              onApplyPlan={(plan) => executePipeline(plan)}
              onSendCopilotMessage={(msg) => void handleSendCopilotMessage(msg)}
              copilotLoading={copilotLoading}
              copilotMessages={copilotMessages}
            />
          )}

          {activeTab === 'features' && (
            <AuditAndExportTab
              datasetName={dataset.name}
              versions={versions}
              activeVersion={activeVersion}
              columns={profileSummary?.columns ?? []}
              versionChangelogs={versionChangelogs}
              onDownloadParquet={() => void handleDownloadCleanData('parquet')}
              onDownloadCsv={() => void handleDownloadCleanData('csv')}
            />
          )}
        </main>
      </div>

      {activeVersion && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          activeVersion={activeVersion}
          dataset={dataset}
          profile={profileSummary}
          onDownloadData={(fmt) => void handleDownloadCleanData(fmt)}
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
