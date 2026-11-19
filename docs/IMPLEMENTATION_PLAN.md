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
| **M1 — Supabase Foundation**   | Local Supabase CLI, email/password + Google OAuth, profiles/workspaces, migrations, RLS, private buckets | ✅ Completed   |
| **M2 — Dataset Management**    | Upload, private Storage, metadata, formats, preview, delete                                              | ✅ Completed   |
| **M3 — Data Engine**           | DuckDB-Wasm worker, schema inference, profile, quality report                                            | ✅ Completed   |
| **M4 — EDA**                   | Feature trends, correlation heatmap, sample strategy, KPI cards, visual metrics                          | ✅ Completed   |
| **M5 — Preprocessing**         | Imputation, dedupe, encoding, scaling, outliers, column drops, preview                                    | ✅ Completed   |
| **M6 — Versioning + Approval** | Plan preview, explicit approval, immutable versions, version switcher, DuckDB in-memory execution        | ✅ Completed   |
| **M7 — Conversational Copilot**| Azure OpenAI gpt-5-mini integration, BYOK fallback, automatic transformation plan drafting, chat          | ✅ Completed   |
| **M8 — ML Export**             | Target/task selection, train/test split, Scikit-learn Pipeline/ColumnTransformer export, Parquet/CSV dl   | ✅ Completed   |
| **M9 — Release**               | Testing, security review, benchmarks, docs, full verification                                            | 🔄 In Progress |

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

## M1 — Supabase Foundation (Detailed)

### Tasks

- [x] Create initial schema migration (`supabase/migrations/20261113000000_initial_schema.sql`)
- [x] Configure `profiles`, `workspaces`, and `ai_preferences` tables
- [x] Add auto-profile and default workspace triggers on user signup
- [x] Enable RLS on all tables with single-owner isolation policies
- [x] Configure private Storage buckets (`datasets`, `artifacts`) with path-based owner RLS
- [x] Install `@supabase/supabase-js` and configure Supabase client
- [x] Create React `AuthProvider` and `useAuth` hook
- [x] Implement Auth UI (Sign In, Sign Up, Google OAuth) on Landing Page
- [x] Implement Dashboard page with Workspace selector and profile header
- [x] Add automated RLS invariant and cross-user isolation unit tests
- [x] Commit and push M1 to git
- Configure Google OAuth provider
- Set up Mailpit for local email testing
- Write cross-user RLS isolation tests
- Document auth setup steps

---

## M2 — Dataset Management

- [x] Multi-format file uploader (CSV, XLSX, JSON, JSONL) with drag-and-drop
- [x] Private Supabase Storage bucket uploads with RLS path validation
- [x] Dataset metadata persistence in PostgreSQL (`datasets`, `dataset_versions`)
- [x] Interactive data table preview with column types and sample rows
- [x] Cascade dataset deletion (versions, storage files, profile records)

---

## M3 — In-Browser Data Engine (DuckDB-Wasm)

- [x] DuckDB-Wasm Web Worker initialization and connection pooling
- [x] Schema inference and Arrow vector conversion
- [x] Dataset profiling: row count, column count, null counts, distinct counts
- [x] Numeric statistics: Min, Max, Mean, Standard Deviation, Median, IQR
- [x] Outlier detection via IQR method (1.5 × IQR boundary)
- [x] Overall Data Quality Score calculation
- [x] Column Inspector with type badges and distribution summaries

---

## M4 — Exploratory Data Analysis (EDA)

- [x] Interactive Trends distribution density curve with column switcher
- [x] Pearson correlation matrix computed via DuckDB `CORR()`
- [x] Color-coded correlation heatmap visualization with hover coefficients
- [x] Top KPI cards: Quality Score, Missing Values, Duplicate Rows, Total Records

---

## M5 — Preprocessing Engine

- [x] In-browser DuckDB transformation engine
- [x] Imputation operations: median, mean, mode, constant
- [x] Column removal (`drop_columns`)
- [x] Outlier treatment: IQR clipping (`clip_iqr`) and row filtering (`drop_rows`)
- [x] Feature scaling: `log1p`, `minmax`, `standard`
- [x] Categorical encoding: one-hot encoding (`encode`)
- [x] Row deduplication (`deduplicate`)
- [x] In-memory Parquet file export (`COPY ... TO 'file.parquet'`)

---

## M6 — Versioning + Approval Gate

- [x] Structured transformation plan parsing and step visualization
- [x] Mandatory user approval gate before executing any mutation
- [x] In-browser execution in DuckDB with zero backend analytical compute
- [x] Immutable version creation (`dataset_versions`) with SHA-256 content hashing
- [x] Dynamic sequential version numbering (`MAX(version_number) + 1`)
- [x] Interactive version switcher pills (`[v 1]`, `[v 2]`, `[v 3]`) with immediate state reload

---

## M7 — Conversational Copilot

- [x] Azure OpenAI `gpt-5-mini` / `gpt-4o-mini` integration
- [x] Vite reverse proxy (`/api/azure-openai`) bypassing CORS
- [x] BYOK local session storage with modal key manager
- [x] Dataset context injector (schema, statistics, missing rates, correlations)
- [x] Automatic structured transformation plan drafting in conversational responses
- [x] One-click approval card directly in the Copilot drawer

---

## M8 — Machine Learning & Pipeline Export

- [x] Leakage-safe Scikit-Learn Python code generator (`ColumnTransformer`, `Pipeline`)
- [x] Imputation transformers (`SimpleImputer` for numeric & categorical)
- [x] Scaling transformers (`StandardScaler`, `FunctionTransformer(np.log1p)`)
- [x] Categorical encoding (`OneHotEncoder(handle_unknown='ignore')`)
- [x] Stratified / random `train_test_split` with user-configurable test size and random seed
- [x] Code export modal with copy-to-clipboard and `.py` file download
- [x] Clean data export in binary Parquet and CSV formats

---

## M9 — Release, Quality & Verification

- [x] Unit and component test suite verification (Vitest)
- [x] Production build verification (`npm run build`)
- [x] End-to-end dataset flow validation
- [x] Architectural documentation and decision records updated
- [x] Multi-stage Docker container build verification
