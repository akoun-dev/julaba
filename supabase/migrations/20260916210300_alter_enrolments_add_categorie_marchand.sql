-- Migration: enrolments (moderne) — colonnes categorie_marchand + activite
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).
--
-- Moderne : mêmes colonnes des deux côtés du bridge de réplication.

alter table public.enrolments
  add column if not exists categorie_marchand text
    check (categorie_marchand is null or categorie_marchand in ('detaillant', 'semi_grossiste', 'grossiste')),
  add column if not exists activite text;
