-- Migration: legacy_bo_missions.team_id — raccourci « assigner toute l'équipe »
-- (scission de 20260908004500_mission_teams_assignments.sql, 1 objet = 1 fichier.)

alter table public.legacy_bo_missions
  add column if not exists team_id text references public.legacy_bo_teams(id) on delete set null;
