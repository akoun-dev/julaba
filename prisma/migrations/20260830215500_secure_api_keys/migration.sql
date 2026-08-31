-- Replace plaintext API key secrets with a one-way hash, and add a
-- description field the create-key UI already collects but never persisted.
ALTER TABLE "BoApiKey" ADD COLUMN "description" TEXT;
ALTER TABLE "BoApiKey" ADD COLUMN "secretHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BoApiKey" DROP COLUMN "secret";

-- Drop the temporary DEFAULT '' on secretHash (SQLite requires a full table
-- rebuild to remove a column default) — every column produced above matches
-- the schema exactly; existing rows just inherit an empty secretHash until
-- reseeded (this is dev data, not production).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BoApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "key" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BoApiKey" ("createdAt", "createdBy", "description", "expiresAt", "id", "isActive", "key", "lastUsedAt", "name", "permissions", "requestCount", "secretHash", "updatedAt") SELECT "createdAt", "createdBy", "description", "expiresAt", "id", "isActive", "key", "lastUsedAt", "name", "permissions", "requestCount", "secretHash", "updatedAt" FROM "BoApiKey";
DROP TABLE "BoApiKey";
ALTER TABLE "new_BoApiKey" RENAME TO "BoApiKey";
CREATE UNIQUE INDEX "BoApiKey_key_key" ON "BoApiKey"("key");
CREATE INDEX "BoApiKey_isActive_idx" ON "BoApiKey"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
