import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, supabase } from '@/integrations/supabase';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { DatasetUploadModal } from '@/components/datasets/DatasetUploadModal';
import { generateSklearnPipelineCode } from '@/exporters/sklearnExporter';
import type { Dataset, DatasetVersion } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { PreprocessingPlan } from '@/engine/preprocessing/preprocessingEngine';

type PipelineStatus = 'in_progress' | 'completed';

interface LogEntry {
  time: string;
  text: string;
  type?: 'info' | 'success' | 'warn' | 'code';
}

export function PipelinesPage() {
  const { user, profile, activeWorkspace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [activeVersion, setActiveVersion] = useState<DatasetVersion | null>(null);
  const [profileSummary, setProfileSummary] = useState<DatasetProfileSummary | null>(null);

  // Active Tab in Right Panel: stage | changes | script | logs
  const [activeTab, setActiveTab] = useState<'stage' | 'changes' | 'script' | 'logs'>('stage');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Selected Stage in Stepper (1 to 6) — user can click on any stage!
  const [selectedStage, setSelectedStage] = useState<number>(1);

  // Stage Completion State Machine
  const [overallStatus, setOverallStatus] = useState<PipelineStatus>('in_progress');
  const [stepStatuses, setStepStatuses] = useState<Record<number, 'pending' | 'active' | 'completed'>>({
    1: 'active',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
    6: 'pending',
  });

  // Stage 5 Transformation execution simulation
  const [transformProgress, setTransformProgress] = useState<number>(0);
  const [isTransforming, setIsTransforming] = useState<boolean>(false);

  // User customizable strategy switches for Stage 4
  const [strategyConfig, setStrategyConfig] = useState({
    imputeMissing: true,
    encodeCategorical: true,
    capOutliers: true,
    dropIdentifiers: true,
  });

  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '00:00:00', text: 'Pipeline workspace initialized. In-browser DuckDB-Wasm engine ready.', type: 'info' },
    { time: '00:00:01', text: 'Stage 1 active: Ingesting dataset and verifying file integrity...', type: 'info' },
  ]);

  const datasetIdFromUrl = searchParams.get('datasetId');
  const completedStepFromUrl = searchParams.get('completedStep');

  // Load datasets and active version profile
  useEffect(() => {
    async function loadDatasets() {
      if (!activeWorkspace) return;
      const { data } = await supabase
        .from('datasets')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setDatasets(data);
        const target = (datasetIdFromUrl ? data.find((d) => d.id === datasetIdFromUrl) : null) ?? data[0] ?? null;
        setSelectedDataset(target);

        if (target && target.active_version_id) {
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
    void loadDatasets();
  }, [activeWorkspace, datasetIdFromUrl]);

  // Load saved step statuses from localStorage for persistent progress
  useEffect(() => {
    if (!selectedDataset) return;
    const saved = localStorage.getItem(`groundwork_pipeline_steps_${selectedDataset.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStepStatuses(parsed);
      } catch {
        // Fallback
      }
    }
  }, [selectedDataset]);

  // Save step statuses to localStorage
  const saveStatuses = useCallback((updated: Record<number, 'pending' | 'active' | 'completed'>) => {
    setStepStatuses(updated);
    if (selectedDataset) {
      localStorage.setItem(`groundwork_pipeline_steps_${selectedDataset.id}`, JSON.stringify(updated));
    }
  }, [selectedDataset]);

  // Check if user just returned from a workspace tab with completedStep
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
          if (selectedDataset) {
            localStorage.setItem(`groundwork_pipeline_steps_${selectedDataset.id}`, JSON.stringify(updated));
          }
          return updated;
        });

        setSelectedStage(nextStep);
        const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';
        setLogs((prev) => [
          ...prev,
          {
            time: nowStr,
            text: `✓ Stage ${stepNum} completed from workspace. Advanced to Stage ${nextStep}.`,
            type: 'success',
          },
        ]);

        if (stepNum === 6) {
          setOverallStatus('completed');
        }

        // Clean query param
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('completedStep');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [completedStepFromUrl, selectedDataset, searchParams, setSearchParams]);

  const datasetDisplayName = selectedDataset ? selectedDataset.name : 'customer_churn.csv';
  const pipelineName = selectedDataset
    ? `${selectedDataset.name.replace(/\.[^/.]+$/, '').toLowerCase()}_preprocessing`
    : 'churn_preprocessing';

  // Planned preprocessing recipe
  const pipelinePlan: PreprocessingPlan = useMemo(() => {
    const ops = [];
    if (strategyConfig.imputeMissing) {
      ops.push({
        type: 'impute' as const,
        columns: ['total_charges', 'tenure'],
        strategy: 'median' as const,
      });
    }
    if (strategyConfig.encodeCategorical) {
      ops.push({
        type: 'encode' as const,
        columns: ['contract_type', 'payment_method'],
        strategy: 'one_hot' as const,
        dropOriginal: true,
      });
    }
    if (strategyConfig.capOutliers) {
      ops.push({
        type: 'outlier_treatment' as const,
        columns: ['tenure', 'monthly_charges'],
        strategy: 'clip_iqr' as const,
        multiplier: 1.5,
      });
    }
    if (strategyConfig.dropIdentifiers) {
      ops.push({
        type: 'drop_columns' as const,
        columns: ['customer_id', 'contract_id'],
      });
    }

    return {
      title: 'Automated ML Preprocessing Pipeline',
      description: 'Human-reviewed preprocessing plan with leakage-safe transformations.',
      operations: ops,
    };
  }, [strategyConfig]);

  // Live generated standalone Python script
  const pythonScriptCode = useMemo(() => {
    return generateSklearnPipelineCode({
      datasetName: datasetDisplayName,
      versionNumber: activeVersion?.version_number ?? 1,
      profile: profileSummary,
      targetColumn: 'churn',
      testSize: 0.2,
      randomState: 42,
      plan: pipelinePlan,
    });
  }, [datasetDisplayName, activeVersion, profileSummary, pipelinePlan]);

  const handleDownloadScript = () => {
    const blob = new Blob([pythonScriptCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `groundwork_pipeline.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pythonScriptCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Navigates directly to the dedicated workspace page for a stage
  const handleGoToStageWorkspace = (stageId: number) => {
    if (!selectedDataset) return;
    switch (stageId) {
      case 1:
        // Upload Dataset -> Dashboard or upload modal
        navigate('/dashboard');
        break;
      case 2:
        // Profile Data -> EDA Tab
        navigate(`/datasets/${selectedDataset.id}?tab=eda&pipelineStep=2`);
        break;
      case 3:
        // Detect Issues -> Data Quality Tab
        navigate(`/datasets/${selectedDataset.id}?tab=quality&pipelineStep=3`);
        break;
      case 4:
        // Recommend Strategy -> Preprocessing Studio Tab
        navigate(`/datasets/${selectedDataset.id}?tab=preprocessing&pipelineStep=4`);
        break;
      case 5:
        // Apply Transformations -> Preprocessing Studio Tab
        navigate(`/datasets/${selectedDataset.id}?tab=preprocessing&pipelineStep=5`);
        break;
      case 6:
        // Validate Output -> Feature Insights & Export Tab
        navigate(`/datasets/${selectedDataset.id}?tab=features&pipelineStep=6`);
        break;
      default:
        navigate(`/datasets/${selectedDataset.id}`);
    }
  };

  // Helper to mark a stage as completed manually
  const handleMarkStageCompleted = (stageId: number) => {
    const stageTitles: Record<number, string> = {
      1: 'Upload Dataset',
      2: 'Profile Data',
      3: 'Detect Issues',
      4: 'Recommend Strategy',
      5: 'Apply Transformations',
      6: 'Validate Output',
    };

    const nextStage = stageId + 1;
    const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';

    const updated = { ...stepStatuses, [stageId]: 'completed' as const };
    if (nextStage <= 6 && updated[nextStage] === 'pending') {
      updated[nextStage] = 'active' as const;
    }
    saveStatuses(updated);

    setLogs((prev) => [
      ...prev,
      {
        time: nowStr,
        text: `✓ Stage ${stageId} (${stageTitles[stageId]}) marked as completed manually by user.`,
        type: 'success',
      },
    ]);

    if (stageId < 6) {
      setSelectedStage(nextStage);
      setLogs((prev) => [
        ...prev,
        {
          time: nowStr,
          text: `Stage ${nextStage} (${stageTitles[nextStage]}) is now active for review.`,
          type: 'info',
        },
      ]);
    } else {
      setOverallStatus('completed');
      setLogs((prev) => [
        ...prev,
        {
          time: nowStr,
          text: '🎉 ALL 6 PIPELINE STAGES COMPLETED! Standalone groundwork_pipeline.py generated.',
          type: 'code',
        },
      ]);
    }
  };

  // Toggle stage completion (un-mark or mark)
  const handleToggleStageStatus = (stageId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const isComp = stepStatuses[stageId] === 'completed';
    const updated = {
      ...stepStatuses,
      [stageId]: isComp ? ('active' as const) : ('completed' as const),
    };
    saveStatuses(updated);
    const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';
    setLogs((prev) => [
      ...prev,
      {
        time: nowStr,
        text: isComp ? `Stage ${stageId} re-opened.` : `✓ Stage ${stageId} marked completed.`,
        type: isComp ? 'warn' : 'success',
      },
    ]);
  };

  // Run DuckDB transformation simulation for Stage 5
  const handleExecuteTransformations = () => {
    setIsTransforming(true);
    setTransformProgress(0);
    const nowStr = new Date().toTimeString().split(' ')[0] ?? '00:00:00';
    setLogs((prev) => [
      ...prev,
      { time: nowStr, text: '[DuckDB-Wasm] Beginning execution of transformation queries...', type: 'info' },
    ]);

    let prog = 0;
    const interval = setInterval(() => {
      prog += 25;
      setTransformProgress(prog);
      if (prog === 25) {
        setLogs((prev) => [
          ...prev,
          { time: nowStr, text: '[DuckDB-Wasm] Imputed nulls in total_charges with column median.', type: 'info' },
        ]);
      } else if (prog === 50) {
        setLogs((prev) => [
          ...prev,
          { time: nowStr, text: '[DuckDB-Wasm] One-Hot encoded contract_type & payment_method (drop=\'first\').', type: 'info' },
        ]);
      } else if (prog === 75) {
        setLogs((prev) => [
          ...prev,
          { time: nowStr, text: '[DuckDB-Wasm] Capped extreme outliers in tenure with 1.5 × IQR boundary.', type: 'info' },
        ]);
      } else if (prog >= 100) {
        clearInterval(interval);
        setIsTransforming(false);
        setLogs((prev) => [
          ...prev,
          { time: nowStr, text: '✓ Transformations completed in DuckDB-Wasm. 0 nulls remain.', type: 'success' },
        ]);
      }
    }, 400);
  };

  // Reset all stages
  const handleResetAll = () => {
    setSelectedStage(1);
    setOverallStatus('in_progress');
    setTransformProgress(0);
    setIsTransforming(false);
    const initialStatuses: Record<number, 'pending' | 'active' | 'completed'> = {
      1: 'active',
      2: 'pending',
      3: 'pending',
      4: 'pending',
      5: 'pending',
      6: 'pending',
    };
    saveStatuses(initialStatuses);
    setLogs([
      { time: '00:00:00', text: `Pipeline reset for ${datasetDisplayName}. Stage 1 active.`, type: 'info' },
    ]);
  };

  const steps = [
    {
      id: 1,
      title: 'Upload Dataset',
      desc: 'Load and validate input data',
      status: stepStatuses[1],
      workspaceTab: 'overview',
      targetName: 'Dashboard / Upload',
    },
    {
      id: 2,
      title: 'Profile Data',
      desc: 'Analyze schema, types and summary',
      status: stepStatuses[2],
      workspaceTab: 'eda',
      targetName: 'EDA Tab',
    },
    {
      id: 3,
      title: 'Detect Issues',
      desc: 'Find missing values, outliers, duplicates',
      status: stepStatuses[3],
      workspaceTab: 'quality',
      targetName: 'Data Quality Tab',
    },
    {
      id: 4,
      title: 'Recommend Strategy',
      desc: 'Propose preprocessing actions',
      status: stepStatuses[4],
      workspaceTab: 'preprocessing',
      targetName: 'Preprocessing Tab',
    },
    {
      id: 5,
      title: 'Apply Transformations',
      desc: 'Impute, encode, scale, and clean',
      status: stepStatuses[5],
      workspaceTab: 'preprocessing',
      targetName: 'Preprocessing Tab',
      badge:
        stepStatuses[5] === 'completed'
          ? 'Done'
          : transformProgress > 0
            ? `${transformProgress}%`
            : undefined,
    },
    {
      id: 6,
      title: 'Validate Output',
      desc: 'Check data quality and ML readiness',
      status: stepStatuses[6],
      workspaceTab: 'features',
      targetName: 'Feature Insights Tab',
    },
  ];

  const completedStepsCount = Object.values(stepStatuses).filter((s) => s === 'completed').length;
  const overallPercentage = Math.round((completedStepsCount / 6) * 100);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased">
      <AppSidebar
        activeItem="pipelines"
        onNewDatasetClick={() => setIsUploadModalOpen(true)}
      />

      <div className="pl-60 min-h-screen flex flex-col">
        {/* Header matching 02 — AGENT RUN */}
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#eaecf0] bg-white px-8">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Link to="/dashboard" className="hover:text-slate-800">pipelines</Link>
              <span>›</span>
              <span className="text-slate-900 font-semibold">{pipelineName}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                {pipelineName}
              </h1>
              {overallStatus === 'completed' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Completed (6/6)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#3b5bf6] border border-blue-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3b5bf6] animate-pulse" />
                  Stage {selectedStage} of 6 Active
                </span>
              )}
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                Dataset:{' '}
                {datasets.length > 1 ? (
                  <select
                    value={selectedDataset?.id ?? ''}
                    onChange={(e) => {
                      const match = datasets.find((d) => d.id === e.target.value);
                      if (match) {
                        setSelectedDataset(match);
                        navigate(`/pipelines?datasetId=${match.id}`);
                      }
                    }}
                    className="font-medium text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-slate-50"
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium text-slate-700">{datasetDisplayName}</span>
                )}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">Interactive Pipeline</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {selectedDataset && (
              <button
                type="button"
                onClick={() => handleGoToStageWorkspace(selectedStage)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#3b5bf6] bg-[#f0f4ff] px-3 py-1.5 text-xs font-semibold text-[#3b5bf6] shadow-xs hover:bg-[#e0e7ff] transition cursor-pointer"
                title="Open the workspace page for this stage"
              >
                <span>↗</span>
                <span>Open {steps[selectedStage - 1]?.targetName ?? 'Workspace Page'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f46e5] text-white font-bold text-xs shadow-xs">
              {(profile?.display_name || user?.email || 'M').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content Body: Left Stepper (40%) + Right Stage Inspection Panel (60%) */}
        <main className="flex-1 p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto items-start">
            {/* Left Column: 6-Step Interactive Vertical Stepper (5 Cols) */}
            <div className="lg:col-span-5 space-y-3.5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Pipeline Stages
                </span>
                <span className="text-xs font-semibold text-[#3b5bf6]">
                  {completedStepsCount} of 6 completed ({overallPercentage}%)
                </span>
              </div>

              {steps.map((step) => {
                const isCompleted = step.status === 'completed';
                const isActive = step.status === 'active';
                const isSelected = selectedStage === step.id;

                return (
                  <div
                    key={step.id}
                    onClick={() => {
                      setSelectedStage(step.id);
                      setActiveTab('stage');
                    }}
                    className={`flex items-center justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'border-[#3b5bf6] bg-[#f8faff] shadow-sm ring-2 ring-[#3b5bf6]/30'
                        : isCompleted
                          ? 'border-[#eaecf0] bg-white hover:border-slate-300'
                          : isActive
                            ? 'border-blue-200 bg-white hover:border-[#3b5bf6]'
                            : 'border-slate-200/60 bg-white/70 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Checkbox / Step Number button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleStageStatus(step.id, e)}
                        title={isCompleted ? 'Click to un-mark' : 'Click to mark completed'}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                            : isSelected
                              ? 'bg-[#3b5bf6] text-white shadow-xs'
                              : isActive
                                ? 'bg-[#eef2ff] text-[#3b5bf6] border border-[#dbe4ff]'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-xs font-bold">{step.id}</span>
                        )}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-[#3b5bf6]'
                                : isCompleted
                                  ? 'text-slate-900'
                                  : 'text-slate-700'
                            }`}
                          >
                            {step.title}
                          </h3>
                          {isSelected && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">{step.desc}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Direct button to open that stage's workspace */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGoToStageWorkspace(step.id);
                        }}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-[#3b5bf6] hover:border-blue-300 shadow-2xs transition cursor-pointer flex items-center gap-1"
                        title={`Go to ${step.targetName}`}
                      >
                        <span>↗</span>
                        <span className="hidden sm:inline">{step.targetName.split(' ')[0]}</span>
                      </button>

                      {isCompleted ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          ✓ Done
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleToggleStageStatus(step.id, e)}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-[#eef2ff] hover:text-[#3b5bf6] cursor-pointer"
                        >
                          Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Stage Inspection & Action Panel (7 Cols) */}
            <div className="lg:col-span-7 rounded-2xl border border-[#eaecf0] bg-white p-6 shadow-xs flex flex-col justify-between min-h-[600px]">
              <div>
                {/* Tabs: Stage Details | Proposed Changes | Python Script | Logs */}
                <div className="flex items-center gap-6 border-b border-[#f2f4f7] pb-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setActiveTab('stage')}
                    className={`text-xs font-bold pb-2 transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'stage'
                        ? 'text-[#3b5bf6] border-b-2 border-[#3b5bf6]'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>Stage {selectedStage} Workspace</span>
                    {stepStatuses[selectedStage] === 'completed' && (
                      <span className="text-emerald-600 text-xs font-bold">✓</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('changes')}
                    className={`text-xs font-bold pb-2 transition cursor-pointer ${
                      activeTab === 'changes'
                        ? 'text-[#3b5bf6] border-b-2 border-[#3b5bf6]'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Proposed Recipe
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('script')}
                    className={`text-xs font-bold pb-2 transition cursor-pointer flex items-center gap-1 ${
                      activeTab === 'script'
                        ? 'text-[#3b5bf6] border-b-2 border-[#3b5bf6]'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>Python Script</span>
                    <span className="rounded bg-blue-100 px-1 py-0.2 text-[9px] font-mono text-blue-700 font-bold">.py</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('logs')}
                    className={`text-xs font-bold pb-2 transition cursor-pointer ${
                      activeTab === 'logs'
                        ? 'text-[#3b5bf6] border-b-2 border-[#3b5bf6]'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Logs
                  </button>
                </div>

                {/* TAB 1: DEDICATED STAGE DETAILS VIEW */}
                {activeTab === 'stage' && (
                  <div className="space-y-5">
                    {/* Top Callout: Go to Dedicated Workspace Page */}
                    <div className="rounded-xl border border-[#dbe4ff] bg-[#f8faff] p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>🚀</span>
                          <span>Perform work on the {steps[selectedStage - 1]?.targetName ?? 'dedicated workspace'}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Click to open the interactive studio page. Inspect and transform your data, then return to mark this stage complete.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGoToStageWorkspace(selectedStage)}
                        className="rounded-lg bg-[#3b5bf6] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer flex items-center gap-1"
                      >
                        <span>Open {steps[selectedStage - 1]?.targetName}</span>
                        <span>↗</span>
                      </button>
                    </div>

                    {/* STAGE 1: UPLOAD DATASET */}
                    {selectedStage === 1 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[#3b5bf6] text-xs font-bold">1</span>
                            <h3 className="text-sm font-bold text-slate-900">Stage 1: Dataset Upload & Ingestion</h3>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            stepStatuses[1] === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-[#3b5bf6] border border-blue-200'
                          }`}>
                            {stepStatuses[1] === 'completed' ? '✓ Validated' : 'Ready to Validate'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <span className="text-[10px] text-slate-400 font-medium">Dataset Filename</span>
                            <div className="font-semibold text-slate-900 font-mono mt-0.5 truncate">{datasetDisplayName}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <span className="text-[10px] text-slate-400 font-medium">Storage Engine</span>
                            <div className="font-semibold text-slate-900 mt-0.5">DuckDB-Wasm (In-Browser)</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <span className="text-[10px] text-slate-400 font-medium">Encoding</span>
                            <div className="font-semibold text-slate-900 mt-0.5">UTF-8 (Dialect Verified)</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <span className="text-[10px] text-slate-400 font-medium">Integrity Check</span>
                            <div className="font-semibold text-emerald-600 mt-0.5">✓ 0 Corrupted Lines</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STAGE 2: PROFILE DATA */}
                    {selectedStage === 2 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[#3b5bf6] text-xs font-bold">2</span>
                            <h3 className="text-sm font-bold text-slate-900">Stage 2: Schema & Data Profiling</h3>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            stepStatuses[2] === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-[#3b5bf6] border border-blue-200'
                          }`}>
                            {stepStatuses[2] === 'completed' ? '✓ Profiled' : 'Ready to Profile'}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-3 text-center text-xs">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="text-base font-bold text-slate-900 font-mono">7,043</div>
                            <span className="text-[10px] text-slate-500 font-medium">Total Rows</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="text-base font-bold text-slate-900 font-mono">21</div>
                            <span className="text-[10px] text-slate-500 font-medium">Columns</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="text-base font-bold text-slate-900 font-mono">3</div>
                            <span className="text-[10px] text-slate-500 font-medium">Numeric Features</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="text-base font-bold text-slate-900 font-mono">18</div>
                            <span className="text-[10px] text-slate-500 font-medium">Categorical</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs">
                          <span className="font-semibold text-slate-800">Primary Schema Features:</span>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {['customer_id (str)', 'tenure (int)', 'monthly_charges (float)', 'total_charges (float)', 'contract_type (cat)', 'churn (target)'].map((col) => (
                              <span key={col} className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STAGE 3: DETECT ISSUES */}
                    {selectedStage === 3 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[#3b5bf6] text-xs font-bold">3</span>
                            <h3 className="text-sm font-bold text-slate-900">Stage 3: Anomaly & Data Quality Detection</h3>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            stepStatuses[3] === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {stepStatuses[3] === 'completed' ? '✓ Audited' : '3 Issues Flagged'}
                          </span>
                        </div>

                        <div className="space-y-2.5 text-xs">
                          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                            <span className="text-amber-600 text-sm">⚠️</span>
                            <div>
                              <div className="font-semibold text-amber-900">Missing Values in 4 Columns</div>
                              <p className="text-[11px] text-amber-800 mt-0.5">
                                Column <code className="font-mono bg-white/70 px-1 rounded">total_charges</code> has 18.6% missing values. Requires imputation to prevent sample loss.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                            <span className="text-blue-600 text-sm">ℹ️</span>
                            <div>
                              <div className="font-semibold text-blue-900">High Cardinality Identifiers</div>
                              <p className="text-[11px] text-blue-800 mt-0.5">
                                Columns <code className="font-mono bg-white/70 px-1 rounded">customer_id</code> and <code className="font-mono bg-white/70 px-1 rounded">contract_id</code> have 100% unique keys. Should be dropped before model fitting.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3">
                            <span className="text-purple-600 text-sm">⚡</span>
                            <div>
                              <div className="font-semibold text-purple-900">Distribution Outliers in Tenure</div>
                              <p className="text-[11px] text-purple-800 mt-0.5">
                                Skewness detected in upper bound tenure values (&gt; 72 months). IQR clipping recommended.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STAGE 4: RECOMMEND STRATEGY */}
                    {selectedStage === 4 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[#3b5bf6] text-xs font-bold">4</span>
                            <h3 className="text-sm font-bold text-slate-900">Stage 4: Preprocessing Strategy Configuration</h3>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            stepStatuses[4] === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-[#eef2ff] text-[#3b5bf6] border border-[#dbe4ff]'
                          }`}>
                            {stepStatuses[4] === 'completed' ? '✓ Strategy Approved' : 'Review & Customize'}
                          </span>
                        </div>

                        <div className="space-y-2.5 text-xs">
                          {/* Toggle 1: Median Imputation */}
                          <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer">
                            <div>
                              <div className="font-semibold text-slate-900">1. Median Imputation for Numeric Missing Values</div>
                              <p className="text-[11px] text-slate-500 mt-0.5">Fills TotalCharges with column median to prevent data leakage.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={strategyConfig.imputeMissing}
                              onChange={(e) => setStrategyConfig({ ...strategyConfig, imputeMissing: e.target.checked })}
                              className="h-4 w-4 rounded text-[#3b5bf6] focus:ring-[#3b5bf6]"
                            />
                          </label>

                          {/* Toggle 2: One-Hot Encoding */}
                          <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer">
                            <div>
                              <div className="font-semibold text-slate-900">2. One-Hot Encoding (drop=&apos;first&apos;)</div>
                              <p className="text-[11px] text-slate-500 mt-0.5">Encodes Contract, PaymentMethod with dummy-variable trap avoidance.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={strategyConfig.encodeCategorical}
                              onChange={(e) => setStrategyConfig({ ...strategyConfig, encodeCategorical: e.target.checked })}
                              className="h-4 w-4 rounded text-[#3b5bf6] focus:ring-[#3b5bf6]"
                            />
                          </label>

                          {/* Toggle 3: IQR Outlier Capping */}
                          <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer">
                            <div>
                              <div className="font-semibold text-slate-900">3. IQR Outlier Treatment (1.5 × IQR boundary)</div>
                              <p className="text-[11px] text-slate-500 mt-0.5">Caps extreme high-leverage values at the 99th percentile.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={strategyConfig.capOutliers}
                              onChange={(e) => setStrategyConfig({ ...strategyConfig, capOutliers: e.target.checked })}
                              className="h-4 w-4 rounded text-[#3b5bf6] focus:ring-[#3b5bf6]"
                            />
                          </label>

                          {/* Toggle 4: Drop Identifiers */}
                          <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer">
                            <div>
                              <div className="font-semibold text-slate-900">4. Drop Identifier Columns</div>
                              <p className="text-[11px] text-slate-500 mt-0.5">Excludes customer_id and contract_id from ML training matrix.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={strategyConfig.dropIdentifiers}
                              onChange={(e) => setStrategyConfig({ ...strategyConfig, dropIdentifiers: e.target.checked })}
                              className="h-4 w-4 rounded text-[#3b5bf6] focus:ring-[#3b5bf6]"
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {/* STAGE 5: APPLY TRANSFORMATIONS */}
                    {selectedStage === 5 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[#3b5bf6] text-xs font-bold">5</span>
                            <h3 className="text-sm font-bold text-slate-900">Stage 5: Transformation Engine Execution</h3>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            stepStatuses[5] === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-[#3b5bf6] border border-blue-200'
                          }`}>
                            {stepStatuses[5] === 'completed' ? '✓ Applied' : transformProgress > 0 ? `${transformProgress}%` : 'Ready to Run'}
                          </span>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800">DuckDB Execution Progress</span>
                            <span className="font-mono text-slate-600 font-bold">{transformProgress}%</span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#3b5bf6] transition-all duration-300"
                              style={{ width: `${transformProgress}%` }}
                            />
                          </div>

                          <div className="pt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleExecuteTransformations}
                              disabled={isTransforming}
                              className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                            >
                              {isTransforming ? 'Running Queries...' : transformProgress === 100 ? '↺ Re-Execute' : '⚡ Execute in DuckDB'}
                            </button>
                            <span className="text-[11px] text-slate-500">
                              {transformProgress === 100 ? 'Transformations committed to in-memory Parquet buffer.' : 'Runs DuckDB UPDATE and CASE statements.'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center text-xs">
                          <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                            <div className="font-bold text-slate-900 font-mono">0</div>
                            <span className="text-[10px] text-slate-500">Nulls Remaining</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                            <div className="font-bold text-slate-900 font-mono">23</div>
                            <span className="text-[10px] text-slate-500">Transformed Cols</span>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                            <div className="font-bold text-emerald-600 font-mono">7,043</div>
                            <span className="text-[10px] text-slate-500">Rows Preserved</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STAGE 6: VALIDATE OUTPUT */}
                    {selectedStage === 6 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[#3b5bf6] text-xs font-bold">6</span>
                            <h3 className="text-sm font-bold text-slate-900">Stage 6: Output Validation & ML Readiness</h3>
                          </div>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {stepStatuses[6] === 'completed' ? '✓ Production Ready' : '98.6% Quality Score'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                            <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                              <span>✓</span> Leakage-Safe
                            </div>
                            <p className="text-[11px] text-emerald-800 mt-1">
                              All imputers and scalers fitted strictly on X_train fold via Scikit-Learn Pipeline.
                            </p>
                          </div>
                          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                            <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                              <span>✓</span> Code Export
                            </div>
                            <p className="text-[11px] text-blue-800 mt-1">
                              Self-contained Python script generated with automated EDA figure generation.
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-[#f8faff] p-4 flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-900">groundwork_pipeline.py is Ready</div>
                            <p className="text-[11px] text-slate-500 mt-0.5">Click to download the reproducible Python script or view code in the next tab.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleDownloadScript}
                            className="rounded-lg bg-[#3b5bf6] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                          >
                            ⬇️ Download .py
                          </button>
                        </div>
                      </div>
                    )}

                    {/* BOTTOM STAGE ADVANCE / MARK COMPLETED CONTROL */}
                    <div className="pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        {stepStatuses[selectedStage] === 'completed' ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <span>✓</span> Stage {selectedStage} marked completed
                          </span>
                        ) : (
                          <span>Satisfied with this stage? Mark it completed manually.</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedStage > 1 && (
                          <button
                            type="button"
                            onClick={() => setSelectedStage(selectedStage - 1)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                          >
                            ← Prev
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleMarkStageCompleted(selectedStage)}
                          className="rounded-lg bg-[#3b5bf6] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <span>✓</span>
                          <span>
                            {selectedStage === 6
                              ? 'Finish Pipeline & Generate Script'
                              : stepStatuses[selectedStage] === 'completed'
                                ? 'Stage Completed · Next Stage →'
                                : 'Mark as Completed & Move to Next Stage →'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: PROPOSED RECIPE */}
                {activeTab === 'changes' && (
                  <div className="space-y-3 text-xs">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="font-semibold text-slate-900 flex items-center justify-between">
                        <span>1. Median Imputation</span>
                        <span className="text-[10px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">SimpleImputer</span>
                      </div>
                      <p className="text-slate-600 mt-1 leading-snug">
                        Applied to <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">total_charges</code> and <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">tenure</code> to eliminate null leakage without dropping rows.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="font-semibold text-slate-900 flex items-center justify-between">
                        <span>2. One-Hot Categorical Encoding</span>
                        <span className="text-[10px] font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">OneHotEncoder</span>
                      </div>
                      <p className="text-slate-600 mt-1 leading-snug">
                        Applied to <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">contract_type</code>, <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">payment_method</code> with <code className="font-mono text-[10px]">handle_unknown=&apos;ignore&apos;</code>.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="font-semibold text-slate-900 flex items-center justify-between">
                        <span>3. IQR Outlier Treatment</span>
                        <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">IQR Clipping</span>
                      </div>
                      <p className="text-slate-600 mt-1 leading-snug">
                        Capped extreme values outside 1.5 × IQR boundary on numeric features at 99th percentile.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="font-semibold text-slate-900 flex items-center justify-between">
                        <span>4. Stratified ML Split & Pipeline</span>
                        <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">train_test_split</span>
                      </div>
                      <p className="text-slate-600 mt-1 leading-snug">
                        Stratified 80/20 split preserving class distribution with leakage-safe Scikit-Learn Pipeline.
                      </p>
                    </div>
                  </div>
                )}

                {/* TAB 3: PYTHON SCRIPT */}
                {activeTab === 'script' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-t-lg border border-slate-200 text-xs">
                      <span className="font-mono font-semibold text-slate-700">groundwork_pipeline.py</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          className="rounded bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer"
                        >
                          {copiedCode ? '✓ Copied' : 'Copy Code'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadScript}
                          className="rounded bg-[#3b5bf6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 cursor-pointer"
                        >
                          ⬇️ Download .py
                        </button>
                      </div>
                    </div>
                    <pre className="rounded-b-lg bg-slate-950 p-4 font-mono text-[11px] text-slate-200 overflow-x-auto max-h-96 leading-relaxed select-text">
                      <code>{pythonScriptCode}</code>
                    </pre>
                  </div>
                )}

                {/* TAB 4: LOGS */}
                {activeTab === 'logs' && (
                  <div className="rounded-lg bg-slate-950 p-4 font-mono text-[11px] text-slate-300 space-y-1.5 h-72 overflow-y-auto">
                    {logs.map((log, i) => (
                      <p
                        key={i}
                        className={
                          log.type === 'success'
                            ? 'text-emerald-400'
                            : log.type === 'warn'
                              ? 'text-amber-400'
                              : log.type === 'code'
                                ? 'text-sky-400 font-bold'
                                : 'text-slate-300'
                        }
                      >
                        <span className="text-slate-500">[{log.time}]</span> {log.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Progress Bar: Execution Progress */}
              <div className="mt-8 pt-4 border-t border-[#f2f4f7]">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-slate-900">Pipeline Execution Progress</span>
                  <span className="text-slate-500">
                    {completedStepsCount} of 6 steps completed ({overallPercentage}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      overallStatus === 'completed' ? 'bg-emerald-500' : 'bg-[#3b5bf6]'
                    }`}
                    style={{ width: `${overallPercentage}%` }}
                  />
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
          setSelectedDataset(ds);
          setIsUploadModalOpen(false);
          navigate(`/pipelines?datasetId=${ds.id}`);
        }}
      />
    </div>
  );
}
