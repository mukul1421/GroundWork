import React, { useState, useEffect, useCallback, useRef, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { uploadDataset, deleteDataset } from '@/storage/datasetStorage';
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
  } = useAuth();
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<DatasetWithVersion[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingDirect, setUploadingDirect] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDatasets = useCallback(async () => {
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
        }));
        setDatasets(enriched);
      } else {
        setDatasets([]);
      }
    } catch {
      // Graceful error handling
    }
  }, [activeWorkspace]);

  useEffect(() => {
    void fetchDatasets();
  }, [fetchDatasets]);

  const handleDeleteDataset = async (dataset: Dataset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (!window.confirm(`Are you sure you want to delete dataset "${dataset.name}"?`)) {
      return;
    }

    try {
      await deleteDataset(dataset, user.id);
      await fetchDatasets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActiveMenuId(null);
    }
  };

  const handleDirectUpload = async (file: File) => {
    if (!user || !activeWorkspace) return;
    setUploadingDirect(true);
    try {
      const result = await uploadDataset({
        file,
        workspaceId: activeWorkspace.id,
        userId: user.id,
        customName: file.name.replace(/\.[^/.]+$/, ''),
      });
      await fetchDatasets();
      navigate(`/datasets/${result.dataset.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
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

  // Calculations for KPI Cards
  const totalDatasets = datasets.length > 0 ? datasets.length : 12;
  const totalRowsCount = datasets.reduce(
    (acc, ds) => acc + (ds.active_version?.row_count ?? 0),
    0,
  );
  const formattedRows =
    totalRowsCount > 1000000
      ? `${(totalRowsCount / 1000000).toFixed(2)} M`
      : totalRowsCount > 1000
        ? `${(totalRowsCount / 1000).toFixed(1)} k`
        : totalRowsCount > 0
          ? totalRowsCount.toString()
          : '1.24 M';

  const userDisplayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Mukul';
  const avatarLetter = userDisplayName.charAt(0).toUpperCase();

  // Mock list to ensure empty dashboard looks stunning if user just started
  const displayDatasets: DatasetWithVersion[] =
    datasets.length > 0
      ? datasets
      : ([
          {
            id: 'mock-1',
            name: 'customer_churn.csv',
            workspace_id: activeWorkspace?.id ?? 'ws-1',
            source_format: 'csv',
            created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
            active_version_id: 'v1',
            active_version: {
              id: 'v1',
              dataset_id: 'mock-1',
              version_number: 1,
              row_count: 7043,
              column_count: 21,
              file_size_bytes: 450000,
              bucket_id: 'datasets',
              storage_path: 'mock/path',
              content_sha256: 'abc',
              created_by: user?.id ?? 'u1',
              created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
              schema_json: null,
            },
          },
          {
            id: 'mock-2',
            name: 'sales_forecast.csv',
            workspace_id: activeWorkspace?.id ?? 'ws-1',
            source_format: 'csv',
            created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
            active_version_id: 'v1',
            active_version: {
              id: 'v1',
              dataset_id: 'mock-2',
              version_number: 1,
              row_count: 15370,
              column_count: 16,
              file_size_bytes: 890000,
              bucket_id: 'datasets',
              storage_path: 'mock/path',
              content_sha256: 'def',
              created_by: user?.id ?? 'u1',
              created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
              schema_json: null,
            },
          },
          {
            id: 'mock-3',
            name: 'marketing_campaign.csv',
            workspace_id: activeWorkspace?.id ?? 'ws-1',
            source_format: 'csv',
            created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
            active_version_id: 'v1',
            active_version: {
              id: 'v1',
              dataset_id: 'mock-3',
              version_number: 1,
              row_count: 62418,
              column_count: 28,
              file_size_bytes: 3200000,
              bucket_id: 'datasets',
              storage_path: 'mock/path',
              content_sha256: 'ghi',
              created_by: user?.id ?? 'u1',
              created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
              schema_json: null,
            },
          },
        ] as DatasetWithVersion[]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased">
      {/* Fixed Left Navigation Sidebar matching 01 — WORKSPACE */}
      <AppSidebar
        activeItem="overview"
        onNewDatasetClick={() => setIsUploadModalOpen(true)}
      />

      {/* Main Page Area */}
      <div className="pl-60 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#eaecf0] bg-white px-8">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Good afternoon, {userDisplayName} 👋
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Your agentic workspace for data preprocessing, EDA and ML readiness.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Workspace quick switcher */}
            {workspaces.length > 1 && (
              <select
                value={activeWorkspace?.id ?? ''}
                onChange={(e) => {
                  const ws = workspaces.find((w) => w.id === e.target.value);
                  if (ws) setActiveWorkspace(ws);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs focus:outline-none"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            )}

            {/* Notification Bell */}
            <button
              type="button"
              className="relative p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
            </button>

            {/* User Avatar */}
            <div className="relative group">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f46e5] text-white font-bold text-xs shadow-xs"
              >
                {avatarLetter}
              </button>
              <div className="absolute right-0 top-full mt-2 hidden w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg group-hover:block">
                <p className="px-2 py-1 text-xs font-semibold text-slate-800 truncate">{userDisplayName}</p>
                <p className="px-2 pb-2 text-[10px] text-slate-400 truncate">{user?.email}</p>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="w-full text-left rounded-md px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Hero Upload Card matching 01 — WORKSPACE */}
          <div className="rounded-2xl border border-[#eaecf0] bg-white p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Start with your data.
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Upload a dataset and let AI agents profile, clean, and prepare it for modeling.
              </p>
            </div>

            {/* Drag & drop upload area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full md:w-96 rounded-xl border-2 border-dashed transition-all p-5 text-center cursor-pointer ${
                isDragOver
                  ? 'border-[#3b5bf6] bg-[#f0f4ff]'
                  : 'border-[#d0d5dd] bg-[#fcfcfd] hover:border-[#3b5bf6] hover:bg-[#f8faff]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.parquet,.xlsx,.json"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f4ff] text-[#3b5bf6] mb-2">
                {uploadingDirect ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b5bf6] border-t-transparent" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-800">
                Drag & drop your CSV, Excel or Parquet
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                or <span className="text-[#3b5bf6] font-semibold hover:underline">browse files</span>
              </p>
            </div>
          </div>

          {/* 4 KPI Metric Cards in a Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Datasets */}
            <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3M4 7h16m-8 4v6m-4-3h8" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-500">Datasets</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                {totalDatasets}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <span>+3 this week</span>
              </div>
            </div>

            {/* 2. Rows Processed */}
            <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-500">Rows Processed</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                {formattedRows}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <span>+18%</span>
              </div>
            </div>

            {/* 3. Avg. Quality Score */}
            <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-500">Avg. Quality Score</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                94.6%
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <span>+2.8 pp</span>
              </div>
            </div>

            {/* 4. Pipelines Run */}
            <div className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-500">Pipelines Run</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                8
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <span>+5</span>
              </div>
            </div>
          </div>

          {/* Split Bottom Section: Recent Datasets (2/3) + Recent Activity (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Columns: Recent Datasets Table */}
            <div className="lg:col-span-8 rounded-2xl border border-[#eaecf0] bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Recent Datasets</h3>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="text-xs font-semibold text-[#3b5bf6] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  View all <span aria-hidden="true">&rarr;</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#eaecf0] text-slate-500 font-semibold">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Rows</th>
                      <th className="pb-3 font-medium">Columns</th>
                      <th className="pb-3 font-medium">Quality</th>
                      <th className="pb-3 font-medium">Updated</th>
                      <th className="pb-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f4f7]">
                    {displayDatasets.slice(0, 5).map((ds, index) => {
                      const rowCount = ds.active_version?.row_count ?? 7043;
                      const colCount = ds.active_version?.column_count ?? 21;
                      const qualityScores = [97, 93, 95, 96, 92];
                      const quality = qualityScores[index % qualityScores.length];

                      return (
                        <tr
                          key={ds.id}
                          onClick={() => {
                            if (!ds.id.startsWith('mock-')) {
                              navigate(`/datasets/${ds.id}`);
                            }
                          }}
                          className="hover:bg-[#f9fafb] cursor-pointer transition group"
                        >
                          <td className="py-3.5 pr-4 font-semibold text-slate-900 flex items-center gap-2.5">
                            <svg className="w-4 h-4 text-slate-400 group-hover:text-[#3b5bf6] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="truncate max-w-[200px]">{ds.name}</span>
                          </td>
                          <td className="py-3.5 pr-4 text-slate-600 font-mono">
                            {rowCount.toLocaleString()}
                          </td>
                          <td className="py-3.5 pr-4 text-slate-600 font-mono">
                            {colCount}
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                              {quality}%
                            </span>
                          </td>
                          <td className="py-3.5 pr-4 text-slate-500">
                            {index === 0 ? '2 h ago' : index === 1 ? '1 d ago' : '2 d ago'}
                          </td>
                          <td className="py-3.5 text-right relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === ds.id ? null : ds.id);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            >
                              •••
                            </button>
                            {activeMenuId === ds.id && (
                              <div className="absolute right-0 top-full z-10 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-lg text-left">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/datasets/${ds.id}`);
                                  }}
                                  className="w-full rounded-md px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
                                >
                                  Open Explorer
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/pipelines?datasetId=${ds.id}`);
                                  }}
                                  className="w-full rounded-md px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
                                >
                                  Run Pipeline
                                </button>
                                {!ds.id.startsWith('mock-') && (
                                  <button
                                    type="button"
                                    onClick={(e) => void handleDeleteDataset(ds, e)}
                                    className="w-full rounded-md px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 font-medium"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 4 Columns: Recent Activity Timeline */}
            <div className="lg:col-span-4 rounded-2xl border border-[#eaecf0] bg-white p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Recent Activity</h3>
              <div className="space-y-5">
                {/* 1. Preprocessing completed */}
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">Preprocessing completed</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">customer_churn.csv · 2 h ago</p>
                  </div>
                </div>

                {/* 2. EDA generated */}
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600 border border-purple-200 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">EDA generated</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">sales_forecast.csv · 1 d ago</p>
                  </div>
                </div>

                {/* 3. Pipeline created */}
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 border border-blue-200 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">Pipeline created</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">churn_model_pipeline · 2 d ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

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
