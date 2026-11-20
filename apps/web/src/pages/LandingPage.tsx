import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/integrations/supabase';
import { AuthCard } from '@/components/auth/AuthCard';
import { GroundworkSculpture3D } from '@/components/landing/GroundworkSculpture3D';
import { ScrollDepthCard } from '@/components/landing/ScrollDepthCard';
import { clamp01, dampValue } from '@/utils/scroll3dMath';

interface PipelineStageSpec {
  index: string;
  name: string;
  stageTagline: string;
  headline: string;
  description: string;
  artifactTitle: string;
  codePreview: string;
  metrics: Array<{ label: string; value: string }>;
}

const PIPELINE_STAGES: PipelineStageSpec[] = [
  {
    index: '01',
    name: 'Ingest',
    stageTagline: 'Local DuckDB-Wasm Memory',
    headline: 'Drop CSV, Excel, JSON, or Parquet directly into browser memory.',
    description:
      'Files are parsed locally inside your browser tab via DuckDB-Wasm. Zero raw rows are transmitted to external compute servers, removing upload latency and data-residency risk.',
    artifactTitle: 'duckdb_ingest.sql',
    codePreview: `CREATE TABLE raw_customer_churn AS
SELECT * FROM read_csv(
  'customer_churn.csv',
  auto_detect = true,
  null_padding = true
);
-- 152 rows · 9 columns · 0 bytes uploaded`,
    metrics: [
      { label: 'Parse latency (10k rows)', value: '42 ms' },
      { label: 'Offsite payload', value: '0 bytes' },
      { label: 'Supported formats', value: 'CSV · XLSX · JSON' },
    ],
  },
  {
    index: '02',
    name: 'Profile',
    stageTagline: 'Statistical Schema Diagnostics',
    headline: 'Exact schema diagnostics, quantiles, IQR fences, and Pearson correlations.',
    description:
      'Every numeric and categorical feature is profiled in milliseconds—surfacing exact missingness rates, duplicate rows, identifier leakage, and statistical skew before modeling.',
    artifactTitle: 'profile_audit.json',
    codePreview: `{
  "rowCount": 152,
  "duplicateRows": 4,
  "overallMissingRate": "1.6%",
  "findings": [
    "total_charges: 10.5% null -> median impute",
    "tenure: 4 IQR outliers (> 92.5 mo)"
  ]
}`,
    metrics: [
      { label: 'Null audit precision', value: '100% exact' },
      { label: 'Outlier method', value: 'Tukey 1.5× IQR' },
      { label: 'Correlation matrix', value: 'Pairwise Pearson r' },
    ],
  },
  {
    index: '03',
    name: 'Transform',
    stageTagline: 'Approval-Gated Immutable Diffs',
    headline: 'Inspect and approve every transformation diff before a single cell changes.',
    description:
      'Groundwork never mutates source data silently. Every rule-based or natural-language cleaning plan renders an inspectable diff and writes a new immutable SHA-256 version.',
    artifactTitle: 'approved_plan_v2.json',
    codePreview: `{
  "version": "v1 -> v2 (immutable)",
  "operations": [
    { "type": "deduplicate" },
    { "type": "impute", "col": "total_charges", "by": "median" },
    { "type": "clip_iqr", "col": "tenure", "k": 1.5 }
  ]
}`,
    metrics: [
      { label: 'Source mutation', value: 'Never overwritten' },
      { label: 'Version fingerprint', value: 'SHA-256 hash' },
      { label: 'Version rollback', value: 'Instant 1-click' },
    ],
  },
  {
    index: '04',
    name: 'Export',
    stageTagline: 'Leakage-Safe Scikit-Learn Pipeline',
    headline: 'Ship leakage-safe Scikit-Learn pipelines ready for production training.',
    description:
      'Download cleaned tables alongside a standalone Python script that fits every imputer, scaler, and encoder strictly inside X_train with zero train-test contamination.',
    artifactTitle: 'groundwork_pipeline.py',
    codePreview: `X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
preprocessor = ColumnTransformer([
    ("num", Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ]), numeric_cols),
])`,
    metrics: [
      { label: 'Train/test leakage', value: 'Zero' },
      { label: 'Export artifacts', value: '.py · .md · .csv' },
      { label: 'Reproducibility', value: 'Deterministic seed' },
    ],
  },
];

