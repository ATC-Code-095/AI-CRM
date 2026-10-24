#!/usr/bin/env bash
# PostgreSQL 备份（配合 docs/15 §2）
set -euo pipefail
OUT_DIR="${OUT_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$OUT_DIR"

# 使用 DATABASE_URL 或默认本地
URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/ai_crm}"
FILE="$OUT_DIR/ai_crm_$STAMP.dump"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --format=custom "$URL" -f "$FILE"
  echo "backup written $FILE"
else
  # 回退：本机没有 pg_dump 时，用 docker-compose.yml 中的 postgres 服务导出
  if command -v docker >/dev/null 2>&1; then
    docker compose exec -T postgres pg_dump -U crm -Fc ai_crm > "$FILE"
    echo "backup via docker $FILE"
  else
    echo "pg_dump/docker not available" >&2
    exit 1
  fi
fi

# 清理过期
find "$OUT_DIR" -name 'ai_crm_*.dump' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
echo "retention ${RETENTION_DAYS}d"
