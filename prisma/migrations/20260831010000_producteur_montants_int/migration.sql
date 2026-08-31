-- FCFA amounts are always integers project-wide (see formatFCFA());
-- quantiteKg stays REAL since it's a physical measure, not money.
PRAGMA foreign_keys=OFF;

-- RedefineTables: ProducteurRecolte (prixSouhaiteParKg, montantVente REAL -> INTEGER)
CREATE TABLE "new_ProducteurRecolte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producteurId" TEXT NOT NULL,
    "produit" TEXT NOT NULL,
    "quantiteKg" REAL NOT NULL,
    "qualite" TEXT NOT NULL,
    "dateRecolte" DATETIME NOT NULL,
    "parcelle" TEXT NOT NULL,
    "prixSouhaiteParKg" INTEGER NOT NULL,
    "photos" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "acheteur" TEXT,
    "montantVente" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProducteurRecolte" ("id", "producteurId", "produit", "quantiteKg", "qualite", "dateRecolte", "parcelle", "prixSouhaiteParKg", "photos", "statut", "acheteur", "montantVente", "notes", "createdAt", "updatedAt")
SELECT "id", "producteurId", "produit", "quantiteKg", "qualite", "dateRecolte", "parcelle", CAST(ROUND("prixSouhaiteParKg") AS INTEGER), "photos", "statut", "acheteur", CASE WHEN "montantVente" IS NULL THEN NULL ELSE CAST(ROUND("montantVente") AS INTEGER) END, "notes", "createdAt", "updatedAt"
FROM "ProducteurRecolte";
DROP TABLE "ProducteurRecolte";
ALTER TABLE "new_ProducteurRecolte" RENAME TO "ProducteurRecolte";
CREATE INDEX "ProducteurRecolte_producteurId_idx" ON "ProducteurRecolte"("producteurId");
CREATE INDEX "ProducteurRecolte_statut_idx" ON "ProducteurRecolte"("statut");

-- RedefineTables: ProducteurCommande (montant REAL -> INTEGER)
CREATE TABLE "new_ProducteurCommande" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producteurId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "acheteurNom" TEXT NOT NULL,
    "produit" TEXT NOT NULL,
    "quantiteKg" REAL NOT NULL,
    "montant" INTEGER NOT NULL,
    "dateLivraisonSouhaitee" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'a_traiter',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "transporteur" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProducteurCommande" ("id", "producteurId", "reference", "acheteurNom", "produit", "quantiteKg", "montant", "dateLivraisonSouhaitee", "statut", "urgent", "transporteur", "createdAt", "updatedAt")
SELECT "id", "producteurId", "reference", "acheteurNom", "produit", "quantiteKg", CAST(ROUND("montant") AS INTEGER), "dateLivraisonSouhaitee", "statut", "urgent", "transporteur", "createdAt", "updatedAt"
FROM "ProducteurCommande";
DROP TABLE "ProducteurCommande";
ALTER TABLE "new_ProducteurCommande" RENAME TO "ProducteurCommande";
CREATE UNIQUE INDEX "ProducteurCommande_reference_key" ON "ProducteurCommande"("reference");
CREATE INDEX "ProducteurCommande_producteurId_idx" ON "ProducteurCommande"("producteurId");
CREATE INDEX "ProducteurCommande_statut_idx" ON "ProducteurCommande"("statut");

PRAGMA foreign_keys=ON;
