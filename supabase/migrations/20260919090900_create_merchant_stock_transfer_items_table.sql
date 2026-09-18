-- Migration: table merchant_stock_transfer_items (STK-802 — système de stock)
-- Lignes de transfert : quantité positive en unité de base (le signe vit
-- dans les mouvements TRANSFER_OUT / TRANSFER_IN, jamais ici).
-- Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_stock_transfer_items (
  id                     text primary key default gen_random_uuid()::text,
  transfer_id            text not null
    references public.merchant_stock_transfers(id) on delete cascade,
  product_id             text not null
    references public.legacy_products(id) on delete restrict,
  product_name           text not null,
  -- Quantité envoyée, en unité de base.
  quantity_base          numeric(14, 3) not null check (quantity_base > 0),
  unit_code              text,
  -- Quantité effectivement reçue (réception ; null = pas encore reçue).
  received_quantity_base numeric(14, 3)
    check (received_quantity_base is null or received_quantity_base >= 0),
  created_at             timestamptz not null default now()
);

create index if not exists idx_merchant_stock_transfer_items_transfer_id
  on public.merchant_stock_transfer_items(transfer_id);
create index if not exists idx_merchant_stock_transfer_items_product_id
  on public.merchant_stock_transfer_items(product_id);

alter table public.merchant_stock_transfer_items enable row level security;
