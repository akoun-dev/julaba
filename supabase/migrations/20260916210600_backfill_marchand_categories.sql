-- Migration: backfill — la catégorie coule du dossier vers l'acteur
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).
--
-- Le plus récent dossier de même téléphone/type fait foi ; seules les
-- catégories manquantes sont remplies (les valeurs déjà connues sont
-- préservées), donc le script est rejouable sans surprise.

update public.legacy_bo_actors a
set categorie_marchand = e.categorie_marchand
from (
  select distinct on (phone) phone, categorie_marchand
  from public.legacy_bo_enrolments
  where actor_type = 'marchand' and categorie_marchand is not null
  order by phone, created_at desc
) e
where a.type = 'marchand' and a.phone = e.phone and a.categorie_marchand is null;

update public.actors a
set categorie_marchand = e.categorie_marchand
from (
  select distinct on (phone) phone, categorie_marchand
  from public.enrolments
  where actor_type = 'marchand' and categorie_marchand is not null
  order by phone, created_at desc
) e
where a.actor_type = 'marchand' and a.phone = e.phone and a.categorie_marchand is null;
