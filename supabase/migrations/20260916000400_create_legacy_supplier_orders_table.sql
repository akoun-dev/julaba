-- Migration: table legacy_supplier_orders — commandes fournisseurs du Marché Jùlaba
-- Extrait de 20260916000000_marchand_features.sql (re-baseline 1 table = 1 fichier).
--
-- Commandes qu'un marchand passe sur une entrée du catalogue fournisseurs
-- (le catalogue codé en dur de l'écran Marché tient lieu de côté fournisseur
-- jusqu'à un vrai portail). Cycle de vie porté par le côté fournisseur/backoffice :
-- en_attente → confirmee → livree, en_attente → annulee (par le marchand).

create table if not exists public.legacy_supplier_orders (
  id           text primary key default gen_random_uuid()::text,
  merchant_id  text not null,
  client_id    text unique,
  supplier     text not null,
  product_name text not null,
  quantity     integer not null default 1 check (quantity > 0),
  unit_price   integer not null default 0 check (unit_price >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  status       text not null default 'en_attente'
    check (status in ('en_attente', 'confirmee', 'livree', 'annulee')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_legacy_supplier_orders_merchant
  on public.legacy_supplier_orders(merchant_id, created_at desc);
create index if not exists idx_legacy_supplier_orders_status
  on public.legacy_supplier_orders(merchant_id, status);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session).
alter table public.legacy_supplier_orders disable row level security;
