#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/queuectl}"

if [[ ! -f "$APP_DIR/server/.env" ]]; then
  echo "Missing $APP_DIR/server/.env — create it on the VPS before deploying."
  exit 1
fi

cd "$APP_DIR/server"
npm ci --omit=dev
npm run migrate

if pm2 describe queuectl-api &>/dev/null; then
  pm2 reload "$APP_DIR/deploy/ecosystem.config.cjs" --update-env
else
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
fi

pm2 save

echo "Deploy complete."
