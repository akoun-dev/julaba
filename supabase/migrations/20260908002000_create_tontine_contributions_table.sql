create table public.tontine_contributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tontine_id uuid not null,
  member_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, client_id),
  -- Écriture financière : la tontine doit appartenir à la même organisation.
  constraint contribution_same_org foreign key (organization_id, tontine_id)
    references public.tontines(organization_id, id)
    on delete restrict
    deferrable initially deferred
);

create index tontine_contributions_scope_idx
on public.tontine_contributions(organization_id, member_user_id, created_at desc);

create index tontine_contributions_tontine_idx
on public.tontine_contributions(tontine_id, created_at desc);

alter table public.tontine_contributions enable row level security;

create policy tontine_contributions_read_scope
on public.tontine_contributions for select to authenticated
using (public.is_org_member(organization_id));

-- Un marchand cotise en son nom ; un administrateur peut saisir pour un membre.
create policy tontine_contributions_insert
on public.tontine_contributions for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and (
    member_user_id = (select auth.uid())
    or public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone'])
  )
);
