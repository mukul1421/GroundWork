import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Datasets Schema & RLS Policy Invariants (M2)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20261113000001_datasets_schema.sql',
  );
  const sql = readFileSync(migrationPath, 'utf-8');

  it('enables Row Level Security on datasets table', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.datasets\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
  });

  it('enables Row Level Security on dataset_versions table', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.dataset_versions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i,
    );
  });

  it('enforces workspace ownership check on datasets', () => {
    expect(sql).toMatch(/ON\s+public\.datasets\s+FOR\s+ALL/i);
    expect(sql).toContain('w.id = datasets.workspace_id');
    expect(sql).toContain('w.owner_id = (SELECT auth.uid())');
  });

  it('enforces workspace ownership check on dataset_versions', () => {
    expect(sql).toMatch(/ON\s+public\.dataset_versions\s+FOR\s+ALL/i);
    expect(sql).toContain('d.id = dataset_versions.dataset_id');
    expect(sql).toContain('w.owner_id = (SELECT auth.uid())');
  });

  it('defines format check constraint for supported types', () => {
    expect(sql).toMatch(
      /CHECK\s*\(source_format\s+IN\s*\('csv',\s*'xlsx',\s*'json',\s*'jsonl'\)\)/i,
    );
  });

  it('defines unique version per dataset constraint', () => {
    expect(sql).toMatch(/UNIQUE\s*\(dataset_id,\s*version_number\)/i);
  });
});
