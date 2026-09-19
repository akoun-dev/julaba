# SPEC-MODE-907 — Fournisseurs (cahier Mode Marché §15)

Statut : livré (Task 74-c — tests d'abord, gates vertes). Prérequis : MODE-906
(partners/credits-store), STK-803 (RPC merchant_record_purchase valide déjà
p_supplier_id contre business_partners).

## 1. Principe
Annuaire des fournisseurs du marchand + rattachement des achats de
marchandises à un fournisseur (voix et API). Réutilise SANS duplication :
table `business_partners` (kind 'fournisseur'), route `POST/GET
/api/marchand/partners` (MODE-906), handler offline `'merchant-partner'`,
store `credits-store.upsertPartner` (kind accepté, défaut 'client'),
RPC `merchant_record_purchase` (Fournisseur invalide si inconnu).
Montants FCFA entiers. Zéro emoji.

## 2. Décisions verrouillées
- Le client envoie `supplierClientId` (client_id du partenaire) dans le
  payload d'achat ; la ROUTE le résout en `business_partners.id` (par
  client_id + merchant) et passe `p_supplier_id` à la RPC. Introuvable :
  création à la volée SI `supplierName` (upsert idempotent), sinon 422
  « Fournisseur inconnu ». `supplierId` direct reste accepté (compat) et
  prioritaire ; les deux fournis → `supplierClientId` gagne (supplierName
  ne sert qu'au secours de création).
- Offline : ordre FIFO garanti — l'upsert du fournisseur part en file
  `'merchant-partner'` AVANT la file d'achat `'stock-purchase'` ; aucun
  changement d'offline-db.
- Crédit fournisseur : AFFICHAGE SEULEMENT en v1 (badge si
  `balance_cfa < 0` = le marchand doit au fournisseur). Enregistrer des
  paiements aux fournisseurs est HORS PÉRIMÈTRE (sémantique des signes à
  repenser avant) — en v1 rien n'écrit la balance d'un fournisseur.
- Commandes fournisseur (`legacy_supplier_orders.supplier`, texte libre) :
  NE PAS migrer — dette technique consignée.

## 3. API achats (`/api/marchand/purchases`)
- `createPurchaseSchema` + `supplierClientId?` (min 8) + `supplierName?`
  (min 2).
- POST : résolution supplierClientId → id, création à la volée si
  supplierName (23505 → relecture), 422 « Fournisseur inconnu » sinon ;
  42P01 → 503 transitoire (table non migrée).
- GET : `?supplierId=` filtre l'historique par fournisseur ;
  `?supplierClientId=` est résolu pareil — fournisseur jamais synchronisé
  → liste vide honnête (jamais tous les achats).

## 4. Voix
- « j'ai acheté 20 kilos de tomates à 15 000 francs chez Koné » → intent
  `purchase` avec `supplier: 'Koné'` (1-3 mots, fin de phrase, casse
  libre) ; la queue « chez … » est RETIRÉE du flux montant (l'espace des
  milliers y est normalisée) — les phrases sans « chez » restent
  strictement identiques (non-régression testée).
- voice-modal branche achat : si un fournisseur est capté →
  `credits-store.upsertPartner({ kind:'fournisseur', name, clientId })`
  PUIS `supplierClientId` (+ `supplierName`, filet serveur) dans le
  payload ; confirmation orale « Achat enregistré : …, chez Koné. »
  uniquement si un fournisseur est capté — sinon phrases existantes
  inchangées.

## 5. UI
- Écran « Mes fournisseurs » (route `'fournisseurs'`) : liste (nom,
  téléphone, localisation, badge crédit si balance < 0), création/édition
  (nom requis, téléphone, localisation, produits en texte libre), détail
  = historique d'achats (GET ?supplierClientId=, repli honnête hors
  connexion), état vide avec aide (« Dites : j'ai acheté 20 kilos de
  tomates à 15 000 francs chez Koné »). Accès : QuickAction Mode Marché +
  tuile accueil à côté de « Mes crédits ».
- Localisation/produits : champs structurés LOCAUX (credits-store,
  persist 'julaba-credits-store') ; ils voyagent vers le serveur dans
  `note` (texte libre, « Localisation : … · Produits : … ») — aucune
  colonne/migration nouvelle, aucune perte.

## 6. Hors périmètre (volontaire)
Paiements/remboursements fournisseurs (écriture de balance_cfa),
rattachement du fournisseur aux réceptions de commandes
(legacy_supplier_orders, texte libre — dette technique), formulaire
clavier d'achat (il n'existe pas : seuls la voix et l'API portent le
fournisseur), réconciliation serveur → local de l'annuaire.
