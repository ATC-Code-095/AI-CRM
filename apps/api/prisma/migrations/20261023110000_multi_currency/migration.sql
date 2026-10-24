-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "amountBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "totalBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
ALTER COLUMN "currency" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "receivedAmountBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
ALTER COLUMN "currency" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "amountBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "receivedAmountBase" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "amountBase" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_tenantId_currency_effectiveDate_key" ON "ExchangeRate"("tenantId", "currency", "effectiveDate");


-- ========== 本位币折算（触发器） ==========
-- 规则：1 单位外币 = rate 单位本位币；取单据日期当天或之前最近的汇率，没有则取最早一条，仍没有按 1:1。
-- 本位币存于 Setting(key = 'currency.base', scope = 'TENANT')，默认 CNY。单据币种为空时写入租户本位币。
-- 写入时计算并存储；汇率之后再调整，历史单据的折算金额不变。

CREATE OR REPLACE FUNCTION crm_base_currency(t text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT "value" #>> '{}' FROM "Setting" WHERE "tenantId" = t AND "key" = 'currency.base' AND "scope" = 'TENANT' LIMIT 1),
    'CNY')
$$;

CREATE OR REPLACE FUNCTION crm_to_base(t text, cur text, amt numeric, d date) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN amt IS NULL THEN 0
    WHEN cur IS NULL OR cur = '' OR cur = crm_base_currency(t) THEN amt
    ELSE round(amt * COALESCE(
      (SELECT "rate" FROM "ExchangeRate" WHERE "tenantId" = t AND "currency" = cur AND "effectiveDate" <= d ORDER BY "effectiveDate" DESC LIMIT 1),
      (SELECT "rate" FROM "ExchangeRate" WHERE "tenantId" = t AND "currency" = cur ORDER BY "effectiveDate" ASC LIMIT 1),
      1), 2)
  END
$$;

CREATE OR REPLACE FUNCTION crm_opportunity_base() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."currency" IS NULL OR NEW."currency" = '' THEN NEW."currency" := crm_base_currency(NEW."tenantId"); END IF;
  NEW."amountBase" := crm_to_base(NEW."tenantId", NEW."currency", NEW."amount", CURRENT_DATE);
  RETURN NEW;
END
$$;
CREATE TRIGGER crm_opportunity_base BEFORE INSERT OR UPDATE OF "amount", "currency" ON "Opportunity"
  FOR EACH ROW EXECUTE FUNCTION crm_opportunity_base();

CREATE OR REPLACE FUNCTION crm_quote_base() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."currency" IS NULL OR NEW."currency" = '' THEN NEW."currency" := crm_base_currency(NEW."tenantId"); END IF;
  NEW."totalBase" := crm_to_base(NEW."tenantId", NEW."currency", NEW."total", CURRENT_DATE);
  RETURN NEW;
END
$$;
CREATE TRIGGER crm_quote_base BEFORE INSERT OR UPDATE OF "total", "currency" ON "Quote"
  FOR EACH ROW EXECUTE FUNCTION crm_quote_base();

CREATE OR REPLACE FUNCTION crm_contract_base() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date := COALESCE(NEW."signDate", CURRENT_DATE);
BEGIN
  IF NEW."currency" IS NULL OR NEW."currency" = '' THEN NEW."currency" := crm_base_currency(NEW."tenantId"); END IF;
  NEW."totalBase" := crm_to_base(NEW."tenantId", NEW."currency", NEW."total", d);
  NEW."receivedAmountBase" := crm_to_base(NEW."tenantId", NEW."currency", NEW."receivedAmount", d);
  RETURN NEW;
END
$$;
CREATE TRIGGER crm_contract_base BEFORE INSERT OR UPDATE OF "total", "receivedAmount", "currency", "signDate" ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION crm_contract_base();

-- 回款计划按所属合同的币种与签约日汇率
CREATE OR REPLACE FUNCTION crm_payment_plan_base() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cur text; d date;
BEGIN
  SELECT c."currency", COALESCE(c."signDate", CURRENT_DATE) INTO cur, d FROM "Contract" c WHERE c."id" = NEW."contractId";
  NEW."amountBase" := crm_to_base(NEW."tenantId", cur, NEW."amount", COALESCE(d, CURRENT_DATE));
  NEW."receivedAmountBase" := crm_to_base(NEW."tenantId", cur, NEW."receivedAmount", COALESCE(d, CURRENT_DATE));
  RETURN NEW;
END
$$;
CREATE TRIGGER crm_payment_plan_base BEFORE INSERT OR UPDATE OF "amount", "receivedAmount", "contractId" ON "PaymentPlan"
  FOR EACH ROW EXECUTE FUNCTION crm_payment_plan_base();

-- 回款按所属合同的币种、回款日汇率
CREATE OR REPLACE FUNCTION crm_payment_base() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cur text;
BEGIN
  SELECT c."currency" INTO cur FROM "Contract" c WHERE c."id" = NEW."contractId";
  NEW."amountBase" := crm_to_base(NEW."tenantId", cur, NEW."amount", COALESCE(NEW."paidAt"::date, CURRENT_DATE));
  RETURN NEW;
END
$$;
CREATE TRIGGER crm_payment_base BEFORE INSERT OR UPDATE OF "amount", "paidAt", "contractId" ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION crm_payment_base();

-- 合同改币种或签约日：重算其回款计划与回款
CREATE OR REPLACE FUNCTION crm_contract_children_base() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "PaymentPlan" SET "amount" = "amount" WHERE "contractId" = NEW."id";
  UPDATE "Payment" SET "amount" = "amount" WHERE "contractId" = NEW."id";
  RETURN NULL;
END
$$;
CREATE TRIGGER crm_contract_children_base AFTER UPDATE OF "currency", "signDate" ON "Contract"
  FOR EACH ROW WHEN (OLD."currency" IS DISTINCT FROM NEW."currency" OR OLD."signDate" IS DISTINCT FROM NEW."signDate")
  EXECUTE FUNCTION crm_contract_children_base();

-- 既有数据：按当前币种折算（此时尚无汇率，外币按 1:1，录入汇率后可在设置页重新折算）
UPDATE "Opportunity" SET "amount" = "amount";
UPDATE "Quote" SET "total" = "total";
UPDATE "Contract" SET "total" = "total";
UPDATE "PaymentPlan" SET "amount" = "amount";
UPDATE "Payment" SET "amount" = "amount";
