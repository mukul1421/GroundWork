import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { AuthError, type User, type Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './client';
import type { Profile, Workspace } from '@/types/database';
import { AuthContext } from './useAuth';

const DEMO_MODE_KEY = 'groundwork_demo_mode';

const DEMO_USER: User = {
  id: 'user-groundwork-demo',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'alex.chen@groundwork.local',
  app_metadata: { provider: 'local' },
  user_metadata: { full_name: 'Alex Chen' },
  created_at: new Date().toISOString(),
};

const DEMO_PROFILE: Profile = {
  id: 'user-groundwork-demo',
  display_name: 'Alex Chen',
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEMO_WORKSPACE: Workspace = {
  id: 'ws-groundwork-local',
  name: 'Local ML Workspace',
  owner_id: 'user-groundwork-demo',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const activateDemoWorkspace = useCallback(() => {
    try {
      sessionStorage.setItem(DEMO_MODE_KEY, '1');
    } catch {
      // Ignore storage access restrictions
    }
    setIsDemoMode(true);
    setUser(DEMO_USER);
    setProfile(DEMO_PROFILE);
    setWorkspaces([DEMO_WORKSPACE]);
    setActiveWorkspace(DEMO_WORKSPACE);
    setLoading(false);
  }, []);

  const fetchProfileAndWorkspaces = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      const { data: workspacesData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true });

      if (workspacesData && workspacesData.length > 0) {
        setWorkspaces(workspacesData);
        setActiveWorkspace((prev) => prev ?? workspacesData[0] ?? null);
      }
    } catch {
      // Quiet fail if Supabase is offline/not initialized
    }
  }, []);

  useEffect(() => {
    // Support ?autostart=1 or existing sandbox session
    const params = new URLSearchParams(window.location.search);
    const hasAutoStart = params.get('autostart') === '1';
    let savedDemo = false;
    try {
      savedDemo = sessionStorage.getItem(DEMO_MODE_KEY) === '1';
    } catch {
      savedDemo = false;
    }

    if (hasAutoStart || savedDemo) {
      activateDemoWorkspace();
      return;
    }

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    void supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          void fetchProfileAndWorkspaces(initialSession.user.id);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        setIsDemoMode(false);
        void fetchProfileAndWorkspaces(currentSession.user.id);
      } else {
        setProfile(null);
        setWorkspaces([]);
        setActiveWorkspace(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfileAndWorkspaces, activateDemoWorkspace]);

  const signInWithEmail = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      if (!email.includes('@') || password.length < 6) {
        return {
          error: new AuthError(
            'Enter a valid email address and a password with at least 6 characters.',
          ),
        };
      }
      // Create a local session with the user's email when cloud auth is not configured
      const displayName = email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Data Engineer';
      const formattedName = displayName.replace(/\b\w/g, (c) => c.toUpperCase());
      try {
        sessionStorage.setItem(DEMO_MODE_KEY, '1');
      } catch {
        // Ignore
      }
      setIsDemoMode(true);
      setUser({ ...DEMO_USER, email });
      setProfile({ ...DEMO_PROFILE, display_name: formattedName });
      setWorkspaces([DEMO_WORKSPACE]);
      setActiveWorkspace(DEMO_WORKSPACE);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      if (!email.includes('@') || password.length < 6) {
        return {
          error: new AuthError(
            'Enter a valid email address and a password with at least 6 characters.',
          ),
        };
      }
      return signInWithEmail(email, password);
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      activateDemoWorkspace();
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      sessionStorage.removeItem(DEMO_MODE_KEY);
    } catch {
      // Ignore
    }
    if (isDemoMode || !isSupabaseConfigured) {
      setIsDemoMode(false);
      setUser(null);
      setSession(null);
      setProfile(null);
      setWorkspaces([]);
      setActiveWorkspace(null);
      return { error: null };
    }
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const refreshWorkspaces = async () => {
    if (user && !isDemoMode) {
      await fetchProfileAndWorkspaces(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        workspaces,
        activeWorkspace,
        loading,
        isDemoMode,
        isSupabaseConfigured,
        setActiveWorkspace,
        enterDemoMode: activateDemoWorkspace,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        refreshWorkspaces,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
