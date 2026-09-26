-- Migration: médias + GPS réels des enrôlements (AUDIT-013 / MODE-1014)
--
-- ADDITIVE uniquement : avant cette migration, le serveur ne recevait que
-- des INDICATEURS (has_photo/has_gps) — les images restaient sur l'appareil
-- et les coordonnées complètes étaient perdues. Désormais la route POST
-- /api/backoffice/enrolments téléverse les pièces (photo acteur, CNI
-- recto/verso) dans un bucket Storage PRIVÉ et n'écrit ici que les CHEMINS,
-- avec les coordonnées GPS mesurées au wizard.
--
-- Vérification préalable (obligation « réutiliser, jamais doubler ») :
--   • legacy_bo_enrolments ne portait AUCUNE colonne gps (seuls les booléens
--     has_photo/has_gps, 20260101011300) → les 3 colonnes gps_* sont neuves ;
--   • la table canonique public.enrolments porte DÉJÀ gps_lat/gps_lng
--     (20260908002600) → réutilisées telles quelles, AUCUN ajout ici ;
--   • le bucket enrolments-media n'existait pas (20260908001400 liste
--     actor-photos/harvest-photos/voice-exports) → insert ... do nothing.

alter table public.legacy_bo_enrolments
  add column if not exists photo_path text,
  add column if not exists cni_recto_path text,
  add column if not exists cni_verso_path text,
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision,
  add column if not exists gps_accuracy_m double precision;

comment on column public.legacy_bo_enrolments.photo_path is
  'Chemin Storage (bucket privé enrolments-media) de la photo de l''acteur — NULL si pièce non transmise';
comment on column public.legacy_bo_enrolments.cni_recto_path is
  'Chemin Storage du recto de CNI (bucket privé enrolments-media)';
comment on column public.legacy_bo_enrolments.cni_verso_path is
  'Chemin Storage du verso de CNI (bucket privé enrolments-media)';
comment on column public.legacy_bo_enrolments.gps_lat is
  'Latitude GPS mesurée à l''enrôlement (degrés décimaux WGS84)';
comment on column public.legacy_bo_enrolments.gps_lng is
  'Longitude GPS mesurée à l''enrôlement (degrés décimaux WGS84)';
comment on column public.legacy_bo_enrolments.gps_accuracy_m is
  'Précision de la mesure GPS en mètres (null si non fournie par l''appareil)';

-- Bucket PRIVÉ : aucun objet lisible publiquement, aucune policy sur
-- storage.objects pour ce bucket — l'accès passe exclusivement par le
-- client admin (service_role, bypass RLS). L'affichage back-office
-- utilisera des URLs signées, jamais un bucket public.
insert into storage.buckets (id, name, public)
values ('enrolments-media', 'enrolments-media', false)
on conflict (id) do nothing;
