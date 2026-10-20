# Badger Budget

A personal budgeting and finance web app: accounts, transactions, categories, budgets, reports, and optional bank sync. It runs as one container with a bundled PostgreSQL database and nightly backups.

Badger Budget is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0-only).

Bank sync supports **Israeli banks only**.

## Quickstart

You need Docker with Compose v2.

```bash
curl -O https://raw.githubusercontent.com/shai-raz/badger-budget/main/docker-compose.yml
docker compose up -d
```

Open <http://localhost:8080> and register the first account. That account becomes the only one: once it exists, registration closes (see [Registration](#registration)).

The stack starts three services. `app` is the web app and API on port 8080. `db` is PostgreSQL 16, which is not reachable from the host. `backup` writes nightly database dumps to `./backups` (see [Backups and restore](#backups-and-restore) to turn it off).

No configuration is required for a working install. Stop it with `docker compose down`. Your data stays in the `pgdata` and `app_data` volumes.

## Configuration

Compose reads an optional `.env` file next to `docker-compose.yml`. Every variable has a default, so the file can be left out. An empty value is the same as an unset one.

Secrets need one step of care. `JWT_SECRET`, `JWT_REFRESH_SECRET` and `CREDENTIAL_ENCRYPTION_PEPPER` are generated on first boot and saved to `/data/secrets` inside the `app_data` volume. Later boots reuse them. Values you set in `.env` take precedence over the generated files.

**Back up the secrets.** Losing `CREDENTIAL_ENCRYPTION_PEPPER` makes the stored bank credentials unrecoverable. Losing the JWT secrets signs everyone out. See [Backups and restore](#backups-and-restore).

Set `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` before the first `docker compose up`. The database keeps the password it was created with.

Use only URL-safe characters in these three values (letters, digits, `-`, `_`, `.` and `~`). The app reads the password from a connection URL, and characters such as `@`, `:`, `/`, `?`, `#` or `%` make it fail to connect, while the database itself looks healthy. `openssl rand -hex 24` produces a safe password.

## Optional features

| Variable                                                                                              | What it enables                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FREE_CURRENCY_API_KEY`                                                                               | Multi-currency support. Fetches historical FX rates from freecurrencyapi.com. Without a key, keep every account in one currency. The default Cash account is ILS, and new accounts default to the browser's locale currency, so mixing currencies without a key breaks budgets and reports. |
| `GOOGLE_SHEETS_TYPE`, `_PROJECT_ID`, `_PRIVATE_KEY_ID`, `_PRIVATE_KEY`, `_CLIENT_EMAIL`, `_CLIENT_ID` | Importing transactions from Google Sheets through a service account. Share each sheet with the service account's email. The Google Sheets UI stays hidden until `GOOGLE_SHEETS_CLIENT_EMAIL` and `GOOGLE_SHEETS_PRIVATE_KEY` are set.                                                       |
| `BROWSERLESS_URL`                                                                                     | A remote Browserless service for bank sync. By default the image uses its bundled Chromium.                                                                                                                                                                                                 |
| `CAL_PROXY_URL`                                                                                       | An HTTP proxy in Israel for Visa Cal scrapes. Cal blocks datacenter IPs. See [Bank sync](#bank-sync).                                                                                                                                                                                       |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PRESIGN_TTL`            | Uploading scraper debug artifacts (screenshots, page snapshots) to Cloudflare R2. Without R2, nothing is uploaded.                                                                                                                                                                          |
| `STORE_SCRAPER_DEBUG_LOCALLY`                                                                         | Troubleshooting only. Writes scraper debug artifacts to `/data/debug-artifacts`. These contain bank-page content, so delete them when you are done.                                                                                                                                         |
| `SEED_DEMO`                                                                                           | Creates the public demo account `demo@demo.demo` on startup. Its password is published in the repository, so leave this off on any instance that other people can reach.                                                                                                                    |

Set variables in `.env` and run `docker compose up -d` again to apply them.

## Bank sync

Bank sync supports **Israeli banks only**. It runs the scrapers from [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers) inside the app container, with no extra services.

Residential IP addresses usually avoid Cal's blocking of datacenter IPs. If you host Badger Budget in a datacenter, Visa Cal scrapes may fail. The fix is an Israeli residential proxy in `CAL_PROXY_URL` (see [Optional features](#optional-features)).

## HTTPS and reverse proxy

### Built-in Caddy

The `https` profile adds Caddy, which obtains and renews a publicly trusted TLS certificate for one domain. Point the domain's DNS record at this host and open ports 80 and 443 to it. Then:

```bash
# .env
DOMAIN=budget.example.com
PUBLIC_URL=https://budget.example.com
TRUST_PROXY_HOPS=1
APP_PORT=127.0.0.1:8080
```

```bash
docker compose --profile https up -d
```

`APP_PORT=127.0.0.1:8080` keeps the app reachable only through Caddy.

### Your own reverse proxy

Point your proxy at the app's port 8080 and set:

- `PUBLIC_URL` to the public address, for example `https://budget.example.com`.
- `TRUST_PROXY_HOPS` to the number of proxies between the internet and the app. One proxy means `1`.

`TRUST_PROXY_HOPS` decides which address the app treats as the client's IP, and per-IP login rate limits depend on it. A value that is too high lets clients fake their IP in `X-Forwarded-For` and bypass the limits. A value that is too low counts all users as one proxy's address. The compose file defaults to `0`, which is right only when nothing sits in front of the app.

### Coolify and other platforms

Deploy from the root `Dockerfile` or the published image, with port `8080`, a persistent volume at `/data`, and `PUBLIC_URL` and `TRUST_PROXY_HOPS=1` set as above. Use `/api/v1/health` as the health check path. The image ships `wget`, so platform health checks that run `curl` or `wget` inside the container work. Pick `wget` if the platform asks which tool to use.

## Registration

Registration is open until the first non-demo account exists. After that, `POST /auth/register` returns 403 unless `ALLOW_REGISTRATION=true`. The demo account does not count toward this.

To let more people sign up, set `ALLOW_REGISTRATION=true` in `.env` and run `docker compose up -d`. Set it back to empty to close registration again.

## Backups and restore

The `backup` service dumps the database once a day, at midnight in the container's clock (UTC), into `./backups`. It keeps 7 daily, 4 weekly and 6 monthly dumps:

```
backups/
  last/     the latest dump, as <POSTGRES_DB>-latest.sql.gz (badger-latest.sql.gz by default)
  daily/
  weekly/
  monthly/
```

The dumps hold your financial data, so store them as carefully as the live database.

### Turning the database backups off

The `backup` service is on by default. To turn it off, set `BACKUP_REPLICAS=0` in `.env` and run `docker compose up -d`. Leave the variable unset, or set it to `1`, to turn them back on. Turning them off does not delete the dumps already in `./backups`.

A database dump is not a full backup. It does not contain `/data`, which holds the generated secrets. Back up both.

### Back up `/data`

```bash
docker run --rm -v badger-budget_app_data:/data -v "$PWD":/backup busybox \
  tar czf /backup/badger-data.tgz -C /data .
```

The archive contains the secrets, so keep it private. Also keep your `.env` file, because the secrets you set there are not in the volume.

### Restore `/data`

Stop the app first, then restore into the volume:

```bash
docker compose stop app
docker run --rm -v badger-budget_app_data:/data -v "$PWD":/backup busybox \
  sh -c 'cd /data && tar xzf /backup/badger-data.tgz'
docker compose up -d app
```

### Restore the database

This replaces the database contents with the dump. Stop the app first so nothing writes during the restore:

```bash
docker compose stop app
docker compose exec -T db sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c backups/last/*-latest.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
docker compose up -d app
```

To restore an older dump, use a file from `backups/daily`, `backups/weekly` or `backups/monthly` in place of `backups/last/*-latest.sql.gz`.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

The app runs database migrations automatically on start.

For controlled upgrades, pin the image to a release tag instead of `latest`. Set `BADGER_IMAGE=ghcr.io/shai-raz/badger-budget:1.4.0` in `.env` and run `docker compose up -d`. Release tags are published as `v*.*.*` git tags.

**PostgreSQL major versions:** do not change `postgres:16` to a newer major version in the compose file. The data directory is not compatible across major versions, and the database will not start. Take a dump, move the old `pgdata` volume aside or create a new one, start the new major version, and restore the dump into it.

## Split deployment

The web app and API are served from the same origin by default, so the web app needs no configuration. If you host the web app on a different domain than the API, set `NUXT_PUBLIC_API_BASE_URL` when you build the web app. It is inlined at build time, so a change needs a web rebuild.

## Development

Start the dev database with `docker compose -f docker-compose.dev.yml up -d`. It publishes PostgreSQL on port 5433. Then run `pnpm install` and `pnpm dev`. The dev web app runs on port 3001 and the API on port 3000.

Project layout, commands and conventions are in [CLAUDE.md](./CLAUDE.md). Architecture notes are in [apps/api/ARCHITECTURE.md](./apps/api/ARCHITECTURE.md) and [apps/web/ARCHITECTURE.md](./apps/web/ARCHITECTURE.md).

## License

Badger Budget is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](./LICENSE), version 3. It comes with no warranty. If you run a modified version for other people over a network, the AGPL requires you to offer them the source of that version.
