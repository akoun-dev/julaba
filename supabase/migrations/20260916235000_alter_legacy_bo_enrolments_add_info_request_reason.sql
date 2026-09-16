-- Migration: legacy_bo_enrolments — colonne info_request_reason (message au demandeur)
-- Le bouton « Demander info » du backoffice ne changeait que le statut en
-- mémoire client (setState) : ni le statut `info_demandee` ni le motif n'étaient
-- persistés, tout disparaissait au rechargement. La persistance du statut utilise
-- les colonnes existantes (status / validated_by / validated_at) ; cette colonne
-- porte le message adressé à l'identificateur (optionnel, NULL = simple demande
-- sans précision). Distinct de reject_reason pour ne jamais présenter une demande
-- d'information comme un rejet.

alter table public.legacy_bo_enrolments
  add column if not exists info_request_reason text;
