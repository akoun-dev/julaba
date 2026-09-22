-- Migration: MODE-985 (DET-COOP-011 tranche 2) — merchants.commune_id.
--
-- La dette (DEBT_REPORT DET-COOP-011, restes après MODE-982) : les filtres
-- région/commune de la liste membres de l'espace coopérative étaient
-- IMPOSSIBLES honnêtement — la table merchants ne porte NI région NI
-- commune, contrairement à producers et cooperatives depuis MODE-979.
--
-- Ici (miroir exact du pattern MODE-979, même référentiel) :
--   1. merchants.commune_id (FK nullable vers le référentiel communes de
--      MODE-979 — 41 communes, aucune table nouvelle) ;
--   2. PAS de backfill possible : merchants n'a JAMAIS eu de colonne
--      commune texte (contrairement à cooperatives.commune en MODE-979) —
--      il n'y a littéralement rien à lier. Chaque marchand déclare sa
--      commune lui-même (Profil > Mon compte > « Ma commune », MODE-985) ;
--   3. la colonne est NULLABLE : un marchand sans commune déclarée reste
--      valide — il apparaît simplement dans le filtre « Toutes » et les
--      rangées de filtre ne mentent jamais sur ce qu'elles savent.
--
-- Aucune donnée détruite, aucune colonne renommée. RLS de merchants déjà
-- active (accès serveur uniquement — admin client / session appareil).

alter table public.merchants
  add column if not exists commune_id uuid references public.communes(id);

create index if not exists idx_merchants_commune_id
  on public.merchants(commune_id);
