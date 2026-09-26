-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260925162000_money_guards.sql — AUDIT-013 / MODE-1014
-- Gardes SQL des montants FCFA : CHECK nommés, ADDITIFS, idempotents.
--
-- Constat AUDIT-013 : les montants sont bien gardés dans plusieurs flux
-- marchands/marketplace (sales, expenses, tontine_contributions,
-- merchant_*, marketplace_*), mais PAS PARTOUT — la génération legacy
-- (re-baseline 20260101*) et quelques tables récentes n'ont AUCUNE
-- contrainte CHECK : les montants n'étaient portés que par Zod/la
-- validation applicative. Un insert direct (RPC future, backoffice,
-- seed corrompu, script d'admin) peut écrire un montant négatif.
--
-- ── PRÉ-CONTRÔLE À LANCER EN PROD AVANT `supabase db push` ──────────────
-- Si une ligne négative existe, le ADD CONSTRAINT (validé) échouera et
-- la migration s'arrêtera. Nettoyer/corriger d'abord, puis re-pousser.
--
--   select 'legacy_products' t, id, price_unit v from public.legacy_products where price_unit < 0
--   union all select 'legacy_sales', id, total_amount from public.legacy_sales where total_amount < 0
--   union all select 'legacy_sales', id, amount_received from public.legacy_sales where amount_received < 0
--   union all select 'legacy_sales', id, change_amount from public.legacy_sales where change_amount < 0
--   union all select 'legacy_sale_items', id, unit_price from public.legacy_sale_items where unit_price < 0
--   union all select 'legacy_sale_items', id, subtotal from public.legacy_sale_items where subtotal < 0
--   union all select 'legacy_expenses', id, amount from public.legacy_expenses where amount < 0
--   union all select 'legacy_caisse_sessions', id, fond_de_caisse from public.legacy_caisse_sessions where fond_de_caisse < 0
--   union all select 'legacy_caisse_sessions', id, total_ventes from public.legacy_caisse_sessions where total_ventes < 0
--   union all select 'legacy_caisse_sessions', id, total_depenses from public.legacy_caisse_sessions where total_depenses < 0
--   union all select 'legacy_caisse_sessions', id, total_final from public.legacy_caisse_sessions where total_final < 0
--   union all select 'legacy_tontines', id, amount from public.legacy_tontines where amount < 0
--   union all select 'legacy_tontine_contributions', id, amount from public.legacy_tontine_contributions where amount <= 0
--   union all select 'legacy_bo_keiwa_accounts', id, balance from public.legacy_bo_keiwa_accounts where balance < 0
--   union all select 'legacy_bo_keiwa_transactions', id, amount from public.legacy_bo_keiwa_transactions where amount <= 0
--   union all select 'legacy_producteur_recoltes', id, prix_souhaite_par_kg from public.legacy_producteur_recoltes where prix_souhaite_par_kg < 0
--   union all select 'legacy_producteur_recoltes', id, montant_vente from public.legacy_producteur_recoltes where montant_vente < 0
--   union all select 'legacy_producteur_commandes', id, montant from public.legacy_producteur_commandes where montant < 0
--   union all select 'keiwa_accounts', id::text, balance from public.keiwa_accounts where balance < 0
--   union all select 'cash_sessions', id::text, closing_amount from public.cash_sessions where closing_amount < 0
--   union all select 'merchant_market_sessions', id, starting_cash from public.merchant_market_sessions where starting_cash < 0
--   union all select 'merchant_market_sessions', id, ending_cash from public.merchant_market_sessions where ending_cash < 0
--   union all select 'merchant_market_sessions', id, sales_total from public.merchant_market_sessions where sales_total < 0
--   union all select 'merchant_market_sessions', id, expenses_total from public.merchant_market_sessions where expenses_total < 0
--   union all select 'cooperative_besoins', id::text, prix_max from public.cooperative_besoins where prix_max < 0
--   union all select 'cooperative_besoins', id::text, prix_achat from public.cooperative_besoins where prix_achat < 0
--   union all select 'cooperative_besoins', id::text, prix_dispatch from public.cooperative_besoins where prix_dispatch < 0;
--
-- ── SÉMANTIQUE DES DOMAINES (choix >= 0 vs > 0, vérifié dans le code) ───
-- • Prix / totaux / caisse / dépenses : >= 0 — zéro est légitime
--   (produit offert, countedCash absent→0, montantFcfaValide accepte 0
--   dans src/lib/marchand/fcfa.ts ; aligné sur les contraintes des tables
--   modernes sales/expenses/cash_sessions qui utilisent >= 0).
-- • Cotisations (tontine_contributions) : > 0 — la route
--   /api/marchand/tontines refuse amount <= 0 et la table moderne
--   tontine_contributions porte déjà check (amount > 0) : les deux
--   générations s'accordent, aucun doute.
-- • Transactions wallet (legacy_bo_keiwa_transactions) : > 0 — la
--   magnitude est positive, la direction est portée par `type`
--   (depot/retrait/transfert) + sender/recipient ; aligné sur la table
--   sœur legacy_keiwa_transactions (check amount > 0). Aucun chemin
--   d'écriture applicatif n'insère de négatif (route backoffice en
--   lecture seule).
-- • Soldes de portefeuille (keiwa_accounts, legacy_bo_keiwa_accounts) :
--   >= 0 — un solde wallet ne descend jamais sous 0 (les débits sont
--   bloqués SOLDE_INSUFFISANT côté legacy_keiwa_apply_operation /
--   cooperative_cotiser_keiwa) ; aligné sur legacy_keiwa_wallets.balance
--   qui porte déjà check (balance >= 0).
-- • Prix coopératifs (cooperative_besoins.prix_*) : NULL autorisé (le
--   prix n'est connu qu'à la consolidation), mais non négatif sinon —
--   `col is null or col >= 0`.
--
-- ── EXCLUSIONS MOTIVÉES (aucune contrainte ajoutée) ─────────────────────
-- • public.business_partners.balance_cfa : solde SIGNÉ PAR DESIGN. La
--   migration d'origine (20260919090100) le documente : « > 0 le
--   partenaire doit au marchand ; < 0 le marchand doit au partenaire ».
--   Le seed contient des soldes négatifs légitimes (fournisseurs :
--   -15000, -85000) et la RPC merchant_record_credit_op gère la règle
--   métier (REPAYMENT_EXCEEDS_DEBT pour les clients). Un CHECK >= 0
--   casserait des données valides.
-- • public.keiwa_transactions.amount : déjà check (amount <> 0) —
--   registre SIGNÉ volontaire (débits/crédits), pas une magnitude.
-- • Tables déjà gardées (aucune action) : sales, sale_items, expenses,
--   cash_sessions.total_*/opening_float, tontines (moderne),
--   tontine_contributions (moderne), products.price_unit (moderne),
--   harvests.desired_price_per_kg/sale_amount, producer_orders.amount,
--   legacy_keiwa_wallets.balance, legacy_keiwa_transactions.amount/
--   balance_after (balance_after vérifié par la fonction apply_operation),
--   legacy_supplier_orders, merchant_product_prices, merchant_purchases,
--   merchant_purchase_items, merchant_stock_balances.weighted_avg_cost,
--   merchant_credit_ops, marketplace_* (orders/order_items/payments/
--   listings), loyalty (points_balance/cost_points/value_cfa),
--   cooperative_transactions.montant, cooperative_stock(_mouvements),
--   bo_objectifs.target.
-- • Aucune table auth.*, aucune fonction, aucun trigger : contraintes
--   CHECK ADDITIVES uniquement (idempotentes via pg_constraint).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── legacy_products : prix unitaire ──────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_products_price_unit'
      and conrelid = 'public.legacy_products'::regclass and contype = 'c'
  ) then
    alter table public.legacy_products
      add constraint chk_legacy_products_price_unit check (price_unit >= 0);
  end if;
