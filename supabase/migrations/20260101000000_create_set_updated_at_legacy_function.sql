-- Migration: fonction partagée set_updated_at_legacy (trigger updated_at)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 objet = 1 fichier).
-- Utilisée par les triggers updated_at de merchants, producers, bo_users
-- et des tables legacy business (004600, éclatées au même format).

create or replace function public.set_updated_at_legacy()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
