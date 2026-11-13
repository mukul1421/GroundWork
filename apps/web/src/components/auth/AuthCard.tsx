import { useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/integrations/supabase';

export function AuthCard() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
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
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await signInWithEmail(email, password);
        if (signInError) {
          setError(signInError.message);
        }
      } else {
        const { error: signUpError } = await signUpWithEmail(email, password);
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setMessage('Account created! Please check your email for confirmation.');
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
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
      setError('Google sign-in failed. Please try again.');
    }
  };

  return (
    <div className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 p-6 shadow-xl backdrop-blur-sm">
      {/* Tab Switcher */}
      <div className="mb-6 flex rounded-lg bg-slate-900/60 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            mode === 'signin' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
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
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            mode === 'signup' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Sign Up
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 rounded-md border border-rose-800/50 bg-rose-950/40 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-emerald-800/50 bg-emerald-950/40 p-3 text-xs text-emerald-300">
          {message}
        </div>
      )}

      {/* Email/Password Form */}
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-slate-300" htmlFor="email">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-sky-500 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-sky-400 disabled:opacity-50"
        >
          {submitting
            ? 'Processing...'
            : mode === 'signin'
              ? 'Sign In to Workspace'
              : 'Create Account'}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-800 px-2 text-slate-400">or continue with</span>
        </div>
      </div>

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={() => {
          void handleGoogle();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700/50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
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
        Continue with Google
      </button>

      {/* BYOK & Privacy Disclaimer */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
        Authentication provides private workspace isolation. Groundwork never stores your AI API
        keys on the server.
      </p>
    </div>
  );
}
