create table public.keiwa_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid references public.keiwa_accounts(id) on delete restrict,
  type text not null,
  amount bigint not null check (amount <> 0),
  sender_name text,
  sender_phone text,
  recipient_name text,
  recipient_phone text,
  status text not null default 'termine',
  created_at timestamptz not null default now(),
  constraint keiwa_transaction_same_org foreign key (organization_id, account_id)
    references public.keiwa_accounts(organization_id, id)
    on delete restrict
    deferrable initially deferred
);

create index keiwa_transactions_account_idx
on public.keiwa_transactions(organization_id, account_id, created_at desc);
create index keiwa_transactions_status_idx
on public.keiwa_transactions(organization_id, status, created_at desc);

alter table public.keiwa_transactions enable row level security;

-- Journal financier append-only : insertion et lecture admin, jamais de
-- modification ni suppression.
create policy keiwa_transactions_admin_read
on public.keiwa_transactions for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy keiwa_transactions_admin_insert
on public.keiwa_transactions for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));
