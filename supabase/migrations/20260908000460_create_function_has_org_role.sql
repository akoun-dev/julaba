-- Migration: fonction has_org_role — appartenance avec rôle parmi une liste
-- (scission de 20260908000400_organization_members.sql, 1 objet = 1 fichier).

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
