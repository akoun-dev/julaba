create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  -- Préfixe public identifiant la clé ; le secret complet n'est jamais stocké,
  -- seulement son SHA-256, retourné une unique fois à la création.
  key_prefix text not null unique,
  secret_hash text not null,
  permissions text not null default 'read',
  request_count integer not null default 0 check (request_count >= 0),
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index api_keys_active_idx on public.api_keys(organization_id, is_active);

create trigger api_keys_updated_at
before update on public.api_keys
for each row execute function public.set_updated_at();

alter table public.api_keys enable row level security;

-- 'api-keys' : super_admin uniquement. Les secrets restent invisibles des
-- autres rôles, y compris en lecture.
create policy api_keys_super_read
on public.api_keys for select to authenticated
using (public.has_org_role(organization_id, array['super_admin']));

create policy api_keys_super_insert
on public.api_keys for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin']));

create policy api_keys_super_update
on public.api_keys for update to authenticated
using (public.has_org_role(organization_id, array['super_admin']))
with check (public.has_org_role(organization_id, array['super_admin']));

create policy api_keys_super_delete
on public.api_keys for delete to authenticated
using (public.has_org_role(organization_id, array['super_admin']));
