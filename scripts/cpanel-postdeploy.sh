#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "Starting cPanel deployment in $APP_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in this deploy shell."
  echo "Open cPanel -> Setup Node.js App -> Run NPM Install, then run: npm run build"
  exit 0
fi

npm install
npm run cpanel:build

if [ -n "$DB_HOST" ] && [ -n "$DB_NAME" ] && [ -n "$DB_USER" ]; then
  npm run db:migrate
else
  echo "MySQL env is not configured, skipping db:migrate."
fi

echo "Deployment finished. Restart the Node.js app in cPanel if it did not restart automatically."
