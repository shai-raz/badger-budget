# Badger Budget on Coolify

This folder runs Badger Budget on [Coolify](https://coolify.io) with [`docker-compose.yml`](./docker-compose.yml): the app, PostgreSQL 16 and nightly backups. It uses the published image, so nothing is built on your server. For the rest of the app, see the [root README](../../README.md).

## Setup

1. Choose **+ New → Public Repository**, enter `https://github.com/shai-raz/badger-budget` and branch `main`.
2. Set **Build Pack** to **Docker Compose** and **Docker Compose Location** to `/deploy/coolify/docker-compose.yml`. You can also paste the file into **+ New → Docker Compose Empty** instead.
3. Click **Deploy**, open the generated domain, and register the first account.

To use your own domain, set it on the `app` service. To update, redeploy.

## Filled in automatically

- **Domain and proxy.** `SERVICE_URL_APP` is the generated domain. Coolify's proxy routes it to the app on port 8080 and terminates TLS.
- **Database credentials.** `SERVICE_USER_POSTGRES` and `SERVICE_PASSWORD_POSTGRES` are generated and shared by `app`, `db` and `backup`.
- **App secrets.** `JWT_SECRET`, `JWT_REFRESH_SECRET` and `CREDENTIAL_ENCRYPTION_PEPPER` are generated on first boot into `/data/secrets` in the `app_data` volume. See [Backups and restore](../../README.md#backups-and-restore).

## You set

- **Optional features**, on the Environment Variables tab. See [Optional features](../../README.md#optional-features).
- **In-app upgrade**, described below.

## Backups

The `backup` service writes dumps to the `backups` named volume once a day. It keeps 7 daily, 4 weekly and 6 monthly dumps, and the latest is at `last/<POSTGRES_DB>-latest.sql.gz`. Find the exact volume name on the server with `docker volume ls`, which shows the Coolify project prefix. Then copy a dump out of the volume:

```bash
docker run --rm -v <project>_backups:/backups -v "$PWD":/out busybox \
  cp /backups/last/badger-latest.sql.gz /out/
```

Restore the database from that file with the steps in [Restore the database](../../README.md#restore-the-database). Those steps use `docker compose`, so on Coolify run them against the service's containers. Also back up the `app_data` volume (`/data`), which holds the generated secrets, as described in [Back up `/data`](../../README.md#back-up-data).

## In-app upgrade

Lets the admin upgrade from the update dialog. The general behaviour is in [Upgrade from the app](../../README.md#upgrade-from-the-app). For Coolify, set these on the Environment Variables tab:

- `DEPLOY_WEBHOOK_URL`: copy the **Deploy Webhook URL** from Coolify's **Configuration → Webhooks** page. It looks like `https://<coolify>/api/v1/deploy?uuid=<uuid>&force=false`.
- `DEPLOY_WEBHOOK_TOKEN`: an API token from **Keys & Tokens → API Tokens** with the deploy permission.
- Turn on API access under **Settings → Advanced**, so the token is accepted.
- Leave `DEPLOY_WEBHOOK_TOKEN_HEADER` unset. The token then goes as `Authorization: Bearer`, which is what Coolify expects.
