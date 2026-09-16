-- Migration: policies de lecture par appartenance (organisations, zones, membres)
-- (scission de 20260908000400_organization_members.sql, 1 objet = 1 fichier).

create policy organizations_member_read
on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy zones_member_read
on public.zones for select to authenticated
using (public.is_org_member(organization_id));

alter table public.organization_members enable row level security;

create policy members_self_read
on public.organization_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_org_role(organization_id, array['super_admin','admin_general','admin_national'])
);
