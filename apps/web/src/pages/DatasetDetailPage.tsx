import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { deleteDataset } from '@/storage/datasetStorage';
import { DatasetPreviewTable } from '@/components/datasets/DatasetPreviewTable';
import type { Dataset, DatasetVersion } from '@/types/database';

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [activeVersion, setActiveVersion] = useState<DatasetVersion | null>(null);
  const [allVersions, setAllVersions] = useState<DatasetVersion[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      if (dsError) {
        throw new Error(dsError.message);
      }
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

      // 3. Generate preview rows from schema_json if available
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
            </div>
          </div>

          <div className="flex items-center gap-3">
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
        {/* Metric Overview Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Total Rows (Est.)
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {activeVersion?.row_count.toLocaleString() ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Columns
            </p>
            <p className="mt-1 text-2xl font-bold text-sky-400">
              {activeVersion?.column_count ?? 0}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              File Size
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {activeVersion ? `${(activeVersion.file_size_bytes / 1024).toFixed(1)} KB` : '—'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Active Version
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              v{activeVersion?.version_number ?? 1}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({allVersions.length} total)
              </span>
            </p>
          </div>
        </div>

        {/* Column Badges */}
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-800/30 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Detected Columns ({columns.length})
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {columns.map((col) => (
              <span
                key={col}
                className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 font-mono text-xs text-slate-200"
              >
                {col}
              </span>
            ))}
          </div>
        </div>

        {/* Sample Preview Table */}
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-800/30 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Sample Data Preview</h2>
              <p className="text-xs text-slate-400">
                Client-side preview parsed before DuckDB deep profiling (M3)
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Source file:{' '}
              <span className="font-mono text-slate-300">{dataset.source_filename}</span>
            </div>
          </div>

          <DatasetPreviewTable
            columns={columns}
            rows={previewRows}
            totalRowsEstimate={activeVersion?.row_count}
            maxDisplayRows={10}
          />
        </div>
      </main>
    </div>
  );
}
