-- Migration: table legacy_bo_institutions (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_institutions (
  id             text primary key default gen_random_uuid()::text,
  name           text not null,
  type           text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  address        text,
  linked_actors  integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_institutions_updated_at on public.legacy_bo_institutions;
create trigger set_legacy_bo_institutions_updated_at
  before update on public.legacy_bo_institutions
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_institutions enable row level security;

alter table public.legacy_bo_institutions
  add column if not exists status text not null default 'en_attente'
    check (status in ('actif', 'inactif', 'en_attente')),
  add column if not exists initials text,
  add column if not exists color text,
  add column if not exists website text,
  add column if not exists last_sync timestamptz;

update public.legacy_bo_institutions
set status = case when is_active then 'actif' else 'inactif' end
where status = 'en_attente';