end $$;

-- ── legacy_sales : total, montant reçu, monnaie rendue ───────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_sales_total_amount'
      and conrelid = 'public.legacy_sales'::regclass and contype = 'c'
  ) then
    alter table public.legacy_sales
      add constraint chk_legacy_sales_total_amount check (total_amount >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_sales_amount_received'
      and conrelid = 'public.legacy_sales'::regclass and contype = 'c'
  ) then
    alter table public.legacy_sales
      add constraint chk_legacy_sales_amount_received check (amount_received >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_sales_change_amount'
      and conrelid = 'public.legacy_sales'::regclass and contype = 'c'
  ) then
    alter table public.legacy_sales
      add constraint chk_legacy_sales_change_amount check (change_amount >= 0);
  end if;
end $$;

-- ── legacy_sale_items : prix unitaire et sous-total ──────────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_sale_items_unit_price'
      and conrelid = 'public.legacy_sale_items'::regclass and contype = 'c'
  ) then
    alter table public.legacy_sale_items
      add constraint chk_legacy_sale_items_unit_price check (unit_price >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_sale_items_subtotal'
      and conrelid = 'public.legacy_sale_items'::regclass and contype = 'c'
  ) then
    alter table public.legacy_sale_items
      add constraint chk_legacy_sale_items_subtotal check (subtotal >= 0);
  end if;
