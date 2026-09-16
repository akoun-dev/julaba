-- Migration: fonction close_cash_session — clôture de session de caisse
-- (scission de 20260908001700_cash_session_functions.sql, 1 objet = 1 fichier).

create or replace function public.close_cash_session(
  p_organization_id uuid,
  p_session_id uuid
)
returns public.cash_sessions
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.cash_sessions;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;

  select * into session_row from public.cash_sessions
  where id = p_session_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Session de caisse introuvable';
  end if;
  if session_row.merchant_user_id <> (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Session appartenant à un autre marchand';
  end if;
  -- Rejeu idempotent : une session déjà clôturée est retournée sans recalcul.
  if not session_row.is_open then
    return session_row;
  end if;

  select coalesce(sum(total_amount), 0) into session_row.total_sales
  from public.sales where cash_session_id = p_session_id;

  select coalesce(sum(amount), 0) into session_row.total_expenses
  from public.expenses where cash_session_id = p_session_id;

  update public.cash_sessions
  set total_sales = session_row.total_sales,
      total_expenses = session_row.total_expenses,
      closing_amount = session_row.opening_float + session_row.total_sales - session_row.total_expenses,
      is_open = false,
      closed_at = now()
  where id = p_session_id
  returning * into session_row;

  return session_row;
end;
$$;

revoke all on function public.close_cash_session(uuid, uuid) from public;
grant execute on function public.close_cash_session(uuid, uuid) to authenticated;
