-- MODE-1005 (AUDIT-012 P2 « Adjame vs Adjamé ») — normalisation des zones
--
-- Problème : les zones sont du texte libre (le seed legacy porte « Adjame »
-- sans accent, le référentiel communes 20260922100000 porte « Adjamé ») et
-- les routes back-office filtrent en égalité stricte eq('zone', …). Un
-- gestionnaire_zone affecté à « Adjame » ne voyait donc jamais les acteurs
-- enrôlés « Adjamé » — et vice-versa — alors qu'il s'agit de la même commune.
--
-- Solution : colonne GÉNÉRÉE TOUJOURS STOCKÉE zone_key = julaba_zone_key(zone)
-- — recalculée par PostgreSQL à chaque écriture, donc plus aucun drift
-- possible à l'insertion — + index par table. Les routes filtrent désormais
-- sur zone_key avec la MÊME normalisation que le JS
-- (normalizeZoneKey de src/lib/objectifs.ts : trim + NFD + retrait des
-- diacritiques + minuscules). Le vrai fix reste la FK zone_id (plan 30 j de
-- l'audit) ; ce stopgap rend la frontière de zone correcte sans migration
-- de données ni changement d'UI.
--
-- Idempotent (create or replace / add column if not exists / create index
-- if not exists / revoke ré-exécutables). L'endpoint Management API
-- database/query rejette le multi-instructions avec $$ : chaque bloc $$ est
-- envoyé SEUL (fonction, puis alters, puis index, puis revokes).

create or replace function public.julaba_zone_key(label text)
returns text
language sql
immutable
as $$
  select lower(trim(
    translate(
      coalesce(label, ''),
      'ÀÁÂÃÄÅàáâãäåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÕÖóòôõöÚÙÛÜúùûüÝŸýÿ',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyyyy'
    )
  ))
$$;

-- Colonnes générées (recalculées à chaque INSERT/UPDATE de zone — les
-- variantes déjà en base et les futures écritures libres sont couvertes).
alter table public.legacy_bo_actors
  add column if not exists zone_key text
  generated always as (public.julaba_zone_key(zone)) stored;

alter table public.legacy_bo_enrolments
  add column if not exists zone_key text
  generated always as (public.julaba_zone_key(zone)) stored;

alter table public.legacy_bo_identificateurs
  add column if not exists zone_key text
  generated always as (public.julaba_zone_key(zone)) stored;

create index if not exists legacy_bo_actors_zone_key_idx
  on public.legacy_bo_actors (zone_key);

create index if not exists legacy_bo_enrolments_zone_key_idx
  on public.legacy_bo_enrolments (zone_key);

create index if not exists legacy_bo_identificateurs_zone_key_idx
  on public.legacy_bo_identificateurs (zone_key);

-- Fonction interne de normalisation : exécutable par le propriétaire des
-- tables (évaluation des colonnes générées) et service_role, plus par le
-- canal PostgREST (cohérence avec la politique revoke du dépôt).
revoke execute on function public.julaba_zone_key(text)
  from public, anon, authenticated;
