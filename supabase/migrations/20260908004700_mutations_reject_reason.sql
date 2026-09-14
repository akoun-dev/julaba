-- The "Mutations" backoffice screen has always collected a reject reason
-- when an admin refuses a zone-mutation request, and an actor type when
-- creating one, but legacy_bo_mutations had nowhere to store either.
alter table public.legacy_bo_mutations
  add column if not exists reject_reason text,
  add column if not exists actor_type text;
