-- Migration: table merchant_purchases (STK-802 — système de stock marchand)
-- Achat de marchandises (§10, §30) : document tête + lignes
-- (merchant_purchase_items). Montants FCFA entiers ; la créance fournisseur
-- = total_amount − amount_paid. Tier service_role : RLS activé sans policy.

create table if not exists public.merchant_purchases (
  id            text primary key default gen_random_uuid()::text,
  merchant_id   text not null,
  client_id     text unique,
  supplier_id   text references public.business_partners(id) on delete set null,
  session_id    text,
  -- Montant total de l'achat (recalculé serveur depuis les lignes).
  total_amount  bigint not null default 0 check (total_amount >= 0),
  -- Ce qui a été payé au fournisseur ; le reste = créance (D6 : l'écriture
  -- comptable liée est optionnelle, l'achat reste un fait de stock).
  amount_paid   bigint not null default 0 check (amount_paid >= 0),
  note          text,
  is_voice      boolean not null default false,
  voice_transcript text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_merchant_purchases_merchant_id
  on public.merchant_purchases(merchant_id);
create index if not exists idx_merchant_purchases_supplier_id
  on public.merchant_purchases(supplier_id);

drop trigger if exists set_merchant_purchases_updated_at on public.merchant_purchases;
create trigger set_merchant_purchases_updated_at
  before update on public.merchant_purchases
  for each row execute function public.set_updated_at_legacy();

alter table public.merchant_purchases enable row level security;
