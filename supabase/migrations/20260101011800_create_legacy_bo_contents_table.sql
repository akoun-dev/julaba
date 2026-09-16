-- Migration: table legacy_bo_contents (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_contents (
  id           text primary key default gen_random_uuid()::text,
  title        text not null,
  type         text not null,
  category     text,
  content      text not null,
  excerpt      text,
  author       text,
  status       text not null default 'publie',
  difficulty   text default 'debutant',
  duration     text,
  target_role  text,
  media_url    text,
  sort_order   integer not null default 0,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_legacy_bo_contents_status on public.legacy_bo_contents(status);
create index if not exists idx_legacy_bo_contents_type on public.legacy_bo_contents(type);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_contents_updated_at on public.legacy_bo_contents;
create trigger set_legacy_bo_contents_updated_at
  before update on public.legacy_bo_contents
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_contents enable row level security;
