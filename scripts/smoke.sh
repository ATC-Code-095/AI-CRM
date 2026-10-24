#!/usr/bin/env bash
# AI-CRM 冒烟：主链路 API 验证
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3001/api/v1}"
EMAIL="${EMAIL:-admin@demo.com}"
PASS="${PASS:-Demo@12345}"

echo "== health =="
curl -sf "$BASE/health" | head -c 200; echo

echo "== login =="
LOGIN=$(curl -sf -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["accessToken"])')
AUTH="Authorization: Bearer $TOKEN"
JSON='Content-Type: application/json'
echo "token ok"

echo "== me =="
curl -sf "$BASE/auth/me" -H "$AUTH" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["email"], d["roles"])'

echo "== lead -> convert =="
LEAD=$(curl -sf -X POST "$BASE/leads" -H "$AUTH" -H "$JSON" \
  -d "{\"name\":\"冒烟线索$RANDOM\",\"source\":\"PHONE\",\"phone\":\"138$RANDOM\"}")
LID=$(echo "$LEAD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -sf -X POST "$BASE/leads/$LID/convert" -H "$AUTH" -H "$JSON" \
  -d '{"mode":"create_account","createOpportunity":true,"amount":"12000","expectedCloseDate":"2026-12-01"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("converted", d["accountId"], d.get("opportunityId"))'

echo "== quote -> contract -> payment =="
# 自建低价产品：避免取到高价产品后触发合同金额审批（≥ contract_approval_amount）
PROD=$(curl -sf -X POST "$BASE/products" -H "$AUTH" -H "$JSON" \
  -d "{\"code\":\"SMOKE$(date +%s)\",\"name\":\"冒烟产品\",\"standardPrice\":\"19800.00\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
ACC=$(curl -sf "$BASE/accounts?pageSize=1" -H "$AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["items"][0]["id"])')
Q=$(curl -sf -X POST "$BASE/quotes" -H "$AUTH" -H "$JSON" \
  -d "{\"accountId\":\"$ACC\",\"subject\":\"冒烟报价\",\"lines\":[{\"productId\":\"$PROD\",\"qty\":\"1\",\"discountRate\":\"0\"}]}")
QID=$(echo "$Q" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -sf -X POST "$BASE/quotes/$QID/submit" -H "$AUTH" >/dev/null
curl -sf -X POST "$BASE/quotes/$QID/accept" -H "$AUTH" >/dev/null
CT=$(curl -sf -X POST "$BASE/quotes/$QID/to-contract" -H "$AUTH")
CID=$(echo "$CT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -sf -X POST "$BASE/contracts/$CID/effective" -H "$AUTH" >/dev/null
TOTAL=$(echo "$CT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["total"])')
curl -sf -X PUT "$BASE/contracts/$CID/plans" -H "$AUTH" -H "$JSON" \
  -d "{\"plans\":[{\"seq\":\"1\",\"dueDate\":\"2026-10-01\",\"amount\":\"$TOTAL\"}]}" >/dev/null
PLAN=$(curl -sf "$BASE/contracts/$CID" -H "$AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["plans"][0]["id"])')
PAY=$(curl -sf -X POST "$BASE/payments" -H "$AUTH" -H "$JSON" \
  -d "{\"contractId\":\"$CID\",\"paymentPlanId\":\"$PLAN\",\"amount\":\"$TOTAL\",\"paidAt\":\"2026-09-23\",\"method\":\"BANK\"}")
PID=$(echo "$PAY" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -sf -X POST "$BASE/payments/$PID/confirm" -H "$AUTH" >/dev/null
curl -sf -X POST "$BASE/payments/$PID/reconcile" -H "$AUTH" >/dev/null
curl -sf "$BASE/contracts/$CID" -H "$AUTH" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("received", d["receivedAmount"])'

curl -sf -X PATCH "$BASE/products/$PROD" -H "$AUTH" -H "$JSON" -d '{"isActive":false}' >/dev/null  # 冒烟产品用完即停用
echo "== dashboard =="
curl -sf "$BASE/reports/dashboard" -H "$AUTH" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("opps", d["openOppCount"], "funnel", len(d["funnel"]))'

echo "SMOKE OK"
