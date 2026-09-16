-- Migration: fonction open_cash_session — ouverture de session de caisse
-- (scission de 20260908001700_cash_session_functions.sql, 1 objet = 1 fichier).

create or replace function public.open_cash_session(
  p_organization_id uuid,
  p_opening_float bigint,
  p_client_id uuid default null
)
returns public.cash_sessions
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.cash_sessions;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;
  if p_opening_float < 0 then
    raise exception using errcode = '22023', message = 'Fond de caisse invalide';
  end if;
  -- Le rejeu idempotent (même client_id) doit retomber sur la session
  -- existante, pas être rejeté par ce contrôle.
  if exists (
    select 1 from public.cash_sessions
    where organization_id = p_organization_id
      and merchant_user_id = (select auth.uid())
      and is_open
      and client_id is distinct from p_client_id
  ) then
    raise exception using errcode = '23505', message = 'Une session de caisse est déjà ouverte';
  end if;

  insert into public.cash_sessions (
    organization_id, merchant_user_id, client_id, opening_float
  )
  values (p_organization_id, auth.uid(), p_client_id, p_opening_float)
  on conflict (organization_id, client_id) do nothing
  returning * into session_row;

  -- Rejeu idempotent : la session existe déjà, on la retourne telle quelle.
  if session_row.id is null then
    select * into session_row from public.cash_sessions
    where organization_id = p_organization_id and client_id = p_client_id;
  end if;
  return session_row;
end;
$$;

revoke all on function public.open_cash_session(uuid, bigint, uuid) from public;
grant execute on function public.open_cash_session(uuid, bigint, uuid) to authenticated;
