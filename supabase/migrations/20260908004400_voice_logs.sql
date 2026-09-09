-- Transcriptions vocales : données sensibles (architecture §6) — accès
-- restreint au marchand propriétaire et aux administrateurs nationaux.
create table public.voice_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  merchant_user_id uuid not null references auth.users(id) on delete cascade,
  transcript text not null,
  intent text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  response_text text,
  created_at timestamptz not null default now()
);

create index voice_logs_scope_idx
on public.voice_logs(organization_id, merchant_user_id, created_at desc);

alter table public.voice_logs enable row level security;

create policy voice_logs_read_scope
on public.voice_logs for select to authenticated
using (
  merchant_user_id = (select auth.uid())
  or public.has_org_role(organization_id, array['super_admin', 'admin_national'])
);

create policy voice_logs_insert_owner
on public.voice_logs for insert to authenticated
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));
