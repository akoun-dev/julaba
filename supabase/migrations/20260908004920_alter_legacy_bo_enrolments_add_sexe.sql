-- Migration: legacy_bo_enrolments — colonne sexe (masculin | feminin | autre)
-- La wizard d'enrôlement a toujours collecté le sexe de l'acteur (étape 3,
-- « Informations complémentaires ») mais il n'était jamais envoyé au serveur —
-- chaque application saluait avec un « Maman »/« Papa » codé en dur.
-- (scission de 20260908004900_actor_sexe.sql, 1 table = 1 fichier.)

alter table public.legacy_bo_enrolments
  add column if not exists sexe text check (sexe is null or sexe in ('masculin', 'feminin', 'autre'));
