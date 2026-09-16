-- Migration: table legacy_producteur_recoltes (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_producteur_recoltes (
  id                    text primary key default gen_random_uuid()::text,
  producteur_id         text not null,
  produit               text not null,
  quantite_kg           real not null,
  qualite               text not null,
  date_recolte          timestamptz not null,
  parcelle              text not null default '',
  prix_souhaite_par_kg  integer not null default 0,
  photos                text not null default '[]',
  statut                text not null default 'brouillon',
  acheteur              text,
  montant_vente         integer,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_recoltes_producteur_id on public.legacy_producteur_recoltes(producteur_id);
create index if not exists idx_legacy_producteur_recoltes_statut on public.legacy_producteur_recoltes(statut);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_producteur_recoltes_updated_at on public.legacy_producteur_recoltes;
create trigger set_legacy_producteur_recoltes_updated_at
  before update on public.legacy_producteur_recoltes
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_producteur_recoltes enable row level security;
