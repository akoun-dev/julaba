-- Migration: table merchant_stock_balances (STK-802 — système de stock marchand)
-- Cache de disponibilité par produit : quantity_base >= 0 (CHECK absolu — le
-- stock négatif est physiquement impossible, §33). Les mouvements restent la
-- source de vérité ; la balance est tenue à jour dans les transactions RPC.
-- Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_stock_balances (
  merchant_id         text not null,
  product_id          text not null
    references public.legacy_products(id) on delete restrict,
  -- Stock en unité de base. CHECK >= 0 : invariant métier non négociable (§3).
  quantity_base       numeric(14, 3) not null default 0
    check (quantity_base >= 0),
  -- EXACT = compté/connu ; ESTIMATED = approché ; UNKNOWN = stock inconnu
  -- (toute vente à décrément précis exige un comptage d'abord, §23).
  stock_precision     text not null default 'UNKNOWN'
    check (stock_precision in ('EXACT', 'ESTIMATED', 'UNKNOWN')),
  -- Seuil d'alerte paramétrable par produit (§39) — null = pas d'alerte.
  -- Informe (« Attention, ton stock de tomates est faible ») sans jamais bloquer.
  low_stock_threshold numeric(14, 3),
  -- Coût moyen pondéré en FCFA par unité de base (§30, marge estimée).
  weighted_avg_cost   numeric(14, 2) check (weighted_avg_cost is null or weighted_avg_cost >= 0),
  last_movement_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (merchant_id, product_id)
);

create index if not exists idx_merchant_stock_balances_merchant
  on public.merchant_stock_balances(merchant_id);

drop trigger if exists set_merchant_stock_balances_updated_at
  on public.merchant_stock_balances;
create trigger set_merchant_stock_balances_updated_at
  before update on public.merchant_stock_balances
  for each row execute function public.set_updated_at_legacy();

alter table public.merchant_stock_balances enable row level security;
