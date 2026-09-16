create table public.communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  type text not null,
  content text not null,
  target_group text not null default 'tous'
    check (target_group in ('tous', 'marchands', 'producteurs', 'identificateurs', 'backoffice')),
  target_zone_id uuid,
  status text not null default 'brouillon'
    check (status in ('brouillon', 'envoyee')),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivery_rate numeric(5, 2) check (delivery_rate is null or (delivery_rate >= 0 and delivery_rate <= 100)),
  sent_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_zone_same_org foreign key (organization_id, target_zone_id)
    references public.zones(organization_id, id)
    on delete set null
    deferrable initially deferred
);

create index communications_status_idx on public.communications(organization_id, status, created_at desc);

create trigger communications_updated_at
before update on public.communications
for each row execute function public.set_updated_at();

alter table public.communications enable row level security;

-- 'communication' : super_admin, admin_national.
create policy communications_admin_read
on public.communications for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_national']));

create policy communications_admin_insert
on public.communications for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_national']));

create policy communications_admin_update
on public.communications for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_national']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_national']));
