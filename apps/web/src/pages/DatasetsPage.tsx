import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { deleteDataset } from '@/storage/datasetStorage';
import {
  getLocalWorkspaceSnapshot,
  subscribeLocalWorkspace,
  deleteLocalDataset,
  getActiveVersionOfDataset,
} from '@/storage/localWorkspaceStore';
import { computeQualityScore, formatRelativeTime } from '@/engine/localAnalytics';
import type { Dataset, DatasetVersion } from '@/types/database';

interface DatasetListItem extends Dataset {
  rowCount: number;
  columnCount: number;
  versionNumber: number;
  qualityScore: number | null;
  descriptionText: string;
}

export function DatasetsPage() {
  const { user, activeWorkspace, isDemoMode } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<DatasetListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'csv' | 'xlsx' | 'json'>('all');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DatasetListItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage((cur) => (cur === msg ? null : cur)), 3500);
  };

  const loadDatasets = useCallback(async () => {
    if (isDemoMode) {
      const snap = getLocalWorkspaceSnapshot();
      setItems(
        snap.datasets.map((ds) => {
          const ver = getActiveVersionOfDataset(ds);
          return {
            ...ds,
            rowCount: ver.row_count,
            columnCount: ver.column_count,
            versionNumber: ver.version_number,
            qualityScore: computeQualityScore(ver.profile),
            descriptionText: ds.description,
          };
        }),
      );
      return;
    }

    if (!activeWorkspace) return;
    try {
      const { data: dsRows, error } = await supabase
        .from('datasets')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (error || !dsRows) return;

      const versionIds = dsRows
        .map((d) => d.active_version_id)
        .filter((id): id is string => Boolean(id));

      let verMap: Record<string, DatasetVersion> = {};
      if (versionIds.length > 0) {
        const { data: vers } = await supabase
          .from('dataset_versions')
          .select('*')
          .in('id', versionIds);
        if (vers) {
          verMap = Object.fromEntries(vers.map((v) => [v.id, v]));
        }
      }

      setItems(
        dsRows.map((d) => {
          const ver = d.active_version_id ? verMap[d.active_version_id] : undefined;
          return {
            ...d,
            rowCount: ver?.row_count ?? 0,
            columnCount: ver?.column_count ?? 0,
            versionNumber: ver?.version_number ?? 1,
            qualityScore: null,
            descriptionText: `${d.source_format.toUpperCase()} dataset`,
          };
        }),
      );
    } catch {
      // Graceful fallback
    }
  }, [activeWorkspace, isDemoMode]);

  useEffect(() => {
    void loadDatasets();
    if (isDemoMode) {
      return subscribeLocalWorkspace(() => {
        void loadDatasets();
      });
    }
    return undefined;
  }, [loadDatasets, isDemoMode]);

  const filtered = items.filter((item) => {
    if (formatFilter !== 'all') {
      if (formatFilter === 'json' && item.source_format !== 'json' && item.source_format !== 'jsonl') {
        return false;
      }
      if (formatFilter !== 'json' && item.source_format !== formatFilter) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.descriptionText.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (isDemoMode) {
        deleteLocalDataset(deleteTarget.id);
      } else if (user) {
        await deleteDataset(deleteTarget, user.id);
        await loadDatasets();
      }
      showToast(`Deleted "${deleteTarget.name}".`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete dataset.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <AppSidebar activeItem="datasets" onNewDatasetClick={() => setIsUploadOpen(true)} />

      <div className="lg:pl-60 min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-slate-900 tracking-tight truncate">
              Datasets
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {items.length} dataset{items.length === 1 ? '' : 's'} available in{' '}
              {activeWorkspace?.name ?? 'your workspace'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="rounded-lg bg-[#3b63f6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#2f54e0] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upload Dataset
          </button>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl p-6 lg:p-8 space-y-6">
          {toastMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800"
            >
              {toastMessage}
            </div>
          )}

          {/* Filter & Search Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative w-full sm:w-72">
              <label htmlFor="dataset-library-search" className="sr-only">
                Search datasets
              </label>
              <input
                id="dataset-library-search"
                type="search"
                placeholder="Search datasets by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-[#3b63f6] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['all', 'csv', 'xlsx', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatFilter(fmt)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                    formatFilter === fmt
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {fmt === 'all' ? 'All Formats' : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Dataset Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  {items.length === 0 ? 'No datasets uploaded yet' : 'No datasets match your filters'}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload a CSV, Excel, or JSON file to inspect column statistics, visualize
                  distributions, and prepare clean training splits.
                </p>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="mt-2 rounded-lg bg-[#3b63f6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2f54e0] transition cursor-pointer"
                >
                  Upload First Dataset
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                    <tr>
                      <th className="py-3 pl-5 pr-4 font-medium">Dataset</th>
                      <th className="py-3 px-4 font-medium">Format</th>
                      <th className="py-3 px-4 font-medium text-right">Rows</th>
                      <th className="py-3 px-4 font-medium text-right">Columns</th>
                      <th className="py-3 px-4 font-medium text-right">Quality</th>
                      <th className="py-3 px-4 font-medium">Updated</th>
                      <th className="py-3 pl-4 pr-5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((ds) => (
                      <tr
                        key={ds.id}
                        className="hover:bg-slate-50/80 transition"
                      >
                        <td className="py-3.5 pl-5 pr-4">
                          <button
                            type="button"
                            onClick={() => navigate(`/datasets/${ds.id}`)}
                            className="text-left group cursor-pointer"
                          >
                            <div className="font-semibold text-slate-900 group-hover:text-[#3b63f6] transition">
                              {ds.name}
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {ds.descriptionText}
                            </div>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 uppercase">
                          {ds.source_format} · v{ds.versionNumber}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                          {ds.rowCount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                          {ds.columnCount}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          {ds.qualityScore !== null ? (
                            <span
                              className={
                                ds.qualityScore >= 90
                                  ? 'font-semibold text-emerald-700'
                                  : ds.qualityScore >= 75
                                    ? 'font-semibold text-amber-700'
                                    : 'font-semibold text-rose-700'
                              }
                            >
                              {ds.qualityScore}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {formatRelativeTime(ds.updated_at)}
                        </td>
                        <td className="py-3.5 pl-4 pr-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/datasets/${ds.id}`)}
                              className="text-xs font-semibold text-[#3b63f6] hover:underline cursor-pointer"
                            >
                              Explore
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/pipelines?datasetId=${ds.id}`)}
                              className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Pipeline
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${ds.name}`}
                              onClick={() => setDeleteTarget(ds)}
                              className="text-xs font-medium text-rose-600 hover:text-rose-800 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Accessible Delete Confirmation Dialog (replaces banned window.confirm) */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-ds-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg space-y-4">
            <h2 id="delete-ds-title" className="font-display text-base font-bold text-slate-900">
              Delete dataset?
            </h2>
            <p className="text-xs leading-relaxed text-slate-600">
              Are you sure you want to remove <strong className="text-slate-900">{deleteTarget.name}</strong> and
              all of its version snapshots? This action cannot be undone.
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
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                Delete Dataset
              </button>
            </div>
          </div>
        </div>
      )}

      <DatasetUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={(ds) => {
          setIsUploadOpen(false);
          navigate(`/datasets/${ds.id}`);
        }}
      />
    </div>
  );
}