end $$;

-- ── legacy_expenses : dépense ────────────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_expenses_amount'
      and conrelid = 'public.legacy_expenses'::regclass and contype = 'c'
  ) then
    alter table public.legacy_expenses
      add constraint chk_legacy_expenses_amount check (amount >= 0);
  end if;
end $$;

-- ── legacy_caisse_sessions : fond de caisse et totaux ────────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_caisse_sessions_fond_de_caisse'
      and conrelid = 'public.legacy_caisse_sessions'::regclass and contype = 'c'
  ) then
    alter table public.legacy_caisse_sessions
      add constraint chk_legacy_caisse_sessions_fond_de_caisse check (fond_de_caisse >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_caisse_sessions_total_ventes'
      and conrelid = 'public.legacy_caisse_sessions'::regclass and contype = 'c'
  ) then
    alter table public.legacy_caisse_sessions
      add constraint chk_legacy_caisse_sessions_total_ventes check (total_ventes >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_caisse_sessions_total_depenses'
      and conrelid = 'public.legacy_caisse_sessions'::regclass and contype = 'c'
  ) then
    alter table public.legacy_caisse_sessions
      add constraint chk_legacy_caisse_sessions_total_depenses check (total_depenses >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_caisse_sessions_total_final'
      and conrelid = 'public.legacy_caisse_sessions'::regclass and contype = 'c'
  ) then
    alter table public.legacy_caisse_sessions
      add constraint chk_legacy_caisse_sessions_total_final check (total_final >= 0);
  end if;
end $$;

-- ── legacy_tontines : cotisation cible (>= 0, aligné table moderne) ──────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_tontines_amount'
      and conrelid = 'public.legacy_tontines'::regclass and contype = 'c'
  ) then
    alter table public.legacy_tontines
      add constraint chk_legacy_tontines_amount check (amount >= 0);
  end if;
end $$;

-- ── legacy_tontine_contributions : cotisation STRICTEMENT positive (> 0,
--    la route refuse amount <= 0 et la table moderne porte amount > 0) ────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_tontine_contributions_amount'
      and conrelid = 'public.legacy_tontine_contributions'::regclass and contype = 'c'
  ) then
    alter table public.legacy_tontine_contributions
      add constraint chk_legacy_tontine_contributions_amount check (amount > 0);
  end if;
end $$;

-- ── legacy_bo_keiwa_accounts : solde wallet >= 0 ─────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_bo_keiwa_accounts_balance'
      and conrelid = 'public.legacy_bo_keiwa_accounts'::regclass and contype = 'c'
  ) then
    alter table public.legacy_bo_keiwa_accounts
      add constraint chk_legacy_bo_keiwa_accounts_balance check (balance >= 0);
  end if;
end $$;

-- ── legacy_bo_keiwa_transactions : magnitude > 0 (direction via `type`,
--    aligné sur la table sœur legacy_keiwa_transactions) ──────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_bo_keiwa_transactions_amount'
      and conrelid = 'public.legacy_bo_keiwa_transactions'::regclass and contype = 'c'
  ) then
    alter table public.legacy_bo_keiwa_transactions
      add constraint chk_legacy_bo_keiwa_transactions_amount check (amount > 0);
  end if;
end $$;

