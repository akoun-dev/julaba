-- CreateTable
CREATE TABLE "TontineContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tontineId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TontineContribution_clientId_key" ON "TontineContribution"("clientId");

-- CreateIndex
CREATE INDEX "TontineContribution_tontineId_idx" ON "TontineContribution"("tontineId");

-- CreateIndex
CREATE INDEX "TontineContribution_merchantId_idx" ON "TontineContribution"("merchantId");

