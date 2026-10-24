#!/usr/bin/env bash
# 一键生成手机 App 用的网页包，并同步到 Capacitor（iOS / Android）与鸿蒙工程。
# 用法：
#   VITE_API_BASE=https://crm.example.com bash scripts/sync-mobile.sh
#   （可选）CAP_APP_ID=com.example.crm  覆盖应用包名，见 apps/mobile/capacitor.config.ts
# 说明：App 内页面从本地加载，必须告诉它后端地址；网页部署不受影响。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

: "${VITE_API_BASE:?请设置 VITE_API_BASE（后端地址，如 https://crm.example.com）}"
case "$VITE_API_BASE" in
  https://*) ;;
  http://*) echo "WARN: 后端是明文 HTTP，仅适合内网测试；正式发布请改用 HTTPS（iOS 默认会拦截 HTTP 请求）" ;;
  *) echo "VITE_API_BASE 必须以 https:// 或 http:// 开头" >&2; exit 1 ;;
esac
export VITE_API_BASE="${VITE_API_BASE%/}"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

echo "[1/3] 构建网页包（API: $VITE_API_BASE）"
# 输出到临时目录，不覆盖网页部署用的 apps/web/dist
(cd "$ROOT/apps/web" && pnpm exec vite build --outDir "$OUT" --emptyOutDir --logLevel warn)
# App 内不使用 Service Worker 离线缓存：版本更新后它会继续提供旧页面
rm -f "$OUT/sw.js"

echo "[2/3] 复制到 apps/mobile/www 与鸿蒙工程 entry/src/main/resources/rawfile/www"
for dest in "$ROOT/apps/mobile/www" "$ROOT/apps/harmony/entry/src/main/resources/rawfile/www"; do
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$OUT/." "$dest/"
done

echo "[3/3] 同步原生工程"
if [ -d "$ROOT/apps/mobile/android" ] || [ -d "$ROOT/apps/mobile/ios" ]; then
  (cd "$ROOT/apps/mobile" && pnpm exec cap sync)
else
  echo "尚未生成原生工程，跳过 cap sync（生成方法见 apps/mobile/BUILD.md）"
fi

VERSION="$(node -p "require('$ROOT/apps/mobile/www/version.json').version + ' · ' + require('$ROOT/apps/mobile/www/version.json').commit")"
echo "MOBILE_SYNC_OK  网页包版本 $VERSION"
