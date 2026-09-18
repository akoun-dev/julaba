# PLAN_STOCK.md — Système de gestion de stock Jùlaba (Audit + Plan)

_Session Task 62 (2026-09-19) · AGENT 1 · Livrable : AUDIT + PLAN UNIQUEMENT — aucun code applicatif modifié (méthode demandée §47 : ne pas commencer à modifier le code)._
_Référence : cahier des charges utilisateur « Implémentation complète du système de stock » (48 sections)._

---

## 0. Cadre et invariants

- **Règle métier absolue (§3, §48)** : `stock disponible < quantité demandée → VENTE REFUSÉE`. Le stock ne peut JAMAIS devenir négatif. La garantie doit vivre dans PostgreSQL (transactions + verrous + contraintes), pas seulement dans React.
- **Source de vérité (§5)** : les MOUVEMENTS de stock, pas un champ numérique. Corrections = nouveaux mouvements (jamais d'écrasement, jamais de DELETE — §44).
- **Invariants Jùlaba préservés** : offline-first, FCFA entiers (`fcfaAmount`), montant dicté fait loi (VOCAL-603), jamais de donnée inventée, registre `.ai/TASKS.xlsx` + worklogs, **aucun build APK**, logique d'enregistrement des ventes intacte (sauf le contrat « refus stock insuffisant », demandé expressément — voir §2.6).

---

## 1. PHASE 1 — AUDIT (constats vérifiés au code)

### 1.1 Ce qui existe et fonctionne (à préserver)

| Domaine | État | Fichiers clés |
|---|---|---|
| Auth marchand | PIN/pattern/visuel + session appareil (`julaba_device`) + `requireDeviceOwner` sur chaque route | `src/lib/require-owner.ts`, `src/lib/claim-device-session.ts`, `/api/merchant/login` |
| Ventes | 3 chemins (caisse, vente rapide, vocal) → `POST /api/marchand/sales` (idempotent sur `client_id`, total recalculé serveur) → `legacy_sales` + `legacy_sale_items` | `caisse-screen.tsx`, `quick-sale.ts`, `vente-rapide-modal.tsx`, `voice-modal.tsx`, `api/marchand/sales/route.ts` |
| Offline/sync | File localStorage (cap 500) FIFO, 12 handlers, classification erreurs transitoire/définitive, conflits rapportés | `offline-db.ts`, `sync-handlers.ts`, `sync-flusher.tsx`, `docs/OFFLINE.md` |
| Vocal Tata | STT factory (Sherpa natif offline → Web Speech), `parseIntent` (13 intents), extraction montants (VOCAL-603), confirmations oui/non, TTS multi-moteurs, wake-word | `src/lib/voice/**` (22 fichiers, 393 tests) |
| Dépenses | Catégories FR, POST idempotent, intégrée au résumé vocal du jour | `depenses-screen.tsx`, `api/marchand/expenses/route.ts`, `day-summary.ts` |
| Profils | `merchantCategorie` : `detaillant` / `semi_grossiste` / `grossiste` (CHECK en DB, backfill login) ; producteur = rôle séparé avec récoltes/journal | `marchand-categories.ts`, `merchants` (migration 20260101000100) |
| DB moderne (orpheline) | `products` (uuid, `numeric(14,3)`, CHECK ≥ 0), `stock_movements` (append-only, `unique(organization_id, client_id)`), `sales`/`sale_items`, `cash_sessions`, RPC `create_sale` **transactionnelle** (FOR UPDATE, refus stock insuffisant, idempotence) — 92 tables, RLS intégral, 176 assertions pgTAP | `supabase/migrations/2026090800*` |

### 1.2 État du stock aujourd'hui (les faits)

- **Stock = `legacy_products.stock_qty` (integer, SANS CHECK ≥ 0)**, mis à jour par UPDATE absolu calculé **côté client** en 3 points :
  - `src/lib/quick-sale.ts:114-123` (écrêtage `Math.max(0, stockQty − qty)`, jamais de refus — flag `stockShort` non bloquant, testé par `quick-sale.test.ts:92`) ;
  - `src/components/marchand/caisse-screen.tsx:139-146` (décrément AVANT persistance de la vente) ;
  - `src/components/marchand/voice-modal.tsx:194` (réappro vocal, incrément) + `stock-screen.tsx:146`.
- **Le serveur ne touche JAMAIS au stock** : `POST /api/marchand/sales` insère la vente sans vérifier ni décrémenter (`sales/route.ts:91-174`) ; `PATCH /api/marchand/products` écrit `stock_qty` tel que dicté par le client.
- **Aucun journal de mouvements** côté marchand : aucune traçabilité, aucune détection de divergence multi-appareils.
- **Réappro jamais réincrémenté** : `legacy_supplier_orders` → `status='livree'` ne touche pas au stock ; les achats de marchandises passent éventuellement en dépense comptable (`category 'aliment'`) sans effet stock.

### 1.3 Ce qui manque (gap vs cahier des charges)

- ❌ Tables `purchases/purchase_items`, `business_partners` (clients/fournisseurs), `stock_transfers` — inexistantes.
- ❌ Unités de mesure et conversions (aucune notion de kg/sac/bassine/panier nulle part) ; quantité = entier abstrait.
- ❌ Seuil de stock faible paramétrable (`10` codé en dur à 5 endroits).
- ❌ Mouvements LOSS/DAMAGE/ADJUSTMENT/PRODUCTION/TRANSFER/RETURN/OPENING_BALANCE.
- ❌ Intents vocaux stock (`stock_check`, `stock_loss`, `stock_adjust`, achat-marchandise) ; `restock` incomplet ; « combien il reste de tomates ? » tombe dans `consultation` (= CA du jour) ; unités parsées limitées à `unités|pièces|kilos|kg|sacs|caisses|tas|lots|cartons|bottes` (`localIntent.ts:345-347`).
- ❌ Vérification serveur du stock sur le flux marchand actif (la RPC `create_sale` moderne n'a **aucun appelant**).
- ❌ Coût moyen pondéré / marge / prix multi-niveaux.

### 1.4 Infrastructures réutilisables (découvertes clés)

1. **Idempotence par `client_id`** déjà opérationnelle sur ventes/dépenses/produits (rejeu → 200, pas de doublon) — base à généraliser aux mouvements avec `operation_id`.
2. **RPC `create_sale` (migration 20260908001730)** : modèle exact de la transaction demandée (§35) — FOR UPDATE, refus `stock_qty < quantity`, mouvement + décrément atomiques, idempotence. Elle sera **adaptée** au flux marchand actif.
3. **Conventions migrations** : « 1 table = 1 fichier, 1 fonction = 1 fichier », RLS activé partout, pgTAP dans `supabase/tests/rls.sql`.
4. **Machine de confirmation vocale** (`routeConfirmResponse`, phases `confirm`) prête pour les confirmations d'opérations ambiguës (§17).
5. **`merchantCategorie`** en DB (CHECK) — support grossiste/semi-grossiste/détaillant déjà porté par l'auth (§24-26).

### 1.5 Risques identifiés

- **R1 — Contrat de vente change** : l'écrêtage « vente enregistrée, stock écrêté à 0 » devient un REFUS. Comportement demandé expressément (§3, §18) mais change le flux actuel + 1 test à réécrire (`quick-sale.test.ts:92`).
- **R2 — Deux générations de tables cohabitent** : le flux marchand actif vit sur `legacy_*` via `service_role` (PIN + device session), le tier moderne exige `organization_id` + Supabase Auth. Migrer l'auth = hors périmètre et risqué → construire sur le flux actif (décision §2.1).
- **R3 — Offline** : la vérification stricte est serveur ; hors ligne, une vente peut être acceptée localement puis REJETÉE à la synchro (conflit métier rapporté). À documenter pour la marchande.
- **R4 — Concurrence de nom** : la table moderne `stock_movements` (org-scoped) existe déjà → les nouvelles tables marchand prennent le préfixe `merchant_stock_*` pour éviter toute collision.

---

## 2. PHASE 2 — PLAN

### 2.1 Décisions d'architecture

| # | Décision | Justification |
|---|---|---|
| D1 | **Construire sur le flux marchand actif** (famille `legacy_*`, accès `service_role`, scoping `merchant_id`), PAS sur le tier moderne org-scoped | « Intégrer progressivement, ne pas détruire » : auth device-session préservée, zéro migration d'authentification ; la fusion vers le tier moderne se fera quand le marchand passera à Supabase Auth |
| D2 | **`legacy_sales`/`legacy_sale_items` restent les tables de ventes** ; la RPC unique `merchant_record_sale` y insère ET écrit le mouvement + la balance dans la même transaction | Les écrans ventes, le résumé vocal du jour, la sync lisent `legacy_sales` — zéro rupture de lecture ; le mouvement stock devient atomique avec la vente |
| D3 | **Double écriture temporaire** : la RPC met à jour `legacy_products.stock_qty` (compat écrans actuels) ET `merchant_stock_balances` (nouvelle source de vérité) ; le champ legacy sera gelé puis retiré après migration des lecteurs | Compatibilité immédiate, retrait progressif conforme §41 |
| D4 | **Mouvements signés** (`quantity_base` > 0 entrées, < 0 sorties, en unité de base) + CHECK de cohérence type↔signe | Historique lisible (§5 : ACHAT +100, VENTE −20), calcul = `SUM(quantity_base)` |
| D5 | **Append-only** : aucune route DELETE/UPDATE sur les mouvements ; correction = mouvement ADJUSTMENT_* avec `reason` + `reference_id` (§44) | Immutabilité de l'historique |
| D6 | **Pertes ≠ dépenses** : un LOSS est un mouvement de stock, pas une écriture comptable | §21 explicite |
| D7 | **Vente avec montant seul** (« pour 1 500 francs de tomates ») sur produit suivi : Tata DEMANDE la quantité, jamais de décrément arbitraire ; produit non suivi (balance UNKNOWN) : comportement actuel conservé (vente encaissée sans mouvement stock) | §12 explicite |

### 2.2 Schéma de données (migrations SQL, 1 objet = 1 fichier, préfixé `merchant_stock_`)

```
legacy_products (existant, inchangé)
  ├── merchant_product_units      — unités commerciales + conversion vers l'unité de base
  ├── merchant_product_prices     — PURCHASE / RETAIL / WHOLESALE / SEMI_WHOLESALE (validité temporelle)
  ├── merchant_stock_balances     — cache : quantity_base ≥ 0 (CHECK absolu), stock_precision (EXACT|ESTIMATED|UNKNOWN),
  │                                 low_stock_threshold, weighted_avg_cost
  └── merchant_stock_movements    — JOURNAL append-only, signé, unité de base
        types: OPENING_BALANCE, PURCHASE, RECEIPT, PRODUCTION, CUSTOMER_RETURN, TRANSFER_IN, ADJUSTMENT_IN,
               SALE, LOSS, DAMAGE, DONATION, SUPPLIER_RETURN, TRANSFER_OUT, ADJUSTMENT_OUT
        colonnes: merchant_id, product_id (FK RESTRICT), movement_type, quantity_base numeric(14,3) CHECK <> 0,
               quantity_commercial, unit_code, reason (PERISHABLE/SPOILAGE/INVENTORY_COUNT/THEFT/…),
               reference_type, reference_id, operation_id uuid, device_id, created_by, created_at
        UNIQUE (merchant_id, operation_id)  ← idempotence (§31-32)

merchant_purchases + merchant_purchase_items   — achats (fournisseur, montant FCFA entier)
merchant_stock_transfers + items               — transferts entre marchands (identifiant commun §28, status brouillon→envoyé→reçu)
business_partners                              — clients/fournisseurs (kind CHECK in ('client','fournisseur'), créances V1 = notes/solde)
```

Contraintes clés : `merchant_stock_balances.quantity_base CHECK >= 0` (**stock négatif physiquement impossible**, §33) ; un seul `is_base` par produit (index unique partiel) ; conversion `> 0` ; montants `bigint >= 0` (règle FCFA). RLS activé, **default deny** (régime service_role existant) — un marchand n'accède jamais aux données d'un autre (§42), l'API serveur filtre déjà par `requireDeviceOwner`.

### 2.3 RPC PostgreSQL (1 fonction = 1 fichier) — la garantie serveur

- `merchant_record_sale(p_merchant_id, p_operation_id, p_device_id, p_items jsonb, …)` (§35) :
  1. idempotence : `(merchant_id, operation_id)` déjà présent → retourner la vente existante ;
  2. pour chaque item (trié par product_id, anti-deadlock) : `SELECT … FOR UPDATE` sur la balance ;
  3. `quantity_base > available` → `RAISE` avec `USING` payload JSON `{"code":"INSUFFICIENT_STOCK","available":7,"requested":20,"unit":"kg","product":"tomates"}` (§36) ;
  4. INSERT `legacy_sales` + `legacy_sale_items` (total recalculé serveur, règle actuelle) ;
  5. INSERT mouvement `SALE` (−qty) ; UPDATE balance (double écriture D3) ; UPDATE coût/marge estimée ;
  6. COMMIT — tout ou rien.
- `merchant_record_purchase` : achat + mouvement `PURCHASE` (+qty) + balance + **coût moyen pondéré** (§30) + dépense liée optionnelle.
- `merchant_record_movement` : LOSS / DAMAGE / DONATION / CUSTOMER_RETURN / SUPPLIER_RETURN / PRODUCTION / RECEIPT / ADJUSTMENT_* avec `reason` obligatoire pour les sorties anormales.
- `merchant_adjust_to_count` : comptage réel → calcule le delta → crée ADJUSTMENT_IN/OUT `reason=INVENTORY_COUNT` (§22, jamais d'écrasement).
- `merchant_transfer_out` / `merchant_transfer_receive` : deux transactions liées par le même `transfer_id` (§28).
- **BACKFILL** (§40) : pour chaque `legacy_products` actif `stock_qty > 0` → mouvement `OPENING_BALANCE` (+qty, `operation_id` déterministe `opening-<product_id>`) + balance créée `EXACT`. Idempotent, rejouable.

### 2.4 StockService + API (§34 — une couche, zéro duplication)

- **Nouveau** `src/lib/stock/stock-service.ts` : `getStock()`, `checkAvailability()`, `recordSale()` (bascule la route vente), `recordPurchase()`, `recordLoss()`, `recordAdjustment()`, `adjustToCount()`, `createTransfer()`, `receiveTransfer()`, `getMovements()` + helpers d'affichage `formatStockDisplay(balance, units)` → « 2 sacs + 13 kg » (§8).
- **API** : `POST/GET /api/marchand/stock/movements` (journal + perte/ajustement), `GET /api/marchand/stock/balance`, `POST/GET /api/marchand/purchases`, `POST/GET /api/marchand/stock/transfers`, `GET/POST /api/marchand/stock/units` (conversions). Toutes : zod + `requireDeviceOwner` + mapping des erreurs RPC (`INSUFFICIENT_STOCK` → HTTP 422 + `{available, requested, unit}` pour Tata).
- **Route existante modifiée** : `POST /api/marchand/sales` délègue à la RPC `merchant_record_sale` (au lieu de 2 inserts non transactionnels) — le GET reste identique.

### 2.5 Migration de l'existant (§40-41)

1. BACKFILL OPENING_BALANCE (ci-dessus) — ancien stock = point de départ de l'historique.
2. `legacy_supplier_orders` : à la réception (`livree`) → génération d'un achat + mouvement RECEIPT (tâche dédiée STK-809).
3. Les données legacy sont TOUTES conservées ; aucun DROP ; dépréciation progressive de `stock_qty` nu.

### 2.6 Vente : nouveau contrat (R1 — changement demandé §3, §18, §19)

- **Avant** : stock insuffisant → vente ENREGISTRÉE, stock écrêté à 0, note « Attention, stock épuisé. » (`quick-sale.ts:114-123`, flag non bloquant).
- **Après** : `requested > available` → **refus** (serveur = autorité ; client = pré-vérification pour l'UX) → Tata : « Tu as seulement 7 kilos de tomates en stock. Je ne peux pas enregistrer cette vente. » → correction « Alors vends seulement 10 kilos » supportée (nouveau plan sur la même session). Cas exact (`=`) et zéro autorisés/refusés correctement (§19, §20).
- Le test `quick-sale.test.ts:92` (survente signalée sans blocage) est **réécrit** pour acter le refus — changement de contrat explicite de ce chantier.
- ⚠️ Conformité vocale : la confirmation de vente inclut désormais le stock disponible quand l'opération est ambiguë (§17).

### 2.7 Vocal Tata (§14-18) — pipeline inchangé, capacités étendues

- **Intents ajoutés** (`localIntent.ts`, avant la branche `navigation` — arbitrage : « stock » + produit/« combien » → `stock_check`, sinon navigation) : `stock_check` (« Il reste combien de tomates ? », « Quel est mon stock d'oignons ? »), `stock_loss` (« perdu », « gâtées », « avariées », « cassées », « volées »), `stock_adjust` (« Ajoute 20 kilos », « Enlève 5 kilos », « j'ai compté, il reste X »), `purchase` (« j'ai acheté 2 sacs d'oignons à 12 000 le sac » — discrimine `expense` actuel par présence d'un produit du vocabulaire).
- **Extraction** : `extractQuantity` étendu — unités `bassine|panier|bidon|fût|seau|litre|sachet|régime|plateau|boîte|botte` + décimales (« 1,5 kilo ») + retour `{quantity, unit}` dans `ParsedIntent` ; « 5 mille », « un tas », « deux paniers » déjà couverts par `parseFrenchNumber`/`NUMBER_WORDS`.
- **Dialogue montant-sans-quantité** (§12) : état `pendingQuantity` dans les modales → « Tu as vendu combien de kilos de tomates ? ».
- **Confirmations** (§17) : réutilisation de la machine existante (`confirm → routeConfirmResponse`) pour vente ambiguë/stock faible, perte, ajustement, achat.
- **Phrases Tata** (`tata-phrases.ts` étendu) : refus stock exact (§18/§20), avertissement stock faible non bloquant (§39), consultation convertie (« Il te reste 63 kilos d'oignons, soit environ 2 sacs et 13 kilos. » — §38), confirmation de réception d'achat.
- Producteur : « j'ai récolté 100 kilos » → mouvement PRODUCTION (rôle producteur existant, tâche STK-809).

### 2.8 Offline / sync (§31-32-33)

- `operation_id` UUID généré localement sur toute opération stock (achat, perte, ajustement, transfert) ; ventes conservent leur `clientId` existant (déjà idempotent).
- Nouvelles entités de queue + handlers : `purchase`, `stock-movement`, `stock-transfer` (+ handler `stock-transfer-receive`).
- **Conflit métier** : vente offline dont la synchro rencontre `INSUFFICIENT_STOCK` → 422 → `SyncConflictError` (mécanisme existant) → conflit rapporté, balance locale corrigée au refresh post-flush.
- Après chaque flush réussi : rechargement des balances serveur (source de vérité) dans `stock-store`.
- Vérification locale = pré-vérification UX ; **l'autorité reste le serveur** (concurrence multi-appareils garantie par FOR UPDATE + CHECK ≥ 0).

### 2.9 UI (§37 — ne pas transformer en ERP)

- `stock-screen.tsx` : affichage « MES PRODUITS » avec stock en unité commerciale (« Oignons — 4 sacs + 8 kg »), seuil paramétrable par produit (fini le `10` en dur), actions rapides VENDRE / AJOUTER / PERTE / COMPTAGE, historique du produit (§43 : 18 sept. 09:10 Achat +50 kg …).
- Simple et identique pour détaillant ; semi-grossiste/grossiste : mêmes briques + transferts/fournisseurs visibles selon `merchantCategorie` (badge déjà en DB).
- Panneau coûts/marge (V2, STK-810) discret.

### 2.10 Tests (§45) et critères d'acceptation (§46)

- **vitest** : stock-service (vente ≤ / = / > stock, stock 0, jamais négatif), unités & conversions (kg/sac/carton/bassine/panier, config par marchand), vocal (nouvelles phrases ivoiriennes, montant-sans-quantité, refus + correction), offline (achat/perte offline, double synchro = 1 seul effet, conflit insuffisant), régression ventes/caisse/résumé du jour.
- **pgTAP** (`supabase/tests/`) : RPC idempotente, CHECK ≥ 0, concurrence (2 sessions FOR UPDATE : 7 + 5 sur 10 → une réussit, une échoue, jamais −2), RLS default deny, append-only.
- **Checklist §46 reprise comme Definition of Done** du chantier, répartie sur les tâches ci-dessous.

### 2.11 Ordre d'implémentation + découpage registre (§47)

| Tâche | Contenu | Prio |
|---|---|---|
| STK-801 | Audit + plan (cette session, `.ai/PLAN_STOCK.md`) — TERMINÉ | P1 |
| STK-802 | Migrations DB : tables `merchant_stock_*` + `merchant_purchases*` + `merchant_stock_transfers*` + `business_partners` + contraintes + RLS + backfill OPENING_BALANCE | P1 |
| STK-803 | RPC transactionnelles (vente/achat/mouvement/comptage/erreurs métier JSON) + pgTAP concurrence | P1 |
| STK-804 | StockService + API `/api/marchand/stock/*`, `/purchases` + bascule `POST /api/marchand/sales` sur la RPC | P1 |
| STK-805 | **Refus strict stock insuffisant** (serveur + client + vocal + réécriture test quick-sale) — cœur de la règle §3 | P0 |
| STK-806 | Unités locales + conversions par produit/marchand + affichage commercial + seuils paramétrables | P1 |
| STK-807 | Vocal stock : intents + unités étendues + montant-sans-quantité + confirmations + phrases Tata | P1 |
| STK-808 | Offline/sync : operation_id, entités queue, conflits, refresh balances | P1 |
| STK-809 | Transferts + retours + réception commande fournisseur → stock + producteur PRODUCTION | P2 |
| STK-810 | Prix multi-niveaux + coût moyen pondéré + marge (MARGIN_CHECK vocal) | P2 |
| STK-811 | UI : MES PRODUITS enrichi + historique + perte/ajustement + simplicité par profil | P2 |
| STK-812 | Tests transverses (vitest + pgTAP) + checklist §46 complète | P1 |

### 2.12 Points de décision à confirmer avant implémentation

1. **D1/D2** : construire sur le flux legacy actif avec double écriture temporaire de `legacy_products.stock_qty` (recommandé) — ou migrer d'abord le marchand vers le tier moderne org-scoped (lourd, repousse tout).
2. **R1** : le refus strict remplace l'écrêtage actuel — confirmé par le cahier des charges (§3) mais cela **bloquera** des ventes qui passent aujourd'hui ; option de transition possible (refus + question « Enregistrer quand même comme vente sans stock ? » NON recommandée, elle contredit §18).
3. **D7** : vente « pour 1 500 francs » sur produit suivi → Tata demande la quantité (nouveau dialogue) ; sur produit non suivi → comportement actuel.
4. Séquence : STK-802 → 803 → 804 → 805 d'abord (fondation + règle métier), puis 806-808, puis 809-811.
