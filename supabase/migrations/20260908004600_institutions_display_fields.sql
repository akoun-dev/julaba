-- legacy_bo_institutions only ever carried is_active (boolean) plus the
-- contact/address fields, but the backoffice "Institutions" screen has
-- always displayed a tri-state status (actif/inactif/en_attente), a colored
-- initials badge, a website link, and a last-sync timestamp — none of
-- which had anywhere to persist, so every one of those fields silently
-- fell back to a hardcoded default on every page load regardless of what
-- an admin set. This adds real columns for them.
alter table public.legacy_bo_institutions
  add column if not exists status text not null default 'en_attente'
    check (status in ('actif', 'inactif', 'en_attente')),
  add column if not exists initials text,
  add column if not exists color text,
  add column if not exists website text,
  add column if not exists last_sync timestamptz;

-- Backfill from the existing boolean so previously-active institutions
-- don't all regress to "en_attente" once the UI starts reading `status`.
update public.legacy_bo_institutions
set status = case when is_active then 'actif' else 'inactif' end
where status = 'en_attente';
