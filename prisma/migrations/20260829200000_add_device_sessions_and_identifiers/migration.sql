-- AlterTable
ALTER TABLE "BoEnrolment" ADD COLUMN "identificateurId" TEXT;

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProducteurJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producteurId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "texte" TEXT NOT NULL,
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProducteurJournal" ("createdAt", "cycleId", "date", "id", "photoUrl", "texte", "producteurId") SELECT "createdAt", "cycleId", "date", "id", "photoUrl", "texte", 'producteur-1' FROM "ProducteurJournal";
DROP TABLE "ProducteurJournal";
ALTER TABLE "new_ProducteurJournal" RENAME TO "ProducteurJournal";
CREATE INDEX "ProducteurJournal_cycleId_idx" ON "ProducteurJournal"("cycleId");
CREATE INDEX "ProducteurJournal_producteurId_idx" ON "ProducteurJournal"("producteurId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_subject_key" ON "DeviceSession"("subject");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_tokenHash_key" ON "DeviceSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceSession_expiresAt_idx" ON "DeviceSession"("expiresAt");

-- CreateIndex
CREATE INDEX "BoEnrolment_identificateurId_idx" ON "BoEnrolment"("identificateurId");

