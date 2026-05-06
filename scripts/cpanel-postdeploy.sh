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
  echo "Open cPanel Terminal and run the cPanel build commands manually."
  exit 0
fi

npm install
npm run cpanel:build

if [ -n "$DB_HOST" ] && [ -n "$DB_NAME" ] && [ -n "$DB_USER" ]; then
  npm run db:migrate
else
  echo "MySQL env is not configured, skipping db:migrate."
fi

mkdir -p tmp
touch tmp/restart.txt

echo "Deployment finished."
