-- AlterTable
ALTER TABLE "BoActor" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "BoActor" ADD COLUMN "producteurId" TEXT;

-- CreateTable
CREATE TABLE "SyncConflictReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "clientCreatedAt" DATETIME NOT NULL,
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SyncConflictReport_subject_idx" ON "SyncConflictReport"("subject");

-- CreateIndex
CREATE INDEX "SyncConflictReport_reportedAt_idx" ON "SyncConflictReport"("reportedAt");

-- CreateIndex
CREATE INDEX "Notification_subject_read_idx" ON "Notification"("subject", "read");

-- CreateIndex
CREATE INDEX "Notification_subject_createdAt_idx" ON "Notification"("subject", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BoActor_merchantId_key" ON "BoActor"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "BoActor_producteurId_key" ON "BoActor"("producteurId");

