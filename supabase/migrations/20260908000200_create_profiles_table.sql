create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text,
  phone text,
  actor_type text not null default 'marchand'
    check (actor_type in ('marchand', 'producteur', 'identificateur', 'backoffice')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, actor_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    new.raw_user_meta_data ->> 'last_name',
    new.phone,
    coalesce(new.raw_user_meta_data ->> 'actor_type', 'marchand')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy profiles_self_read
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy profiles_self_update
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
