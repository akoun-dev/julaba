-- Migration: table legacy_products (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_products (
  id          text primary key default gen_random_uuid()::text,
  merchant_id text not null,
  client_id   text unique,
  name        text not null,
  category    text not null default 'autre',
  price_unit  integer not null default 0,
  stock_qty   integer not null default 0,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_legacy_products_merchant_id on public.legacy_products(merchant_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_products disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_products_updated_at on public.legacy_products;
create trigger set_legacy_products_updated_at
  before update on public.legacy_products
  for each row execute function public.set_updated_at_legacy();
