-- CreateTable
CREATE TABLE "GroupEntity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SUBSIDIARY',
    "region" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GroupEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBudget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "budgetAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expenseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupExpenseClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "level2ById" TEXT,
    "level2ByName" TEXT,
    "level2At" TIMESTAMP(3),
    "budgetPostedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupFundTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupFundTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settleNo" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category" TEXT NOT NULL DEFAULT '服务费',
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupExpenseAlloc" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupExpenseAlloc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupExpenseAllocLine" (
    "id" TEXT NOT NULL,
    "allocId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "weight" DECIMAL(10,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupExpenseAllocLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAccountEntity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAccountEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupUserScope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "GroupUserScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupEntity_tenantId_deletedAt_idx" ON "GroupEntity"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBudget_tenantId_entityId_year_key" ON "GroupBudget"("tenantId", "entityId", "year");

-- CreateIndex
CREATE INDEX "GroupExpenseClaim_tenantId_status_createdAt_idx" ON "GroupExpenseClaim"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GroupFundTransfer_tenantId_status_createdAt_idx" ON "GroupFundTransfer"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GroupSettlement_tenantId_status_createdAt_idx" ON "GroupSettlement"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSettlement_tenantId_settleNo_key" ON "GroupSettlement"("tenantId", "settleNo");

-- CreateIndex
CREATE INDEX "GroupExpenseAlloc_tenantId_createdAt_idx" ON "GroupExpenseAlloc"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupExpenseAllocLine_allocId_idx" ON "GroupExpenseAllocLine"("allocId");

-- CreateIndex
CREATE INDEX "GroupExpenseAllocLine_entityId_idx" ON "GroupExpenseAllocLine"("entityId");

-- CreateIndex
CREATE INDEX "GroupAccountEntity_tenantId_entityId_idx" ON "GroupAccountEntity"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAccountEntity_tenantId_accountId_key" ON "GroupAccountEntity"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupUserScope_tenantId_userId_entityId_key" ON "GroupUserScope"("tenantId", "userId", "entityId");

-- AddForeignKey
ALTER TABLE "GroupExpenseAllocLine" ADD CONSTRAINT "GroupExpenseAllocLine_allocId_fkey" FOREIGN KEY ("allocId") REFERENCES "GroupExpenseAlloc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

