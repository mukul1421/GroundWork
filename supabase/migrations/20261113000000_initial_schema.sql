-- ==============================================================================
-- Groundwork V1 — Initial Schema Migration (Milestone M1)
-- Tables: profiles, workspaces, ai_preferences
-- Storage buckets: datasets, artifacts
-- RLS: Default-deny with strict owner isolation
-- ==============================================================================

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Workspaces table (V1: Single-owner workspaces)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. AI Preferences table (Provider preference only, NEVER API keys)
CREATE TABLE IF NOT EXISTS public.ai_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini')),
  model TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_id);

-- ==============================================================================
-- Trigger: Auto-update updated_at timestamp
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_ai_preferences_updated_at
  BEFORE UPDATE ON public.ai_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- Trigger: Handle new user creation (auto-create profile and default workspace)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.workspaces (owner_id, name)
  VALUES (
    NEW.id,
    'Default Workspace'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- ==============================================================================

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Workspaces RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select workspaces"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "Owner can insert workspaces"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "Owner can update workspaces"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "Owner can delete workspaces"
  ON public.workspaces FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- AI Preferences RLS
ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own ai preferences"
  ON public.ai_preferences FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own ai preferences"
  ON public.ai_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own ai preferences"
  ON public.ai_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ==============================================================================
-- Storage Buckets & Policies (datasets & artifacts)
-- Path format:
--   datasets/<user_id>/<workspace_id>/<dataset_id>/<version_id>/<filename>
--   artifacts/<user_id>/<workspace_id>/<dataset_id>/<run_id>/<artifact_filename>
-- ==============================================================================

-- Insert private buckets into storage.buckets if not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('datasets', 'datasets', false, 41943040, NULL),
  ('artifacts', 'artifacts', false, 41943040, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 41943040;

-- Storage RLS: datasets bucket
CREATE POLICY "Users can read own dataset objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'datasets'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = split_part(name, '/', 2)
      AND w.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can upload own dataset objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'datasets'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = split_part(name, '/', 2)
      AND w.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own dataset objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'datasets'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = split_part(name, '/', 2)
      AND w.owner_id = (SELECT auth.uid())
    )
  );

-- Storage RLS: artifacts bucket
CREATE POLICY "Users can read own artifact objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'artifacts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = split_part(name, '/', 2)
      AND w.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can upload own artifact objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'artifacts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = split_part(name, '/', 2)
      AND w.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own artifact objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'artifacts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = split_part(name, '/', 2)
      AND w.owner_id = (SELECT auth.uid())
    )
  );
