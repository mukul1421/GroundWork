/**
 * Landing page — shown before authentication.
 * Spec §3.2: Product summary, sign up, sign in, Google OAuth,
 * privacy and BYOK explanation.
 *
 * M0: Placeholder structure. Full auth UI is built in M1.
 */
export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Logo */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight text-sky-400">Groundwork</h1>
          <p className="text-lg text-slate-400">AI-assisted data preparation for everyone</p>
        </div>

        {/* Feature highlights */}
        <div className="space-y-3 text-left">
          <FeatureItem
            title="Upload & Profile"
            description="Upload CSV, XLSX, JSON — get instant data profiling and quality reports."
          />
          <FeatureItem
            title="AI Copilot"
            description="Ask an AI assistant to clean, transform, and prepare your data. BYOK — use your own API key."
          />
          <FeatureItem
            title="Approve & Export"
            description="Every change requires your explicit approval. Export ML-ready data and Scikit-learn pipelines."
          />
        </div>

        {/* Auth placeholder — M1 will add real sign-in */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <p className="text-sm text-slate-500">
            Authentication will be available in the next milestone.
          </p>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-600">
          Zero-cost infrastructure target · Your AI keys, your billing · Private by default
        </p>
      </div>
    </div>
  );
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
      <h3 className="font-semibold text-sky-300">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}
