# Groundwork — Implementation Plan

## Document Control

| Field        | Value                   |
| ------------ | ----------------------- |
| Product      | Groundwork              |
| Spec Version | V1.0                    |
| Created      | 2026-11-13              |
| Status       | Active — M0 in progress |

## Milestone Overview

| Milestone                      | Scope                                                                                                    | Status         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------- |
| **M0 — Repo Foundation**       | Vite/React/TS, Tailwind, lint, typecheck, Dockerfile, Compose, CI skeleton                               | ✅ Completed   |
| **M1 — Supabase Foundation**   | Local Supabase CLI, email/password + Google OAuth, profiles/workspaces, migrations, RLS, private buckets | 🔄 Next Up     |
| **M2 — Dataset Management**    | Upload, private Storage, metadata, formats, preview, delete                                              | ⬜ Not Started |
| **M3 — Data Engine**           | DuckDB-Wasm worker, schema inference, profile, quality report                                            | ⬜ Not Started |
| **M4 — EDA**                   | Plotly charts, correlation, sample strategy, target exploration                                          | ⬜ Not Started |
| **M5 — Preprocessing**         | Imputation, dedupe, encoding, scaling, outliers, datetime, preview                                       | ⬜ Not Started |
| **M6 — Versioning + Approval** | Plan preview, explicit approval, immutable versions, operation history, undo/restore                     | ⬜ Not Started |
| **M7 — BYOK Copilot**          | AI settings, Edge Function proxy, OpenAI/Gemini adapters, agent planner, chat                            | ⬜ Not Started |
| **M8 — ML Export**             | Target/task selection, train/test split, Scikit-learn Pipeline/ColumnTransformer export                  | ⬜ Not Started |
| **M9 — Release**               | Playwright E2E, security review, benchmarks, docs, Cloudflare Pages deployment                           | ⬜ Not Started |

---

## M0 — Repo Foundation (Detailed)

### Tasks

- [x] Initialize git repository
- [x] Create `docs/IMPLEMENTATION_PLAN.md` and `docs/DECISIONS.md`
- [x] Scaffold React + Vite + TypeScript + Tailwind CSS monorepo under `apps/web/`
- [x] Enable TypeScript strict mode
- [x] Configure ESLint + Prettier
- [x] Add Vitest and a smoke test
- [x] Add Dockerfile (multi-stage) and `compose.yaml`
- [x] Add Supabase CLI configuration placeholder
- [x] Create `.env.example` with documented placeholders
- [x] Verify no secrets committed (`.gitignore` review)
- [x] Run lint, typecheck, tests, and production build — all PASS
- [x] Commit and push M0

### Exit Criteria

- App runs locally with `npm run dev`
- App builds for production with `npm run build`
- Docker build produces a working static image
- Lint, typecheck, and tests pass cleanly
- `.env.example` exists with placeholders only — no real secrets
- Monorepo structure matches spec Section 14.1

### Dependencies

- Node.js ≥ 18 ✅ (v24.4.0)
- Docker ✅ (v28.0.4)
- npm ✅

### Files to Create

```
apps/web/
  src/
    app/           — routes, providers
    components/    — reusable UI
    pages/         — page components
    ai/            — AI module (placeholder)
    engine/        — data engine (placeholder)
    integrations/  — Supabase integration (placeholder)
    storage/       — storage module (placeholder)
    exporters/     — export module (placeholder)
    types/         — shared TypeScript types
    main.tsx
    App.tsx
    index.css
  index.html
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
supabase/
  config.toml
  migrations/     — (empty, ready for M1)
  functions/      — (placeholder structure)
  seed.sql
tests/
  unit/
  integration/
  e2e/
  security/
docs/
  IMPLEMENTATION_PLAN.md
  DECISIONS.md
Dockerfile
compose.yaml
.env.example
package.json       — root workspace
README.md
```

---

## M1 — Supabase Foundation (Preview)

### Prerequisites (Owner Action Required)

- Supabase project URL and publishable key
- Google OAuth client ID and secret
- Docker running for Supabase CLI local stack

### Tasks

- Initialize Supabase CLI project
- Create migration: `profiles`, `workspaces` tables
- Enable RLS on all tables
- Configure email/password auth
- Configure Google OAuth provider
- Set up Mailpit for local email testing
- Write cross-user RLS isolation tests
- Document auth setup steps

---

## M2–M9

Detailed task breakdowns will be added as each prior milestone is completed and accepted.
