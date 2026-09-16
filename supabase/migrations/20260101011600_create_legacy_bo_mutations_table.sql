-- Migration: table legacy_bo_mutations (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_mutations (
  id            text primary key default gen_random_uuid()::text,
  actor_id      text not null,
  actor_name    text not null,
  from_zone     text not null,
  to_zone       text not null,
  reason        text,
  status        text not null default 'en_attente',
  requested_by  text,
  requested_at  timestamptz not null default now(),
  processed_by  text,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_mutations_actor_id on public.legacy_bo_mutations(actor_id);
create index if not exists idx_legacy_bo_mutations_status on public.legacy_bo_mutations(status);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_mutations disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_mutations_updated_at on public.legacy_bo_mutations;
create trigger set_legacy_bo_mutations_updated_at
  before update on public.legacy_bo_mutations
  for each row execute function public.set_updated_at_legacy();
