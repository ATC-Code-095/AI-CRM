-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "DocTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "defaultDuration" TEXT NOT NULL DEFAULT '',
    "defaultPayment" TEXT NOT NULL DEFAULT '',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "content" TEXT NOT NULL DEFAULT '',
    "file" JSONB,
    "autoParsed" BOOLEAN NOT NULL DEFAULT false,
    "approveStatus" TEXT,
    "approveNote" TEXT NOT NULL DEFAULT '',
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedByName" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocTemplateApprovalLog" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "byId" TEXT,
    "byName" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocTemplateApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ActivityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocTemplate_tenantId_kind_deletedAt_idx" ON "DocTemplate"("tenantId", "kind", "deletedAt");

-- CreateIndex
CREATE INDEX "DocTemplateVersion_templateId_createdAt_idx" ON "DocTemplateVersion"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "DocTemplateApprovalLog_templateId_at_idx" ON "DocTemplateApprovalLog"("templateId", "at");

-- CreateIndex
CREATE INDEX "EmailTemplate_tenantId_deletedAt_idx" ON "EmailTemplate"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "ActivityTemplate_tenantId_deletedAt_idx" ON "ActivityTemplate"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_tenantId_deletedAt_category_idx" ON "KnowledgeArticle"("tenantId", "deletedAt", "category");

-- AddForeignKey
ALTER TABLE "DocTemplateVersion" ADD CONSTRAINT "DocTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocTemplateApprovalLog" ADD CONSTRAINT "DocTemplateApprovalLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

