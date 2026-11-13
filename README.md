# Groundwork

**AI-assisted, conversational data preparation platform.**

Upload datasets, explore profiling and EDA results, ask an AI copilot to prepare changes, approve each proposed modification, and export reproducible ML-ready data and Scikit-learn pipelines.

## Key Features (V1)

- **Upload & Profile** — CSV, XLSX, JSON, JSONL with automatic profiling and quality reports
- **Exploratory Data Analysis** — Histograms, box plots, correlation heatmaps, scatter plots via Plotly.js
- **AI Copilot (BYOK)** — Conversational data preparation with OpenAI or Google Gemini using your own API key
- **Explicit Approval** — Every data mutation requires your explicit approval after reviewing the exact plan and impact
- **Immutable Versioning** — Original data is never modified; each transformation creates a new version
- **ML Export** — Scikit-learn Pipeline/ColumnTransformer code generation with leakage-safe train/test splits
- **Zero-Cost Infrastructure** — Built on Supabase free tier + Cloudflare Pages; you only pay your AI provider

## Architecture

```
Browser (React + Vite + TypeScript + Tailwind CSS)
  ├── DuckDB-Wasm (Web Worker) — profiling, EDA, preprocessing
  ├── Supabase Auth — email/password + Google OAuth
  ├── Supabase PostgreSQL — workspace & dataset metadata
  ├── Supabase Private Storage — dataset files & artifacts
  └── Supabase Edge Function — BYOK AI proxy (OpenAI / Gemini)
```

All dataset processing happens in the browser. The server stores metadata and proxies AI requests.

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Docker (for Supabase local stack)

### Setup

```bash
# Clone
git clone https://github.com/mukul1421/GroundWork.git
cd GroundWork

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Supabase project URL and publishable key

# Start local Supabase (Docker must be running)
npx supabase start

# Start development server
npm run dev
```

### Available Commands

```bash
npm run dev         # Start Vite dev server (port 5173)
npm run build       # TypeScript check + production build
npm run preview     # Preview production build
npm run lint        # ESLint check
npm run typecheck   # TypeScript strict check
npm test            # Run Vitest tests
npm run format      # Format with Prettier
```

### Docker

```bash
# Development with hot reload
docker compose up web-dev

# Production preview
docker compose --profile preview up web-preview
docker build -t groundwork-web:local .
```

## Project Structure

```
groundwork/
├── apps/web/           # React + Vite frontend
│   └── src/
│       ├── ai/         # AI copilot module
│       ├── engine/     # DuckDB-Wasm, profiling, EDA, preprocessing
│       ├── pages/      # Route pages
│       ├── components/ # Reusable UI components
│       ├── types/      # Shared TypeScript types
│       └── ...
├── supabase/           # Supabase config, migrations, Edge Functions
├── tests/              # Unit, integration, E2E, security tests
├── docs/               # Implementation plan and decision log
├── Dockerfile          # Multi-stage production build
└── compose.yaml        # Docker Compose for local dev
```

## Documentation

- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) — Milestone breakdown and task tracking
- [Decisions Log](docs/DECISIONS.md) — Implementation choices and rationale

## Security

- All dataset storage is private (Supabase Storage RLS)
- Row Level Security on every database table
- BYOK API keys are never stored or logged — memory-only, per-request
- Every data mutation requires explicit user approval
- No arbitrary code execution from AI responses

## License

Private — All rights reserved.
