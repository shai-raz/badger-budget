# syntax=docker/dockerfile:1

# One image, one origin: the API serves the bundled SPA (WEB_DIST_DIR) and /api/v1 on PORT.
# Build: docker build -t badger-budget .

ARG NODE_VERSION=22.22.2

# ---------------------------------------------------------------------------
# build: compile the API, the seed and the web app
# ---------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1 LEFTHOOK=0 CI=1 NUXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# pnpm's version comes from the packageManager field in package.json: corepack reads it on the first pnpm call in /app.
RUN corepack enable

# Manifests first, so the dependency layer is cached until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Web's postinstall runs this script; it skips the shared-data build here because the package sources aren't copied yet.
COPY apps/web/scripts/build-shared-data.mjs apps/web/scripts/
COPY packages/api-client/package.json packages/api-client/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/release/package.json packages/release/
COPY packages/shared-data/package.json packages/shared-data/
COPY packages/types/package.json packages/types/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/utils/package.json packages/utils/
RUN pnpm install --frozen-lockfile

COPY . .
# The API build also emits dist-seed (the seed compiled to plain JS, see apps/api/tsconfig.seed.json).
RUN pnpm turbo run build --filter=api && pnpm turbo run generate --filter=web

# ---------------------------------------------------------------------------
# deps: production-only node_modules for the API, installed for the target platform. Native modules (bcrypt,
# the Prisma engines) are arch-specific, which is why this stage does not run on $BUILDPLATFORM.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1 LEFTHOOK=0 CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/release/package.json packages/release/
COPY packages/shared-data/package.json packages/shared-data/
COPY packages/types/package.json packages/types/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/utils/package.json packages/utils/
# Install the full API tree first: the israeli-bank-scrapers git dependency builds in its `prepare` script, which needs
# its devDependencies. Then `pnpm deploy --prod` writes the API's production graph to /deploy (a standalone node_modules).
# Filtering with --prod on the workspace itself would keep the other packages' tooling (swc, nuxt, ...) in the tree.
# prisma (the CLI) stays: `migrate deploy` runs at boot.
RUN pnpm install --frozen-lockfile --filter "api..." \
    && pnpm --filter api deploy --prod /deploy

COPY apps/api/prisma /deploy/prisma
RUN cd /deploy && node_modules/.bin/prisma generate

# ---------------------------------------------------------------------------
# runtime: system Chromium for bank scraping, production node_modules, no build tooling
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation openssl ca-certificates tini wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web \
    PATH=/app/node_modules/.bin:$PATH \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage

COPY --from=deps /deploy/node_modules ./node_modules
# pnpm deploy copies the workspace packages into node_modules/@badger; they are consumed from their compiled dist.
COPY --from=build /app/packages/shared-data/dist ./node_modules/@badger/shared-data/dist
COPY --from=build /app/packages/utils/dist ./node_modules/@badger/utils/dist

# API: compiled app, compiled seed (run with plain node), and the Prisma schema and migrations.
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/changelog.json ./apps/api/changelog.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/dist-seed ./apps/api/dist-seed
COPY --from=build /app/apps/web/.output/public ./web
COPY docker/entrypoint.sh ./docker/entrypoint.sh

# Set by CI (docker-publish.yml) from `git describe --tags` and the commit SHA. Builds without them (local, Coolify)
# leave both empty and the API reports "<apps/api package.json version>-dev".
ARG APP_VERSION=
ARG GIT_SHA=
ENV APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA}

# Only the data volume is created and owned here; the rest of /app stays root-owned and read-only.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "sh", "/app/docker/entrypoint.sh"]
