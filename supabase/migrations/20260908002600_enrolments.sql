create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  zone_id uuid not null,
  dossier_id text not null,
  actor_name text not null,
  actor_type text not null default 'marchand'
    check (actor_type in ('marchand', 'producteur', 'cooperatif')),
  phone text not null,
  has_photo boolean not null default false,
  has_gps boolean not null default false,
  gps_lat double precision,
  gps_lng double precision,
  identificateur_user_id uuid references auth.users(id) on delete set null,
  identificateur_name text not null,
  status text not null default 'en_attente'
    check (status in ('en_attente', 'info_demandee', 'valide', 'rejete')),
  validated_by_user_id uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dossier_id),
  -- Un dossier rejeté porte obligatoirement sa raison.
  constraint enrolment_reject_reason_required
    check (status <> 'rejete' or reject_reason is not null),
  constraint enrolment_zone_same_org foreign key (organization_id, zone_id)
    references public.zones(organization_id, id)
    on delete restrict
    deferrable initially deferred
);

create index enrolments_status_idx on public.enrolments(organization_id, status);
create index enrolments_zone_idx on public.enrolments(organization_id, zone_id);
create index enrolments_identificateur_idx
on public.enrolments(organization_id, identificateur_user_id, created_at desc);

create trigger enrolments_updated_at
before update on public.enrolments
for each row execute function public.set_updated_at();

alter table public.enrolments enable row level security;

create policy enrolments_read_scope
on public.enrolments for select to authenticated
using (public.is_org_member(organization_id));

-- L'identificateur soumet en son nom ; un administrateur peut saisir pour
-- un autre identificateur (identificateur_user_id laissé null).
create policy enrolments_insert
on public.enrolments for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and (
    identificateur_user_id = (select auth.uid())
    or (
      identificateur_user_id is null
      and public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone'])
    )
  )
);

-- La décision (validation/rejet) est backoffice uniquement.
create policy enrolments_admin_update
on public.enrolments for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
