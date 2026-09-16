-- Migration: table legacy_bo_communications (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_communications (
  id            text primary key default gen_random_uuid()::text,
  title         text not null,
  type          text not null,
  content       text not null,
  target_group  text not null,
  target_zone   text,
  status        text not null default 'envoyee',
  sent_count    integer not null default 0,
  delivery_rate real,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_communications_status on public.legacy_bo_communications(status);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_communications_updated_at on public.legacy_bo_communications;
create trigger set_legacy_bo_communications_updated_at
  before update on public.legacy_bo_communications
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_communications enable row level security;
