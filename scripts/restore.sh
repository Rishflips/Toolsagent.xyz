#!/usr/bin/env bash
# Restore a ToolsAgent deployment onto a fresh host from a backup made by backup.sh.
#
# The point of this script is the 80-day move: when the AWS credit period ends,
# stand the whole thing up somewhere else with one command instead of remembering
# six steps under pressure.
#
# Usage, on the NEW host:
#   git clone https://github.com/Rishflips/Toolsagent.xyz && cd Toolsagent.xyz
#   ./scripts/restore.sh /path/to/toolsagent-<timestamp>
#
# Order matters and is deliberate:
#   1. .env is put in place FIRST so JWT_SECRET / ENCRYPTION_SECRET match the dump.
#      If the secrets change, every stored provider API key becomes undecryptable
#      and every logged-in user's token is invalidated.
#   2. The database container starts and becomes healthy.
#   3. The dump is loaded INTO the running stack, not into a fresh volume, so the
#      schema and data land together.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-}"

if [ -z "$SRC" ]; then
  echo "Usage: ./scripts/restore.sh /path/to/toolsagent-<timestamp>"
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "ERROR: backup directory not found: $SRC"
  exit 1
fi

for f in database.sql env.backup; do
  if [ ! -f "$SRC/$f" ]; then
    echo "ERROR: backup is incomplete — missing $f"
    echo "A database dump without the matching .env cannot be restored safely:"
    echo "ENCRYPTION_SECRET derives the key for stored provider credentials."
    exit 1
  fi
done

cd "$REPO_DIR"

echo "==> Restoring secrets"
if [ -f .env ]; then
  echo "    .env already exists — keeping it and saving the backup copy alongside."
  echo "    (Overwriting would change JWT_SECRET / ENCRYPTION_SECRET and orphan stored keys.)"
  cp "$SRC/env.backup" .env.from-backup
  chmod 600 .env.from-backup
  echo "    Wrote .env.from-backup — compare the two before continuing:"
  echo "      diff .env .env.from-backup"
else
  cp "$SRC/env.backup" .env
  chmod 600 .env
  echo "    .env written."
fi

echo "==> Starting the database"
docker compose up -d db

echo "==> Waiting for the database to accept connections"
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U toolsagent >/dev/null 2>&1; then
    echo "    ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: database did not become ready in 30s. Check: docker compose logs db"
    exit 1
  fi
  sleep 1
done

echo "==> Loading the dump"
# --clean --if-exists in the dump means this is safe to re-run: it drops and
# recreates objects rather than duplicating rows.
docker compose exec -T db psql -U toolsagent -d toolsagent < "$SRC/database.sql" >/dev/null

echo "==> Verifying the restore"
COUNTS="$(docker compose exec -T db psql -U toolsagent -d toolsagent -Atc \
  "SELECT 'orgs=' || (SELECT count(*) FROM orgs)
        || ' users=' || (SELECT count(*) FROM users)
        || ' api_keys=' || (SELECT count(*) FROM api_keys)
        || ' traces=' || (SELECT count(*) FROM traces)
        || ' spend_events=' || (SELECT count(*) FROM spend_events);" 2>/dev/null || echo "")"

if [ -z "$COUNTS" ]; then
  echo "ERROR: could not read back row counts — the restore may have failed."
  echo "Do not start the rest of the stack until this is resolved."
  exit 1
fi

echo "    $COUNTS"
if [ "$SRC/MANIFEST.txt" ] && [ -f "$SRC/MANIFEST.txt" ]; then
  echo
  echo "    For comparison, the backup's MANIFEST recorded:"
  sed -n '/Row counts:/,$p' "$SRC/MANIFEST.txt" | sed 's/^/    /'
fi

echo "==> Starting the rest of the stack"
docker compose up -d

echo
echo "Restore complete."
docker compose ps
echo
echo "Check the health endpoint once the backend settles:"
echo "  curl -s http://localhost:4000/health"
