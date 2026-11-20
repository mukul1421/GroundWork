import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const envKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  isValidHttpUrl(envUrl) &&
    envKey &&
    !envUrl.includes('localhost:54321') &&
    !envUrl.includes('your-') &&
    !envUrl.includes('example.com') &&
    !envUrl.includes('placeholder') &&
    envKey !== 'placeholder-anon-key',
);

const supabaseUrl = isSupabaseConfigured ? envUrl : 'https://unconfigured.supabase.co';
const supabaseKey = isSupabaseConfigured ? envKey : 'unconfigured-anon-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    detectSessionInUrl: isSupabaseConfigured,
  },
});
