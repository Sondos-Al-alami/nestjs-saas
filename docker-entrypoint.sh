#!/bin/sh
set -e
if [ "${PRISMA_DB_PUSH:-}" = "1" ]; then
  npx prisma db push --skip-generate
fi
exec node "dist/apps/${APP_NAME}/main.js"
