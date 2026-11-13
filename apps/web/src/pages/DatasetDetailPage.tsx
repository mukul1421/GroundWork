import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth, supabase } from '@/integrations/supabase';
import { deleteDataset } from '@/storage/datasetStorage';
import { DatasetPreviewTable } from '@/components/datasets/DatasetPreviewTable';
import { DatasetProfileView } from '@/components/profiling/DatasetProfileView';
import { getDuckDB } from '@/engine/duckdb/duckdbClient';
import {
  profileTable,
  saveProfileToDatabase,
  type DatasetProfileSummary,
} from '@/engine/profiling/datasetProfiler';
import type { Dataset, DatasetVersion } from '@/types/database';

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [activeVersion, setActiveVersion] = useState<DatasetVersion | null>(null);
  const [allVersions, setAllVersions] = useState<DatasetVersion[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [profileSummary, setProfileSummary] = useState<DatasetProfileSummary | null>(null);

  const [activeTab, setActiveTab] = useState<'profiling' | 'preview'>('profiling');
  const [loading, setLoading] = useState(true);
  const [profilingInProgress, setProfilingInProgress] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDuckDBProfiling = useCallback(
    async (ds: Dataset, ver: DatasetVersion) => {
      setProfilingInProgress(true);
      try {
        // 1. Download file blob from private storage
        const { data: blob, error: downloadError } = await supabase.storage
          .from('datasets')
          .download(ver.storage_path);

        if (downloadError) throw downloadError;

        // 2. Initialize DuckDB-Wasm
        const db = await getDuckDB();
        const conn = await db.connect();
        const tableName = `dataset_${ver.id.replace(/-/g, '_')}`;
        const buffer = await blob.arrayBuffer();

        // 3. Register and load table into DuckDB
        if (ds.source_format === 'xlsx') {
          const wb = XLSX.read(buffer, { type: 'array' });
          const firstSheet = wb.SheetNames[0];
          if (!firstSheet) throw new Error('No sheet found in workbook');
          const sheet = wb.Sheets[firstSheet];
          if (!sheet) throw new Error('Could not read sheet');
          const csvText = XLSX.utils.sheet_to_csv(sheet);
          await db.registerFileText(`${tableName}.csv`, csvText);
          await conn.query(
            `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${tableName}.csv')`,
          );
        } else if (ds.source_format === 'csv') {
          await db.registerFileBuffer(`${tableName}.csv`, new Uint8Array(buffer));
          await conn.query(
            `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${tableName}.csv')`,
          );
        } else if (ds.source_format === 'json') {
          await db.registerFileBuffer(`${tableName}.json`, new Uint8Array(buffer));
          await conn.query(
            `CREATE TABLE ${tableName} AS SELECT * FROM read_json_auto('${tableName}.json')`,
          );
        } else {
          // jsonl
          await db.registerFileBuffer(`${tableName}.jsonl`, new Uint8Array(buffer));
          await conn.query(
            `CREATE TABLE ${tableName} AS SELECT * FROM read_ndjson_auto('${tableName}.jsonl')`,
          );
        }

        // 4. Run profiling computations
        const summary = await profileTable(conn, tableName);
        setProfileSummary(summary);

        // 5. Save compact summary to PostgreSQL
        await saveProfileToDatabase(ver.id, summary);
        await conn.close();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'DuckDB profiling failed');
      } finally {
        setProfilingInProgress(false);
      }
    },
    [],
  );

  const fetchDatasetDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch dataset
      const { data: dsData, error: dsError } = await supabase
        .from('datasets')
        .select('*')
        .eq('id', id)
        .single();

      if (dsError) throw new Error(dsError.message);
      setDataset(dsData);

      // 2. Fetch versions
      const { data: verData, error: verError } = await supabase
        .from('dataset_versions')
        .select('*')
        .eq('dataset_id', id)
        .order('version_number', { ascending: false });

      if (verError) throw new Error(verError.message);
      setAllVersions(verData);

      const currentVer =
        verData.find((v) => v.id === dsData.active_version_id) ?? verData[0] ?? null;
      setActiveVersion(currentVer);

      // 3. Generate preview rows from schema_json
      if (currentVer && Array.isArray(currentVer.schema_json)) {
        const schema = currentVer.schema_json as Array<{
          name: string;
          sampleValues?: unknown[];
        }>;
        const maxSamples = Math.max(...schema.map((s) => s.sampleValues?.length ?? 0), 0);
        const rows: Record<string, unknown>[] = [];
        for (let i = 0; i < maxSamples; i++) {
          const row: Record<string, unknown> = {};
          schema.forEach((col) => {
            row[col.name] = col.sampleValues?.[i] ?? null;
          });
          rows.push(row);
        }
        setPreviewRows(rows);
      }

      // 4. Check for existing profile in dataset_profiles
      if (currentVer) {
        const { data: existingProfile } = await supabase
          .from('dataset_profiles')
          .select('*')
          .eq('dataset_version_id', currentVer.id)
          .maybeSingle();

        if (existingProfile) {
          // Fetch column profiles
          const { data: colProfiles } = await supabase
            .from('column_profiles')
            .select('*')
            .eq('dataset_version_id', currentVer.id);

          const dsProf = (existingProfile.profile_json ?? {}) as {
            rowCount?: number;
            columnCount?: number;
            duplicateRowsCount?: number;
            constantColumnsCount?: number;
            overallMissingRate?: number;
          };

          setProfileSummary({
            rowCount: dsProf.rowCount ?? currentVer.row_count,
            columnCount: dsProf.columnCount ?? currentVer.column_count,
            duplicateRowsCount: dsProf.duplicateRowsCount ?? 0,
            constantColumnsCount: dsProf.constantColumnsCount ?? 0,
            overallMissingRate: dsProf.overallMissingRate ?? 0,
            columns: (colProfiles ?? []).map((cp) => ({
              columnName: cp.column_name,
              inferredType: cp.inferred_type,
              isNumeric:
                cp.inferred_type.includes('INT') ||
                cp.inferred_type.includes('DOUBLE') ||
                cp.inferred_type.includes('FLOAT'),
              nullable: cp.nullable,
              missingCount: cp.missing_count,
              missingPercent:
                currentVer.row_count > 0 ? (cp.missing_count / currentVer.row_count) * 100 : 0,
              distinctCount: cp.distinct_count,
              uniquenessPercent:
                currentVer.row_count > 0 ? (cp.distinct_count / currentVer.row_count) * 100 : 0,
              isConstant: cp.distinct_count === 1,
              isPrimaryKeyCandidate:
                cp.distinct_count === currentVer.row_count && cp.missing_count === 0,
              stats: cp.stats_json as unknown as DatasetProfileSummary['columns'][0]['stats'],
            })),
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dataset');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchDatasetDetails();
  }, [fetchDatasetDetails]);

  const handleDelete = async () => {
    if (!dataset || !user) return;
    if (!window.confirm(`Are you sure you want to delete dataset "${dataset.name}"?`)) {
      return;
    }

    setDeleting(true);
    try {
      await deleteDataset(dataset, user.id);
      void navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent"></div>
          <span className="text-sm">Loading dataset details...</span>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="min-h-screen bg-slate-900 px-6 py-12 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-xl border border-rose-800/60 bg-rose-950/30 p-6 text-center">
          <p className="text-sm text-rose-300">{error ?? 'Dataset not found'}</p>
          <Link
            to="/dashboard"
            className="mt-4 inline-block text-xs font-semibold text-sky-400 hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const columns =
    activeVersion && Array.isArray(activeVersion.schema_json)
      ? (activeVersion.schema_json as Array<{ name: string }>).map((c) => c.name)
      : [];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Navigation header */}
      <header className="border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-xs text-slate-400 transition hover:text-white">
              ← Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-sky-400">
                {dataset.source_format}
              </span>
              <h1 className="text-base font-bold text-white">{dataset.name}</h1>
              {activeVersion && (
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                  v{activeVersion.version_number}
                  {allVersions.length > 1 ? ` (${allVersions.length} versions)` : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeVersion && (
              <button
                type="button"
                disabled={profilingInProgress}
                onClick={() => {
                  void runDuckDBProfiling(dataset, activeVersion);
                }}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-sky-400 disabled:opacity-50"
              >
                {profilingInProgress ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    DuckDB Profiling...
                  </span>
                ) : (
                  '⚡ Run DuckDB Deep Profiling'
                )}
              </button>
            )}

            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                void handleDelete();
              }}
              className="rounded-md border border-rose-900/60 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-900/50 hover:text-white disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Dataset'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Navigation Tabs */}
        <div className="mb-6 flex border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('profiling')}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'profiling'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            📊 In-Depth Profiling & Quality
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'preview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            📋 Raw Data Sample Preview
          </button>
        </div>

        {activeTab === 'profiling' ? (
          <div>
            {profileSummary ? (
              <DatasetProfileView
                profile={profileSummary}
                refreshing={profilingInProgress}
                onRefresh={() => {
                  if (activeVersion) void runDuckDBProfiling(dataset, activeVersion);
                }}
              />
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
                  ⚡
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">
                  DuckDB In-Browser Analytical Profiling
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
                  Compute deep column statistics, exact duplicate counts, missingness patterns, and
                  outlier detection using local WebAssembly.
                </p>
                <button
                  type="button"
                  disabled={profilingInProgress || !activeVersion}
                  onClick={() => {
                    if (activeVersion) void runDuckDBProfiling(dataset, activeVersion);
                  }}
                  className="mt-6 rounded-lg bg-sky-500 px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-sky-400 disabled:opacity-50"
                >
                  {profilingInProgress ? 'Analyzing in Web Worker...' : 'Start Profiling Now'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Preview Tab */
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Sample Data Preview</h2>
                <p className="text-xs text-slate-400">
                  Source file: <span className="font-mono text-slate-300">{dataset.source_filename}</span>
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {activeVersion?.row_count.toLocaleString() ?? '—'} rows · {columns.length} columns
              </span>
            </div>

            <DatasetPreviewTable
              columns={columns}
              rows={previewRows}
              totalRowsEstimate={activeVersion?.row_count}
              maxDisplayRows={15}
            />
          </div>
        )}
      </main>
    </div>
  );
}
