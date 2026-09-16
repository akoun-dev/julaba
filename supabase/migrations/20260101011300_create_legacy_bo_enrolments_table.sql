-- Migration: table legacy_bo_enrolments (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_enrolments (
  id                   text primary key default gen_random_uuid()::text,
  dossier_id           text not null unique,
  actor_name           text not null,
  actor_type           text not null default 'marchand',
  zone                 text not null,
  identificateur_id    text,
  identificateur_name  text not null,
  status               text not null default 'en_attente',
  has_photo            boolean not null default false,
  has_gps              boolean not null default false,
  phone                text not null,
  submitted_at         timestamptz not null default now(),
  validated_by         text,
  validated_at         timestamptz,
  reject_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_legacy_bo_enrolments_zone on public.legacy_bo_enrolments(zone);
create index if not exists idx_legacy_bo_enrolments_status on public.legacy_bo_enrolments(status);
create index if not exists idx_legacy_bo_enrolments_identificateur_id on public.legacy_bo_enrolments(identificateur_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_enrolments disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_enrolments_updated_at on public.legacy_bo_enrolments;
create trigger set_legacy_bo_enrolments_updated_at
  before update on public.legacy_bo_enrolments
  for each row execute function public.set_updated_at_legacy();
