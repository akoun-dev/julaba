-- CreateTable
CREATE TABLE "Producteur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL DEFAULT 'pin',
    "pinHash" TEXT,
    "patternHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Producteur_phone_key" ON "Producteur"("phone");
