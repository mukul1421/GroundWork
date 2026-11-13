-- ==============================================================================
-- Groundwork V1 — Datasets Schema Migration (Milestone M2)
-- Tables: datasets, dataset_versions
-- RLS: Strict workspace owner isolation
-- ==============================================================================

-- 1. Datasets Table
CREATE TABLE IF NOT EXISTS public.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('csv', 'xlsx', 'json', 'jsonl')),
  status TEXT NOT NULL CHECK (status IN ('UPLOADING', 'UPLOADED', 'PROFILING', 'READY', 'PROCESSING', 'ERROR')),
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Dataset Versions Table (Immutable versions)
CREATE TABLE IF NOT EXISTS public.dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES public.dataset_versions(id),
  version_number INT NOT NULL,
  bucket_id TEXT NOT NULL DEFAULT 'datasets',
  storage_path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  column_count INT NOT NULL DEFAULT 0,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dataset_id, version_number)
);

-- Add foreign key constraint to datasets.active_version_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_datasets_active_version'
  ) THEN
    ALTER TABLE public.datasets
      ADD CONSTRAINT fk_datasets_active_version
      FOREIGN KEY (active_version_id)
      REFERENCES public.dataset_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes (Spec Section 10.2)
CREATE INDEX IF NOT EXISTS idx_datasets_workspace ON public.datasets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_versions_dataset ON public.dataset_versions(dataset_id, version_number DESC);

-- Trigger: auto-update updated_at on datasets
CREATE TRIGGER set_datasets_updated_at
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- ==============================================================================

-- Datasets RLS
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace owner manages datasets"
  ON public.datasets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = datasets.workspace_id
      AND w.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = datasets.workspace_id
      AND w.owner_id = (SELECT auth.uid())
    )
  );

-- Dataset Versions RLS
ALTER TABLE public.dataset_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace owner manages dataset versions"
  ON public.dataset_versions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.datasets d
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE d.id = dataset_versions.dataset_id
      AND w.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.datasets d
      JOIN public.workspaces w ON d.workspace_id = w.id
      WHERE d.id = dataset_versions.dataset_id
      AND w.owner_id = (SELECT auth.uid())
    )
  );
