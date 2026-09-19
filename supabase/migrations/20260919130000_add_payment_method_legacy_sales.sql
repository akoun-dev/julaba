-- Migration: MODE-906 — mode de paiement sur les ventes legacy.
-- `payment_method` décrit COMMENT la vente a été encaissée (§9/§21 du cahier
-- Mode Marché) : la valeur 'credit' marque une vente à crédit (l'op de crédit
-- correspondante vit dans merchant_credit_ops, liée par sale_client_id).
-- Colonne avec défaut 'especes' : les ventes antérieures restent des ventes
-- en espèces, et les inserts existants (qui n'envoient pas la colonne)
-- continuent de fonctionner avant comme après la migration.

alter table public.legacy_sales
  add column if not exists payment_method text not null default 'especes';

-- Le vocabulaire est fermé : jamais de valeur inventée côté client.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'legacy_sales_payment_method_check'
      and conrelid = 'public.legacy_sales'::regclass
  ) then
    alter table public.legacy_sales
      add constraint legacy_sales_payment_method_check
      check (payment_method in ('especes', 'mobile_money', 'credit', 'autre'));
  end if;
end $$;
