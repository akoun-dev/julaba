create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  opening_float bigint not null default 0 check (opening_float >= 0),
  total_sales bigint not null default 0 check (total_sales >= 0),
  total_expenses bigint not null default 0 check (total_expenses >= 0),
  closing_amount bigint,
  is_open boolean not null default true,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

-- Une seule session ouverte par marchand et par organisation.
create unique index cash_sessions_one_open_idx
on public.cash_sessions(organization_id, merchant_user_id)
where is_open;

create index cash_sessions_scope_idx
on public.cash_sessions(organization_id, merchant_user_id, opened_at desc);

-- Rattachement explicite des écritures à la session de caisse, contrairement
-- au schéma Prisma historique où les totaux étaient recalculés par fenêtre de
-- dates. Le lien rend la clôture exacte et rejouable.
alter table public.sales
  add column cash_session_id uuid references public.cash_sessions(id) on delete restrict;

create index sales_cash_session_idx on public.sales(cash_session_id);

alter table public.expenses
  add column cash_session_id uuid references public.cash_sessions(id) on delete restrict;

create index expenses_cash_session_idx on public.expenses(cash_session_id);

alter table public.cash_sessions enable row level security;

create trigger cash_sessions_updated_at
before update on public.cash_sessions
for each row execute function public.set_updated_at();

create policy cash_sessions_read_scope
on public.cash_sessions for select to authenticated
using (public.is_org_member(organization_id));

create policy cash_sessions_insert_owner
on public.cash_sessions for insert to authenticated
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy cash_sessions_update_owner
on public.cash_sessions for update to authenticated
using (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));
