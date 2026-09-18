-- Migration: table merchant_product_units (STK-802 — système de stock marchand)
-- Unités commerciales par produit et conversion vers l'unité de base (§8-9) :
-- « Ne jamais supposer qu'un sac = X kg universellement » — la conversion est
-- configurable par produit ET par marchand (1 sac oignons = 25 kg ou 50 kg).
-- Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_product_units (
  id                 text primary key default gen_random_uuid()::text,
  merchant_id        text not null,
  product_id         text not null
    references public.legacy_products(id) on delete cascade,
  client_id          text unique,
  -- kg, g, litre, ml, sac, carton, caisse, bassine, panier, tas, botte,
  -- bidon, fut, seau, piece, unite, lot… (code libre, validé côté API)
  unit_code          text not null,
  -- Combien d'unités de base vaut 1 unité commerciale (ex. sac → 25 kg).
  conversion_to_base numeric(14, 6) not null check (conversion_to_base > 0),
  -- Unité de base du produit (le stock réel est compté dans cette unité).
  is_base            boolean not null default false,
  -- Unité proposée par défaut au comptoir pour ce produit.
  is_default_sale    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (merchant_id, product_id, unit_code)
);

create index if not exists idx_merchant_product_units_merchant_product
  on public.merchant_product_units(merchant_id, product_id);

-- Un seul is_base et une seule unité de vente par défaut par produit.
create unique index if not exists uq_merchant_product_units_one_base
  on public.merchant_product_units(merchant_id, product_id)
  where is_base;
create unique index if not exists uq_merchant_product_units_one_default
  on public.merchant_product_units(merchant_id, product_id)
  where is_default_sale;

-- L'unité de base vaut exactement 1 fois elle-même.
alter table public.merchant_product_units
  add constraint chk_merchant_product_units_base_is_one
  check (is_base = false or conversion_to_base = 1);

drop trigger if exists set_merchant_product_units_updated_at
  on public.merchant_product_units;
create trigger set_merchant_product_units_updated_at
  before update on public.merchant_product_units
  for each row execute function public.set_updated_at_legacy();

alter table public.merchant_product_units enable row level security;
