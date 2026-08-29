-- CreateTable
CREATE TABLE "ProducteurRecolte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producteurId" TEXT NOT NULL,
    "produit" TEXT NOT NULL,
    "quantiteKg" REAL NOT NULL,
    "qualite" TEXT NOT NULL,
    "dateRecolte" DATETIME NOT NULL,
    "parcelle" TEXT NOT NULL,
    "prixSouhaiteParKg" REAL NOT NULL,
    "photos" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "acheteur" TEXT,
    "montantVente" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProducteurCommande" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producteurId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "acheteurNom" TEXT NOT NULL,
    "produit" TEXT NOT NULL,
    "quantiteKg" REAL NOT NULL,
    "montant" REAL NOT NULL,
    "dateLivraisonSouhaitee" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'a_traiter',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "transporteur" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProducteurJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "texte" TEXT NOT NULL,
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProducteurRecolte_producteurId_idx" ON "ProducteurRecolte"("producteurId");

-- CreateIndex
CREATE INDEX "ProducteurRecolte_statut_idx" ON "ProducteurRecolte"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "ProducteurCommande_reference_key" ON "ProducteurCommande"("reference");

-- CreateIndex
CREATE INDEX "ProducteurCommande_producteurId_idx" ON "ProducteurCommande"("producteurId");

-- CreateIndex
CREATE INDEX "ProducteurCommande_statut_idx" ON "ProducteurCommande"("statut");

-- CreateIndex
CREATE INDEX "ProducteurJournal_cycleId_idx" ON "ProducteurJournal"("cycleId");
