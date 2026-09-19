# CHECKLIST_STK — Definition of Done du chantier stock (§46)

_« La checklist §46 reprise comme Definition of Done du chantier » (PLAN_STOCK §2.10)._
_Mise à jour : 2026-09-19 (STK-801 → STK-812 + SEC-813/814) · vitest 862/862 (54 fichiers) · tsc 0 · eslint 0 · pgTAP plan(108)_

Légende : ✅ livré et vérifié · la colonne Preuve renvoie au fichier/test/deployment qui le démontre.

## A. Fondation SQL (STK-802/803) — vérifiés pgTAP + DB prod

| # | Critère §46 | Statut | Preuve |
|---|---|---|---|
| 1 | 9 tables `merchant_stock_*` créées, RLS activée, 0 policy publique (tier service_role, deny-all) | ✅ | `supabase/tests/stock.sql` §1-2 · DB prod vérifiée (audit + scripts/check_db_state.js) |
| 2 | CHECK ≥ 0 sur balances : le stock négatif est physiquement impossible | ✅ | `stock.sql` (CHECK contraintes) + refus RPC avant écriture |
| 3 | RPC transactionnelles vente/achat/mouvement/comptage/backfill (SECURITY DEFINER, search_path fixé) | ✅ | migrations 091000-091400 · `stock.sql` §3 |
| 4 | Refus strict INSUFFICIENT_STOCK : vente ≤ / = / > stock ; stock 0 → refus ; JAMAIS d'écrêtage | ✅ | `stock.sql` §4-5 · `quick-sale.test.ts` (refus client + serveur) |
| 5 | Idempotence (merchant_id, operation_id) : rejeu offline = un seul effet | ✅ | `stock.sql` (idempotence) · `stock-service.test.ts` operationUuid déterministe |
| 6 | Journal append-only : mouvements jamais UPDATE/DELETE (§44) | ✅ | `stock.sql` (append-only) · TRIGGER protection |
| 7 | Raison obligatoire sur toute sortie anormale (LOSS/DAMAGE/DONATION/…/ADJUSTMENT_OUT) | ✅ | CHECK table + zod superRefine (`validation/marchand.ts`) |
| 8 | Coût moyen pondéré alimenté par les achats (§30) | ✅ | `stock.sql` (Purchases) · /api/marchand/stock/marge lit weighted_avg_cost |
| 9 | Comptage réel : delta tracé ADJUSTMENT_IN/OUT, jamais d'écrasement (§22) | ✅ | `stock.sql` §11-12 |
| 10 | Produit non suivi : comportement honnête préservé, pas de fausse erreur (D7) | ✅ | `stock.sql` (produit non suivi) |

## B. Sécurité (audit PHASE 1 → SEC-813/814)

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 11 | SEC-813 : les 8 RPC merchant_* ne sont exécutables NI par anon NI par authenticated | ✅ | migration `20260919100000` · DB prod vérifiée (anon=REFUSED 42501) · `stock.sql` §13 |
| 12 | SEC-814 : device_push_tokens RLS + 0 grants anon/authenticated | ✅ | migration `20260919100100` · DB prod vérifiée · `stock.sql` §13 |
| 13 | Toute écriture stock passe par requireDeviceOwner + client service_role | ✅ | 8 routes `/api/marchand/stock/*` + purchases/sales (`require-owner`) |

## C. Unités & affichage (STK-806)

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 14 | Catalogue 21 unités CI, conversions PAR produit/marchand (jamais « sac = X kg » universel) | ✅ | `units.ts` · API /stock/units · `units.test.ts` |
| 15 | Affichage converti « 2 sacs + 13 kilos », honnête sans config (quantité brute) | ✅ | `formatStockDisplay` · `units.test.ts` · stock-screen `displayStock` |
| 16 | Seuils d'alerte paramétrables par produit — fini le « < 10 » gravé (5 occurrences supprimées) | ✅ | `stock-store.ts` (thresholdsByProduct) · caisse/stock-screen · `stock-store.test.ts` |

## D. Voix Tata (STK-807/809/810)

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 17 | 4+1 intents stock : check §38, perte §41, ajustement, production, achat — avant le détecteur de fin | ✅ | `localIntent.ts` · `voice-stock-intents.test.ts` (« il me reste plus rien » ≠ au revoir) |
| 18 | Quantité+unité orales : « 2 sacs », « 1,5 kilo », « deux régimes », garde anti-préfixe (?![a-zà-öø-ÿ]) | ✅ | `extractQuantityWithUnit` · 8 tests extracteur |
| 19 | INVALID_UNIT honnête : unité non configurée → Tata demande de configurer, jamais de conversion inventée | ✅ | `resolveSpokenQuantity` · `voice-stock-intents.test.ts` |
| 20 | Dialogue §12 montant-sans-quantité : « Tu en as vendu combien ? » puis fusion de la réponse | ✅ | `pendingQuantityRef` (voice-modal) · formatAskQuantity |
| 21 | Consultation marge vocale : 3 vérités (gagne / PERTE / « je ne sais pas ») | ✅ | `margin_check` · `formatMarginReply` · `prices.test.ts` |
| 22 | « acheté du riz 500 » = ACHAT de stock (contrat réécrit), dépense sans produit intacte | ✅ | `localIntent.test.ts` (contrat réécrit) |

## E. Offline & sync (STK-808/809)

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 23 | Toute opération stock (achat, perte, ajustement, comptage, transfert, réception) porte un clientId → UUID déterministe ; rejeu = un seul effet | ✅ | `sync-handlers.ts` (6 entités) · routes operationUuid · `sync-handlers-stock.test.ts` |
| 24 | Conflits : 422 stock insuffisant = rejet DÉFINITIF (SyncConflictError), jamais de retry en boucle ; post-flush = refresh balances serveur | ✅ | `jsonRequest` 422→conflict · `sync-flusher.tsx` refreshStockAfterFlush (throttle 2 s) |

## F. Transferts, réception, UI (STK-809/811)

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 25 | Transferts inter-marchands : doc sent→received/cancelled, annulation RENTRE le stock, recevoir = destinataire seul ; réception commande fournisseur → achat RPC PUIS statut livrée ; MES PRODUITS : actions rapides tracées en mouvements (Réappro absolu SUPPRIMÉ), historique §43 FR, marge discrète | ✅ | `stock.sql` §14-15 · route transfers · supplier-orders recevoir · `stock-screen.tsx` · `quick-actions.test.ts` |

## Gates finaux

| Gate | Résultat |
|---|---|
| `bun run test` (vitest) | **862/862 verts** — 54 fichiers |
| `tsc --noEmit` | 0 erreur |
| `eslint .` | 0 erreur 0 warning |
| pgTAP `supabase/tests/stock.sql` | plan(108) — 71 historiques + 37 nouveaux (ACL SEC, transferts complets, multi-articles dérivés, atomicité) |
| Migrations en production | 20260919090100 → 20260919100400+ (transferts + fixes + SEC-813/814) appliquées et vérifiées in situ |
| Backfill OPENING_BALANCE | Exécuté en prod : 4 balances EXACT + 4 mouvements |
