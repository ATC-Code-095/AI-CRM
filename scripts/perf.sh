#!/usr/bin/env bash
# 简单性能基线：登录 + 关键 GET 各 N 次
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3001/api/v1}"
N="${N:-30}"

TOKEN=$(curl -sf -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.com","password":"Demo@12345"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["accessToken"])')
AUTH="Authorization: Bearer $TOKEN"

bench() {
  local name="$1" url="$2"
  local start end
  start=$(python3 -c 'import time;print(time.time())')
  for _ in $(seq 1 "$N"); do
    curl -sf -o /dev/null "$url" -H "$AUTH"
  done
  end=$(python3 -c 'import time;print(time.time())')
  python3 -c "print(f'$name {$N} reqs avg', round((float('$end')-float('$start'))*1000/$N,1), 'ms')"
}

echo "N=$N"
bench health "$BASE/health"
bench leads "$BASE/leads?pageSize=20"
bench accounts "$BASE/accounts?pageSize=20"
bench dashboard "$BASE/reports/dashboard"
bench board "$BASE/boards/pipeline"
echo "PERF DONE"
