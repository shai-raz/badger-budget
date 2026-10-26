# AGENTS.md

**Badger Budget** is a personal finance and budgeting web app: `apps/api` (NestJS REST API, port 3000) and `apps/web` (Nuxt 4 SPA, port 3001), with shared code in `packages/`.

## Commands

All commands use **pnpm** (v9). Node is pinned to the version in `.node-version`. Run from the repo root.

```bash
# Dev servers
pnpm dev            # All apps via Turborepo
pnpm dev:api        # API only (runs prisma:migrate + prisma:generate first)
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

**Formatting:** a `lefthook` pre-commit hook (installed by `pnpm install`, needs git >= 2.31) runs `prettier --write` on staged files, so don't hand-format; style is in `.prettierrc`. CI runs `format:check` on every PR. For local blame, run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once to skip the reformat commit.

**Database:** `docker compose -f docker-compose.dev.yml up -d` starts `badger-postgres` on host port 5433.

## Architecture

- **API** (`apps/api`, NestJS 11): [apps/api/ARCHITECTURE.md](apps/api/ARCHITECTURE.md).
- **Web** (`apps/web`, Nuxt 4 SPA): [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md).
- **UI design system** (`apps/web/DESIGN.md`): read before any UI change.
- **Docker image:** `.github/workflows/docker-publish.yml` builds amd64+arm64 to `ghcr.io/<owner>/badger-budget` on main pushes that touch its `paths` list (release commits get their semver tags from that same build; tag pushes build nothing). It stamps `APP_VERSION` and `GIT_SHA` (see `apps/api/ARCHITECTURE.md`).
- **Shared packages** (`packages/`): `types` (TS source only), `api-client` (typed Axios client), `shared-data` (constants and enums) and `utils` (runtime helpers, compiled to CJS).

## Environment Setup

- API: `apps/api/.env.example` lists every variable; nearly all are optional. Generated secrets go in `DATA_DIR/secrets`.
- Web: no `.env.example`. `NUXT_PUBLIC_API_BASE_URL` is the only variable, a build-time override of the same-origin `/api/v1`.
- Self-hosting: `docker-compose.yml` (production, see README), `deploy/coolify/` and `deploy/dokploy/` (the same stack per host, each with a README) and `docker-compose.dev.yml` (dev Postgres).

## Agent Workflow

### Verifying changes

- `pnpm check-types` must pass for every package. Isolate one with `pnpm check-types --filter=web` / `--filter=api` (through turbo, so shared packages rebuild first); `pnpm --filter <pkg> check-types` skips that and can report phantom errors from a stale `dist/`. Nothing else type-checks the API: its build, watch and Jest all run through SWC, and CI skips it.
- `pnpm lint`: `apps/web` must stay at 0 warnings (`--max-warnings 0`, enforced in CI). `apps/api` has ~196 pre-existing warnings; don't chase them, and add none.
- `pnpm test`: Jest (api) and Vitest (web), both in CI's `Tests` job. No database needed: specs mock `PrismaService`.
- For UI changes, also run the app and exercise the feature in a browser; passing checks don't prove it works. Sign in as the demo user (`demo@demo.demo` / `demo123QWEasd`; seeded only with `SEED_DEMO=true` in `apps/api/.env`), whose data is topped up to today on each login.

### Pull requests and releases

- **Open every PR with a Conventional Commit title** (`type(scope)!: subject`; types in `packages/release/src/conventional.mjs`), not a plain title fixed later. PRs are squash-merged, so the title becomes the commit subject, picks the release bump and appears verbatim in the release notes; `pr-title.yml` fails otherwise.
- No stack position in the title (`(2/4)`, `[1 of 3]`, `part 2`). Link related PRs in the body.
- `release.yml` releases everything user-facing on each push to main: `feat` → minor, `fix`/`perf` → patch, breaking → major (minor while the major is 0). Never hand-edit versions.
- `apps/api/changelog.json` is the source for the generated `CHANGELOG.md` and for the in-app What's New dialog. Dry run, re-render and owner setup: [packages/release/README.md](packages/release/README.md).

### Writing docs (AGENTS.md, ARCHITECTURE.md, DESIGN.md)

Every agent working in a directory pays for its docs in context, so they hold only what the code can't tell you quickly and you would otherwise get wrong. Bloat is worse than a small gap.

**Where things go** (word budget in brackets; check with `wc -w`, and cut before adding when a file is over):

- Root `AGENTS.md` [1,000]: repo-wide commands, workflow, and pointers. Nothing specific to one app or feature.
- `apps/*/AGENTS.md` [300]: how to work in that app (conventions, testing).
- `apps/*/ARCHITECTURE.md` [1,200]: the app's shape: stack, cross-cutting mechanisms (auth, request pipeline, layout contract, CSS layers) and constraints that span modules. A few lines per mechanism, linking the module doc for depth.
- `apps/web/DESIGN.md` [1,200]: UI rules and tokens only.
- Module `AGENTS.md` (`apps/api/src/<module>/`) [400]: that module's invariants and traps. Add one only when the module has some.
- A code comment, not a doc, when the trap lives in one file or function: it sits where the next editor looks, and dies with the code.
- `README.md` files are for humans (self-hosting, a package's purpose), not agent instructions.

**A line earns its place only if** it is not evident from the code it describes, getting it wrong costs a bug, a security hole or a wasted hour, and it isn't already stated elsewhere (link instead).

**Never write:**

- History: what changed or was fixed, spikes, dates, "previously…", investigation notes. That belongs in the commit or PR.
- Feature behaviour and UI copy (labels, which button opens which dialog, toast text). Code and tests own it.
- Inventories that mirror the code (module, component, endpoint, tool or type lists, env var tables). They drift; point at the source file instead.
- One-off recipes or runbooks (manual verification steps, a migration's rollout). Put them in the PR.

**When to edit:**

- Change a doc only when your change makes a line wrong, or adds an invariant or trap that passes the bar above. A new feature needs no doc line by default.
- Fix a stale line by deleting or shortening it, not by appending a correction. When you add to a section, look for something in it to cut.
- Outside your change's scope, only delete or correct what is wrong; don't expand.
- Write tersely: one fact per bullet, no preamble.
