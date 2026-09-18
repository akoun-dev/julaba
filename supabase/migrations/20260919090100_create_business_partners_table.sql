-- Migration: table business_partners (STK-802 — système de stock marchand)
-- Clients et fournisseurs du marchand (§13 cahier des charges stock).
-- Tier service_role : RLS activé sans policy (accès uniquement via le backend).

create table if not exists public.business_partners (
  id          text primary key default gen_random_uuid()::text,
  merchant_id text not null,
  client_id   text unique,
  kind        text not null check (kind in ('client', 'fournisseur')),
  name        text not null,
  phone       text,
  notes       text,
  -- Solde de créance en FCFA (règle montant entier) :
  -- > 0 le partenaire doit au marchand ; < 0 le marchand doit au partenaire.
  balance_cfa bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_business_partners_merchant_id
  on public.business_partners(merchant_id);
create index if not exists idx_business_partners_merchant_kind
  on public.business_partners(merchant_id, kind);
-- Un même téléphone ne peut pas exister deux fois pour le même marchand
-- et le même type de partenaire.
create unique index if not exists uq_business_partners_merchant_kind_phone
  on public.business_partners(merchant_id, kind, phone)
  where phone is not null;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_business_partners_updated_at on public.business_partners;
create trigger set_business_partners_updated_at
  before update on public.business_partners
  for each row execute function public.set_updated_at_legacy();

alter table public.business_partners enable row level security;
