-- Enregistrement d'une cotisation par le marchand membre lui-même.
-- Idempotent par client_id : un rejeu retourne la cotisation existante.
create or replace function public.record_tontine_contribution(
  p_organization_id uuid,
  p_tontine_id uuid,
  p_amount bigint,
  p_client_id uuid default null
)
returns public.tontine_contributions
language plpgsql security invoker set search_path = public as $$
declare
  contribution_row public.tontine_contributions;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Montant de cotisation invalide';
  end if;
  if not exists (
    select 1 from public.tontine_members
    where tontine_id = p_tontine_id
      and organization_id = p_organization_id
      and member_user_id = (select auth.uid())
  ) then
    raise exception using errcode = '22023', message = 'Vous n êtes pas membre de cette tontine';
  end if;

  insert into public.tontine_contributions (
    organization_id, tontine_id, member_user_id, client_id, amount
  )
  values (p_organization_id, p_tontine_id, auth.uid(), p_client_id, p_amount)
  on conflict (organization_id, client_id) do nothing
  returning * into contribution_row;

  if contribution_row.id is null then
    select * into contribution_row from public.tontine_contributions
    where organization_id = p_organization_id and client_id = p_client_id;
  end if;
  return contribution_row;
end;
$$;

revoke all on function public.record_tontine_contribution(uuid, uuid, bigint, uuid) from public;
grant execute on function public.record_tontine_contribution(uuid, uuid, bigint, uuid) to authenticated;
