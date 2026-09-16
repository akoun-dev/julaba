-- Migration: table legacy_sale_items (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_sale_items (
  id           text primary key default gen_random_uuid()::text,
  sale_id      text not null references public.legacy_sales(id) on delete cascade,
  product_id   text,
  product_name text not null,
  quantity     integer not null,
  unit_price   integer not null,
  subtotal     integer not null
);

create index if not exists idx_legacy_sale_items_sale_id on public.legacy_sale_items(sale_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_sale_items disable row level security;
