#!/bin/sh
# Container entrypoint: apply migrations, seed reference data, then start the API.
# Run via `sh`, so the exec bit does not matter. Keep LF line endings.
set -e

cd /app/apps/api
/app/node_modules/.bin/prisma migrate deploy
# The seed is compiled at build time (dist-seed), so it runs with plain node: no ts-node or devDependencies in the image.
node dist-seed/prisma/seed.js
exec node dist/main
