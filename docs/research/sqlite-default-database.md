# Research: SQLite as the default database, Postgres still supported

Research only, nothing implemented. Written 2026-11-18 against `main` @ `bef7ad6` (v0.18.1). Every claim marked **(verified)** was reproduced in a spike: Prisma 6.19.1 (the repo's version) with its native SQLite engine (SQLite 3.46.0), and Prisma 7.10.1 with both SQLite driver adapters. The probe scripts are in [`sqlite-probes/`](./sqlite-probes) (see [Appendix](#appendix-reproducing-the-probes)).

## TL;DR

- **It is feasible on the current Prisma 6.19.1, with no ORM change.** The schema needs one model change (`OAuthClient.redirectUris String[]` → `Json`). Beyond that, the SQLite schema can be derived mechanically from the Postgres one.
- **Postgres-specific code is small and contained:** 4 raw-SQL sites, 6 `mode: "insensitive"` filters in 2 services, 2 `skipDuplicates`, 1 `instanceof` check, and the date-only columns.
- **Prisma does not support one schema for two providers.** The workable design is one authored schema, a derived SQLite schema, **two generated clients** chosen at boot from `DATABASE_URL`, and **two migration histories**.
- **The biggest risk is not the code. It is existing installs.** The Coolify and Dokploy deploys read the compose file from `main` on every redeploy, including the in-app upgrade. If those files switched to SQLite, existing users would boot into an empty database with registration open, and the first person to register would become admin. The existing compose files must stay Postgres, and the app needs a boot guard (see [Existing installs](#deployment-and-existing-installs-the-dangerous-part)).
- **Stay on Prisma 6 for this work.** Prisma 7 requires a driver adapter for SQLite. With `@prisma/adapter-better-sqlite3` 7.10.1, **a write made outside an open transaction is silently rolled back with that transaction (verified)**. `@prisma/adapter-libsql` is correct, but it blocks every query, reads included, behind any open transaction.

## Findings

### Schema-level

| Item                                                                             | Postgres today                                       | SQLite (Prisma 6 native)                                                                | Action                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `String[]` (`OAuthClient.redirectUris`)                                          | `text[]`                                             | **Rejected by `prisma validate`** (P1012: "can't be a list") **(verified)**             | Change to `Json` in both providers. PG migration: `ALTER COLUMN redirect_uris TYPE JSONB USING to_jsonb(redirect_uris)`. Parse it with zod on read (`oauth-authorization.service.ts:51`, `oauth-clients.service.ts:68,75`).                                                           |
| `@db.*` native types (Uuid, VarChar, Timestamp(6), Date, Decimal(p,s), SmallInt) | enforced                                             | not allowed in the schema                                                               | Strip them in the derived schema. **VARCHAR lengths are no longer enforced**, so DTO `@MaxLength` is the only guard, and over-long bank data (e.g. `externalId`) is stored instead of failing.                                                                                        |
| `@default(dbgenerated("gen_random_uuid()"))`                                     | DB-generated                                         | function doesn't exist                                                                  | `@default(uuid())`, which Prisma generates client-side **(verified)**.                                                                                                                                                                                                                |
| `Json`                                                                           | `jsonb`                                              | works since Prisma 6.2 **(verified)**                                                   | `@default("{}")` on `User.settings` produces **invalid DDL `DEFAULT {}`**, a Prisma bug that breaks both `migrate` and `db push` **(verified)**. Hand-fix it to `DEFAULT '{}'` in every SQLite migration that creates or redefines `users`.                                           |
| `enum UserRole`                                                                  | PG enum type                                         | `TEXT`, no CHECK **(verified)**                                                         | An invalid stored value makes Prisma **throw on read** (`Value 'BOGUS' not found in enum`) **(verified)**. Optionally add `CHECK (role IN ('USER','ADMIN'))` by hand.                                                                                                                 |
| `Decimal`                                                                        | exact `numeric`                                      | stored as **REAL** (float64) **(verified)**                                             | `Decimal(12,2)` amounts round-trip exactly (`12345678901.23` OK). `Decimal(20,8)` loses digits past about 15 significant: `123456789012.12345678` → `123456789012.12346` **(verified)**. Sums go through `toCents()`/`round2()` already, so the current code is safe. Keep that rule. |
| `@db.Date` columns                                                               | **PG truncates the time on write and on comparison** | stored as full ms timestamp, **no truncation** (`15:30Z` stays `15:30Z`) **(verified)** | The most subtle one. See [Date-only columns](#date-only-columns).                                                                                                                                                                                                                     |
| `DateTime` storage                                                               | `timestamp`                                          | INTEGER Unix ms (native engine) **(verified)**                                          | Raw SQL must write dates the same way. See the raw-SQL traps below.                                                                                                                                                                                                                   |
| Hand-added `CHECK (amount > 0)` on `reimbursement_allocations`                   | in migration `20261022120000`                        | not in the Prisma schema, so not in the derived DDL                                     | Add it by hand to the SQLite baseline. **Prisma's SQLite "redefine table" (used for most ALTERs) recreates tables from its own model and drops hand-added CHECKs**, so every later redefine of that table must re-add it.                                                             |
| FKs / cascades                                                                   | yes                                                  | yes, `PRAGMA foreign_keys=1` is on by default **(verified)**                            | none                                                                                                                                                                                                                                                                                  |
| `@@unique` with nullable `deletedAt`                                             | NULLs distinct                                       | NULLs distinct                                                                          | same behaviour                                                                                                                                                                                                                                                                        |

Every date-only column (`@db.Date`): `User.demoDataThrough`, `Account.balanceDate`, `Budget.startDate/endDate`, `Transaction.transactionDate/postedDate`, `TransactionConversion.rateDate`, `FxRateDaily.rateDate`, `AccountBalanceSnapshot.balanceDate`.

### Query-level

| Item                                                                                              | Postgres       | SQLite                                                                                                                                                    | Sites                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `contains: x, mode: "insensitive"`                                                                | works          | **Prisma validation error** "Unknown argument `mode`" **(verified)**                                                                                      | `transactions.service.ts:360-362`, `reimbursements.service.ts:207-209` (the MCP search goes through the transactions service) |
| `contains` / `startsWith` without `mode`                                                          | case-sensitive | **case-insensitive for ASCII only** (LIKE). `"coffee"` matches `"Coffee SHOP"`, but `"CAFÉ"` doesn't match `"Café"`. Hebrew is unaffected. **(verified)** | Only `demo.service.ts` `externalId startsWith DEMO_EXTERNAL_ID_PREFIX`, which is harmless                                     |
| `createMany({ skipDuplicates })`                                                                  | works          | **"Unknown argument `skipDuplicates`"** **(verified)**                                                                                                    | `category-icon-backfill.service.ts:34`, `sync-error-code-backfill.service.ts:49`                                              |
| `groupBy` / `aggregate` `_sum`, `distinct`, `orderBy … nulls`, `createManyAndReturn`, `RETURNING` | work           | work **(verified)**                                                                                                                                       | none                                                                                                                          |
| Text `ORDER BY` collation                                                                         | PG locale      | BINARY                                                                                                                                                    | No DB-side ordering on text columns today, so no impact. Keep it that way, or sort in JS.                                     |

### Raw SQL (4 of 5 sites are Postgres-only)

| Site                                                              | What it does                           | SQLite equivalent                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transactions/reimbursement-lock.ts:10`                           | `pg_advisory_xact_lock(hashtext(...))` | **No-op.** On the native engine, interactive transactions already run one at a time: a second `$transaction`, even a read-only one, waits for the first to commit **(verified)**. A check-then-insert race in two concurrent transactions is serialized **(verified)**. |
| `auth/registration-policy.service.ts:45`                          | `pg_advisory_xact_lock(20001)`         | No-op, same reason.                                                                                                                                                                                                                                                     |
| `transactions/attachments/transaction-attachments.service.ts:119` | `SELECT … ::uuid … FOR UPDATE`         | Same SELECT without `::uuid` casts and without `FOR UPDATE` (both are syntax errors in SQLite **(verified)**). Serialization comes from the transaction itself.                                                                                                         |
| `auth/auth.service.ts:222`                                        | `settings                              |                                                                                                                                                                                                                                                                         | $1::jsonb`, `octet_length`, `now() AT TIME ZONE 'UTC'`, `RETURNING` | `json_patch(settings, ?)`, `length(CAST(json_patch(...) AS BLOB))`, `RETURNING settings` (works **(verified)**), and bind `updated_at` as a JS `Date` parameter (see the trap below). `json_patch` is an RFC 7396 merge: a `null` in the patch **deletes** the key, where ` |     | `keeps it. That is fine today because the DTO rejects null, but write it down for future settings. The serialized size differs slightly from`jsonb::text`, which has spaces. |
| `health/health.controller.ts:21`                                  | `SELECT 1`                             | works as-is                                                                                                                                                                                                                                                             |

**Raw-SQL date trap (verified):** a JS `Date` bound into `$queryRaw` is stored as INTEGER ms, which matches Prisma. `CURRENT_TIMESTAMP`, `datetime('now')`, and the DDL default for `@default(now())` store **TEXT**. SQLite orders every TEXT value above every INTEGER, so `updatedAt > x` is always true for those rows and `< x` always false. Never write dates from SQL expressions on SQLite. Bind JS `Date`s, or use `CAST(unixepoch('subsec')*1000 AS INTEGER)`. This applies to hand-written migration SQL too.

### Concurrency (Prisma 6 native engine)

- The default journal mode is `delete`, not WAL; `busy_timeout` defaults to 5000 ms; `synchronous=FULL` **(verified)**. `?socket_timeout=N` in the URL sets `busy_timeout` to N s **(verified)**.
- Plain reads are not blocked by an open write transaction (a few ms). Writes and new transactions wait **(verified)**.
- **Any write transaction held longer than `busy_timeout` makes every concurrent write fail with `P1008 Socket timeout`**, with or without WAL **(verified, 7 s transaction vs 5 s timeout)**.
- The app has 60-second interactive transactions: demo top-up (`demo.service.ts:118,163`), rules save-and-apply (`rules.service.ts:69,85`, `SAVE_AND_APPLY_TIMEOUT_MS`), and the boot backfills. On SQLite, the whole instance can't write while one of them runs. Mitigations: set `socket_timeout` to at least the longest transaction (suggest 30–60 s), keep request-path transactions short, and map `P1008` to a 503 "busy, try again" instead of a 500. The bank import path doesn't wrap the batch in one transaction, so it's fine.
- The app already assumes a single API instance (`ARCHITECTURE.md`). SQLite makes that a hard rule.

### Prisma 7 / driver adapters (why not now)

| Stack                                    | DateTime storage                                                         | Behaviour under concurrency                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma 6.19 native (recommended)         | INTEGER ms                                                               | Correct. Writes wait up to `busy_timeout`.                                                                                                                                                                                                                           |
| Prisma 7.10.1 + `adapter-better-sqlite3` | TEXT ISO-8601 by default (`timestampFormat: "unixepoch-ms"` for INTEGER) | **Unsafe.** One shared connection, so a write made outside an open transaction joins it and is **rolled back with it**: the outside row was gone after the rollback in 3/3 runs **(verified)**. A second `$transaction` fails after 2 s with `P2028` **(verified)**. |
| Prisma 7.10.1 + `adapter-libsql`         | TEXT ISO-8601 by default                                                 | Correct, but **every query, reads included, waits** behind an open transaction (2.9 s and 6.9 s waits) **(verified)**. A second `$transaction` fails after 2 s (`P2028`) unless `transactionOptions.maxWait` is raised.                                              |

Prisma 7 throws "A driver adapter is required" without one **(verified)**. npm `latest` is already 8.0.0-rc.34, and 7.10.1 is the newest stable. When Badger upgrades to Prisma 7:

1. Use `adapter-libsql` (or re-run `sqlite-probes/rollback-leak-prisma7.js` against a newer better-sqlite3 adapter first).
2. Set `timestampFormat: "unixepoch-ms"`. Otherwise new rows are TEXT and existing rows INTEGER, and date comparisons break as described above.
3. Raise `maxWait`.

Do that upgrade as its own project after SQLite ships, or before it, but not in the same change.

## Proposed architecture

### Provider selection

- Decide from `DATABASE_URL`: `postgres://` or `postgresql://` → Postgres, `file:` → SQLite. **Unset → SQLite at `file:${DATA_DIR}/badger.db?socket_timeout=60`**, using `config/data-dir.ts`. No new env variable needed.
- One helper (e.g. `src/prisma/database-url.ts`) resolves the provider and URL. The API, seed, entrypoint and e2e all use it.

### Schema: one source, one derived

- `apps/api/prisma/schema.prisma` stays the authored Postgres schema. Its migrations stay in `prisma/migrations`. **Never rename or move those folders**: `_prisma_migrations` keys on folder names and checksums.
- `apps/api/prisma/sqlite/schema.prisma` is **generated, committed and never hand-edited**, by a ~30-line script (`scripts/derive-sqlite-schema.mjs`). These rules are enough, because the spike's only failure was `String[]`:
    - `provider = "postgresql"` → `"sqlite"`
    - strip ` @db.<Type>(<args>)`
    - `dbgenerated("gen_random_uuid()")` → `uuid()`
    - set the generator `output` to the SQLite client directory
    - fail loudly on anything unknown (`String[]`, other `dbgenerated`, `Unsupported`)
- The script also emits the list of `@db.Date` fields (the SQLite DMMF drops native types **(verified)**) for the date normalizer.
- CI fails if the derived schema is stale.

### Two generated clients

- Generate the Postgres client to the default `@prisma/client` location, so the 31 files that import types from it don't change. Generate the SQLite client to a custom output (e.g. `apps/api/generated/sqlite`).
- `PrismaService` picks the class at module load: `class PrismaService extends (isSqlite ? SqliteClient : PgClient)`. Their public API is the same.
- **A custom output bundles its own runtime copy, so error and Decimal classes differ between the clients** (`PrismaClientKnownRequestError` and `Prisma.Decimal` are not `===` **(verified)**). Replace `error instanceof Prisma.PrismaClientKnownRequestError` (`bank-sync.service.ts:176`) with a duck-typed `isPrismaError(err, "P2002")` helper, and never `instanceof Prisma.Decimal`. Enums are equal by value **(verified)**.
- Image size: about +24 MB for the second client, which includes its own engine `.so` **(verified)**.

### Type safety for "works on both"

- Code is type-checked against the Postgres client, which **accepts `mode` and `skipDuplicates`**. The SQLite client's types reject both: `skipDuplicates` doesn't appear in its typings, and string filters have no `mode`.
- Add a second type-check pass: `tsconfig.sqlite.json` with `paths: { "@prisma/client": ["./generated/sqlite"] }`, wired into `pnpm check-types --filter=api` and CI. This catches PG-only query arguments at compile time.
- The dialect module below is the one place allowed to use them, behind a cast.

### Dialect module (`src/prisma/dialect.ts`)

Keep all provider branching here, so services stay provider-agnostic:

- `textSearch(term)` → `{ contains: term, mode: "insensitive" }` on PG, `{ contains: term }` on SQLite. On SQLite that is ASCII-insensitive, which is acceptable for Hebrew and English. If full Unicode folding is needed later, add a `search_text` column lower-cased in JS.
- `lockUserScope(tx, key)` → advisory lock on PG, no-op on SQLite. Used by `reimbursement-lock.ts` and the registration lock.
- `lockLiveTransaction(tx, id, userId)` → `FOR UPDATE` on PG, plain SELECT on SQLite.
- `mergeUserSettings(...)` → the two SQL variants above.
- `skipDuplicates` (2 backfills) → replace on **both** providers with "read existing names, `createMany` the rest" inside the claiming transaction. These run once at boot, so the extra read is free, and there's no branch.
- Unit-test each helper for both providers. Spec files that assert the current raw SQL text (auth settings merge, registration lock) need a case per provider.

### Date-only columns

Postgres silently truncates `@db.Date` values to the day, both when **writing** and when **comparing** (the parameter is cast to `date`). Today's code relies on that:

- `@IsDateString()` accepts full timestamps (`transactions/dto/*`, `budgets/dto/*`).
- `transactions.service.ts:324,327` builds filters with `new Date(filters.startDate/endDate)`.
- `reports.service.ts:64`, `accounts.service.ts:260` (`transactionDate: new Date(dto.date)`).

On SQLite the stored value keeps its time, so day-equality and range filters change meaning. The **verified** example: a `15:30Z` row was missed by `transactionDate = <that day>`.

Fix it once, centrally, on **both** providers so behaviour stays identical: a Prisma client extension (`$extends({ query: { $allModels: { $allOperations } } })`; `$use` middleware no longer exists in 6.19 **(verified)**). It truncates `Date` values to UTC midnight for the date-only fields, in `data` (create/update/upsert/createMany) and in `where` (equals/gt/gte/lt/lte/in/notIn), including nested relation filters.

Extended clients aren't subclasses, so `PrismaService` becomes a factory provider whose type is the extended client. Check `$transaction` callbacks receive the extended `tx`. Also tighten the DTOs to date-only strings (`YYYY-MM-DD`) where the API means a day.

### SQLite runtime settings

- At boot, `PRAGMA journal_mode=WAL` once (it persists in the file; the native default is `delete` **(verified)**). WAL lets readers run during writes and makes `VACUUM INTO` backups non-blocking.
- `socket_timeout` (= `busy_timeout`) in the default URL. See [Concurrency](#concurrency-prisma-6-native-engine).
- Never put the DB on a network filesystem (NFS/SMB): WAL locking breaks there. Say so in the README.

### Migrations

- **SQLite baseline:** one migration `0_init` in `prisma/sqlite/migrations`, from `prisma migrate diff --from-empty --to-schema-datamodel prisma/sqlite/schema.prisma --script`, plus these hand fixes:
    - `DEFAULT '{}'` for `users.settings`
    - the reimbursement `CHECK (amount > 0)`
    - optional role CHECK

    After applying the fixed baseline, `migrate diff` against the schema reports no drift **(verified)**. The 39 Postgres migrations, with their data rewrites (`to_char`, `::numeric`, `UPDATE … FROM`), never need porting.

- **Workflow per schema change**, which agents must follow:
    1. Edit `schema.prisma`.
    2. Run `pnpm --filter api db:derive`.
    3. Run `prisma migrate dev --name x` for PG, then `prisma migrate dev --schema prisma/sqlite/schema.prisma --name x` for SQLite. Use the same name in both; SQLite needs no server.
    4. Hand-port any data SQL (no `::` casts, no `now()`, dates as bound values or integer ms).
    5. Re-check the hand fixes if a table was redefined.
- **CI drift gate**, per provider: `prisma migrate diff --from-migrations <dir> --to-schema-datamodel <schema> --shadow-database-url <db> --exit-code`. PG uses the e2e Postgres service. SQLite uses a temp file.
- `migrate deploy` creates the SQLite file when it's missing. The entrypoint runs `prisma migrate deploy --schema <chosen>` through a small `scripts/prisma.mjs` wrapper that resolves the schema from `DATABASE_URL`. The `dev`, `prisma:migrate` and `prisma:generate` scripts use the same wrapper. `prisma:generate` generates both clients.

### Dockerfile

- The `deps` stage runs `prisma generate` for both schemas.
- Copy `prisma/sqlite/` into the runtime image.
- The `/data` volume already exists, is owned by `node`, and is where the DB file goes. No other change.

## Deployment and existing installs (the dangerous part)

**Failure mode to design against:** an existing Postgres install restarts with a file that no longer sets `DATABASE_URL`. It boots on a fresh SQLite file, shows an empty app with **registration open, and the first person to register becomes ADMIN** (`registration-policy.service.ts`). The old data is still in `pgdata` but invisible.

How it can happen:

- **Coolify** ("Public Repository", compose at `/deploy/coolify/docker-compose.yml`) and **Dokploy** (Git-sourced compose) re-read the compose file from `main` on every redeploy, **including the in-app "Upgrade now"**. Changing these files changes every existing deploy on its next upgrade.
- Root `docker-compose.yml`: the documented upgrade is `docker compose pull` with the local file, but anyone who re-downloads it (the quickstart `curl -O`) would switch.

Required safeguards:

1. **Never change the database of an existing compose file.** Keep `docker-compose.yml`, `deploy/coolify/` and `deploy/dokploy/` on Postgres, and add SQLite variants (e.g. `docker-compose.sqlite.yml`, `deploy/coolify-sqlite/`, `deploy/dokploy-sqlite/`). New-user docs point at the SQLite files. Optionally, much later, rename after a deprecation period. The SQLite variants drop the `db` and `backup` services and `depends_on`. Add them to `compose-env-parity.spec.ts`.
2. **Provider marker:** on every boot, write `DATA_DIR/database.json` (`{"provider":"postgresql"}` or `"sqlite"`).
    - Ship this in a release **before** SQLite becomes the default, so existing installs get stamped as they upgrade.
    - On SQLite-by-default boot, refuse to start with an explicit error if the marker says `postgresql`, or if there's no marker and no DB file but `DATA_DIR/secrets/` already exists (an older install that skipped the stamping release).
    - The error tells the user to set `DATABASE_URL` back to Postgres. To really start fresh, they delete the marker.
3. **Ephemeral filesystems:** today, a host with no persistent `/data` fails fast (no `DATABASE_URL`). With SQLite as the default it would boot and lose data on the next redeploy. Log the resolved DB path at boot, and keep the README's "persistent volume at `/data`" requirement prominent ("Other hosts").

### Backups (the `backup` service is Postgres-only)

- Add an in-app nightly backup on SQLite: a `@nestjs/schedule` job runs `VACUUM INTO '<DATA_DIR>/backups/badger-<date>.db'`. Bound parameters work, and it produces a consistent copy while the app runs **(verified)**. Keep the same retention as today (7 daily / 4 weekly / 6 monthly), on by default with an env switch like `BACKUP_REPLICAS`.
- README changes:
    - `/data` now holds the database, so "back up `/data`" becomes the whole story, except S3 attachments.
    - A `tar` of a live `/data` can capture a torn DB plus `-wal`. Tell users to stop the app first or copy from `backups/`.
    - Restore: stop the app, replace `badger.db`, delete `badger.db-wal` and `badger.db-shm`, start.

### Moving an existing install between providers (optional, later)

Both clients ship in the image, so a one-shot CLI is cheap: `node dist/scripts/copy-database.js --from <url> --to <url>`.

- Run `migrate deploy` on the target, then copy table by table in FK order, in batches.
- Copy Decimals as strings and preserve ids.
- Verify row counts and sums afterwards.
- This works both ways, so a SQLite user who outgrows it can move to Postgres.

Not required for the first release. Existing users can simply stay on Postgres.

## Developer experience, tests, CI

- Local dev defaults to SQLite (`apps/api/.env.example` gets `DATABASE_URL="file:./dev.db"`, or leave it unset). `docker-compose.dev.yml` Postgres stays for testing PG. The AGENTS.md "Database" line changes accordingly.
- Jest: unaffected (Prisma is mocked), except the dialect helpers and the specs that assert raw SQL.
- E2E: make the job a matrix `[postgres, sqlite]`. The SQLite leg needs no service container. `e2e/helpers/server.ts` and `e2e/scripts/prepare.mjs` take the URL from env and pick the schema through the wrapper.
- Add the SQLite type-check pass and the two drift gates to CI.
- Re-run `docs/research/sqlite-probes/` whenever Prisma is upgraded.

## Suggested implementation order (each one PR)

1. `refactor(api)`: provider-agnostic groundwork on Postgres only. Contains:
    - `redirectUris` → `Json` (PG migration)
    - `isPrismaError` helper
    - `skipDuplicates` removal
    - dialect module (PG implementations only)
    - date-only normalizing extension, plus stricter date DTOs

    No behaviour change, easy to review.

2. `feat(api)`: provider marker in `DATA_DIR/database.json` (stamps existing installs; ships at least one release before step 5).
3. `feat(api)`: SQLite support. Contains:
    - derive script, derived schema, both clients, the `PrismaService` switch
    - SQLite dialect branches
    - baseline migration with hand fixes
    - WAL / timeout config
    - wrapper script, entrypoint, Dockerfile
    - SQLite type-check pass, drift gates, e2e matrix
4. `feat`: SQLite backups (`VACUUM INTO` job) plus README backup and restore docs.
5. `feat(deploy)!`: SQLite as the default for **new** installs. Contains:
    - new SQLite compose files for root, Coolify and Dokploy
    - boot guard
    - README quickstart pointing to the SQLite files
    - local dev default

    The existing compose files remain unchanged and keep working.

6. Optional: `copy-database` CLI. Later: Prisma 7 upgrade, with the conditions in [Prisma 7](#prisma-7--driver-adapters-why-not-now).

## Open decisions

- **Naming of compose files:** keep `docker-compose.yml` = Postgres forever and add `docker-compose.sqlite.yml` (safest), or swap the names after a deprecation window (cleaner for new users, riskier).
- **Case-insensitive search on SQLite:** is ASCII-only folding OK (Hebrew has no case, so probably yes), or is a normalized `search_text` column worth it?
- **Prisma 7 timing:** before or after SQLite. SQLite-first is recommended, given the adapter findings.
- **Long transactions:** accept a 60 s `busy_timeout`, or split rules save-and-apply into a short write plus a background apply.

## Appendix: reproducing the probes

```bash
# Prisma 6 (native engine), from an empty scratch dir:
npm init -y && npm i prisma@6.19.1 @prisma/client@6.19.1
mkdir prisma
sed -E -e 's/provider = "postgresql"/provider = "sqlite"/' \
       -e 's/ @db\.[A-Za-z]+(\([0-9, ]*\))?//g' \
       -e 's/dbgenerated\("gen_random_uuid\(\)"\)/uuid()/g' \
       -e 's/redirectUris String\[\]/redirectUris Json    /' \
       <repo>/apps/api/prisma/schema.prisma > prisma/schema.prisma
export DATABASE_URL=file:./dev.db
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > init.sql
sed -i "s/DEFAULT {}/DEFAULT '{}'/" init.sql          # the Prisma Json-default bug
npx prisma db execute --schema prisma/schema.prisma --file init.sql && npx prisma generate
node behaviour.js; node lock-wait.js 'file:./dev.db' 7000; node raw-dates-and-backup.js

# Prisma 7: same schema without the `url = env(...)` line, plus prisma.config.ts with datasource.url,
# npm i prisma@7.10.1 @prisma/client@7.10.1 @prisma/adapter-better-sqlite3@7.10.1 @prisma/adapter-libsql@7.10.1
node rollback-leak-prisma7.js; node libsql-prisma7.js '' 7000
```
