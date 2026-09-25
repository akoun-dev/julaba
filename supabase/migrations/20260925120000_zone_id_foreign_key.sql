-- MODE-1009 (campagne dettes) — FK structurelle zone_id vers legacy_bo_zones
--
-- Contexte : les zones sont du texte libre sur legacy_bo_actors /
-- legacy_bo_enrolments / legacy_bo_identificateurs. Le stopgap MODE-1005
-- (colonne générée zone_key) rend la frontière de zone correcte quelle que
-- soit l'orthographe ; le VRAI fix audit (plan 30 j) est l'ancrage
-- structurel : une FK zone_id vers le référentiel legacy_bo_zones.
--
-- Design (zéro changement de comportement pour l'application) :
--   1) zone_id NULLABLE — une écriture avec une zone inconnue du
--      référentiel ne doit JAMAIS échouer (données legacy hétérogènes) ;
--   2) backfill idempotent par normalisation julaba_zone_key (réutilise la
--      fonction IMMUTABLE du MODE-1005, jamais dupliquée) ;
--   3) la CHAÎNE `zone` reste la source de vérité tant que l'app écrit la
--      chaîne libre : un trigger BEFORE INSERT OR UPDATE resynchronise
--      zone_id automatiquement à chaque écriture (l'app n'a rien à
--      changer ; les routes continuent de filtrer sur zone_key, la FK
--      devient la base des jointures progressives) ;
--   4) fonction de trigger : revoke execute public/anon/authenticated
--      (politique SEC-813, miroir julaba_zone_key).
--
-- Idempotent (add column if not exists / create index if not exists /
-- create or replace / drop trigger if exists). L'endpoint Management API
-- database/query rejette le multi-instructions avec $$ : chaque bloc $$
-- est envoyé SEUL (fonction, puis alters, puis backfills, puis index,
-- puis triggers, puis revokes).

create or replace function public.julaba_sync_zone_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.zone is distinct from old.zone or new.zone_id is null then
    new.zone_id := (
      select z.id
      from public.legacy_bo_zones z
      where public.julaba_zone_key(z.name) = public.julaba_zone_key(new.zone)
      limit 1
    );
  end if;
  return new;
end;
$$;

alter table public.legacy_bo_actors
  add column if not exists zone_id text references public.legacy_bo_zones(id);

alter table public.legacy_bo_enrolments
  add column if not exists zone_id text references public.legacy_bo_zones(id);

alter table public.legacy_bo_identificateurs
  add column if not exists zone_id text references public.legacy_bo_zones(id);

update public.legacy_bo_actors t
  set zone_id = z.id
  from public.legacy_bo_zones z
  where t.zone_id is null
    and public.julaba_zone_key(z.name) = public.julaba_zone_key(t.zone);

update public.legacy_bo_enrolments t
  set zone_id = z.id
  from public.legacy_bo_zones z
  where t.zone_id is null
    and public.julaba_zone_key(z.name) = public.julaba_zone_key(t.zone);

update public.legacy_bo_identificateurs t
  set zone_id = z.id
  from public.legacy_bo_zones z
  where t.zone_id is null
    and public.julaba_zone_key(z.name) = public.julaba_zone_key(t.zone);

create index if not exists legacy_bo_actors_zone_id_idx
  on public.legacy_bo_actors (zone_id);

create index if not exists legacy_bo_enrolments_zone_id_idx
  on public.legacy_bo_enrolments (zone_id);

create index if not exists legacy_bo_identificateurs_zone_id_idx
  on public.legacy_bo_identificateurs (zone_id);

drop trigger if exists sync_zone_id on public.legacy_bo_actors;
create trigger sync_zone_id
  before insert or update of zone, zone_id
  on public.legacy_bo_actors
  for each row execute function public.julaba_sync_zone_id();

drop trigger if exists sync_zone_id on public.legacy_bo_enrolments;
create trigger sync_zone_id
  before insert or update of zone, zone_id
  on public.legacy_bo_enrolments
  for each row execute function public.julaba_sync_zone_id();

drop trigger if exists sync_zone_id on public.legacy_bo_identificateurs;
create trigger sync_zone_id
  before insert or update of zone, zone_id
  on public.legacy_bo_identificateurs
  for each row execute function public.julaba_sync_zone_id();

revoke execute on function public.julaba_sync_zone_id() from public, anon, authenticated;
