-- CreateTable
CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "toName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "html" TEXT NOT NULL DEFAULT '',
    "templateId" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "sentById" TEXT,
    "sentByName" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "clickedAt" TIMESTAMP(3),
    "lastClickUrl" TEXT,

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'ACCOUNT',
    "entityId" TEXT NOT NULL DEFAULT '',
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendees" TEXT NOT NULL DEFAULT '',
    "agenda" TEXT NOT NULL DEFAULT '',
    "decisions" TEXT NOT NULL DEFAULT '',
    "actions" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAction" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "due" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelPartner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuccessPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "goals" TEXT NOT NULL DEFAULT '',
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "adoption" INTEGER NOT NULL DEFAULT 0,
    "champion" TEXT NOT NULL DEFAULT '',
    "risks" TEXT NOT NULL DEFAULT '',
    "nextReview" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL DEFAULT '',
    "tag" TEXT NOT NULL DEFAULT '',
    "minAmount" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "autoOutreach" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSend_tenantId_sentAt_idx" ON "EmailSend"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailSend_tenantId_entityType_entityId_idx" ON "EmailSend"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_heldAt_idx" ON "Meeting"("tenantId", "heldAt");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_entityType_entityId_idx" ON "Meeting"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAction_meetingId_sort_key" ON "MeetingAction"("meetingId", "sort");

-- CreateIndex
CREATE INDEX "NpsScore_tenantId_createdAt_idx" ON "NpsScore"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "NpsScore_tenantId_accountId_idx" ON "NpsScore"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "ChannelPartner_tenantId_deletedAt_idx" ON "ChannelPartner"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SuccessPlan_tenantId_accountId_key" ON "SuccessPlan"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "CustomerSegment_tenantId_deletedAt_idx" ON "CustomerSegment"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

