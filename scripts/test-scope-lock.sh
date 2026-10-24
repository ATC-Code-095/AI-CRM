#!/usr/bin/env bash
# 数据权限 + 乐观锁 验证
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3001/api/v1}"
JSON='Content-Type: application/json'

login() {
  curl -sf -X POST "$BASE/auth/login" -H "$JSON" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["accessToken"])'
}

ADMIN=$(login admin@demo.com 'Demo@12345')
REP=$(login rep@demo.com 'Demo@12345')
A="Authorization: Bearer $ADMIN"
R="Authorization: Bearer $REP"

echo "== admin 创建线索（owner=admin） =="
LID=$(curl -sf -X POST "$BASE/leads" -H "$A" -H "$JSON" \
  -d '{"name":"权限测试线索","source":"OTHER"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')

echo "== rep(dataScope=SELF) 列表不应包含 =="
COUNT=$(curl -sf "$BASE/leads?q=%E6%9D%83%E9%99%90%E6%B5%8B%E8%AF%95&pageSize=50" -H "$R" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["total"])')
echo "rep_list_total=$COUNT (expect 0)"

echo "== rep 读详情应 40301 =="
CODE=$(curl -sS -o /tmp/perm.json -w '%{http_code}' "$BASE/leads/$LID" -H "$R")
echo "rep_get_http=$CODE body=$(cat /tmp/perm.json | head -c 120)"

echo "== admin 读详情应 200 =="
curl -sf "$BASE/leads/$LID" -H "$A" | python3 -c 'import sys,json;print("admin_get", json.load(sys.stdin)["data"]["name"])'

echo "== 乐观锁：错误 version 应 40900 =="
ACC=$(curl -sf "$BASE/accounts?pageSize=1" -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["items"][0]["id"])')
OID=$(curl -sf -X POST "$BASE/opportunities" -H "$A" -H "$JSON" \
  -d "{\"name\":\"乐观锁测试\",\"accountId\":\"$ACC\",\"amount\":\"1\",\"expectedCloseDate\":\"2026-12-31\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
CODE=$(curl -sS -o /tmp/ver.json -w '%{http_code}' -X PATCH "$BASE/opportunities/$OID" -H "$A" -H "$JSON" \
  -d '{"name":"改名","version":999}')
echo "bad_version_http=$CODE body=$(cat /tmp/ver.json | head -c 140)"

echo "== 正确 version 可更新 =="
curl -sf -X PATCH "$BASE/opportunities/$OID" -H "$A" -H "$JSON" \
  -d '{"name":"乐观锁测试-OK","version":1}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("updated", d["name"], "v", d["version"])'

echo "SCOPE_LOCK OK"
