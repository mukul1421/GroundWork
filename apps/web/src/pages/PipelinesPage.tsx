import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { generateSklearnPipelineCode } from '@/exporters/sklearnExporter';
import {
  computeQualityScore,
  generateDataInsights,
} from '@/engine/localAnalytics';
import {
  getLocalWorkspaceSnapshot,
  getActiveVersionOfDataset,
  applyLocalPreprocessingPlan,
  subscribeLocalWorkspace,
  type LocalDatasetRecord,
} from '@/storage/localWorkspaceStore';
import type { Dataset, DatasetVersion } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import type { PreprocessingPlan } from '@/engine/preprocessing/preprocessingEngine';

type PipelineStatus = 'in_progress' | 'completed';

interface LogEntry {
  time: string;
  text: string;
  type: 'info' | 'success' | 'warn';
}

export function PipelinesPage() {
  const { user, profile, activeWorkspace, isDemoMode } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [activeVersion, setActiveVersion] = useState<DatasetVersion | null>(null);
  const [profileSummary, setProfileSummary] = useState<DatasetProfileSummary | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationMatrixResult | null>(null);

  const [activeTab, setActiveTab] = useState<'stage' | 'changes' | 'script' | 'logs'>('stage');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [selectedStage, setSelectedStage] = useState<number>(1);
  const [overallStatus, setOverallStatus] = useState<PipelineStatus>('in_progress');
  const [stepStatuses, setStepStatuses] = useState<Record<number, 'pending' | 'active' | 'completed'>>({
    1: 'completed',
    2: 'active',
    3: 'pending',
    4: 'pending',
    5: 'pending',
    6: 'pending',
  });

  const [isTransforming, setIsTransforming] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null);

  const [strategyConfig, setStrategyConfig] = useState({
    deduplicate: true,
    imputeMissing: true,
    capOutliers: true,
    dropIdentifiers: true,
    encodeCategorical: false,
  });

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toTimeString().split(' ')[0] ?? '00:00:00',
      text: 'Pipeline orchestrator initialized. Deterministic in-browser execution engine ready.',
      type: 'info',
    },
  ]);

  const datasetIdFromUrl = searchParams.get('datasetId');
  const completedStepFromUrl = searchParams.get('completedStep');

  const hydrateLocal = useCallback(
    (preferredId: string | null) => {
      const snap = getLocalWorkspaceSnapshot();
      setDatasets(snap.datasets);
      const target: LocalDatasetRecord | null =
        (preferredId ? snap.datasets.find((d) => d.id === preferredId) : null) ??
        snap.datasets[0] ??
        null;
      setSelectedDataset(target);
      if (target) {
        const ver = getActiveVersionOfDataset(target);
        setActiveVersion(ver);
        setProfileSummary(ver.profile);
        setCorrelationData(ver.correlation);
      } else {
        setActiveVersion(null);
        setProfileSummary(null);
        setCorrelationData(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (isDemoMode) {
      hydrateLocal(datasetIdFromUrl);
      return subscribeLocalWorkspace(() => hydrateLocal(datasetIdFromUrl));
    }

    async function loadCloudDatasets() {
      if (!activeWorkspace) return;
      const { data } = await supabase
        .from('datasets')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setDatasets(data);
        const target =
          (datasetIdFromUrl ? data.find((d) => d.id === datasetIdFromUrl) : null) ??
          data[0] ??
          null;
        setSelectedDataset(target);

        if (target?.active_version_id) {
          const { data: verData } = await supabase
            .from('dataset_versions')
            .select('*')
            .eq('id', target.active_version_id)
            .maybeSingle();

          if (verData) {
            setActiveVersion(verData);
            const { data: profData } = await supabase
              .from('dataset_profiles')
              .select('*')
              .eq('dataset_version_id', verData.id)
              .maybeSingle();

            if (profData?.profile_json) {
              setProfileSummary(profData.profile_json as unknown as DatasetProfileSummary);
            }
          }
        }
      }
    }
    void loadCloudDatasets();
  }, [isDemoMode, activeWorkspace, datasetIdFromUrl, hydrateLocal]);

  // Persist per-dataset pipeline steps safely
  useEffect(() => {
    if (!selectedDataset) return;
    try {
      const saved = localStorage.getItem(`groundwork_pipeline_steps_${selectedDataset.id}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<number, 'pending' | 'active' | 'completed'>;
        setStepStatuses(parsed);
        const doneCount = Object.values(parsed).filter((s) => s === 'completed').length;
        setOverallStatus(doneCount === 6 ? 'completed' : 'in_progress');
        return;
      }
    } catch {
      // Ignore invalid localStorage state
    }
    setStepStatuses({
      1: 'completed',
      2: 'active',
      3: 'pending',
      4: 'pending',
      5: 'pending',
      6: 'pending',
    });
    setOverallStatus('in_progress');
  }, [selectedDataset]);

  const saveStatuses = useCallback(
    (updated: Record<number, 'pending' | 'active' | 'completed'>) => {
      setStepStatuses(updated);
      const allDone = Object.values(updated).filter((s) => s === 'completed').length === 6;
      setOverallStatus(allDone ? 'completed' : 'in_progress');
      if (selectedDataset) {
        try {
          localStorage.setItem(
            `groundwork_pipeline_steps_${selectedDataset.id}`,
            JSON.stringify(updated),
          );
        } catch {
          // Ignore storage quota errors
        }
      }
    },
    [selectedDataset],
  );

  // Return-from-workspace completion handler
  useEffect(() => {
    if (completedStepFromUrl && selectedDataset) {
      const stepNum = parseInt(completedStepFromUrl, 10);
      if (stepNum >= 1 && stepNum <= 6) {
        const nextStep = stepNum < 6 ? stepNum + 1 : 6;
        setStepStatuses((prev) => {
          const updated = { ...prev, [stepNum]: 'completed' as const };
          if (nextStep <= 6 && updated[nextStep] === 'pending') {
            updated[nextStep] = 'active' as const;
          }
          try {
            localStorage.setItem(
              `groundwork_pipeline_steps_${selectedDataset.id}`,
              JSON.stringify(updated),
            );
          } catch {
            // Ignore
          }
          return updated;
        });

        setSelectedStage(nextStep);
        const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';
        setLogs((prev) => [
          ...prev,
          {
            time: nowStr,
            text: `Stage ${stepNum} completed in Data Explorer. Advanced to Stage ${nextStep}.`,
            type: 'success',
          },
        ]);

        if (stepNum === 6) setOverallStatus('completed');

        const newParams = new URLSearchParams(searchParams);
        newParams.delete('completedStep');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [completedStepFromUrl, selectedDataset, searchParams, setSearchParams]);

  const datasetDisplayName = selectedDataset?.name ?? 'No dataset selected';
  const pipelineName = selectedDataset
    ? `${selectedDataset.name.replace(/\.[^/.]+$/, '').toLowerCase()}_pipeline`
    : 'data_prep_pipeline';

  // Real computed profile metrics
  const numericCols = useMemo(
    () => (profileSummary?.columns ?? []).filter((c) => c.isNumeric),
    [profileSummary],
  );
  const categoricalCols = useMemo(
    () => (profileSummary?.columns ?? []).filter((c) => !c.isNumeric),
    [profileSummary],
  );
  const missingNumericCols = useMemo(
    () => numericCols.filter((c) => c.missingCount > 0).map((c) => c.columnName),
    [numericCols],
  );
  const missingCatCols = useMemo(
    () => categoricalCols.filter((c) => c.missingCount > 0).map((c) => c.columnName),
    [categoricalCols],
  );
  const outlierCols = useMemo(
    () =>
      numericCols
        .filter((c) => 'outlierCount' in c.stats && c.stats.outlierCount > 0)
        .map((c) => c.columnName),
    [numericCols],
  );
  const identifierCols = useMemo(
    () =>
      (profileSummary?.columns ?? [])
        .filter((c) => c.isPrimaryKeyCandidate && c.columnName.toLowerCase().includes('id'))
        .map((c) => c.columnName),
    [profileSummary],
  );
  const encodableCatCols = useMemo(
    () =>
      categoricalCols
        .filter((c) => !c.isPrimaryKeyCandidate && c.distinctCount >= 2 && c.distinctCount <= 10)
        .slice(0, 2)
        .map((c) => c.columnName),
    [categoricalCols],
  );
  const targetColName = useMemo(() => {
    const match = (profileSummary?.columns ?? []).find((c) =>
      ['churn', 'renewed', 'returned', 'survived', 'target', 'label'].includes(
        c.columnName.toLowerCase(),
      ),
    );
    return match?.columnName ?? profileSummary?.columns[profileSummary.columns.length - 1]?.columnName ?? 'target';
  }, [profileSummary]);

  const realInsights = useMemo(
    () => generateDataInsights(profileSummary, correlationData),
    [profileSummary, correlationData],
  );

  const qualityScore = useMemo(() => computeQualityScore(profileSummary), [profileSummary]);

  // Dynamic preprocessing plan derived strictly from the active dataset's actual columns
  const pipelinePlan: PreprocessingPlan = useMemo(() => {
    const ops: PreprocessingPlan['operations'] = [];
    if (strategyConfig.deduplicate && (profileSummary?.duplicateRowsCount ?? 0) > 0) {
      ops.push({ type: 'deduplicate' });
    }
    if (strategyConfig.imputeMissing) {
      if (missingNumericCols.length > 0) {
        ops.push({ type: 'impute', columns: missingNumericCols, strategy: 'median' });
      }
      if (missingCatCols.length > 0) {
        ops.push({ type: 'impute', columns: missingCatCols, strategy: 'mode' });
      }
    }
    if (strategyConfig.capOutliers && outlierCols.length > 0) {
      ops.push({
        type: 'outlier_treatment',
        columns: outlierCols,
        strategy: 'clip_iqr',
        multiplier: 1.5,
      });
    }
    if (strategyConfig.dropIdentifiers && identifierCols.length > 0) {
      ops.push({ type: 'drop_columns', columns: identifierCols });
    }
    if (strategyConfig.encodeCategorical && encodableCatCols.length > 0) {
      ops.push({
        type: 'encode',
        columns: encodableCatCols,
        strategy: 'one_hot',
        dropOriginal: true,
      });
    }

    return {
      title: `Pipeline Plan for ${datasetDisplayName}`,
      description: 'Human-approved deterministic preprocessing recipe.',
      operations: ops,
    };
  }, [
    strategyConfig,
    profileSummary,
    missingNumericCols,
    missingCatCols,
    outlierCols,
    identifierCols,
    encodableCatCols,
    datasetDisplayName,
  ]);

  const pythonScriptCode = useMemo(() => {
    return generateSklearnPipelineCode({
      datasetName: datasetDisplayName,
      versionNumber: activeVersion?.version_number ?? 1,
      profile: profileSummary,
      targetColumn: targetColName,
      testSize: 0.2,
      randomState: 42,
      plan: pipelinePlan,
    });
  }, [datasetDisplayName, activeVersion, profileSummary, targetColName, pipelinePlan]);

  const handleDownloadScript = () => {
    const blob = new Blob([pythonScriptCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineName}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pythonScriptCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = pythonScriptCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleGoToStageWorkspace = (stageId: number) => {
    if (!selectedDataset) return;
    switch (stageId) {
      case 1:
        navigate('/datasets');
        break;
      case 2:
        navigate(`/datasets/${selectedDataset.id}?tab=eda&pipelineStep=2`);
        break;
      case 3:
        navigate(`/datasets/${selectedDataset.id}?tab=quality&pipelineStep=3`);
        break;
      case 4:
      case 5:
        navigate(`/datasets/${selectedDataset.id}?tab=preprocessing&pipelineStep=${stageId}`);
        break;
      case 6:
        navigate(`/datasets/${selectedDataset.id}?tab=features&pipelineStep=6`);
        break;
      default:
        navigate(`/datasets/${selectedDataset.id}`);
    }
  };

  const handleMarkStageCompleted = (stageId: number) => {
    const nextStage = stageId < 6 ? stageId + 1 : 6;
    const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';
    const updated = { ...stepStatuses, [stageId]: 'completed' as const };
    if (nextStage <= 6 && updated[nextStage] === 'pending') {
      updated[nextStage] = 'active' as const;
    }
    saveStatuses(updated);
    setSelectedStage(nextStage);
    setLogs((prev) => [
      ...prev,
      { time: nowStr, text: `Stage ${stageId} verified and marked complete.`, type: 'success' },
    ]);
  };

  const handleToggleStageStatus = (stageId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const isComp = stepStatuses[stageId] === 'completed';
    const updated = {
      ...stepStatuses,
      [stageId]: isComp ? ('active' as const) : ('completed' as const),
    };
    saveStatuses(updated);
  };

  // REAL execution (replaces fake setInterval simulation & memory leak)
  const handleExecuteTransformations = () => {
    if (!selectedDataset) return;
    const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';

    if (pipelinePlan.operations.length === 0) {
      setLogs((prev) => [
        ...prev,
        {
          time: nowStr,
          text: 'No pending operations needed — dataset already satisfies selected rules.',
          type: 'info',
        },
      ]);
      setLastRunSummary('Dataset already satisfies the selected transformation rules.');
      handleMarkStageCompleted(5);
      return;
    }

    setIsTransforming(true);
    try {
      if (isDemoMode) {
        const { newVersion, result } = applyLocalPreprocessingPlan(selectedDataset.id, pipelinePlan);
        const summary = `Created v${newVersion.version_number} (${result.sourceRowCount.toLocaleString()} → ${result.transformedRowCount.toLocaleString()} rows, ${result.sourceColumnCount} → ${result.transformedColumnCount} cols) in ${result.durationMs}ms.`;
        setLastRunSummary(summary);
        setLogs((prev) => [
          ...prev,
          { time: nowStr, text: newVersion.changelogSummary, type: 'info' },
          { time: nowStr, text: summary, type: 'success' },
        ]);
        handleMarkStageCompleted(5);
      } else {
        navigate(`/datasets/${selectedDataset.id}?tab=preprocessing&pipelineStep=5`);
      }
    } finally {
      setIsTransforming(false);
    }
  };

  const handleResetAll = () => {
    setSelectedStage(1);
    setLastRunSummary(null);
    saveStatuses({
      1: 'completed',
      2: 'active',
      3: 'pending',
      4: 'pending',
      5: 'pending',
      6: 'pending',
    });
    const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';
    setLogs([
      { time: nowStr, text: `Pipeline checklist reset for ${datasetDisplayName}.`, type: 'info' },
    ]);
  };

  const steps = [
    { id: 1, title: 'Upload & Verify', desc: 'Validate schema & dialect', status: stepStatuses[1], targetName: 'Datasets' },
    { id: 2, title: 'Profile Data', desc: 'Inspect types, distributions & stats', status: stepStatuses[2], targetName: 'EDA Studio' },
    { id: 3, title: 'Detect Anomalies', desc: 'Review nulls, outliers & duplicates', status: stepStatuses[3], targetName: 'Quality Audit' },
    { id: 4, title: 'Configure Strategy', desc: 'Select approval-gated rules', status: stepStatuses[4], targetName: 'Preprocessing' },
    { id: 5, title: 'Execute Version', desc: 'Apply plan & mint immutable snapshot', status: stepStatuses[5], targetName: 'Preprocessing' },
    { id: 6, title: 'Export Artifacts', desc: 'Download Python pipeline & report', status: stepStatuses[6], targetName: 'Feature Insights' },
  ];

  const completedStepsCount = Object.values(stepStatuses).filter((s) => s === 'completed').length;
  const overallPercentage = Math.round((completedStepsCount / 6) * 100);
  const userDisplayName = profile?.display_name || user?.email?.split('@')[0] || 'Workspace User';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased">
      <AppSidebar
        activeItem="pipelines"
        onNewDatasetClick={() => setIsUploadModalOpen(true)}
      />

      <div className="flex min-h-screen flex-col lg:pl-60">
        {/* Top Pipeline Header */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-[#eaecf0] bg-white px-4 py-3.5 sm:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Link to="/dashboard" className="hover:text-slate-700">
                Pipelines
              </Link>
              <span>›</span>
              <span className="truncate font-semibold text-slate-700">{pipelineName}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">{pipelineName}</h1>
              <span className="font-mono text-xs font-semibold text-[#3b5bf6] tabular-nums">
                {overallStatus === 'completed' ? 'Completed (6/6)' : `Stage ${selectedStage} of 6`}
              </span>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Dataset:</span>
                {datasets.length > 0 ? (
                  <select
                    aria-label="Select dataset for pipeline"
                    value={selectedDataset?.id ?? ''}
                    onChange={(e) => {
                      const match = datasets.find((d) => d.id === e.target.value);
                      if (match) {
                        navigate(`/pipelines?datasetId=${match.id}`);
                      }
                    }}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-medium text-slate-800"
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium text-slate-700">None</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {selectedDataset && (
              <button
                type="button"
                onClick={() => handleGoToStageWorkspace(selectedStage)}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-[#3b5bf6] bg-[#f0f4ff] px-3 py-1.5 text-xs font-semibold text-[#3b5bf6] transition hover:bg-[#e0e7ff]"
              >
                Open {steps[selectedStage - 1]?.targetName ?? 'Explorer'} ↗
              </button>
            )}
            <button
              type="button"
              onClick={handleResetAll}
              className="cursor-pointer whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Reset
            </button>
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white sm:flex">
              {userDisplayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Left 6-Stage Stepper */}
            <div className="space-y-3 lg:col-span-5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pipeline Stages
                </span>
                <span className="font-mono text-xs font-semibold text-[#3b5bf6] tabular-nums">
                  {completedStepsCount}/6 ({overallPercentage}%)
                </span>
              </div>

              {steps.map((step) => {
                const isCompleted = step.status === 'completed';
                const isSelected = selectedStage === step.id;

                return (
                  <div
                    key={step.id}
                    onClick={() => {
                      setSelectedStage(step.id);
                      setActiveTab('stage');
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition ${
                      isSelected
                        ? 'border-[#3b5bf6] bg-[#f8faff] ring-1 ring-[#3b5bf6]/25'
                        : 'border-[#eaecf0] bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        aria-label={`Toggle completion of stage ${step.id}`}
                        onClick={(e) => handleToggleStageStatus(step.id, e)}
                        className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg font-mono text-xs font-bold transition ${
                          isCompleted
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : isSelected
                              ? 'bg-[#3b5bf6] text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          step.id
                        )}
                      </button>

                      <div className="min-w-0">
                        <h3 className={`truncate text-xs font-bold ${isSelected ? 'text-[#3b5bf6]' : 'text-slate-900'}`}>
                          {step.title}
                        </h3>
                        <p className="truncate text-[11px] text-slate-500">{step.desc}</p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 font-mono text-[11px] font-semibold ${
                        isCompleted ? 'text-emerald-700' : isSelected ? 'text-[#3b5bf6]' : 'text-slate-400'
                      }`}
                    >
                      {isCompleted ? 'Done' : isSelected ? 'Active' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Inspection & Execution Panel */}
            <div className="flex min-h-[560px] flex-col justify-between rounded-2xl border border-[#eaecf0] bg-white p-6 lg:col-span-7">
              <div>
                <div
                  role="tablist"
                  aria-label="Pipeline inspection tabs"
                  className="mb-6 flex items-center gap-6 overflow-x-auto border-b border-slate-100 pb-3"
                >
                  {(
                    [
                      { id: 'stage', label: `Stage ${selectedStage} Details` },
                      { id: 'changes', label: `Recipe (${pipelinePlan.operations.length})` },
                      { id: 'script', label: 'Python Script' },
                      { id: 'logs', label: `Run Log (${logs.length})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`shrink-0 cursor-pointer whitespace-nowrap border-b-2 pb-2 text-xs font-bold transition ${
                        activeTab === tab.id
                          ? 'border-[#3b5bf6] text-[#3b5bf6]'
                          : 'border-transparent text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'stage' && (
                  <div className="space-y-5">
                    {selectedStage === 1 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900">
                          Stage 1: Dataset Verification
                        </h3>
                        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                            <span className="text-[10px] font-semibold uppercase text-slate-400">
                              Dataset File
                            </span>
                            <div className="mt-1 truncate font-mono font-semibold text-slate-900">
                              {datasetDisplayName}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                            <span className="text-[10px] font-semibold uppercase text-slate-400">
                              Active Snapshot
                            </span>
                            <div className="mt-1 font-mono font-semibold text-[#3b5bf6] tabular-nums">
                              v{activeVersion?.version_number ?? 1} ·{' '}
                              {(profileSummary?.rowCount ?? activeVersion?.row_count ?? 0).toLocaleString()}{' '}
                              rows × {profileSummary?.columnCount ?? activeVersion?.column_count ?? 0} cols
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                            <span className="text-[10px] font-semibold uppercase text-slate-400">
                              Content Hash
                            </span>
                            <div className="mt-1 truncate font-mono text-slate-700">
                              {activeVersion?.content_sha256.slice(0, 20) ?? '—'}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                            <span className="text-[10px] font-semibold uppercase text-slate-400">
                              Quality Score
                            </span>
                            <div className="mt-1 font-mono font-bold text-slate-900 tabular-nums">
                              {qualityScore}%
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedStage === 2 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900">
                          Stage 2: Schema &amp; Statistical Profile
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                              {(profileSummary?.rowCount ?? activeVersion?.row_count ?? 0).toLocaleString()}
                            </div>
                            <span className="text-[10px] font-medium text-slate-500">Rows</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                              {profileSummary?.columnCount ?? activeVersion?.column_count ?? 0}
                            </div>
                            <span className="text-[10px] font-medium text-slate-500">Columns</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                              {numericCols.length}
                            </div>
                            <span className="text-[10px] font-medium text-slate-500">Numeric</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                              {categoricalCols.length}
                            </div>
                            <span className="text-[10px] font-medium text-slate-500">Categorical</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                          <span className="font-semibold text-slate-800">Detected Schema</span>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(profileSummary?.columns ?? []).map((col) => (
                              <span
                                key={col.columnName}
                                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                              >
                                {col.columnName} ({col.inferredType})
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedStage === 3 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-900">
                            Stage 3: Detected Anomalies
                          </h3>
                          <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
                            {realInsights.length} finding{realInsights.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        {realInsights.length > 0 ? (
                          <div className="space-y-2.5 text-xs">
                            {realInsights.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5"
                              >
                                <div className="font-semibold text-slate-900">{item.title}</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                                  {item.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900">
                            No critical data anomalies detected in the active version.
                          </div>
                        )}
                      </div>
                    )}

                    {selectedStage === 4 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900">
                          Stage 4: Strategy Configuration
                        </h3>
                        <div className="space-y-2.5 text-xs">
                          {[
                            {
                              key: 'deduplicate' as const,
                              title: 'Remove exact duplicate rows',
                              desc: `${profileSummary?.duplicateRowsCount ?? 0} duplicates detected in active version.`,
                            },
                            {
                              key: 'imputeMissing' as const,
                              title: 'Impute missing values (median / mode)',
                              desc:
                                missingNumericCols.length + missingCatCols.length > 0
                                  ? `Targets: ${[...missingNumericCols, ...missingCatCols].join(', ')}`
                                  : 'No missing values currently detected.',
                            },
                            {
                              key: 'capOutliers' as const,
                              title: 'Clip extreme tails (1.5× IQR fence)',
                              desc:
                                outlierCols.length > 0
                                  ? `Targets: ${outlierCols.join(', ')}`
                                  : 'No IQR outliers currently detected.',
                            },
                            {
                              key: 'dropIdentifiers' as const,
                              title: 'Drop unique identifier columns',
                              desc:
                                identifierCols.length > 0
                                  ? `Targets: ${identifierCols.join(', ')}`
                                  : 'No identifier columns detected.',
                            },
                            {
                              key: 'encodeCategorical' as const,
                              title: 'One-hot encode low-cardinality categoricals',
                              desc:
                                encodableCatCols.length > 0
                                  ? `Targets: ${encodableCatCols.join(', ')}`
                                  : 'No low-cardinality categorical columns detected.',
                            },
                          ].map((opt) => (
                            <label
                              key={opt.key}
                              className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50"
                            >
                              <div>
                                <div className="font-semibold text-slate-900">{opt.title}</div>
                                <p className="mt-0.5 text-[11px] text-slate-500">{opt.desc}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={strategyConfig[opt.key]}
                                onChange={(e) =>
                                  setStrategyConfig((prev) => ({
                                    ...prev,
                                    [opt.key]: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4 accent-[#3b5bf6]"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedStage === 5 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900">
                          Stage 5: Execute &amp; Mint Immutable Version
                        </h3>
                        <p className="text-xs leading-relaxed text-slate-600">
                          Executing this plan runs {pipelinePlan.operations.length} deterministic transformation
                          {pipelinePlan.operations.length === 1 ? '' : 's'} and saves a new immutable version without overwriting v
                          {activeVersion?.version_number ?? 1}.
                        </p>

                        {lastRunSummary && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                            <p className="font-semibold">Execution complete</p>
                            <p className="mt-1 font-mono text-[11px]">{lastRunSummary}</p>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={isTransforming || !selectedDataset}
                          onClick={handleExecuteTransformations}
                          className="cursor-pointer rounded-xl bg-[#3b5bf6] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isTransforming ? 'Executing...' : 'Approve & Run Transformations'}
                        </button>
                      </div>
                    )}

                    {selectedStage === 6 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900">
                          Stage 6: Validate &amp; Export Pipeline
                        </h3>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                          <div className="flex items-center justify-between font-mono tabular-nums">
                            <span className="text-slate-600">Active Version</span>
                            <span className="font-bold text-slate-900">
                              v{activeVersion?.version_number ?? 1}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between font-mono tabular-nums">
                            <span className="text-slate-600">Quality Score</span>
                            <span className="font-bold text-emerald-700">{qualityScore}%</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between font-mono tabular-nums">
                            <span className="text-slate-600">Missing Rate</span>
                            <span className="font-bold text-slate-900">
                              {(profileSummary?.overallMissingRate ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleDownloadScript}
                            className="cursor-pointer rounded-xl bg-[#3b5bf6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                          >
                            Download Python Script (.py)
                          </button>
                          {selectedDataset && (
                            <button
                              type="button"
                              onClick={() => handleGoToStageWorkspace(6)}
                              className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Open Feature Insights ↗
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'changes' && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">Configured Recipe Steps</h3>
                    {pipelinePlan.operations.length > 0 ? (
                      pipelinePlan.operations.map((op, i) => (
                        <div
                          key={`${op.type}-${i}`}
                          className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs"
                        >
                          <div className="font-mono text-[10px] font-bold uppercase text-[#3b5bf6]">
                            Step {i + 1} · {op.type.replace(/_/g, ' ')}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-700">
                            {'columns' in op && op.columns ? `Columns: ${op.columns.join(', ')}` : 'Applies across full table'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">
                        No pending transformation steps are active for the current dataset state.
                      </p>
                    )}
                  </div>
                )}

                {activeTab === 'script' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {pipelineName}.py
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopyCode()}
                          className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {copiedCode ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadScript}
                          className="cursor-pointer rounded-lg bg-[#3b5bf6] px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Download .py
                        </button>
                      </div>
                    </div>
                    <pre className="max-h-[400px] overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-200">
                      <code>{pythonScriptCode}</code>
                    </pre>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="space-y-2 font-mono text-xs">
                    {logs.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2"
                      >
                        <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                          {entry.time}
                        </span>
                        <span
                          className={
                            entry.type === 'success'
                              ? 'text-emerald-700'
                              : entry.type === 'warn'
                                ? 'text-amber-700'
                                : 'text-slate-700'
                          }
                        >
                          {entry.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Action Footer */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={selectedStage <= 1}
                  onClick={() => setSelectedStage((s) => Math.max(1, s - 1))}
                  className="cursor-pointer rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous Stage
                </button>

                <button
                  type="button"
                  onClick={() => handleMarkStageCompleted(selectedStage)}
                  className="cursor-pointer rounded-lg bg-[#3b5bf6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  {selectedStage < 6 ? `Complete Stage ${selectedStage} & Continue →` : 'Mark Pipeline Complete'}
                </button>
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
          navigate(`/pipelines?datasetId=${ds.id}`);
        }}
      />
    </div>
  );
}
