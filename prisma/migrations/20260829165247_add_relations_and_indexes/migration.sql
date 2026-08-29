-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL DEFAULT 'pin',
    "pinHash" TEXT,
    "patternHash" TEXT,
    "visualCodeHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'autre',
    "priceUnit" INTEGER NOT NULL DEFAULT 0,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "sessionId" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "changeAmount" INTEGER NOT NULL DEFAULT 0,
    "amountReceived" INTEGER NOT NULL DEFAULT 0,
    "isVoiceSale" BOOLEAN NOT NULL DEFAULT false,
    "voiceTranscript" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CaisseSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isVoice" BOOLEAN NOT NULL DEFAULT false,
    "voiceTranscript" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaisseSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "fondDeCaisse" INTEGER NOT NULL,
    "totalVentes" INTEGER NOT NULL DEFAULT 0,
    "totalDepenses" INTEGER NOT NULL DEFAULT 0,
    "totalFinal" INTEGER NOT NULL DEFAULT 0,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "CaisseSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tontine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'mensuel',
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "nextDueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TontineMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tontineId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TontineMember_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TontineMember_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "intent" TEXT,
    "confidence" REAL,
    "responseText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operateur_terrain',
    "zone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" DATETIME,
    "mfaSecret" TEXT,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "BoSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "BoUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoMfaChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoMfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "BoUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "BoUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoActor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'marchand',
    "phone" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'actif',
    "photoUrl" TEXT,
    "gpsLat" REAL,
    "gpsLng" REAL,
    "identificateurName" TEXT,
    "identificateurId" TEXT,
    "validatedBy" TEXT,
    "validatedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoActor_identificateurId_fkey" FOREIGN KEY ("identificateurId") REFERENCES "BoUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "identificateurCount" INTEGER NOT NULL DEFAULT 0,
    "actorCount" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoMission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "zone" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'en_cours',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoMission_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "BoUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoEnrolment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dossierId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'marchand',
    "zone" TEXT NOT NULL,
    "identificateurName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'en_attente',
    "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
    "hasGps" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedBy" TEXT,
    "validatedAt" DATETIME,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "severity" TEXT NOT NULL DEFAULT 'moyenne',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BoInstitution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "linkedActors" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoMutation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "fromZone" TEXT NOT NULL,
    "toZone" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'en_attente',
    "requestedBy" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedBy" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoMutation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "BoActor" ("actorId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoModerationReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'moyenne',
    "status" TEXT NOT NULL DEFAULT 'en_attente',
    "reportedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "status" TEXT NOT NULL DEFAULT 'publie',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoCommunication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetGroup" TEXT NOT NULL,
    "targetZone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'envoyee',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryRate" REAL,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'en_attente',
    "courierName" TEXT,
    "pickupAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoCronJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "command" TEXT,
    "status" TEXT NOT NULL DEFAULT 'actif',
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "durationMs" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "avgDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoCreditScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "creditLimit" INTEGER,
    "lastCalculatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoCreditScore_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "BoActor" ("actorId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoKeiwaTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "senderName" TEXT,
    "senderPhone" TEXT,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'termine',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoKeiwaTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BoKeiwaAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoKeiwaAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holderName" TEXT NOT NULL,
    "holderPhone" TEXT NOT NULL,
    "zone" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BoPlatformConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BoSystemEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_phone_key" ON "Merchant"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "BoUser_email_key" ON "BoUser"("email");

-- CreateIndex
CREATE INDEX "BoUser_zone_idx" ON "BoUser"("zone");

-- CreateIndex
CREATE INDEX "BoUser_role_idx" ON "BoUser"("role");

-- CreateIndex
CREATE UNIQUE INDEX "BoSession_tokenHash_key" ON "BoSession"("tokenHash");

-- CreateIndex
CREATE INDEX "BoSession_userId_idx" ON "BoSession"("userId");

