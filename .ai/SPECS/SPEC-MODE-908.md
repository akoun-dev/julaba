# SPEC-MODE-908 — Points de vente multiples (cahier Mode Marché §18)

Statut : livré (Task 74-d — tests d'abord, gates vertes). Prérequis : MODE-906
(conventions routes upsert idempotent client_id, handlers offline, stores
persistés), STK-804 (route ventes, insert legacy conditionnel payment_method).

## 1. Principe
Le marchand vend à plusieurs endroits (boutique, marché Treichville, marché
Adjamé…) : le point actif est visible sur l'écran Mode Marché et chaque vente
est ÉTIQUETÉE par son point (client_id + nom en snapshot). Entité LOCALE-FIRST
`selling-point` { clientId (uuid), name (2-60), kind boutique/marche/autre,
createdAt, archivedAt? } — store persist 'julaba-selling-points', partialize
minimal (convention D8). Action par défaut : un point « Boutique » est créé au
premier usage — JAMAIS de liste vide bloquante. Montants FCFA entiers, zéro
emoji, jamais de suppression (archivage seul).

## 2. Décisions verrouillées
- Route écran : `'points-vente'` — `'marche'` est DÉJÀ PRISE (marketplace
  virtuel MarcheScreen).
- Le point actif vit dans le store (activePointClientId) ; il est passé par
  ARGUMENTS aux ventes (completeQuickSale options) — SENS UNIQUE, aucun
  import croisé nouveau ; quick-sale n'importe jamais le store.
- File offline `'selling-point'` à chaque mutation qui change les données
  serveur (création, renommage, archivage) ; setActive est une préférence
  appareil (aucune colonne is_active) → pas de file.
- La route POST /api/marchand/selling-points est un upsert IDEMPOTENT par
  client_id : connu → mise à jour name/kind (+ archived_at SI fourni, jamais
  NULLé) → 200 ; création → 201 ; course 23505 → relecture → 200 ; 42P01 →
  503 transitoire. GET scopé merchant_id, limit 200 clampé.
- Étiquetage vente : payload + `sellingPointClientId` (min 8) +
  `sellingPointName` (snapshot, min 2 max 60) OPTIONNELS. La route sales
  résout client_id → merchant_selling_points.id et l'écrit dans l'insert
  legacy (`selling_point_client_id`) SEULEMENT si résolu — jamais sinon
  (compat avant/après migration, vente jamais bloquée). La RPC
  merchant_record_sale n'est PAS modifiée (écart documenté, même motif A1
  que payment_method). Point inconnu du serveur → colonne absente, vente OK.
- Journal local (caisse-store) : `todayPoints` agrège ventes/montants par
  point (snapshot name) pour les stats offline ; remis à zéro chaque jour.
- FIFO offline : le point est mis en file AVANT la vente qui le référence.

## 3. API
- `createSellingPointSchema` { merchantId, clientId min 8 max 64, name 2-60,
  kind enum défaut 'autre', archivedAt? ISO }.
- `createSaleSchema` + `sellingPointClientId?` (min 8 max 64) +
  `sellingPointName?` (min 2 max 60) — absents = payload historique identique.
- `POST/GET /api/marchand/selling-points` (conventions zod 400, requireDeviceOwner).

## 4. UI
Écran « Mes points de vente » (route 'points-vente') : liste (nom, kind en
badge, actif en surbrillance, archivés en section repliée), ajouter
(nom + kind), renommer, archiver (jamais supprimer), définir comme actif ;
lucide (Store, MapPin), gros boutons min-h-11. Accès : QuickAction de l'écran
Mode Marché + carte journée (nom du point actif cliquable).

## 5. Hors périmètre v1 (documenté)
Stock par point, transferts entre points, réconciliation serveur → local de
la liste (le serveur fait foi à la relecture ; l'appareil ne télécharge pas
la liste au démarrage), désarchivage, sous-division d'un même marché.
