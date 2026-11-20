import { useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/integrations/supabase';

export function AuthCard() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, enterDemoMode, isSupabaseConfigured } =
    useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid work or personal email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await signInWithEmail(trimmedEmail, password);
        if (signInError) {
          setError(signInError.message);
        }
      } else {
        const { error: signUpError } = await signUpWithEmail(trimmedEmail, password);
        if (signUpError) {
          setError(signUpError.message);
        } else if (isSupabaseConfigured) {
          setMessage('Account created. Check your inbox to confirm your email address.');
        }
      }
    } catch {
      setError('Unable to reach authentication service. You can launch the local workspace below.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      const { error: googleError } = await signInWithGoogle();
      if (googleError) {
        setError(googleError.message);
      }
    } catch {
      setError('Google sign-in failed. Please try again or use the interactive workspace.');
    }
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_50px_-24px_rgba(79,70,229,0.14)]">
      {/* Segmented Auth Mode Switch */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100/90 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
            setMessage(null);
          }}
          className={`rounded-md py-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            mode === 'signin'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError(null);
            setMessage(null);
          }}
          className={`rounded-md py-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            mode === 'signup'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Sign Up
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
        >
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800"
        >
          {message}
        </div>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-slate-700" htmlFor="auth-email">
            Email Address
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@company.com"
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafd] px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafd] px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
        >
          {submitting
            ? 'Signing in...'
            : mode === 'signin'
              ? 'Sign In to Workspace'
              : 'Create Workspace Account'}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200/90" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-slate-400">or continue with</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => {
            void handleGoogle();
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
            />
            <path
              fill="#FBBC05"
              d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <button
          type="button"
          onClick={enterDemoMode}
          className="w-full rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100/80 hover:text-indigo-800 cursor-pointer"
        >
          Explore Interactive Sandbox
        </button>
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
        {isSupabaseConfigured
          ? 'Private workspace isolation with Row-Level Security. Raw datasets stay in your browser.'
          : 'Instant browser-local workspace preloaded with sample datasets. Upload your own CSV, XLSX, or JSON anytime.'}
      </p>
    </div>
  );
}
