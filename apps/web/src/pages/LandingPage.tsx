import { AuthCard } from '@/components/auth/AuthCard';

/**
 * Landing page — shown before authentication.
 * Spec §3.2: Product summary, sign up, sign in, Google OAuth,
 * privacy and BYOK explanation.
 */
export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-4xl space-y-10 text-center">
        {/* Brand Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            Groundwork V1 Baseline
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            Clean Data with an <span className="text-sky-400">AI Copilot</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-slate-400 sm:text-lg">
            Upload datasets, explore automated profiling, collaborate with an AI assistant on
            deterministic transformations, and export production-ready Scikit-learn pipelines.
          </p>
        </div>

        {/* Two-column layout: Features + Auth card */}
        <div className="grid grid-cols-1 items-start gap-8 text-left md:grid-cols-2">
          {/* Features Column */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Core Capabilities
            </h2>
            <FeatureItem
              title="Browser-Local DuckDB Execution"
              description="Zero server compute costs. Your data is processed directly inside your browser using WebAssembly."
            />
            <FeatureItem
              title="Mandatory User Approval Gate"
              description="No silent mutations. Every change generates an exact impact preview and requires your explicit approval."
            />
            <FeatureItem
              title="Bring Your Own Key (BYOK)"
              description="Use your own OpenAI or Google Gemini API key. Keys remain in memory and are never persisted."
            />
            <FeatureItem
              title="Immutable Version Control"
              description="Original data is never overwritten. Every approved transformation produces a reproducible, auditable version."
            />
          </div>

          {/* Auth Card Column */}
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Access Workspace
            </h2>
            <AuthCard />
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-600">
          Zero-cost infrastructure target · Your AI keys, your billing · Strict Row Level Security
        </p>
      </div>
    </div>
  );
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition hover:border-slate-700">
      <h3 className="font-semibold text-sky-300">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}
