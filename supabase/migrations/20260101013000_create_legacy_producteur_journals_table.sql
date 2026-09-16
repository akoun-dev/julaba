-- Migration: table legacy_producteur_journals (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_producteur_journals (
  id            text primary key default gen_random_uuid()::text,
  producteur_id text not null,
  cycle_id      text not null,
  date          timestamptz not null,
  texte         text not null,
  photo_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_journals_cycle_id on public.legacy_producteur_journals(cycle_id);
create index if not exists idx_legacy_producteur_journals_producteur_id on public.legacy_producteur_journals(producteur_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_producteur_journals_updated_at on public.legacy_producteur_journals;
create trigger set_legacy_producteur_journals_updated_at
  before update on public.legacy_producteur_journals
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_producteur_journals enable row level security;
