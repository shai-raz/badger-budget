# AGENTS.md

This file provides guidance to any agent when working with code in this repository.

## Project Overview

**Badger Budget** is a personal finance and budgeting web application. The active apps are:

- `apps/api` — NestJS REST API (port 3000)
- `apps/web` — Nuxt 4 SPA frontend (port 3001)

Shared packages live in `packages/`: `types`, `api-client`, `shared-data`, `utils`, `eslint-config`, `typescript-config`.

## Commands

All commands use **pnpm** (v9). Node is pinned to the version in `.node-version`. Run from the repo root unless noted.

```bash
# Dev servers
pnpm dev            # All apps via Turborepo
pnpm dev:api        # API only
pnpm dev:web        # Web only

# Quality
pnpm lint           # ESLint all packages
pnpm check-types    # TypeScript check all
pnpm format         # Prettier (all supported files, honours .prettierignore)
pnpm format:check   # Prettier, report-only
pnpm test           # Jest (api) + Vitest (web)
pnpm test:watch     # Watch mode

# Build
pnpm build          # All packages
docker build -t badger-budget .   # Production image: API + bundled SPA on one port (8080)
```

**Formatting:** `lefthook` installs a pre-commit hook (on `pnpm install`) that runs `prettier --write` over staged files and re-stages them, so formatting is automatic — don't hand-format. Style lives in `.prettierrc` (4-space, 120 cols, double quotes, LF). Requires **git >= 2.31**. CI runs `format:check` on every PR, which catches anything the hook missed or that was committed with `--no-verify`.

The repo-wide reformat lives in a single commit listed in `.git-blame-ignore-revs`. GitHub's blame view skips it automatically; locally, opt in once per clone with `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

**apps/api specific:**

The `pnpm dev` command will automatically call `pnpm prisma:migrate` and `pnpm prisma:generate` before starting the API dev server.

**Database:** PostgreSQL runs via Docker — `docker compose -f docker-compose.dev.yml up -d` starts `badger-postgres` on host port 5433 (mapped to container port 5432).
When running locally, the docker will usually be up and running.

## Architecture

- **API** (`apps/api`, NestJS 11): see [apps/api/ARCHITECTURE.md](apps/api/ARCHITECTURE.md) for auth, validation, feature modules, bank-sync, and API-specific conventions.
- **Web** (`apps/web`, Nuxt 4 SPA): see [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for UI stack, state/data-fetching, page structure, and web-specific conventions.
- **UI design system** (`apps/web/DESIGN.md`): read before any UI change.
- **Docker image:** `.github/workflows/docker-publish.yml` builds linux/amd64+arm64 and pushes `ghcr.io/<owner>/badger-budget` (`:latest` on main, semver and sha tags; `v*.*.*` tags come from `release.yml`). The `repository.private` guards there only matter if the repo is made private again.

### Shared Packages

| Package               | Purpose                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@badger/types`       | Shared TypeScript types (consumed by API, web, api-client)                                                 |
| `@badger/api-client`  | Axios-based typed HTTP client                                                                              |
| `@badger/shared-data` | Shared constants and enums (categories, currencies, bank providers, category-mapping, sync-passkey limits) |
| `@badger/utils`       | Utility functions (compiled to CJS)                                                                        |

## Environment Setup

- `apps/api/.env.example` — `DATABASE_URL`, `DATA_DIR` and `DEBUG_ARTIFACTS_DIR` (generated secrets go in `DATA_DIR/secrets`), JWT secrets, `ALLOW_REGISTRATION`, `SEED_DEMO`, `FREE_CURRENCY_API_KEY`, Google OAuth, the credential-encryption pepper, Google Sheets service account vars, bank-sync/Puppeteer/R2 settings, `PUBLIC_URL` (or `API_PUBLIC_URL` / `WEB_APP_URL`) for the OAuth/MCP endpoints, `WEB_DIST_DIR` for serving a bundled web app, and `TRUST_PROXY_HOPS` (mostly optional, commented out by default).
- `apps/web` — no `.env.example`; only relevant var is `NUXT_PUBLIC_API_BASE_URL` (a build-time override; the default is the same-origin `/api/v1`).
- Self-hosting: `docker-compose.yml` (production stack, see README), `deploy/coolify/docker-compose.yml` (the same stack for Coolify, using its generated domain and credentials) and `docker-compose.dev.yml` (dev Postgres).

Google Sheets integration reads only the `GOOGLE_SHEETS_*` env vars; no key file is read.

## Agent Workflow

### Verifying changes

- `pnpm check-types` — passes for every package. Isolate one with `pnpm check-types --filter=web` / `--filter=api` (goes through turbo, so `^build` rebuilds shared packages first); avoid `pnpm --filter <pkg> check-types`, which skips that and can report phantom errors from a stale shared-package `dist/`. The API builds and watches with SWC, and Jest runs through `@swc/jest`; neither type-checks, and CI does not type-check the API, so `--filter=api` is the only type check it gets.
- `pnpm lint` — `apps/web` is clean (0 warnings), enforced by `--max-warnings 0` and the CI `Web lint & type-check` job. `apps/api` still has ~196 pre-existing warnings; don't chase them. Never introduce new type errors or lint warnings anywhere.
- `pnpm test` — Jest in `apps/api`, Vitest (`vitest run`) in `apps/web`.
- For UI changes, also run the app (`pnpm dev:web` / `pnpm dev:api`) and exercise the feature in a browser — passing types/lint/tests doesn’t confirm the feature works. Sign in with the seeded demo account (`demo@demo.demo` / `demo123QWEasd`, from `apps/api/prisma/seed-demo.ts`; it exists only if `SEED_DEMO=true` is set in `apps/api/.env` when you seed) to get realistic data to test against — its transactions are kept current, topped up to today on each demo login (see `apps/api/src/demo/AGENTS.md`).

### Releases

- PRs are squash-merged, so the PR title becomes the commit subject. `pr-title.yml` requires a Conventional Commit title (`type(scope)!: subject`; allowed types in `packages/release/src/conventional.mjs`).
- `release.yml` runs on every push to main and releases everything user-facing since the last `v*` tag: `feat` → minor, `fix`/`perf` → patch, breaking → major (minor while the major is 0). It commits and tags the release, then creates the GitHub release.
- `apps/api/changelog.json` is the source; `CHANGELOG.md` is generated from it (`node packages/release/bin/release.mjs --render-only`). Never hand-edit versions; the release job sets them in the three `package.json` files.
- Dry run: `node packages/release/bin/release.mjs --repo shai-raz/badger-budget --dry-run`. Owner setup: [packages/release/README.md](packages/release/README.md).

### Keeping AGENTS.md / ARCHITECTURE.md current

These files (root and per-module) are living docs, not a one-time snapshot — you’re expected to edit them, not just read them:

- If a change you make renders something in one incorrect, fix it in the same change.
- If you notice something unclear or outdated while you’re in a file, improve it, even if unrelated to your task.
- Keep them tight: replace or tighten existing text rather than appending, and cut anything that’s stopped earning its place. Bloat is worse than a small gap.
