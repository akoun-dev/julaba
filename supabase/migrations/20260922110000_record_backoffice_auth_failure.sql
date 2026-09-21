-- MODE-964 (AUDIT-005 A5-F19) — verrouillage par compte back-office ATOMIQUE.
--
-- AVANT : registerFailedAttempt (src/lib/backoffice-auth/lockout.ts) recevait
-- le compteur lu par la route login (SELECT) et réécrivait compteur+1 via un
-- UPDATE applicatif : lecture-modifier-écriture = TOCTOU (leçon I-07, celle-là
-- même qui a fondé les RPC de 20260921130000). Sous concurrence, deux requêtes
-- lisent N, toutes deux écrivent N+1 : les échecs se perdent, le seuil de
-- verrouillage est repoussé, un flux concurrent peut même écraser la remise à
-- zéro du succès ou le compteur fraîchement verrouillé.
--
-- APRÈS : la totalité « incrément + seuil + pose du verrou » tient dans UN
-- SEUL statement UPDATE (atomique, même sous concurrence), sur le modèle de
-- record_auth_failure (20260921130000) :
--   - compte non verrouillé : compteur + 1 ; si le seuil est atteint,
--     compteur remis à 0 et locked_until = now() + p_lock_minutes
--     (sémantique identique à l'ancien code : après expiration du verrou,
--     le compte repart avec un compteur neuf) ;
--   - compte DÉJÀ verrouillé (flux concurrent passé entre la lecture de la
--     route et l'appel) : compteur ET verrou préservés, pas de prolongation —
--     l'appel ne peut ni ralonger ni déplacer un verrou existant ;
--   - compte inconnu : 0 ligne mise à jour → NULL (l'appelant est fail-open).
--
-- Contrat d'exécution : service_role seul (routes API Next via client admin)
-- — revoke public/anon/authenticated, grant service_role. La fonction est
-- SECURITY DEFINER (propriétaire = propriétaire de la table) : elle écrit
-- malgré le RLS deny-all de bo_users, exactement comme le client admin des
-- routes existantes.

create or replace function public.record_backoffice_auth_failure(
    p_user_id       text,
    p_max_attempts  integer,
    p_lock_minutes  integer
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    update bo_users as u
    set failed_login_attempts = case
            when u.locked_until is not null and u.locked_until > now()
                then u.failed_login_attempts
            when u.failed_login_attempts + 1 >= p_max_attempts
                then 0
            else u.failed_login_attempts + 1
        end,
        locked_until = case
            when u.locked_until is not null and u.locked_until > now()
                then u.locked_until
            when u.failed_login_attempts + 1 >= p_max_attempts
                then now() + make_interval(mins => p_lock_minutes)
            else u.locked_until
        end
    where u.id = p_user_id
    returning jsonb_build_object(
        'attempts', u.failed_login_attempts,
        'locked', u.locked_until is not null and u.locked_until > now(),
        'locked_until', u.locked_until
    );
$$;

revoke all on function public.record_backoffice_auth_failure(text, integer, integer) from public;
revoke all on function public.record_backoffice_auth_failure(text, integer, integer) from anon;
revoke all on function public.record_backoffice_auth_failure(text, integer, integer) from authenticated;
grant execute on function public.record_backoffice_auth_failure(text, integer, integer) to service_role;
