create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Cible polymorphe assumée : targetType varie (acteur, contenu,
  -- communication...) et les identifiants historiques mélangent uuid et
  -- chaînes libres, d'où l'absence de FK dure (décision conservée de Prisma).
  target_type text not null,
  target_id text,
  target_name text,
  reason text not null,
  severity text not null default 'moyenne'
    check (severity in ('faible', 'basse', 'moyenne', 'haute', 'critique')),
  status text not null default 'en_attente',
  reported_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_status_idx on public.moderation_reports(organization_id, status, created_at desc);
create index moderation_target_idx on public.moderation_reports(organization_id, target_type, target_id);

create trigger moderation_reports_updated_at
before update on public.moderation_reports
for each row execute function public.set_updated_at();

alter table public.moderation_reports enable row level security;

-- Matrice historique : super_admin, gestionnaire_zone, operateur_terrain.
create policy moderation_read_scope
on public.moderation_reports for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'gestionnaire_zone', 'operateur_terrain']));

create policy moderation_insert_scope
on public.moderation_reports for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'gestionnaire_zone', 'operateur_terrain']));

create policy moderation_update_scope
on public.moderation_reports for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'gestionnaire_zone', 'operateur_terrain']))
with check (public.has_org_role(organization_id, array['super_admin', 'gestionnaire_zone', 'operateur_terrain']));
