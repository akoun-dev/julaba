-- Migration: table merchant_purchase_items (STK-802 — système de stock marchand)
-- Lignes d'achat : quantité commerciale dictée (2 sacs) + quantité en unité
-- de base (50 kg) calculée serveur ; coût unitaire FCFA par unité commerciale.
-- Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_purchase_items (
  id              text primary key default gen_random_uuid()::text,
  purchase_id     text not null
    references public.merchant_purchases(id) on delete cascade,
  product_id      text references public.legacy_products(id) on delete restrict,
  product_name    text not null,
  -- Quantité commerciale saisie (2 sacs) et son unité.
  quantity        numeric(14, 3) not null check (quantity > 0),
  unit_code       text,
  -- Quantité convertie en unité de base (50 kg) — sert au mouvement PURCHASE.
  quantity_base   numeric(14, 3) not null check (quantity_base > 0),
  -- Coût FCFA par unité commerciale (12 000 le sac) et coût de la ligne.
  unit_cost_cfa   bigint not null check (unit_cost_cfa >= 0),
  line_cost_cfa   bigint not null check (line_cost_cfa >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_merchant_purchase_items_purchase_id
  on public.merchant_purchase_items(purchase_id);
create index if not exists idx_merchant_purchase_items_product_id
  on public.merchant_purchase_items(product_id);

alter table public.merchant_purchase_items enable row level security;
