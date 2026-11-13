import { useState, useEffect, useCallback, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { deleteDataset } from '@/storage/datasetStorage';
import type { Dataset, DatasetVersion } from '@/types/database';

interface DatasetWithVersion extends Dataset {
  active_version?: DatasetVersion | null;
}

export function DashboardPage() {
  const {
    user,
    profile,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    signOut,
    refreshWorkspaces,
  } = useAuth();
  const navigate = useNavigate();

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [datasets, setDatasets] = useState<DatasetWithVersion[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDatasets = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoadingDatasets(true);

    try {
      const { data: datasetsData, error: dsError } = await supabase
        .from('datasets')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (dsError) throw dsError;

      if (datasetsData.length > 0) {
        // Fetch active versions for these datasets
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
        }));
        setDatasets(enriched);
      } else {
        setDatasets([]);
      }
    } catch {
      // Quiet fail
    } finally {
      setLoadingDatasets(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    void fetchDatasets();
  }, [fetchDatasets]);

  const handleCreateWorkspace = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !user) return;
    setWorkspaceError(null);

    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        owner_id: user.id,
        name: newWorkspaceName.trim(),
      })
      .select()
      .single();

    if (error) {
      setWorkspaceError(error.message);
    } else {
      setNewWorkspaceName('');
      setCreatingWorkspace(false);
      await refreshWorkspaces();
      setActiveWorkspace(data);
    }
  };

  const handleDeleteDataset = async (dataset: Dataset) => {
    if (!user) return;
    if (!window.confirm(`Are you sure you want to delete dataset "${dataset.name}"?`)) {
      return;
    }

    setDeletingId(dataset.id);
    try {
      await deleteDataset(dataset, user.id);
      await fetchDatasets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const totalStorageBytes = datasets.reduce(
    (acc, ds) => acc + (ds.active_version?.file_size_bytes ?? 0),
    0,
  );
  const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 font-bold text-white shadow-md">
                G
              </span>
              <span className="text-xl font-bold tracking-tight text-white">Groundwork</span>
            </div>

            {/* Workspace Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Workspace:</span>
              <select
                value={activeWorkspace?.id ?? ''}
                onChange={(e) => {
                  const ws = workspaces.find((w) => w.id === e.target.value);
                  if (ws) setActiveWorkspace(ws);
                }}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setCreatingWorkspace((prev) => !prev)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                title="Create Workspace"
              >
                + New
              </button>
            </div>
          </div>

          {/* User profile & Sign out */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium text-slate-200">
                {profile?.display_name ?? user?.email ?? 'User'}
              </p>
              <p className="text-[10px] text-slate-400">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-700 hover:bg-rose-950/30 hover:text-rose-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Workspace Creation Inline Modal */}
        {creatingWorkspace && (
          <form
            onSubmit={(e) => {
              void handleCreateWorkspace(e);
            }}
            className="mb-8 rounded-lg border border-sky-500/30 bg-sky-950/20 p-4"
          >
            <h3 className="text-sm font-semibold text-sky-300">Create New Workspace</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Each workspace provides an isolated environment for datasets and pipelines.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                required
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Workspace name (e.g. Sales Analysis)"
                className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreatingWorkspace(false)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
            {workspaceError && <p className="mt-2 text-xs text-rose-400">{workspaceError}</p>}
          </form>
        )}

        {/* Dashboard Overview Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Active Workspace Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Active Workspace
            </div>
            <div className="mt-2 text-xl font-bold text-sky-400">
              {activeWorkspace?.name ?? 'No Workspace Selected'}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Owner ID: {user?.id.slice(0, 8)}... (RLS Enforced)
            </p>
          </div>

          {/* Storage Quota Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Storage Usage
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-400">
              {totalStorageMB} MB / 40 MB
            </div>
            <p className="mt-1 text-xs text-slate-500">Free-tier allocation for private datasets</p>
          </div>

          {/* AI Provider Status Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              AI Copilot (BYOK)
            </div>
            <div className="mt-2 text-xl font-bold text-slate-300">Not Connected</div>
            <p className="mt-1 text-xs text-slate-500">
              Deterministic profiling & EDA available without key
            </p>
          </div>
        </div>

        {/* Datasets Section */}
        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-800/30 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Datasets</h2>
              <p className="text-xs text-slate-400">
                Upload and manage files inside this workspace
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-sky-400"
            >
              + Upload Dataset
            </button>
          </div>

          {/* Datasets List / Table */}
          {loadingDatasets ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Loading workspace datasets...
            </div>
          ) : datasets.length === 0 ? (
            /* Empty State */
            <div className="mt-8 rounded-lg border border-dashed border-slate-700/60 p-10 text-center">
              <p className="text-sm font-medium text-slate-300">
                No datasets uploaded to this workspace yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Click &ldquo;+ Upload Dataset&rdquo; above to upload your first CSV, XLSX, JSON, or
                JSONL file.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-300">Dataset Name</th>
                    <th className="px-4 py-3 font-semibold text-slate-300">Format</th>
                    <th className="px-4 py-3 font-semibold text-slate-300">Dimensions</th>
                    <th className="px-4 py-3 font-semibold text-slate-300">Size</th>
                    <th className="px-4 py-3 font-semibold text-slate-300">Version</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {datasets.map((ds) => (
                    <tr key={ds.id} className="transition hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            void navigate(`/datasets/${ds.id}`);
                          }}
                          className="font-medium text-sky-400 hover:underline"
                        >
                          {ds.name}
                        </button>
                        <p className="text-[10px] text-slate-500">{ds.source_filename}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-sky-400">
                          {ds.source_format}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {ds.active_version
                          ? `${ds.active_version.row_count.toLocaleString()} rows × ${ds.active_version.column_count} cols`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {ds.active_version
                          ? `${(ds.active_version.file_size_bytes / 1024).toFixed(1)} KB`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/40">
                          v{ds.active_version?.version_number ?? 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigate(`/datasets/${ds.id}`);
                            }}
                            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                          >
                            Explore
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === ds.id}
                            onClick={() => {
                              void handleDeleteDataset(ds);
                            }}
                            className="rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50"
                          >
                            {deletingId === ds.id ? 'Deleting...' : 'Delete'}
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

      {/* Upload Modal */}
      <DatasetUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={() => {
          void fetchDatasets();
        }}
      />
    </div>
  );
}