const SAMPLE_SCHEMA_PREVIEW = [
  { col: 'tenure', type: 'BIGINT', missing: '0.0%', detail: '4 IQR outliers' },
  { col: 'total_charges', type: 'DOUBLE', missing: '10.5%', detail: 'Median impute' },
  { col: 'contract_type', type: 'VARCHAR', missing: '0.0%', detail: '3 categories' },
  { col: 'payment_method', type: 'VARCHAR', missing: '4.0%', detail: 'Mode impute' },
];

function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

export function LandingPage() {
  const { enterDemoMode } = useAuth();
  const topProgressRef = useRef<HTMLDivElement>(null);
  const [selectedStage, setSelectedStage] = useState<number>(0);
  const isDesktop = useIsDesktopViewport();

  useEffect(() => {
    const barEl = topProgressRef.current;
    if (!barEl) return;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastTime = performance.now();
    let target = 0;
    let current = 0;

    const readTarget = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      target = clamp01(window.scrollY / maxScroll);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      current = reducedMotion ? target : dampValue(current, target, 9.5, dt);
      barEl.style.transform = `scaleX(${current.toFixed(4)})`;

      if (Math.abs(target - current) > 0.0004) {
        rafId = requestAnimationFrame(tick);
      } else {
        current = target;
        barEl.style.transform = `scaleX(${current.toFixed(4)})`;
        rafId = 0;
      }
    };

    const onScroll = () => {
      readTarget();
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    readTarget();
    current = target;
    barEl.style.transform = `scaleX(${current.toFixed(4)})`;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const activeStage = PIPELINE_STAGES[selectedStage] ?? PIPELINE_STAGES[0]!;

  return (
    <div
      className="relative min-h-screen text-slate-900 selection:bg-indigo-100 selection:text-indigo-950"
      style={{
        background:
          'linear-gradient(180deg, #f4f3fb 0%, #f8f7fd 22%, #ffffff 48%, #faf9fe 74%, #f2f0fb 100%)',
      }}
    >
      {/* Fixed Full-Viewport 3D Sculpture Canvas (Desktop lg+ Only — Glides Side-to-Side Down Entire Page) */}
      {isDesktop && <GroundworkSculpture3D variant="fixed" selectedStage={selectedStage} />}

      {/* Strict 3-Zone Top Navigation Bar with Damped Hairline Scroll Progress */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f6f5fc]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-display text-base font-bold tracking-tight text-slate-900"
          >
            <svg
              className="h-5 w-5 text-indigo-600"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="8" height="8" rx="1.75" fill="currentColor" />
              <rect
                x="13"
                y="3"
                width="8"
                height="8"
                rx="1.75"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <rect
                x="3"
                y="13"
                width="8"
                height="8"
                rx="1.75"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <rect x="13" y="13" width="8" height="8" rx="1.75" fill="#818CF8" />
            </svg>
            <span>Groundwork</span>
          </a>

          {/* Zone 2: 4 Clean Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex"
          >
            <a
              href="#architecture"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-slate-950"
            >
              Architecture
            </a>
            <a
              href="#capabilities"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-slate-950"
            >
              Capabilities
            </a>
            <a
              href="#benchmarks"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-slate-950"
            >
              Benchmarks
            </a>
            <a
              href="#access"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-slate-950"
            >
              Security
            </a>
          </nav>

          {/* Zone 3: 1 Executive Primary Action */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={enterDemoMode}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Open Workspace
            </button>
          </div>
        </div>

        {/* Damped Global Hairline Scroll Ribbon (Compositor-Only scaleX) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-transparent"
        >
          <div
            ref={topProgressRef}
            className="h-full w-full origin-left bg-gradient-to-r from-indigo-600 via-violet-500 to-sky-400 will-change-transform"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </header>

      <main id="top">
        {/* HERO SECTION — Left Editorial Copy | Right Open Gallery for 3D Monolith (0°) */}
        <section className="relative flex min-h-[calc(100vh-4rem)] items-center border-b border-slate-200/70 py-14 lg:py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              {/* Left 6 cols: Crisp Editorial Hierarchy (z-20) */}
              <div className="relative z-20 space-y-7 lg:col-span-6">
                <p className="font-mono text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                  Browser-Local ML Data Studio
                </p>

                <h1 className="font-display text-4xl leading-[1.06] font-bold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl lg:text-[3.35rem]">
                  Prepare raw datasets for production ML, right in your browser.
                </h1>

                <p className="max-w-lg text-base leading-relaxed text-slate-600 sm:text-[1.0625rem]">
                  Profile schemas in milliseconds with DuckDB-Wasm, approve every transformation
                  diff before it runs, and export leakage-safe Scikit-Learn pipelines without ever
                  uploading sensitive rows.
                </p>

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <button
                    type="button"
                    onClick={enterDemoMode}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(79,70,229,0.28)] transition hover:bg-indigo-700"
                  >
                    <span>Launch Interactive Workspace</span>
                    <span aria-hidden="true">→</span>
                  </button>
                  <a
                    href="#access"
                    className="text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950 hover:decoration-slate-900"
                  >
                    Sign in with account
                  </a>
                </div>

                {/* Unboxed Engineering Proof Strip */}
                <div className="grid grid-cols-3 gap-4 border-t border-slate-200/80 pt-7">
                  <div>
                    <div className="font-mono text-base font-bold text-slate-950 tabular-nums">
                      0 bytes
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">Rows sent offsite</div>
                  </div>
                  <div>
                    <div className="font-mono text-base font-bold text-slate-950 tabular-nums">
                      SHA-256
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">Immutable versions</div>
                  </div>
                  <div>
                    <div className="font-mono text-base font-bold text-slate-950 tabular-nums">
                      Leak-free
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">Sklearn export</div>
                  </div>
                </div>
              </div>

              {/* Right 6 cols: Dedicated Open 3D Gallery Stage on Desktop, Inline 3D on Mobile */}
              <div className="lg:col-span-6">
                {!isDesktop ? (
                  <GroundworkSculpture3D variant="inline" selectedStage={selectedStage} />
                ) : (
                  <div className="min-h-[460px]" aria-hidden="true" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 01: EXECUTION ARCHITECTURE — Left Open Gallery for 3D Monolith (~94° Exploded) | Right Interactive Workbench */}
        <section
          id="architecture"
          className="relative border-b border-slate-200/70 py-24 lg:py-32"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              {/* Left 5 cols: Open Gallery Space where 3D Sculpture Glides & Explodes Strata */}
              <div className="hidden lg:col-span-5 lg:block" aria-hidden="true">
                <div className="min-h-[480px]" />
              </div>

              {/* Right 7 cols: Interactive 4-Stage Pipeline Inspector (z-20) */}
              <div className="relative z-20 space-y-6 lg:col-span-7">
                <div className="space-y-3">
                  <p className="font-mono text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                    01. Execution Architecture
                  </p>
                  <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-slate-950 text-balance sm:text-4xl">
                    Four deterministic stages from raw table to production Python.
                  </h2>
                </div>

                {/* Clean Architectural Stage Selector Tabs */}
                <div
                  role="tablist"
                  aria-label="Pipeline execution stages"
                  className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] sm:grid-cols-4"
                >
                  {PIPELINE_STAGES.map((stage, idx) => {
                    const isActive = idx === selectedStage;
                    return (
                      <button
                        key={stage.index}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setSelectedStage(idx)}
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${
                          isActive
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        <span
                          className={`font-mono ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}
                        >
                          {stage.index}
                        </span>
                        <span>{stage.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Active Stage Detail Card */}
                <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)] sm:p-7">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs font-semibold text-indigo-600">
                        {activeStage.index} · {activeStage.stageTagline}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {activeStage.artifactTitle}
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-bold tracking-tight text-slate-950">
                      {activeStage.headline}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {activeStage.description}
                    </p>
                  </div>

                  {/* Syntax Artifact Preview */}
                  <div className="mt-5 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950">
                    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                      <span className="font-mono text-[11px] font-medium text-slate-300">
                        {activeStage.artifactTitle}
                      </span>
                      <span className="font-mono text-[10px] tracking-wider text-indigo-400 uppercase">
                        Deterministic Artifact
                      </span>
                    </div>
                    <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
                      <code>{activeStage.codePreview}</code>
                    </pre>
                  </div>

                  {/* Stage Metrics Strip */}
                  <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
                    {activeStage.metrics.map((metric) => (
                      <div key={metric.label}>
                        <div className="font-mono text-sm font-bold text-slate-950 tabular-nums">
                          {metric.value}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{metric.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 02: CORE CAPABILITIES — Left Editorial Bento Cards | Right Open Gallery for 3D Monolith (~202°) */}
        <section
          id="capabilities"
          className="relative border-b border-slate-200/70 py-24 lg:py-32"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
              {/* Left 7 cols: Capability Bento (z-20) */}
              <div className="relative z-20 space-y-10 lg:col-span-7">
                <div className="space-y-3">
                  <p className="font-mono text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                    02. Core Capabilities
                  </p>
                  <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-slate-950 text-balance sm:text-4xl">
                    Engineered for reproducibility, privacy, and zero silent data corruption.
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* Card 1 (Full-width in 7-col lane): Local Compute + Live Schema Preview */}
                  <ScrollDepthCard className="sm:col-span-2">
                    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-7">
                      <div className="space-y-2.5">
                        <p className="font-mono text-xs font-semibold text-indigo-600">
                          Local Compute
                        </p>
                        <h3 className="font-display text-lg font-bold tracking-tight text-slate-950">
                          Browser-Local DuckDB Execution
                        </h3>
                        <p className="text-sm leading-relaxed text-slate-600">
                          Run analytical SQL aggregations, quantile scans, Pearson correlation
                          matrices, and multi-step preprocessing pipelines directly inside your
                          browser with zero server compute bills.
                        </p>
                      </div>

                      <div className="mt-6 overflow-x-auto border-t border-slate-100 pt-4">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="pb-2 font-medium">Column</th>
                              <th className="pb-2 font-medium">Type</th>
                              <th className="pb-2 text-right font-medium">Missing</th>
                              <th className="pb-2 text-right font-medium">Diagnostic</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                            {SAMPLE_SCHEMA_PREVIEW.map((row) => (
                              <tr key={row.col} className="text-slate-700">
                                <td className="py-2 font-semibold text-slate-900">{row.col}</td>
                                <td className="py-2 text-slate-500">{row.type}</td>
                                <td className="py-2 text-right">{row.missing}</td>
                                <td className="py-2 text-right font-sans text-indigo-700">
                                  {row.detail}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </ScrollDepthCard>

                  {/* Card 2: Governance */}
                  <ScrollDepthCard>
                    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <div className="space-y-2.5">
                        <p className="font-mono text-xs font-semibold text-indigo-600">
                          Governance
                        </p>
                        <h3 className="font-display text-lg font-bold tracking-tight text-slate-950">
                          Mandatory Approval Gate
                        </h3>
                        <p className="text-sm leading-relaxed text-slate-600">
                          No silent mutations. Every suggested cleaning plan renders an explicit
                          diff and waits for your sign-off.
                        </p>
                      </div>
                      <div className="mt-6 space-y-1.5 border-t border-slate-100 pt-4 font-mono text-xs tabular-nums">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Pending diff</span>
                          <span className="font-semibold text-slate-900">152 → 148 rows</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Execution</span>
                          <span className="font-semibold text-emerald-700">Approval gated</span>
                        </div>
                      </div>
                    </div>
                  </ScrollDepthCard>

                  {/* Card 3: Privacy */}
                  <ScrollDepthCard>
                    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <div className="space-y-2.5">
                        <p className="font-mono text-xs font-semibold text-indigo-600">Privacy</p>
                        <h3 className="font-display text-lg font-bold tracking-tight text-slate-950">
                          Bring Your Own Key (BYOK)
                        </h3>
                        <p className="text-sm leading-relaxed text-slate-600">
                          Use the built-in deterministic schema planner immediately, or connect your
                          own model key in session memory.
                        </p>
                      </div>
                      <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
                        Built-in local planner · Optional BYOK
                      </div>
                    </div>
                  </ScrollDepthCard>

                  {/* Card 4 (Full-width in 7-col lane): Auditability */}
                  <ScrollDepthCard className="sm:col-span-2">
                    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-7">
                      <div className="space-y-2.5">
                        <p className="font-mono text-xs font-semibold text-indigo-600">
                          Auditability
                        </p>
                        <h3 className="font-display text-lg font-bold tracking-tight text-slate-950">
                          Immutable Version Control &amp; Leakage-Safe Export
                        </h3>
                        <p className="text-sm leading-relaxed text-slate-600">
                          Original uploaded files are never overwritten. Every approved
                          transformation mints a new snapshot (
                          <code className="font-mono text-xs text-slate-900">v1</code>,{' '}
                          <code className="font-mono text-xs text-slate-900">v2</code>,{' '}
                          <code className="font-mono text-xs text-slate-900">v3</code>) with SHA-256
                          hashes, exact row/column deltas, and a synchronized Scikit-Learn script.
                        </p>
                      </div>
                      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs font-medium text-slate-600">
                        <span>SHA-256 fingerprints</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span>Markdown changelog</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span>Standalone ColumnTransformer .py</span>
                      </div>
                    </div>
                  </ScrollDepthCard>
                </div>
              </div>

              {/* Right 5 cols: Open Gallery Space where 3D Sculpture Sweeps Back Across */}
              <div className="hidden lg:col-span-5 lg:block" aria-hidden="true">
                <div className="min-h-[540px]" />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 03: QUANTITATIVE BENCHMARKS (CRISP FLOATING ARCHITECTURAL BAND) */}
        <section id="benchmarks" className="relative py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="relative z-20 rounded-2xl border border-slate-200/85 bg-white/95 px-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:px-8">
              <div className="grid grid-cols-1 divide-y divide-slate-200/80 md:grid-cols-4 md:divide-x md:divide-y-0">
                <div className="space-y-1.5 py-7 md:py-8 md:pr-7">
                  <div className="font-mono text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
                    100%
                  </div>
                  <div className="text-sm font-semibold text-slate-900">In-browser execution</div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Profiling, histograms, correlation matrices, and cleaning execute locally
                    without server round-trips.
                  </p>
                </div>
                <div className="space-y-1.5 py-7 md:px-7 md:py-8">
                  <div className="font-mono text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
                    6 Stages
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Guided ML pipeline</div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Structured workflow from ingestion and anomaly detection through sign-off and
                    Python export.
                  </p>
                </div>
                <div className="space-y-1.5 py-7 md:px-7 md:py-8">
                  <div className="font-mono text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
                    Zero
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Train/test leakage</div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Exported Scikit-Learn pipelines fit every imputer, scaler, and encoder strictly
                    on the training split.
                  </p>
                </div>
                <div className="space-y-1.5 py-7 md:py-8 md:pl-7">
                  <div className="font-mono text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
                    1 Click
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Version rollback</div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Compare raw v1 against transformed v2/v3 distributions side-by-side and switch
                    versions cleanly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 04: ACCESS WORKSPACE & SECURITY — Left Open Gallery for Converged 360° Monolith | Right Auth & Security */}
        <section id="access" className="relative border-t border-slate-200/70 py-14 lg:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              {/* Left 5 cols: Dedicated Open Gallery Stage for 360° Converged 3D Monolith */}
              <div className="hidden lg:col-span-5 lg:block" aria-hidden="true">
                <div className="min-h-[420px]" />
              </div>

              {/* Right 7 cols: Access Copy + Light-Studio AuthCard + Security Guarantees (z-20) */}
              <div className="relative z-20 space-y-5 lg:col-span-7">
                <div className="space-y-2">
                  <p className="font-mono text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                    03. Access Workspace
                  </p>
                  <h2 className="font-display text-2xl font-bold tracking-[-0.025em] text-slate-950 text-balance sm:text-3xl">
                    Start preparing real datasets in seconds.
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Sign in to sync workspace metadata across sessions, or launch the browser
                    sandbox preloaded with real churn, revenue, and e-commerce tables.
                  </p>
                </div>

                <div className="max-w-lg">
                  <AuthCard />
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-slate-200/80 pt-5 sm:grid-cols-3">
                  <div>
                    <div className="font-mono text-xs font-semibold text-indigo-600">01. RLS</div>
                    <div className="mt-1 text-xs font-semibold text-slate-900">
                      Row-Level Isolation
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Workspace records isolated per authenticated account.
                    </p>
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-indigo-600">02. BYOK</div>
                    <div className="mt-1 text-xs font-semibold text-slate-900">
                      Ephemeral Keys
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Provider keys remain strictly in browser session memory.
                    </p>
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-indigo-600">
                      03. Sandbox
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-900">
                      Zero-Setup Upload
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Drop CSV, XLSX, or JSON and export Python right away.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="relative z-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-xs text-slate-500 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-slate-900">Groundwork</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>Browser-local data preparation and ML pipeline studio</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#architecture" className="transition-colors hover:text-slate-900">
              Architecture
            </a>
            <a href="#capabilities" className="transition-colors hover:text-slate-900">
              Capabilities
            </a>
            <a href="#access" className="transition-colors hover:text-slate-900">
              Access
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
