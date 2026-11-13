import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Supabase Schema & RLS Policy Invariants (M1)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20261113000000_initial_schema.sql',
  );
  const sql = readFileSync(migrationPath, 'utf-8');

  it('enables Row Level Security on profiles table', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.profiles\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
  });

  it('enables Row Level Security on workspaces table', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.workspaces\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
  });

  it('enables Row Level Security on ai_preferences table', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.ai_preferences\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i,
    );
  });

  it('enforces owner-only policy on workspaces for all operations', () => {
    expect(sql).toMatch(/ON\s+public\.workspaces\s+FOR\s+SELECT/i);
    expect(sql).toMatch(/ON\s+public\.workspaces\s+FOR\s+INSERT/i);
    expect(sql).toMatch(/ON\s+public\.workspaces\s+FOR\s+UPDATE/i);
    expect(sql).toMatch(/ON\s+public\.workspaces\s+FOR\s+DELETE/i);
    expect(sql).toContain('owner_id = (SELECT auth.uid())');
  });

  it('configures private storage buckets with RLS', () => {
    expect(sql).toContain("'datasets'");
    expect(sql).toContain("'artifacts'");
    expect(sql).toMatch(/public\s*=\s*false/i);
    // Verifies path-based workspace owner check
    expect(sql).toContain("split_part(name, '/', 1) = (SELECT auth.uid())::text");
    expect(sql).toContain('w.owner_id = (SELECT auth.uid())');
  });

  it('does NOT contain service_role keys or secrets', () => {
    expect(sql).not.toContain('service_role');
    expect(sql).not.toContain('anon_key');
    expect(sql).not.toContain('secret');
  });
});
