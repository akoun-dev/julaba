-- Migration: table merchant_stock_transfers (STK-802 — système de stock marchand)
-- Transfert de stock entre deux marchands (§28) : TRANSFER_OUT chez
-- l'expéditeur et TRANSFER_IN chez le destinataire, liés par le même
-- identifiant (cette table = l'identifiant commun). Cycle brouillon →
-- envoyé → reçu. Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_stock_transfers (
  id             text primary key default gen_random_uuid()::text,
  merchant_id    text not null,
  to_merchant_id text not null,
  client_id      text unique,
  status         text not null default 'draft'
    check (status in ('draft', 'sent', 'received', 'cancelled')),
  note           text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  received_at    timestamptz,
  updated_at     timestamptz not null default now(),
  constraint chk_merchant_stock_transfers_not_self
    check (merchant_id <> to_merchant_id)
);

create index if not exists idx_merchant_stock_transfers_sender
  on public.merchant_stock_transfers(merchant_id, created_at desc);
create index if not exists idx_merchant_stock_transfers_receiver
  on public.merchant_stock_transfers(to_merchant_id, created_at desc);

drop trigger if exists set_merchant_stock_transfers_updated_at
  on public.merchant_stock_transfers;
create trigger set_merchant_stock_transfers_updated_at
  before update on public.merchant_stock_transfers
  for each row execute function public.set_updated_at_legacy();

alter table public.merchant_stock_transfers enable row level security;
