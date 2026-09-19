# SPEC-MODE-909 — Annulation/correction de vente (cahier Mode Marché §28)

Statut : livré (Task 74-e — tests d'abord, gates vertes). Prérequis : MODE-906
(conventions RPC SECURITY DEFINER + routes idempotentes + handlers offline),
STK-804 (route ventes, operationUuid), MODE-908 (journal caisse du jour).

## 1. Principe
Une vente enregistrée ne se supprime JAMAIS (ni legacy_sales ni journal
local — zéro DELETE/UPDATE). L'annulation est une OPÉRATION INVERSE
append-only : nouvelle entité `sale-reversal` { clientId (uuid
d'idempotence), saleClientId, reason (obligatoire, 3-200), createdAt }.
Une vente annulée = EXISTS une reversal la ciblant. L'historique reste
intact, le stock revient. JAMAIS le mot « supprimer » dans l'UI.

## 2. Décisions verrouillées
- Migration `20260919150000` : table `merchant_sale_reversals` (id uuid pk,
  merchant_id, operation_id uuid, sale_client_id text, reason text CHECK
  length(trim) 3-200, created_at) + UNIQUE (merchant_id, operation_id)
  + UNIQUE (merchant_id, sale_client_id) — une vente ne s'annule qu'UNE
  fois + index (merchant_id, created_at desc) + RLS. AUCUNE colonne
  ajoutée à legacy_sales.
- RPC `merchant_reverse_sale` (20260919150100) SECURITY DEFINER, style
  merchant_record_credit_op : verrou sur la VENTE (FOR UPDATE — sérialise
  les annulations concurrentes) ; idempotence (merchant_id, operation_id)
  → état courant ; vente introuvable → 22023 « Vente introuvable » ; déjà
  annulée (re-vérifié sous verrou) → état courant ; SINON relit
  legacy_sale_items et crée un mouvement CUSTOMER_RETURN (+qty) par article
  SUIVI de stock (réutilise merchant_record_movement, operation_id dérivé
  par produit md5(op || ':reversal:' || product_id) — même technique que
  le fix STK-809) ; ligne sans product_id ou produit non suivi (balance
  absente/UNKNOWN) → item ignoré sans erreur. Retour
  { operation_id, sale_client_id, items_returned, created }.
- Route `POST /api/marchand/sale-reversals` (zod clientId min 8,
  saleClientId min 8, reason 3-200) : RPC ; PGRST202 → repli non
  transactionnel (insert reversal + mouvements via RPC de mouvement si
  dispo, sinon skip stock avec note honnête) ; 42P01 → 503 transitoire ;
  « Vente introuvable » → 422 ; 23505 sur sale_client_id → relecture →
  200 idempotent. Handler offline `'sale-reversal'` (rejeu verbatim ; FIFO
  : la reversal part APRÈS la vente qu'elle annule — vente créée puis
  annulée au rejeu).
- GET /api/marchand/sales : chaque vente enrichie `annulee: boolean` (la
  LISTE garde toutes les ventes — historique intact) ; `totalRevenue`
  exclut les ventes annulées (revenu = ce qui est compté) + `cancelledCount`.
- Local : caisse-store gagne un JOURNAL des ventes du jour (append-only,
  remis à zéro chaque jour) alimenté par tous les émetteurs (caisse,
  vente rapide, voix). `reverseSale(saleClientId, reason)` : marque
  l'entrée (annulee + reason), met en file 'sale-reversal', remet le
  stock local (delta +qty par item via adjustLocalStock — JAMAIS de
  valeur absolue), décrémente les agrégats du jour (jamais sous 0).
  Refus si déjà annulée. Vente EN FILE offline : annulation permise sur
  la copie locale (rejeu FIFO cohérent).
- Voix : intent `annule_vente` (« annule la dernière vente », « annule la
  vente ») → confirmation orale OBLIGATOIRE (pendingConfirmRef) avec les
  infos de la dernière vente locale non annulée ; aucune → « Je ne trouve
  pas de vente à annuler aujourd'hui. » ; non → « Je n'ai rien annulé. »
- Résumé du jour : les ventes annulées sont exclues du dicté et la phrase
  ajoute « {N} vente(s) annulée(s) non comptée(s). » si N > 0 (tests
  day-summary ÉTENDUS, jamais cassés).

## 3. Hors périmètre v1 (documenté)
Remboursement cash en caisse (le retour stock ne restitue pas l'argent —
le marchand rend la monnaie physiquement), annulation d'une vente d'un
autre jour/appareil depuis ce device, échéanciers, annulation d'op de
crédit (MODE-906 note : la reversal d'une vente à crédit ne touche pas le
solde du partenaire — v1 documentée).
