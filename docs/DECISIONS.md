# Groundwork — Architecture & Implementation Decisions

This document records implementation choices not explicitly defined in the V1 specification.
Locked product decisions from the spec are **not** recorded here — they are non-negotiable.

## Decision Log

| #    | Date       | Decision                                                                      | Rationale                                                                                                                                            | Spec Reference            |
| ---- | ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| D001 | 2026-11-13 | Use npm (not pnpm/yarn) as package manager                                    | Widest compatibility, no extra install step; spec does not mandate a specific package manager. `npm install` / `npm run` shown in spec Section 14.3. | §14.3                     |
| D002 | 2026-11-13 | Use npm workspaces for monorepo                                               | Simplest native monorepo support. Root `package.json` with `workspaces: ["apps/web"]`. No Turborepo/Nx overhead for a single-app V1.                 | §14.1                     |
| D003 | 2026-11-13 | Tailwind CSS v4 with Vite plugin                                              | Current stable release; native Vite integration without PostCSS config.                                                                              | §1 (locked: Tailwind CSS) |
| D004 | 2026-11-13 | ESLint v9 flat config + Prettier                                              | Modern config format; avoids deprecated `.eslintrc`. Prettier via `eslint-config-prettier` to avoid conflicts.                                       | §17.1.4                   |
| D005 | 2026-11-13 | Vitest with jsdom environment for component tests                             | Natural fit with Vite; same transform pipeline. jsdom for React component testing.                                                                   | §15.1                     |
| D006 | 2026-11-13 | Multi-stage Dockerfile: Node build → nginx:alpine serve                       | Smallest production image; spec says "small static web-server image". nginx is standard for SPA static serving.                                      | §14.2                     |
| D007 | 2026-11-13 | Docker Compose for web dev only; Supabase CLI manages its own Docker services | Spec explicitly says not to duplicate Supabase stack in Compose.                                                                                     | §14.2                     |

## Pending Decisions

| #    | Question                           | Blocks | Notes                                              |
| ---- | ---------------------------------- | ------ | -------------------------------------------------- |
| P001 | Supabase project region            | M1     | Owner chooses based on user base location          |
| P002 | Google OAuth redirect URLs         | M1     | Depends on Supabase project URL and local dev port |
| P003 | SMTP provider for production email | M9     | Owner needs to select a free-tier SMTP provider    |
