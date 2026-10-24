-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalProvider" TEXT;

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIdentity_tenantId_userId_idx" ON "UserIdentity"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_tenantId_provider_externalId_key" ON "UserIdentity"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_userId_provider_key" ON "UserIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_externalProvider_externalId_key" ON "Department"("tenantId", "externalProvider", "externalId");

