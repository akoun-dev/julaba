create table public.credit_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.actors(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 1000),
  risk_level text not null
    check (risk_level in ('faible', 'moyen', 'eleve', 'critique')),
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  last_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, actor_id)
);

create index credit_scores_risk_idx on public.credit_scores(organization_id, risk_level);

create trigger credit_scores_updated_at
before update on public.credit_scores
for each row execute function public.set_updated_at();

alter table public.credit_scores enable row level security;

-- 'scores' : super_admin, admin_national. Données sensibles : pas d'accès
-- terrain ni marchand.
create policy credit_scores_admin_read
on public.credit_scores for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_national']));

create policy credit_scores_admin_insert
on public.credit_scores for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_national']));

create policy credit_scores_admin_update
on public.credit_scores for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_national']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_national']));
