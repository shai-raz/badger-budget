# Self-hosting Badger

Everything beyond the [quickstart](../README.md#get-it-running): configuration, optional features, HTTPS, backups and upgrades. You don't need any of it for a basic install.

## Configuration

Compose reads an optional `.env` file next to `docker-compose.yml`. Every variable has a default, so the file can be left out. An empty value is the same as an unset one.

Secrets need one step of care. `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_ENCRYPTION_PEPPER` and `VAPID_PRIVATE_KEY` (Web Push) are generated on first boot and saved to `/data/secrets` inside the `app_data` volume. Later boots reuse them. Values you set in `.env` take precedence over the generated files.

**Back up the secrets.** Losing `CREDENTIAL_ENCRYPTION_PEPPER` makes the stored bank credentials unrecoverable. Losing the JWT secrets signs everyone out. Losing `VAPID_PRIVATE_KEY` breaks every push notification subscription, so each device must turn notifications on again. See [Backups and restore](#backups-and-restore).

Set `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` before the first `docker compose up`. The database keeps the password it was created with.

Use only URL-safe characters in these three values (letters, digits, `-`, `_`, `.` and `~`). The app reads the password from a connection URL, and characters such as `@`, `:`, `/`, `?`, `#` or `%` make it fail to connect, while the database itself looks healthy. `openssl rand -hex 24` produces a safe password.

## Optional features

| Variable                                                                                   | Default                     | What it enables                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FREE_CURRENCY_API_KEY`                                                                    | Off: one currency           | Multi-currency support. Fetches historical FX rates from freecurrencyapi.com. Without a key, keep every account in one currency. The default Cash account is ILS, and new accounts default to the browser's locale currency, so mixing currencies without a key breaks budgets and reports. |
| `BROWSERLESS_URL`                                                                          | Bundled Chromium            | A remote Browserless service for bank sync, instead of the Chromium inside the image.                                                                                                                                                                                                       |
| `CAL_PROXY_URL`                                                                            | No proxy                    | An HTTP proxy in Israel for Visa Cal scrapes. Cal blocks datacenter IPs. See [Bank sync](#bank-sync).                                                                                                                                                                                       |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PRESIGN_TTL` | Off. TTL: `604800` (7 days) | Uploading scraper debug artifacts (screenshots, page snapshots) to Cloudflare R2.                                                                                                                                                                                                           |
| `ATTACHMENTS_S3_ENDPOINT`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`               | Off                         | Transaction attachments (receipts) in an S3-compatible bucket: R2, AWS S3, MinIO or Backblaze B2. Keep the bucket private. Attachments turn on once all four are set. `_REGION` (default `auto`) and `_PUBLIC_ENDPOINT` are optional.                                                       |
| `STORE_SCRAPER_DEBUG_LOCALLY`                                                              | Off                         | Troubleshooting only. Writes scraper debug artifacts to `/data/debug-artifacts`. These contain bank-page content, so delete them when you are done.                                                                                                                                         |
| `SEED_DEMO`                                                                                | Off                         | Creates the public demo account `demo@demo.demo` on startup. Its password is published in the repository, so leave this off on any instance that other people can reach.                                                                                                                    |
| `UPDATE_CHECK`                                                                             | On                          | Once an hour (also in the background, to notify admins) the server asks api.github.com for the latest release, to show the running version and a new-release banner. `false` disables it and makes no outbound request.                                                                     |
| `UPDATE_CHECK_REPO`                                                                        | `shai-raz/badger-budget`    | The GitHub repository to check for releases (`owner/name`). Set it for a fork.                                                                                                                                                                                                              |
| `DEPLOY_WEBHOOK_URL`, `_TOKEN`, `_TOKEN_HEADER`, `_BODY`                                   | Off                         | In-app upgrade from the update dialog (admin only). The app POSTs to your host's deploy webhook. Set the URL to enable it. See [Upgrade from the app](#upgrade-from-the-app).                                                                                                               |

Set variables in `.env` and run `docker compose up -d` again to apply them.

## Bank sync

Bank sync supports **Israeli banks only**. It runs the scrapers from [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers) inside the app container, with no extra services.

Some providers block datacenter IP addresses. Visa Cal is the one we've run into: if you host Badger in a datacenter, Cal scrapes may fail, while a home connection usually works fine. The fix is an Israeli residential proxy in `CAL_PROXY_URL` (see [Optional features](#optional-features)).

Other providers might do the same. We haven't tested them all from a datacenter, so if you hit this with another bank or card, an issue or a pull request adding proxy support for it is very welcome.

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

### Coolify

Setup, backups and the in-app upgrade for Coolify are in [deploy/coolify/README.md](../deploy/coolify/README.md).

### Dokploy

Setup, backups and the in-app upgrade for Dokploy are in [deploy/dokploy/README.md](../deploy/dokploy/README.md).

### Other platforms

Deploy from the root `Dockerfile` or the published image, with port `8080`, a persistent volume at `/data`, and `PUBLIC_URL` and `TRUST_PROXY_HOPS=1` set as above. Use `/api/v1/health` as the health check path. The image ships `wget`, so platform health checks that run `curl` or `wget` inside the container work. Pick `wget` if the platform asks which tool to use.

## Registration

Registration is open until the first non-demo account exists. After that, `POST /auth/register` returns 403 unless `ALLOW_REGISTRATION=true`. The demo account does not count toward this. The first registered user is the instance admin. To hand the role to someone else, update the database: set `role = 'ADMIN'` on the new admin's row in `users` and `role = 'USER'` on the old one.

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

Attachments (receipts) live in the S3 bucket, not in the database or `/data`, so these backups don't include them. Back up the bucket separately.

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

The app runs database migrations automatically on start. Releases are cut automatically when changes land on main, and each one is listed in [CHANGELOG.md](../CHANGELOG.md) and on the GitHub releases page.

For controlled upgrades, pin the image to a release tag instead of `latest`. Set `BADGER_IMAGE=ghcr.io/shai-raz/badger-budget:0.1.0` in `.env` and run `docker compose up -d`. Release tags are published as `v*.*.*` git tags.

The published images report their version in the About card on the Settings page. An image you build yourself with `docker build` has no version stamp, so it reports `<version>-dev` and never shows the new-release banner.

**PostgreSQL major versions:** do not change `postgres:16` to a newer major version in the compose file. The data directory is not compatible across major versions, and the database will not start. Take a dump, move the old `pgdata` volume aside or create a new one, start the new major version, and restore the dump into it.

### Upgrade from the app

If your host can redeploy Badger from a webhook, the admin can upgrade from the app. When a new release is out, the update dialog shows **Upgrade now**. The admin clicks it and confirms, Badger POSTs to your host's deploy webhook, and the app tracks the upgrade until the new version is live. Then it offers **Reload**. The app stays usable while the host redeploys.

The button appears only when `DEPLOY_WEBHOOK_URL` is set, and only for the admin (the first registered user). Other users see the update dialog as before.

Set these in `.env` or your host's environment:

| Variable                      | What it does                                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_WEBHOOK_URL`          | The host's deploy webhook URL. Required. Without it the button stays hidden.                                                                                                                                                                                                                  |
| `DEPLOY_WEBHOOK_TOKEN`        | The secret the host expects. Optional.                                                                                                                                                                                                                                                        |
| `DEPLOY_WEBHOOK_TOKEN_HEADER` | The header that carries the token. Unset sends `Authorization: Bearer <token>`. `Authorization` sends `Bearer <token>`, or the token as is when it already contains a space (for example `Token abc`). Any other name, such as `x-api-key`, gets the raw token. Ignored when no token is set. |
| `DEPLOY_WEBHOOK_BODY`         | An optional JSON body, sent as is with `Content-Type: application/json`. Without it the request has no body.                                                                                                                                                                                  |

An invalid header name or invalid JSON in `DEPLOY_WEBHOOK_BODY` disables the feature and logs a startup warning that names the variable, not its value.

Host guides:

- **Coolify** and **Dokploy**: see [deploy/coolify/README.md](../deploy/coolify/README.md#in-app-upgrade) and [deploy/dokploy/README.md](../deploy/dokploy/README.md#in-app-upgrade).
- **Portainer (BE stack webhook):** set `DEPLOY_WEBHOOK_URL` to the stack's webhook URL. No token.
- **Watchtower (HTTP API, plain Docker Compose):** set `DEPLOY_WEBHOOK_URL=http://watchtower:8080/v1/update` and `DEPLOY_WEBHOOK_TOKEN` to the Watchtower HTTP API token. Watchtower may stop the Badger container before it answers, so the app can show "Could not reach the deploy webhook" while the upgrade still goes ahead.
- **Render:** set `DEPLOY_WEBHOOK_URL` to the service's deploy hook URL. No token.

In-app upgrades work only with a moving tag such as `:latest`. A pinned `BADGER_IMAGE` redeploys the same version.

## Split deployment

The web app and API are served from the same origin by default, so the web app needs no configuration. If you host the web app on a different domain than the API, set `NUXT_PUBLIC_API_BASE_URL` when you build the web app. It is inlined at build time, so a change needs a web rebuild.
