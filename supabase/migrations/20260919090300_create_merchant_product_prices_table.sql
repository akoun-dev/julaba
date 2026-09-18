-- Migration: table merchant_product_prices (STK-802 — système de stock marchand)
-- Prix multi-niveaux à validité temporelle (§29) : PURCHASE / RETAIL /
-- WHOLESALE / SEMI_WHOLESALE. Le prix courant = ligne ouverte (valid_to null).
-- Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_product_prices (
  id          text primary key default gen_random_uuid()::text,
  merchant_id text not null,
  product_id  text not null
    references public.legacy_products(id) on delete cascade,
  client_id   text unique,
  price_type  text not null
    check (price_type in ('PURCHASE', 'RETAIL', 'WHOLESALE', 'SEMI_WHOLESALE')),
  -- Prix en FCFA entiers (règle montantParle / fcfaAmount).
  amount_cfa  bigint not null check (amount_cfa >= 0),
  -- Prix exprimé pour 1 unité commerciale (kg, sac, bassine…) ; null = prix
  -- global du produit, valable quelle que soit l'unité de vente.
  unit_id     text references public.merchant_product_units(id) on delete set null,
  valid_from  timestamptz not null default now(),
  valid_to    timestamptz,
  created_at  timestamptz not null default now(),
  unique (merchant_id, product_id, price_type, valid_from)
);

create index if not exists idx_merchant_product_prices_lookup
  on public.merchant_product_prices(merchant_id, product_id, price_type, valid_from desc);

alter table public.merchant_product_prices enable row level security;
