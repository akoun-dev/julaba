-- Migration: table merchant_stock_movements (STK-802 — système de stock marchand)
-- LE JOURNAL — source de vérité du stock (§5-6) : ACHAT +100, VENTE −20,
-- PERTE −5, TRANSFERT −10/+10, RETOUR +2. Append-only : aucune route
-- DELETE/UPDATE, une correction = un nouveau mouvement ADJUSTMENT_* (§44).
-- Mouvements signés en unité de base : entrées > 0, sorties < 0 (D4).
-- Tier service_role : RLS activé sans policy (isolation marchand, §42).

create table if not exists public.merchant_stock_movements (
  id                   text primary key default gen_random_uuid()::text,
  merchant_id          text not null,
  product_id           text not null
    references public.legacy_products(id) on delete restrict,
  movement_type        text not null check (movement_type in (
    -- Entrées
    'OPENING_BALANCE', 'PURCHASE', 'RECEIPT', 'PRODUCTION',
    'CUSTOMER_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN',
    -- Sorties
    'SALE', 'LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN',
    'TRANSFER_OUT', 'ADJUSTMENT_OUT'
  )),
  -- Signé, en unité de base : > 0 entrées, < 0 sorties. Jamais 0.
  quantity_base        numeric(14, 3) not null check (quantity_base <> 0),
  -- Quantité telle que dictée dans l'unité commerciale (2 sacs, 1,5 kg…).
  quantity_commercial  numeric(14, 3)
    check (quantity_commercial is null or quantity_commercial > 0),
  unit_code            text,
  -- PERISHABLE / SPOILAGE / INVENTORY_COUNT / THEFT / BREAKAGE / DONATION /
  -- RESTOCK / CORRECTION / …
  reason               text,
  reason_note          text,
  reference_type       text,
  reference_id         text,
  -- Idempotence offline (§31-32) : une opération d'un appareil n'est
  -- jamais exécutée deux fois, même en cas de rejeu de synchro.
  operation_id         uuid not null,
  device_id            text,
  created_by           text not null,
  created_at           timestamptz not null default now(),

  -- Cohérence type ↔ signe : entrées strictement positives, sorties
  -- strictement négatives.
  constraint chk_merchant_stock_movements_sign check ((
    movement_type in ('OPENING_BALANCE', 'PURCHASE', 'RECEIPT', 'PRODUCTION',
                      'CUSTOMER_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN')
    and quantity_base > 0
  ) or (
    movement_type in ('SALE', 'LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN',
                      'TRANSFER_OUT', 'ADJUSTMENT_OUT')
    and quantity_base < 0
  )),
  -- Une sortie anormale est toujours motivée (traçabilité §21-22).
  constraint chk_merchant_stock_movements_reason check (
    movement_type not in ('LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN', 'ADJUSTMENT_OUT')
    or reason is not null
  ),
  -- Idempotence offline : une seule fois par (marchand, opération).
  constraint uq_merchant_stock_movements_operation
    unique (merchant_id, operation_id)
);

create index if not exists idx_merchant_stock_movements_history
  on public.merchant_stock_movements(merchant_id, product_id, created_at desc);
create index if not exists idx_merchant_stock_movements_merchant_created
  on public.merchant_stock_movements(merchant_id, created_at desc);
create index if not exists idx_merchant_stock_movements_reference
  on public.merchant_stock_movements(reference_type, reference_id);

-- Append-only : le journal ne se corrige jamais, il se complète.
create or replace function public.forbid_merchant_stock_movements_rewrite()
returns trigger as $$
begin
  raise exception 'merchant_stock_movements est append-only : passer par un mouvement ADJUSTMENT_IN/OUT'
    using errcode = 'P0001';
end;
$$ language plpgsql;

drop trigger if exists forbid_merchant_stock_movements_update
  on public.merchant_stock_movements;
create trigger forbid_merchant_stock_movements_update
  before update or delete on public.merchant_stock_movements
  for each row execute function public.forbid_merchant_stock_movements_rewrite();

alter table public.merchant_stock_movements enable row level security;
