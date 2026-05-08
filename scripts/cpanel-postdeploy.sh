#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "Starting cPanel deployment in $APP_DIR"

APP_NAME="$(basename "$APP_DIR")"
NODE_BIN="$(find "$HOME/nodevenv/$APP_NAME" -path "*/bin" -type d 2>/dev/null | sort -Vr | head -n 1)"
if [ -n "$NODE_BIN" ]; then
  export PATH="$NODE_BIN:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in this deploy shell."
  echo "Expected a Node.js app environment at: $HOME/nodevenv/$APP_NAME"
  echo "Open cPanel > Setup Node.js App, make sure the app exists, then run Deploy again."
  exit 1
fi

echo "Using node: $(command -v node)"
echo "Using npm: $(command -v npm)"

npm install

echo "Skipping frontend build on cPanel. The committed dist folder will be used."
npm run cpanel:build

echo "Frontend assets available:"
ls -1 dist/assets 2>/dev/null || true

if [ -n "$DB_HOST" ] && [ -n "$DB_NAME" ] && [ -n "$DB_USER" ]; then
  npm run db:migrate
else
  echo "MySQL env is not configured, skipping db:migrate."
fi

mkdir -p tmp
touch tmp/restart.txt

echo "Deployment finished."
