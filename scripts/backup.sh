#!/usr/bin/env bash
# Back up everything that CANNOT be recreated from git.
#
# What is stateful in this stack:
#   1. the Postgres volume  -> users, orgs, API keys, traces, spend events, agents
#   2. the .env file        -> JWT_SECRET and ENCRYPTION_SECRET
#
# Everything else (backend, frontend, nginx, schema) lives in the repo and comes
# back with a git clone. So a complete backup is these two things.
#
# ENCRYPTION_SECRET is the one that truly cannot be regenerated: it derives the
# AES key for stored provider API keys. Lose it and those keys become unreadable
# permanently — they would have to be re-entered. So a backup without .env is not
# a backup.
#
# Usage:
#   ./scripts/backup.sh                 # writes to ./backups/toolsagent-<timestamp>/
#   ./scripts/backup.sh /srv/backups    # custom destination

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ROOT="${1:-$REPO_DIR/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$DEST_ROOT/toolsagent-$STAMP"

cd "$REPO_DIR"

if [ ! -f .env ]; then
  echo "REFUSING TO BACK UP: .env is missing."
  echo "Without it the database backup is useless — ENCRYPTION_SECRET cannot be regenerated."
  echo "If this is a fresh checkout, there is nothing to back up yet."
  exit 1
fi

mkdir -p "$DEST"

echo "==> Dumping the database"
docker compose exec -T db \
  pg_dump -U toolsagent -d toolsagent --clean --if-exists \
  > "$DEST/database.sql"

if [ ! -s "$DEST/database.sql" ]; then
  echo "REFUSING: the dump is empty. Is the stack running? (docker compose ps)"
  rm -rf "$DEST"
  exit 1
fi

echo "==> Copying secrets"
cp .env "$DEST/env.backup"
chmod 600 "$DEST/env.backup"

echo "==> Recording what this backup came from"
{
  echo "timestamp:  $STAMP"
  echo "git_commit: $(git rev-parse HEAD 2>/dev/null || echo 'not a git repo')"
  echo "git_branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
  echo "db_bytes:   $(wc -c < "$DEST/database.sql")"
  echo
  echo "Row counts:"
  docker compose exec -T db psql -U toolsagent -d toolsagent -Atc \
    "SELECT relname || ' = ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" \
    2>/dev/null || echo "  (could not read row counts)"
} > "$DEST/MANIFEST.txt"

echo
echo "Backup complete: $DEST"
ls -la "$DEST"
echo
echo "To transfer to another host:"
echo "  scp -r \"$DEST\" user@newhost:/srv/"
echo "then on the new host follow scripts/restore.sh"
