create table public.tontine_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tontine_id uuid not null,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid,
  joined_at timestamptz not null default now(),
  unique (organization_id, client_id),
  unique (tontine_id, member_user_id),
  -- Garantit que la tontine appartient à la même organisation que l'écriture.
  constraint tontine_member_same_org foreign key (organization_id, tontine_id)
    references public.tontines(organization_id, id)
    on delete cascade
    deferrable initially deferred
);

create index tontine_members_user_idx
on public.tontine_members(member_user_id);

-- Projection member_count maintenue automatiquement (jamais écrite à la main).
create or replace function public.sync_tontine_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tontines set member_count = (
    select count(*) from public.tontine_members
    where tontine_id = coalesce(new.tontine_id, old.tontine_id)
  )
  where id = coalesce(new.tontine_id, old.tontine_id);
  return null;
end;
$$;

create trigger tontine_members_count
after insert or delete on public.tontine_members
for each row execute function public.sync_tontine_member_count();

alter table public.tontine_members enable row level security;

create policy tontine_members_read_scope
on public.tontine_members for select to authenticated
using (public.is_org_member(organization_id));

create policy tontine_members_admin_insert
on public.tontine_members for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));

create policy tontine_members_admin_delete
on public.tontine_members for delete to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
