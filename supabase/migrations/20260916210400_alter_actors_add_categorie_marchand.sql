-- Migration: actors (moderne) — colonne categorie_marchand + index partiel
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).

alter table public.actors
  add column if not exists categorie_marchand text
    check (categorie_marchand is null or categorie_marchand in ('detaillant', 'semi_grossiste', 'grossiste'));

create index if not exists idx_actors_categorie
  on public.actors (categorie_marchand)
  where categorie_marchand is not null;
