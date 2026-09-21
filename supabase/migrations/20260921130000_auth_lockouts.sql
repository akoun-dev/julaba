-- MODE-936 (AUDIT-003 S-03) — verrouillage serveur des tentatives de connexion.
--
-- AVANT : aucun lockout — un PIN 4 chiffres (10 000 combinaisons) se
-- bruteforce sans limite sur les routes de login, et le djb2 stocké se
-- cassage hors ligne en quelques secondes.
--
-- APRÈS : la table auth_lockouts porte, par portée (compte « merchants:<id> »,
-- « producers:<id> », « cooperateurs:<id> », ou réseau « ip:<adresse> »), le
-- compteur d'échecs dans une fenêtre glissante et le verrou courant :
--   - compte : 5 échecs (fenêtre 15 min) → verrou 15 min ;
--   - IP : 20 échecs (fenêtre 5 min) → verrou 15 min.
-- Les compteurs ne sont JAMAIS manipulés en lire-modifier-écrire applicatif
-- (TOCTOU, leçon I-07) : les RPC ci-dessous font l'upsert atomique en SQL.
--
-- Contrat d'exécution : service_role seul (les routes API Next utilisent le
-- client admin) — revoke public/anon/authenticated, grant service_role,
-- RLS activé sans policy (deny-all) comme le reste du schéma durci.

create table public.auth_lockouts (
    scope             text primary key,
    failed_attempts   integer not null default 0 check (failed_attempts >= 0),
    window_started_at timestamptz not null default now(),
    locked_until      timestamptz,
    updated_at        timestamptz not null default now()
);

alter table public.auth_lockouts enable row level security;

-- Enregistre un échec pour la portée donnée et déclenche éventuellement le
-- verrou. Un seul statement = atomique, même sous concurrence. La fenêtre
-- glissante repart de zéro si le dernier échec est plus vieux que la
-- fenêtre ; le verrou est (re)posé dès que le compteur atteint le seuil.
create or replace function public.record_auth_failure(
    p_scope           text,
    p_max_attempts    integer,
    p_window_minutes  integer,
    p_lock_minutes    integer
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    insert into auth_lockouts as l (scope, failed_attempts, window_started_at)
    values (p_scope, 1, now())
    on conflict (scope) do update set
        failed_attempts = case
            when l.window_started_at < now() - make_interval(mins => p_window_minutes)
                then 1
            else l.failed_attempts + 1
        end,
        window_started_at = case
            when l.window_started_at < now() - make_interval(mins => p_window_minutes)
                then now()
            else l.window_started_at
        end,
        locked_until = case
            when (case
                    when l.window_started_at < now() - make_interval(mins => p_window_minutes)
                        then 1
                    else l.failed_attempts + 1
                  end) >= p_max_attempts
                then now() + make_interval(mins => p_lock_minutes)
            else l.locked_until
        end,
        updated_at = now()
    returning jsonb_build_object(
        'attempts', failed_attempts,
        'locked', locked_until is not null and locked_until > now(),
        'locked_until', locked_until
    );
$$;

-- Remise à zéro du compteur (succès de connexion, changement de code).
create or replace function public.reset_auth_failures(p_scope text)
returns void
language sql
security definer
set search_path = public
as $$
    delete from auth_lockouts where scope = p_scope;
$$;

-- Verrou courant pour la portée (locked_until) ou null si libre.
create or replace function public.get_auth_lock(p_scope text)
returns timestamptz
language sql
security definer
set search_path = public
as $$
    select locked_until from auth_lockouts
    where scope = p_scope
      and locked_until is not null
      and locked_until > now();
$$;

revoke all on function public.record_auth_failure(text, integer, integer, integer) from public;
revoke all on function public.record_auth_failure(text, integer, integer, integer) from anon;
revoke all on function public.record_auth_failure(text, integer, integer, integer) from authenticated;
revoke all on function public.reset_auth_failures(text) from public;
revoke all on function public.reset_auth_failures(text) from anon;
revoke all on function public.reset_auth_failures(text) from authenticated;
revoke all on function public.get_auth_lock(text) from public;
revoke all on function public.get_auth_lock(text) from anon;
revoke all on function public.get_auth_lock(text) from authenticated;
grant execute on function public.record_auth_failure(text, integer, integer, integer) to service_role;
grant execute on function public.reset_auth_failures(text) to service_role;
grant execute on function public.get_auth_lock(text) to service_role;