-- ── legacy_producteur_recoltes : prix souhaité (>= 0) et montant de vente
--    (nullable — recolte non vendue ; non négatif sinon) ──────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_prod_recoltes_prix_souhaite'
      and conrelid = 'public.legacy_producteur_recoltes'::regclass and contype = 'c'
  ) then
    alter table public.legacy_producteur_recoltes
      add constraint chk_legacy_prod_recoltes_prix_souhaite
        check (prix_souhaite_par_kg >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_prod_recoltes_montant_vente'
      and conrelid = 'public.legacy_producteur_recoltes'::regclass and contype = 'c'
  ) then
    alter table public.legacy_producteur_recoltes
      add constraint chk_legacy_prod_recoltes_montant_vente
        check (montant_vente is null or montant_vente >= 0);
  end if;
end $$;

-- ── legacy_producteur_commandes : montant commande >= 0 ──────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_legacy_prod_commandes_montant'
      and conrelid = 'public.legacy_producteur_commandes'::regclass and contype = 'c'
  ) then
    alter table public.legacy_producteur_commandes
      add constraint chk_legacy_prod_commandes_montant check (montant >= 0);
  end if;
end $$;

-- ── keiwa_accounts : solde wallet >= 0 (aligné legacy_keiwa_wallets) ─────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_keiwa_accounts_balance'
      and conrelid = 'public.keiwa_accounts'::regclass and contype = 'c'
  ) then
    alter table public.keiwa_accounts
      add constraint chk_keiwa_accounts_balance check (balance >= 0);
  end if;
end $$;

-- ── cash_sessions : caisse comptée à la clôture (nullable, >= 0 sinon) ───
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_cash_sessions_closing_amount'
      and conrelid = 'public.cash_sessions'::regclass and contype = 'c'
  ) then
    alter table public.cash_sessions
      add constraint chk_cash_sessions_closing_amount
        check (closing_amount is null or closing_amount >= 0);
  end if;
end $$;

-- ── merchant_market_sessions : caisse de départ/fin, totaux de journée ───
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_merchant_market_sessions_starting_cash'
      and conrelid = 'public.merchant_market_sessions'::regclass and contype = 'c'
  ) then
    alter table public.merchant_market_sessions
      add constraint chk_merchant_market_sessions_starting_cash
        check (starting_cash >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_merchant_market_sessions_ending_cash'
      and conrelid = 'public.merchant_market_sessions'::regclass and contype = 'c'
  ) then
    alter table public.merchant_market_sessions
      add constraint chk_merchant_market_sessions_ending_cash
        check (ending_cash is null or ending_cash >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_merchant_market_sessions_sales_total'
      and conrelid = 'public.merchant_market_sessions'::regclass and contype = 'c'
  ) then
    alter table public.merchant_market_sessions
      add constraint chk_merchant_market_sessions_sales_total
        check (sales_total is null or sales_total >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_merchant_market_sessions_expenses_total'
      and conrelid = 'public.merchant_market_sessions'::regclass and contype = 'c'
  ) then
    alter table public.merchant_market_sessions
      add constraint chk_merchant_market_sessions_expenses_total
        check (expenses_total is null or expenses_total >= 0);
  end if;
end $$;

-- ── cooperative_besoins : prix max/achat/dispatch (nullable, >= 0 sinon) ─
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_cooperative_besoins_prix_max'
      and conrelid = 'public.cooperative_besoins'::regclass and contype = 'c'
  ) then
    alter table public.cooperative_besoins
      add constraint chk_cooperative_besoins_prix_max
        check (prix_max is null or prix_max >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_cooperative_besoins_prix_achat'
      and conrelid = 'public.cooperative_besoins'::regclass and contype = 'c'
  ) then
    alter table public.cooperative_besoins
      add constraint chk_cooperative_besoins_prix_achat
        check (prix_achat is null or prix_achat >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_cooperative_besoins_prix_dispatch'
      and conrelid = 'public.cooperative_besoins'::regclass and contype = 'c'
  ) then
    alter table public.cooperative_besoins
      add constraint chk_cooperative_besoins_prix_dispatch
        check (prix_dispatch is null or prix_dispatch >= 0);
  end if;
end $$;
