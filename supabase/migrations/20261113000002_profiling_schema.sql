-- ==============================================================================
-- Groundwork V1 — Profiling Schema Migration (Milestone M3)
-- Tables: dataset_profiles, column_profiles
-- RLS: Strict workspace owner isolation via dataset_versions join
-- ==============================================================================

-- 1. Dataset Profiles Table
CREATE TABLE IF NOT EXISTS public.dataset_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id UUID NOT NULL REFERENCES public.dataset_versions(id) ON DELETE CASCADE,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dataset_version_id)
);

-- 2. Column Profiles Table
CREATE TABLE IF NOT EXISTS public.column_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id UUID NOT NULL REFERENCES public.dataset_versions(id) ON DELETE CASCADE,
  column_name TEXT NOT NULL,
  inferred_type TEXT NOT NULL,
  nullable BOOLEAN NOT NULL DEFAULT true,
  missing_count INT NOT NULL DEFAULT 0,
  distinct_count INT NOT NULL DEFAULT 0,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dataset_version_id, column_name)
);

-- Indexes (Spec Section 10.2)
CREATE INDEX IF NOT EXISTS idx_profiles_version ON public.dataset_profiles(dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_column_profiles_version ON public.column_profiles(dataset_version_id);

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- ==============================================================================

ALTER TABLE public.dataset_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace owner manages dataset profiles"
  ON public.dataset_profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dataset_versions dv
      JOIN public.datasets d ON dv.dataset_id = d.id
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE dv.id = dataset_profiles.dataset_version_id
      AND w.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dataset_versions dv
      JOIN public.datasets d ON dv.dataset_id = d.id
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE dv.id = dataset_profiles.dataset_version_id
      AND w.owner_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.column_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace owner manages column profiles"
  ON public.column_profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dataset_versions dv
      JOIN public.datasets d ON dv.dataset_id = d.id
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE dv.id = column_profiles.dataset_version_id
      AND w.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dataset_versions dv
      JOIN public.datasets d ON dv.dataset_id = d.id
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE dv.id = column_profiles.dataset_version_id
      AND w.owner_id = (SELECT auth.uid())
    )
  );