-- CreateIndex
CREATE INDEX "BoMfaChallenge_userId_idx" ON "BoMfaChallenge"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BoActor_actorId_key" ON "BoActor"("actorId");

-- CreateIndex
CREATE INDEX "BoActor_zone_idx" ON "BoActor"("zone");

-- CreateIndex
CREATE INDEX "BoActor_status_idx" ON "BoActor"("status");

-- CreateIndex
CREATE INDEX "BoActor_type_idx" ON "BoActor"("type");

-- CreateIndex
CREATE INDEX "BoActor_identificateurId_idx" ON "BoActor"("identificateurId");

-- CreateIndex
CREATE UNIQUE INDEX "BoZone_name_key" ON "BoZone"("name");

-- CreateIndex
CREATE INDEX "BoZone_region_idx" ON "BoZone"("region");

-- CreateIndex
CREATE INDEX "BoMission_zone_idx" ON "BoMission"("zone");

-- CreateIndex
CREATE INDEX "BoMission_status_idx" ON "BoMission"("status");

-- CreateIndex
CREATE INDEX "BoMission_assigneeId_idx" ON "BoMission"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "BoEnrolment_dossierId_key" ON "BoEnrolment"("dossierId");

-- CreateIndex
CREATE INDEX "BoEnrolment_zone_idx" ON "BoEnrolment"("zone");

-- CreateIndex
CREATE INDEX "BoEnrolment_status_idx" ON "BoEnrolment"("status");

-- CreateIndex
CREATE INDEX "BoAlert_module_idx" ON "BoAlert"("module");

-- CreateIndex
CREATE INDEX "BoAlert_acknowledged_idx" ON "BoAlert"("acknowledged");

-- CreateIndex
CREATE INDEX "BoInstitution_type_idx" ON "BoInstitution"("type");

-- CreateIndex
CREATE INDEX "BoMutation_actorId_idx" ON "BoMutation"("actorId");

-- CreateIndex
CREATE INDEX "BoMutation_status_idx" ON "BoMutation"("status");

-- CreateIndex
CREATE INDEX "BoModerationReport_status_idx" ON "BoModerationReport"("status");

-- CreateIndex
CREATE INDEX "BoModerationReport_targetType_targetId_idx" ON "BoModerationReport"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "BoContent_status_idx" ON "BoContent"("status");

-- CreateIndex
CREATE INDEX "BoContent_type_idx" ON "BoContent"("type");

-- CreateIndex
CREATE INDEX "BoCommunication_status_idx" ON "BoCommunication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BoApiKey_key_key" ON "BoApiKey"("key");

-- CreateIndex
CREATE INDEX "BoApiKey_isActive_idx" ON "BoApiKey"("isActive");

-- CreateIndex
CREATE INDEX "BoDelivery_zone_idx" ON "BoDelivery"("zone");

-- CreateIndex
CREATE INDEX "BoDelivery_status_idx" ON "BoDelivery"("status");

-- CreateIndex
CREATE INDEX "BoCronJob_status_idx" ON "BoCronJob"("status");

-- CreateIndex
CREATE INDEX "BoCreditScore_actorId_idx" ON "BoCreditScore"("actorId");

-- CreateIndex
CREATE INDEX "BoCreditScore_zone_idx" ON "BoCreditScore"("zone");

-- CreateIndex
CREATE INDEX "BoCreditScore_riskLevel_idx" ON "BoCreditScore"("riskLevel");

-- CreateIndex
CREATE INDEX "BoKeiwaAccount_zone_idx" ON "BoKeiwaAccount"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "BoPlatformConfig_category_key" ON "BoPlatformConfig"("category");

-- CreateIndex
CREATE INDEX "BoSystemEvent_level_idx" ON "BoSystemEvent"("level");

-- CreateIndex
CREATE INDEX "BoSystemEvent_createdAt_idx" ON "BoSystemEvent"("createdAt");
