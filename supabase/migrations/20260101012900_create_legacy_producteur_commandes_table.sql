-- Migration: table legacy_producteur_commandes (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_producteur_commandes (
  id                         text primary key default gen_random_uuid()::text,
  producteur_id              text not null,
  reference                  text not null unique,
  acheteur_nom               text not null,
  produit                    text not null,
  quantite_kg                real not null default 0,
  montant                    integer not null default 0,
  date_livraison_souhaitee   timestamptz not null default now(),
  statut                     text not null default 'a_traiter',
  urgent                     boolean not null default false,
  transporteur               text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_commandes_producteur_id on public.legacy_producteur_commandes(producteur_id);
create index if not exists idx_legacy_producteur_commandes_statut on public.legacy_producteur_commandes(statut);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_producteur_commandes_updated_at on public.legacy_producteur_commandes;
create trigger set_legacy_producteur_commandes_updated_at
  before update on public.legacy_producteur_commandes
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_producteur_commandes enable row level security;
