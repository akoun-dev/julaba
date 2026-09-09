create table public.producer_journals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  producer_user_id uuid not null references auth.users(id) on delete restrict,
  -- Identifiant de cycle de production généré côté client ; aucune table de
  -- cycles n'existe, la référence reste libre et indexée.
  cycle_id text not null,
  client_id uuid,
  entry_date timestamptz not null,
  text text not null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create index producer_journals_scope_idx
on public.producer_journals(organization_id, producer_user_id, created_at desc);

create index producer_journals_cycle_idx
on public.producer_journals(organization_id, cycle_id, entry_date desc);

create trigger producer_journals_updated_at
before update on public.producer_journals
for each row execute function public.set_updated_at();

alter table public.producer_journals enable row level security;

create policy producer_journals_read_scope
on public.producer_journals for select to authenticated
using (public.is_org_member(organization_id));

create policy producer_journals_insert_owner
on public.producer_journals for insert to authenticated
with check (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy producer_journals_update_owner
on public.producer_journals for update to authenticated
using (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id));
