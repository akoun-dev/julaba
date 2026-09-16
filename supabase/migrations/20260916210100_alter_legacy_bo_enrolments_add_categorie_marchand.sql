-- Migration: legacy_bo_enrolments — colonnes catégorie + identification commerce
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).
--
-- Legacy : dossiers d'enrôlement. La wizard collectait déjà « Activité »,
-- « Type de commerce » et « Nom du commerce » mais le payload les abandonnait ;
-- les colonnes existent désormais pour les recevoir (et backfiller les acteurs).
-- NULL = non collecté (dossiers historiques).

alter table public.legacy_bo_enrolments
  add column if not exists categorie_marchand text
    check (categorie_marchand is null or categorie_marchand in ('detaillant', 'semi_grossiste', 'grossiste')),
  add column if not exists activite text,
  add column if not exists type_commerce text,
  add column if not exists nom_commerce text;
