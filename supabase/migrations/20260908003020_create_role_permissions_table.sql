-- Migration: table role_permissions — matrice rôle × permission
-- (scission de 20260908003000_roles_catalog.sql, 1 table = 1 fichier.)

create table public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

alter table public.role_permissions enable row level security;

create policy role_permissions_read_all
on public.role_permissions for select to authenticated using (true);
