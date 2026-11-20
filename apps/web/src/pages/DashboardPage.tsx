import { useState, useEffect, useCallback, useRef, type ChangeEvent, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { uploadDataset, deleteDataset } from '@/storage/datasetStorage';
import {
  getLocalWorkspaceSnapshot,
  subscribeLocalWorkspace,
  uploadLocalDataset,
  deleteLocalDataset,
  getActiveVersionOfDataset,
  type LocalActivityEvent,
} from '@/storage/localWorkspaceStore';
import {
  computeQualityScore,
  formatRelativeTime,
  getTimeOfDayGreeting,
} from '@/engine/localAnalytics';
import type { Dataset, DatasetVersion } from '@/types/database';

interface DatasetWithVersion extends Dataset {
  active_version?: DatasetVersion | null;
  computedQuality?: number | null;
}

export function DashboardPage() {
  const {
    user,
    profile,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    isDemoMode,
  } = useAuth();
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<DatasetWithVersion[]>([]);
  const [activities, setActivities] = useState<LocalActivityEvent[]>([]);
  const [pipelinesRunCount, setPipelinesRunCount] = useState<number>(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DatasetWithVersion | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingDirect, setUploadingDirect] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (type: 'error' | 'success', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => {
      setFeedback((cur) => (cur?.text === text ? null : cur));
    }, 4000);
  };

  const fetchDatasets = useCallback(async () => {
    if (isDemoMode) {
      const snap = getLocalWorkspaceSnapshot();
      const mapped: DatasetWithVersion[] = snap.datasets.map((ds) => {
        const activeVer = getActiveVersionOfDataset(ds);
        return {
          ...ds,
          active_version: activeVer,
          computedQuality: computeQualityScore(activeVer.profile),
        };
      });
      setDatasets(mapped);
      setActivities(snap.activities);
      setPipelinesRunCount(snap.pipelinesRun);
      return;
    }

    if (!activeWorkspace) return;

    try {
      const { data: datasetsData, error: dsError } = await supabase
        .from('datasets')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (dsError) throw dsError;

      if (datasetsData && datasetsData.length > 0) {
        const versionIds = datasetsData
          .map((d) => d.active_version_id)
          .filter((id): id is string => Boolean(id));

        let versionsMap: Record<string, DatasetVersion> = {};
        if (versionIds.length > 0) {
          const { data: versionsData } = await supabase
            .from('dataset_versions')
            .select('*')
            .in('id', versionIds);

          if (versionsData) {
            versionsMap = Object.fromEntries(versionsData.map((v) => [v.id, v]));
          }
        }

        const enriched: DatasetWithVersion[] = datasetsData.map((d) => ({
          ...d,
          active_version: d.active_version_id ? versionsMap[d.active_version_id] : null,
          computedQuality: null,
        }));
        setDatasets(enriched);
        setActivities(
          enriched.slice(0, 5).map((ds) => ({
            id: ds.id,
            title: 'Dataset synced',
            detail: `${ds.name} · ${(ds.active_version?.row_count ?? 0).toLocaleString()} rows`,
            timestamp: ds.updated_at,
            category: 'upload',
          })),
        );
      } else {
        setDatasets([]);
        setActivities([]);
      }
    } catch {
      showFeedback('error', 'Could not refresh datasets from remote workspace.');
    }
  }, [activeWorkspace, isDemoMode]);

  useEffect(() => {
    void fetchDatasets();
    if (isDemoMode) {
      return subscribeLocalWorkspace(() => {
        void fetchDatasets();
      });
    }
    return undefined;
  }, [fetchDatasets, isDemoMode]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (isDemoMode) {
        deleteLocalDataset(deleteTarget.id);
      } else if (user) {
        await deleteDataset(deleteTarget, user.id);
        await fetchDatasets();
      }
      showFeedback('success', `Removed "${deleteTarget.name}" from workspace.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDirectUpload = async (file: File) => {
    setUploadingDirect(true);
    try {
      if (isDemoMode) {
        const created = await uploadLocalDataset(file);
        navigate(`/datasets/${created.id}`);
        return;
      }
      if (!user || !activeWorkspace) return;
      const result = await uploadDataset({
        file,
        workspaceId: activeWorkspace.id,
        userId: user.id,
        customName: file.name.replace(/\.[^/.]+$/, ''),
      });
      await fetchDatasets();
      navigate(`/datasets/${result.dataset.id}`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingDirect(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      void handleDirectUpload(droppedFile);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      void handleDirectUpload(selectedFile);
    }
  };

  // Accurate workspace KPIs computed strictly from live workspace state
  const totalDatasets = datasets.length;
  const totalRowsCount = datasets.reduce(
    (acc, ds) => acc + (ds.active_version?.row_count ?? 0),
    0,
  );
  const scoredDatasets = datasets.filter(
    (d) => typeof d.computedQuality === 'number',
  );
  const avgQuality =
    scoredDatasets.length > 0
      ? (
          scoredDatasets.reduce((sum, d) => sum + (d.computedQuality ?? 0), 0) /
          scoredDatasets.length
        ).toFixed(1)
      : null;

  const userDisplayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Data Engineer';
  const greeting = getTimeOfDayGreeting();

  return (
    <div className="min-h-screen bg-[#fafafd] text-slate-900 antialiased">
      <AppSidebar
        activeItem="overview"
        onNewDatasetClick={() => setIsUploadModalOpen(true)}
      />

      <div className="lg:pl-60 min-h-screen flex flex-col">
        {/* Clean Single-Row Top Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-slate-900 tracking-tight truncate">
              {greeting}, {userDisplayName}
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {activeWorkspace?.name ?? 'Groundwork Workspace'} · Browser-local data preparation
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {workspaces.length > 1 && (
              <label className="sr-only" htmlFor="workspace-select">
                Active workspace
              </label>
            )}
            {workspaces.length > 1 && (
              <select
                id="workspace-select"
                value={activeWorkspace?.id ?? ''}
                onChange={(e) => {
                  const ws = workspaces.find((w) => w.id === e.target.value);
                  if (ws) setActiveWorkspace(ws);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="hidden sm:inline-flex rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 whitespace-nowrap cursor-pointer"
            >
              Upload Dataset
            </button>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl p-6 lg:p-8 space-y-6">
          {feedback && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${
                feedback.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Quick Ingestion Dropzone */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-md">
              <h2 className="font-display text-base font-bold text-slate-900 tracking-tight">
                Ingest a dataset into browser memory
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Drop any CSV, Excel, or JSON file to compute exact column profiles, visualize
                distributions, and generate reproducible Scikit-Learn preprocessing code.
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`w-full md:w-96 rounded-xl border border-dashed transition-colors p-5 text-center ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-50/60'
                  : 'border-slate-300 bg-[#fafafd] hover:border-indigo-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json,.jsonl"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <button
                type="button"
                disabled={uploadingDirect}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center cursor-pointer disabled:opacity-60"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 mb-2">
                  {uploadingDirect ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-800">
                  {uploadingDirect ? 'Parsing dataset...' : 'Drop CSV, Excel, or JSON here'}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  or <span className="text-indigo-600 font-medium">browse local files</span>
                </span>
              </button>
            </div>
          </section>

          {/* 4 Honest KPI Cards (strict tabular-nums, zero fabricated deltas) */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Workspace metrics">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Datasets</div>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {totalDatasets}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Active in workspace
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Total Rows</div>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {totalRowsCount.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Across active versions
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Avg. Quality Score</div>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {avgQuality !== null ? `${avgQuality}%` : '—'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {avgQuality !== null ? 'Computed from profiles' : 'Profile a dataset to score'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Pipelines Run</div>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {pipelinesRunCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Verified transformations
              </div>
            </div>
          </section>

          {/* Main 2-Column Split: Recent Datasets (8 cols) + Recent Activity (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-sm font-bold text-slate-900">Recent Datasets</h2>
                <Link
                  to="/datasets"
                  className="text-xs font-semibold text-[#3b63f6] hover:underline whitespace-nowrap"
                >
                  View all datasets
                </Link>
              </div>

              {datasets.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-700">No datasets in this workspace</p>
                  <p className="text-xs text-slate-500">
                    Upload a CSV, Excel, or JSON file above to begin profiling and cleaning.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile stacked dataset cards (< sm) */}
                  <div className="space-y-3 sm:hidden">
                    {datasets.slice(0, 6).map((ds) => {
                      const rowCount = ds.active_version?.row_count ?? 0;
                      const colCount = ds.active_version?.column_count ?? 0;
                      const quality = ds.computedQuality;

                      return (
                        <div
                          key={ds.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/datasets/${ds.id}`)}
                              className="text-left text-xs font-semibold text-slate-900 hover:text-[#3b63f6] truncate cursor-pointer"
                            >
                              {ds.name}
                            </button>
                            {typeof quality === 'number' && (
                              <span
                                className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                                  quality >= 90
                                    ? 'text-emerald-700'
                                    : quality >= 75
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                                }`}
                              >
                                {quality}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                            <span>
                              {rowCount.toLocaleString()} rows · {colCount} cols
                            </span>
                            <span className="font-sans">{formatRelativeTime(ds.updated_at)}</span>
                          </div>
                          <div className="flex items-center gap-4 border-t border-slate-200/80 pt-2 text-xs">
                            <button
                              type="button"
                              onClick={() => navigate(`/datasets/${ds.id}`)}
                              className="font-semibold text-[#3b63f6] hover:underline cursor-pointer"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/pipelines?datasetId=${ds.id}`)}
                              className="font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Pipeline
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${ds.name}`}
                              onClick={() => setDeleteTarget(ds)}
                              className="ml-auto font-medium text-rose-600 hover:text-rose-800 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table (>= sm) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="pb-3 font-medium">Name</th>
                          <th className="pb-3 font-medium text-right">Rows</th>
                          <th className="pb-3 font-medium text-right">Columns</th>
                          <th className="pb-3 font-medium text-right">Quality</th>
                          <th className="pb-3 font-medium pl-4">Updated</th>
                          <th className="pb-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {datasets.slice(0, 6).map((ds) => {
                          const rowCount = ds.active_version?.row_count ?? 0;
                          const colCount = ds.active_version?.column_count ?? 0;
                          const quality = ds.computedQuality;

                          return (
                            <tr key={ds.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-3.5 pr-4">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/datasets/${ds.id}`)}
                                  className="font-semibold text-slate-900 hover:text-[#3b63f6] transition text-left truncate max-w-[200px] block cursor-pointer"
                                >
                                  {ds.name}
                                </button>
                              </td>
                              <td className="py-3.5 px-2 text-right text-slate-600 font-mono tabular-nums">
                                {rowCount.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-2 text-right text-slate-600 font-mono tabular-nums">
                                {colCount}
                              </td>
                              <td className="py-3.5 px-2 text-right font-mono tabular-nums">
                                {typeof quality === 'number' ? (
                                  <span
                                    className={
                                      quality >= 90
                                        ? 'font-semibold text-emerald-700'
                                        : quality >= 75
                                          ? 'font-semibold text-amber-700'
                                          : 'font-semibold text-rose-700'
                                    }
                                  >
                                    {quality}%
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3.5 pl-4 text-slate-500 whitespace-nowrap">
                                {formatRelativeTime(ds.updated_at)}
                              </td>
                              <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/datasets/${ds.id}`)}
                                    className="font-semibold text-[#3b63f6] hover:underline cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/pipelines?datasetId=${ds.id}`)}
                                    className="font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                  >
                                    Pipeline
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${ds.name}`}
                                    onClick={() => setDeleteTarget(ds)}
                                    className="font-medium text-rose-600 hover:text-rose-800 cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-display text-sm font-bold text-slate-900 mb-4">
                Recent Activity
              </h2>
              {activities.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Workspace events will appear here after you upload or transform datasets.
                </p>
              ) : (
                <ol className="space-y-4">
                  {activities.slice(0, 5).map((event) => (
                    <li
                      key={event.id}
                      className="border-b border-slate-100 pb-3.5 last:border-none last:pb-0"
                    >
                      <div className="text-xs font-semibold text-slate-900">{event.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {event.detail} · {formatRelativeTime(event.timestamp)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </main>
      </div>

      {/* Accessible Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg space-y-4">
            <h2 id="dashboard-delete-title" className="font-display text-base font-bold text-slate-900">
              Delete dataset?
            </h2>
            <p className="text-xs leading-relaxed text-slate-600">
              Remove <strong className="text-slate-900">{deleteTarget.name}</strong> and its version
              history from this workspace?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                Delete Dataset
              </button>
            </div>
          </div>
        </div>
      )}

      <DatasetUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={(ds) => {
          setIsUploadModalOpen(false);
          void fetchDatasets();
          navigate(`/datasets/${ds.id}`);
        }}
      />
    </div>
  );
}
