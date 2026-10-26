# Badger Budget on Dokploy

This folder runs Badger Budget on [Dokploy](https://dokploy.com) with [`docker-compose.yml`](./docker-compose.yml): the app, PostgreSQL 16 and nightly backups. It uses the published image, so nothing is built on your server. For the rest of the app, see the [root README](../../README.md).

## Setup

1. Create a project, then choose **Create Service → Compose** and pick **Git**. Enter the repository `https://github.com/shai-raz/badger-budget`, branch `main`, and compose path `./deploy/dokploy/docker-compose.yml`.
2. On the **Environment** tab set:
    - `PUBLIC_URL`, for example `https://budget.example.com`.
    - `POSTGRES_PASSWORD`, using letters and digits only, for example from `openssl rand -hex 24`.
3. On the **Domains** tab add a domain for the service `app`, with port `8080` and HTTPS on (Let's Encrypt).
4. Click **Deploy**, open the domain, and register the first account.

## Automatic or manual

Dokploy has no generated-value variables for a Git-sourced compose, so the two values in step 2 are manual. The compose file stops the deploy with a message until both are set.

| Item                                                               | Who sets it                    | Notes                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Domain and HTTPS                                                   | You, on the Domains tab        | Dokploy's Traefik routes the domain to `app:8080` and terminates TLS. The compose file has no labels or networks. |
| `PUBLIC_URL`                                                       | You, required                  | The public address of the app, used for the OAuth and MCP endpoints. The deploy fails until it is set.            |
| `POSTGRES_PASSWORD`                                                | You, required                  | The deploy fails until it is set. It goes into a connection URL, so keep it to letters and digits.                |
| `POSTGRES_USER`                                                    | Optional, defaults to `badger` | Change it only before the first deploy, or see [Coming from the Coolify file](#coming-from-the-coolify-file).     |
| Traefik labels and networks                                        | Dokploy                        | Injected automatically.                                                                                           |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_ENCRYPTION_PEPPER` | The app, on first boot         | Generated into `/data/secrets` in the `app_data` volume.                                                          |
| `TRUST_PROXY_HOPS`                                                 | Defaults to `1`                | Traefik is the one proxy in front of the app.                                                                     |
| Everything else                                                    | Optional                       | Empty by default. See [Optional features](../../README.md#optional-features).                                     |

## Backups

The `backup` service writes dumps to the `backups` named volume once a day, keeping 7 daily, 4 weekly and 6 monthly dumps. Restore steps are in [Restore the database](../../README.md#restore-the-database), and the root README's [Backups and restore](../../README.md#backups-and-restore) section covers the rest.

Dokploy's Volume Backups can copy named volumes to S3 on a schedule, and these volumes are named. Enable it for `backups` and `app_data`. The `app_data` volume holds the generated secrets, which the database dumps do not contain.

## Coming from the Coolify file

If you already run Badger Budget on Coolify and want to move to Dokploy, keep the data:

1. Keep the same service (`app`, `db`, `backup`), so Dokploy uses the same volume names and the data stays in place.
2. Set `POSTGRES_USER` and `POSTGRES_PASSWORD` to the values of `SERVICE_USER_POSTGRES` and `SERVICE_PASSWORD_POSTGRES` from Coolify. Postgres ignores new values after its first start.
3. Set `PUBLIC_URL`.
4. Remove the `SERVICE_URL_APP*` leftovers from the Environment tab.
5. Keep the Domains entry.

## In-app upgrade

Lets the admin upgrade from the update dialog. The general behaviour is in [Upgrade from the app](../../README.md#upgrade-from-the-app). Which recipe applies depends on how the compose is deployed.

### Raw compose (pasted YAML)

If you paste the compose file into Dokploy instead of using Git, set:

```
DEPLOY_WEBHOOK_URL=https://<dokploy>/api/deploy/compose/<token>
```

Copy the URL from the service's **Deployments** tab. No token is needed.

### Git-sourced compose

With a Git-sourced compose, the webhook answers "Branch Not Match", so use Dokploy's API instead:

```
DEPLOY_WEBHOOK_URL=https://<dokploy>/api/compose.deploy
DEPLOY_WEBHOOK_TOKEN=<API key from Profile → API/CLI>
DEPLOY_WEBHOOK_TOKEN_HEADER=x-api-key
DEPLOY_WEBHOOK_BODY={"composeId":"<compose id>"}
```

The compose ID is the last segment of the compose service's page URL in Dokploy.

**Warning:** a Dokploy API key carries all the permissions of the user it belongs to. Create a dedicated user with only the rights it needs to deploy this compose, and use that user's key.
