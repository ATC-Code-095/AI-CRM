# ZhiXiao-CRM 常用命令
.PHONY: install dev api web test smoke perf e2e seed backup restore openapi typecheck lint build

install:
	pnpm install
	pnpm --filter @zhixiao-crm/shared build

api:
	cd apps/api && AUTO_SEED=false node dist/main.js

api-dev:
	cd apps/api && AUTO_SEED=true pnpm exec nest start

web:
	cd apps/web && pnpm exec vite --host 127.0.0.1 --port 5174

typecheck:
	cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit
	cd apps/web && pnpm exec tsc -p tsconfig.json --noEmit

lint:
	pnpm exec eslint apps/api apps/web --max-warnings 0

build:
	pnpm --filter @zhixiao-crm/shared build
	cd apps/api && pnpm exec tsc -p tsconfig.json -outDir dist
	cd apps/web && pnpm exec vite build

test:
	cd apps/api && pnpm exec vitest run

smoke:
	bash scripts/smoke.sh

perf:
	bash scripts/perf.sh

e2e:
	CI=1 pnpm exec playwright test

seed:
	cd apps/api && node scripts/seed-cli.mjs

backup:
	bash scripts/backup-db.sh

restore:
	bash scripts/restore-db.sh $(DUMP)

openapi:
	node scripts/export-openapi.mjs

i18n:
	node scripts/check-i18n.mjs

mobile-sync:
	bash scripts/sync-mobile.sh

ci: typecheck lint test smoke i18n
