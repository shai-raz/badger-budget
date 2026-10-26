# API Architecture (`apps/api`)

NestJS 11 REST API.

- **Global prefix**: `/api/v1`
- **Auth**: JWT (access + refresh tokens) + Google OAuth 2.0 via Passport.js _(Google OAuth is currently not in use)_. Google routes are only wired when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set (otherwise 404). Secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_ENCRYPTION_PEPPER`) come from env, then `DATA_DIR/secrets/<NAME>`, else are generated there on first boot; there are no hardcoded fallbacks (see `src/config/secrets.ts`).
- **Registration**: open until the first non-demo user exists, then `POST /auth/register` returns 403 unless `ALLOW_REGISTRATION=true`. Google sign-up follows the same rule. See `src/auth/AGENTS.md`.
- **Roles**: `User.role` is `USER` or `ADMIN` (default `USER`). The oldest live non-demo user is backfilled to `ADMIN` by the migration, and the first real user to sign up gets it. `AdminGuard` (after `JwtAuthGuard`) returns 403 for anyone else; `JwtStrategy` re-reads the role on every request, so a change applies without a new sign-in. `role` is included in `/auth/me` and in the login/register responses. To change the admin, edit the row directly: `UPDATE users SET role = 'ADMIN' WHERE email = '…'` and demote the old one with `role = 'USER'`.
- **Validation**: `class-validator` + `class-transformer` with global `ValidationPipe` (whitelist + forbidNonWhitelisted)
- **Rate limiting**: `ThrottlerModule` is configured (10 req/60s default) but the global `ThrottlerGuard` is NOT registered (see #163). OAuth/MCP routes apply `ThrottlerGuard` locally with per-route `@Throttle` limits.
- **Trust proxy**: `TRUST_PROXY_HOPS` (default 1) sets Express `trust proxy`, which decides `req.ip` and so every per-IP limit. With Cloudflare in front of the proxy use 2 hops (or trust `CF-Connecting-IP` only from Cloudflare ranges). A wrong value makes per-IP limits spoofable (too low) or one global bucket (too high). Per-IP limits are also shared by Anthropic's egress range, so all Claude connectors count together.
- **Swagger**: `/api/docs`
- **ORM**: Prisma 6 → PostgreSQL 16; schema at `apps/api/prisma/schema.prisma`
- **One-shot data backfills**: `data_backfills` holds one marker row per backfill (`name` PK). The marker is claimed in the same transaction as the work, so a failure retries on the next boot (see `categories/category-icon-backfill.service.ts`). Add a new marker name per backfill; never reuse one.
- All entities use soft-delete (`deletedAt` field) — except `account_balance_snapshots`, an append-only observation log (see Bank sync), `reimbursement_allocations` (an income→expense link that pays back part of an expense; hard-deleted, cascades with either transaction), and the demo user's rolling-window trim, a hard delete (see `demo/AGENTS.md`)
- **Same-origin SPA**: when `WEB_DIST_DIR` holds a built web app (the Docker image sets it), `config/spa.ts` serves it with an SPA fallback. `/api`, `/.well-known` and missing file-like paths (`/_nuxt/*`, anything with an extension) are never answered by the SPA: they 404. Every response carries `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **Public URLs and CORS**: `PUBLIC_URL` is the one-origin shortcut (`config/public-url.ts`); `API_PUBLIC_URL` and `WEB_APP_URL` override it per service. CORS allows localhost dev origins plus `PUBLIC_URL` and `CORS_ORIGIN`.

## Build (SWC)

`nest build`, `nest start --watch` and `start:debug` compile with SWC (`nest-cli.json` `builder: swc`, `typeCheck: false`; no `.swcrc`, so Nest's defaults apply). Nothing type-checks the API at build or watch time, and CI does not either, so `pnpm check-types --filter=api` is the only type-safety net. Output is `dist/main.js` (`start:prod` runs `node dist/main`). The seed compiles separately to `dist-seed/` (`build:seed`, `tsconfig.seed.json`, `tsc`); the Docker image runs that with plain `node`, while dev keeps `prisma db seed` via ts-node. Watch mode needs `chokidar@^4` installed. The image ships only the API's production graph (`pnpm deploy --prod`), and `@badger/types` is a devDependency with TS source, so it must only be imported with `import type`: a value import crashes the container at boot. `eslint.config.mjs` restricts it, and `src/badger-types-imports.spec.ts` fails the build (ESLint errors are downgraded to warnings by the shared config).

Jest also transforms through `@swc/jest` (inline config in `apps/api/package.json#jest`), so unit tests do not type-check either.

- **`@swc/core` is pinned to exactly `1.16.2`** (no caret, in `apps/api/package.json`). From 1.16.12 the native-addon cache validation rejects ordinary Windows ACLs, so `require('@swc/core')` fails with `Failed to load native binding`. On 2026-10-13, 1.16.18 (latest) still failed on Windows 11 with `DACL grants replacement rights to S-1-5-11` on `C:\`, and `SWC_NATIVE_BINDING_CACHE` on another drive did not help. Upstream: [swc#12442](https://github.com/swc-project/swc/issues/12442) (closed, a commenter reports it still fails on 1.16.18), [swc#12273](https://github.com/swc-project/swc/issues/12273) (compressed self-loading addons, open). The cache-root check itself is deliberate security hardening (added in [swc#12289](https://github.com/swc-project/swc/pull/12289)); the Windows ACL rejection is the false positive. Drop the pin once a release loads on default Windows ACLs.

## Feature modules

`auth`, `accounts`, `budgets`, `categories`, `transactions`, `transaction-import` (CSV/bank import), `category-mapping-rules`, `card-payoff-patterns`, `reimbursements` (income → expense allocation CRUD and candidates picker; see its AGENTS.md), `currencies`, `google-sheets`, `reports`, `bank-sync`, `crypto`, `oauth`, `mcp`, `health` (public `GET /api/v1/health`, no guard: `SELECT 1` ping, 503 after 2s), `app-config` (public `GET /api/v1/config`, no guard: `{ registrationOpen, googleSheetsEnabled, fxEnabled }` flags, no secret values), `demo` (no controller — invoked from `AuthService`, not HTTP), `system` (below). Each follows NestJS module conventions (module → controller → service → DTOs), except `demo`. Each module's controller is the reference for its endpoints.

## Bank sync

The `bank-sync` module automates transaction import from Israeli banks via `israeli-bank-scrapers` + `puppeteer-extra` (with stealth plugin). Key pieces:

- `crypto` module encrypts stored scraper credentials (`credential-crypto.service.ts`), keyed off `CREDENTIAL_ENCRYPTION_PEPPER`.
- Scraper sessions can run against a remote Browserless instance (`BROWSERLESS_URL`) or launch local Chromium; concurrency is capped via `BANK_SYNC_CONCURRENCY`.
- On scrape failure, debug artifacts (screenshots/MHTML) upload to Cloudflare R2 (`R2_*` env vars) via `@aws-sdk/client-s3` when configured. Local copies are written only with `STORE_SCRAPER_DEBUG_LOCALLY=true`, to `DEBUG_ARTIFACTS_DIR` (else `DATA_DIR/debug-artifacts`, else `cwd/debug-artifacts`); with neither, nothing is stored.
- Each sync also records **account balances**: `AccountBalanceService` (`accounts/account-balance.service.ts`) appends an `account_balance_snapshots` row per scraped account and refreshes the denormalized `balance*` columns on `accounts`. The snapshot table has no `deletedAt` on purpose — a balance is a point-in-time observation that can't be reconstructed later, since we only ever scrape a transaction lookback window. Card accounts also carry `cardFrame`/`cardIssuer`, and a post-sync sweep types auto-created accounts from the provider.

## System (version and update check)

`GET /api/v1/system/info`, `POST /api/v1/system/check-updates` and the changelog endpoints are behind `JwtAuthGuard` on purpose: the version never appears on a public endpoint (`/health` stays unchanged).

- **Running version**: `APP_VERSION` (stamped into CI images) wins. Without it a local run reports `<apps/api package version>-dev`, which never shows an update. `GIT_SHA` is the commit. See `system/running-version.ts`.
- **Update check**: `UpdateCheckService` reads `api.github.com/repos/<UPDATE_CHECK_REPO>/releases/latest` at boot and then at most once a day. A failure keeps the previous answer and retries after an hour. `check-updates` has a server-wide 60s cooldown. `UPDATE_CHECK=false` makes no request at all.
- **Local runs**: put these variables in `apps/api/.env`, not the shell, since turbo's strict env mode drops shell variables.
- **In-app upgrade**: `POST /api/v1/system/upgrade` (admin only) POSTs to the host's deploy webhook (`DEPLOY_WEBHOOK_URL`, optional `_TOKEN`, `_TOKEN_HEADER`, `_BODY`; see `system/deploy-webhook-config.ts`). It returns 202 `{ targetVersion }`, 404 when unset, 409 while an upgrade is in flight or within the in-memory 2-minute lock after a success (the lock clears on restart), and 502 when the host fails or times out (15s). Redirects are not followed and the response body is never read. The URL and token are never returned or logged, and the body is never logged. A bad value disables the feature with a warning that names only the variable. `upgradeAvailable` in `system/info` is per caller on both info paths: true only for admins when the webhook is configured. See `system/upgrade.service.ts`.
- **What's New**: `GET /api/v1/system/changelog` (user-facing entries from `apps/api/changelog.json` up to the running build's base version, plus `lastSeenVersion` and `showOnStart`) and `POST /api/v1/system/changelog/seen` (raises `User.lastSeenVersion`, never lowers it). `changelog.json` is generated by the release workflow and copied into the image; a missing or invalid file yields no entries. See `system/changelog.ts`.

## OAuth (authorization server for MCP)

The `oauth` module makes the API an OAuth 2.1 authorization server for the MCP resource (`/api/v1/mcp`). Details and security invariants: `src/oauth/AGENTS.md`.

- **Endpoints**: `GET /.well-known/oauth-authorization-server` (RFC 8414; served at the host root through the global-prefix exclusion in `app.setup.ts`, as is `/.well-known/oauth-protected-resource/api/v1/mcp` from the `mcp` module), `POST /oauth/register` (RFC 7591 DCR, public clients only), `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke` (RFC 7009), plus JWT endpoints for the web app: `GET /oauth/requests/:id`, `POST /oauth/requests/:id/decision`, `GET/DELETE /oauth/connections`, `GET /oauth/mcp-config`.
- **Model**: `authorize` stores a pending request server-side and redirects to the web consent page (`WEB_APP_URL/oauth/consent?request=...`). An approved decision creates a grant plus a single-use authorization code (PKCE S256 only). `token` exchanges code or refresh token for an opaque access token (1h) and refresh token. Errors are `{ error, error_description }` via `OAuthExceptionFilter`.
- **Hashing**: codes, access/refresh tokens and request ids are random secrets stored only as SHA-256 hashes. MCP tokens are not JWTs.
- **Refresh rotation**: each refresh issues a new pair. A just-rotated token may be replayed within a 30s grace window (issues a fresh pair and revokes the unused successor and its access token; presenting the superseded successor later is treated as reuse); replay after the window is reuse and revokes the whole grant.
- **Redirect policy**: exact match against the client's registered URIs; DCR accepts any https URI, loopback http (any port) and `cursor:`; the consent page labels unverified apps. A bad `client_id` or `redirect_uri` never redirects (400 JSON); other errors redirect to the client with `error` and `iss`.
- Public URLs come from env only (`PUBLIC_URL`, or `API_PUBLIC_URL` / `WEB_APP_URL`; see `config/public-url.ts`), never from request headers.

## MCP (LLM insights server)

The `mcp` module exposes read-only tools over MCP for OAuth-authenticated users. Details, local verification recipe and how to add a tool: `src/mcp/AGENTS.md`.

- **Layers**: `mcp/tools` is the transport-independent registry (`ToolRegistry` + tool classes, no MCP SDK or HTTP imports); `mcp-server.factory.ts` adapts it to an `McpServer` bound to one user; `mcp/http` holds the controller, guards and protected-resource metadata. Tools are registered through the `MCP_TOOLS` token in `mcp.module.ts`.
- **Transport**: stateless Streamable HTTP, `POST /api/v1/mcp` (server and transport per request, JSON responses); GET/DELETE return 405. Protected-resource metadata (RFC 9728) is served at the host root, outside the global prefix.
- **Guard order**: Origin check, authenticate (OAuth access token, hashed lookup), per-user throttle (120/min, keyed by user so extra grants add no budget, not IP), require-auth. A 401 and an insufficient-scope 403 carry `WWW-Authenticate` with `resource_metadata` and `scope`; the user is always the grant's owner, so tools never take a user id.
- **Results**: compact JSON as a text block (no `outputSchema`), lists columnar `{ columns, rows, rowCount, truncated }`, errors `isError: true`. `search_transactions` caps at 1000 rows and 60k chars (about 17k tokens) and sets `truncated` plus a `hint` when cut; default rows are about 75 chars.
