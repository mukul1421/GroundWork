import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Profiling Schema & RLS Policy Invariants (M3)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20261113000002_profiling_schema.sql',
  );
  const sql = readFileSync(migrationPath, 'utf-8');

  it('enables Row Level Security on dataset_profiles table', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.dataset_profiles\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i,
    );
  });

  it('enables Row Level Security on column_profiles table', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.column_profiles\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i,
    );
  });

  it('enforces workspace ownership check through dataset_versions on dataset_profiles', () => {
    expect(sql).toMatch(/ON\s+public\.dataset_profiles\s+FOR\s+ALL/i);
    expect(sql).toContain('w.owner_id = (SELECT auth.uid())');
  });

  it('enforces workspace ownership check through dataset_versions on column_profiles', () => {
    expect(sql).toMatch(/ON\s+public\.column_profiles\s+FOR\s+ALL/i);
    expect(sql).toContain('w.owner_id = (SELECT auth.uid())');
  });

  it('defines unique constraints for version profiling', () => {
    expect(sql).toMatch(/UNIQUE\s*\(dataset_version_id\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(dataset_version_id,\s*column_name\)/i);
  });
});
