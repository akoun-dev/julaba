-- Migration: table merchant_market_sessions (MODE-902 — Mode Marché, §7-8)
-- Résumé de journée marché : contexte (marché, position, caisse de départ)
-- + clôture (caisse comptée/estimée, totaux ventes/dépenses). La caisse
-- (fond, ventes, dépenses) reste la source de vérité côté client ; cette
-- table porte le contexte de terrain et le bilan de clôture.
-- Tier service_role : RLS activé sans policy (accès uniquement via backend).

create table if not exists public.merchant_market_sessions (
  id             text primary key default gen_random_uuid()::text,
  merchant_id    text not null,
  -- Idempotence §32 : clientId = id de session de caisse, stable offline.
  client_id      text not null unique,
  market_name    text,
  location_mode  text not null default 'none'
                 check (location_mode in ('gps', 'select', 'none')),
  latitude       double precision,
  longitude      double precision,
  accuracy_m     double precision,
  started_at     timestamptz not null,
  starting_cash  bigint not null default 0,
  status         text not null default 'open' check (status in ('open', 'closed')),
  closed_at      timestamptz,
  ending_cash    bigint,
  sales_total    bigint,
  expenses_total bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_merchant_market_sessions_merchant_id
  on public.merchant_market_sessions(merchant_id);
create index if not exists idx_merchant_market_sessions_started_at
  on public.merchant_market_sessions(merchant_id, started_at desc);

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_merchant_market_sessions_updated_at on public.merchant_market_sessions;
create trigger set_merchant_market_sessions_updated_at
  before update on public.merchant_market_sessions
  for each row execute function public.set_updated_at_legacy();

alter table public.merchant_market_sessions enable row level security;
