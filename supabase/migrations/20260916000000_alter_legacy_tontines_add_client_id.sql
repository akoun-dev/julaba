-- Migration: legacy_tontines.client_id — création de tontine idempotente
-- Extrait de 20260916000000_marchand_features.sql (re-baseline 1 objet = 1 fichier).
--
-- Le marchand peut désormais CRÉER une tontine (et pas seulement cotiser).
-- Chaque écriture d'appareil porte un clientId pour un rejeu sûr (file
-- offline) : la table tontines a besoin du même client_id unique que les
-- autres tables marchandes.

alter table public.legacy_tontines
  add column if not exists client_id text unique;
