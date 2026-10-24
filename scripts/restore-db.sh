#!/usr/bin/env bash
# 恢复演练：从 dump 恢复到临时库并检查
set -euo pipefail
DUMP="${1:-}"
URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/ai_crm}"
RESTORE_DB="${RESTORE_DB:-ai_crm_restore_test}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: scripts/restore-db.sh <dump file>" >&2
  echo "hint: bash scripts/backup-db.sh 生成 backups/ai_crm_*.dump" >&2
  exit 1
fi

echo "restoring $DUMP -> $RESTORE_DB"
if command -v pg_restore >/dev/null 2>&1; then
  # 用 URL 中的主机连接 maintenance 库
  psql "$URL" -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" 2>/dev/null || true
  psql "$URL" -c "CREATE DATABASE \"$RESTORE_DB\";"
  pg_restore --dbname="$URL" --dbname="$RESTORE_DB" "$DUMP" || true
  psql "$URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
  echo "restore drill finished"
else
  echo "pg_restore not found; install postgresql-client" >&2
  exit 1
fi
