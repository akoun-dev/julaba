-- Migration: fonction legacy_bo_content_increment_views — compteur de vues Academy atomique
-- Extrait de 20260916000000_marchand_features.sql (re-baseline 1 objet = 1 fichier).
--
-- Supabase JS ne sait pas exprimer « set view_count = view_count + 1 » dans un
-- corps de PATCH, et un read-then-write depuis la route laisserait deux
-- lecteurs concurrents s'écraser leurs compteurs. Seules les lignes publiées
-- sont comptabilisables : la fonction renvoie null pour un id inconnu ou non
-- publié (brouillon/archivé), ce que l'API traduit en 404.

create or replace function public.legacy_bo_content_increment_views(
  p_id text
) returns integer
language sql
as $$
  update public.legacy_bo_contents
  set view_count = view_count + 1
  where id = p_id and status = 'publie'
  returning view_count;
$$;
