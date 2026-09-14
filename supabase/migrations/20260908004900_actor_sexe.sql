-- The identificateur enrollment wizard has always collected the actor's
-- sexe (step 3, "Informations complémentaires"), but it was never sent to
-- the server — every actor's own app (marchand/producteur) greets them
-- with a hardcoded "Maman"/"Papa" regardless of what was actually entered,
-- because there was nowhere to store or read it back from.
alter table public.merchants
  add column if not exists sexe text check (sexe is null or sexe in ('masculin', 'feminin', 'autre'));

alter table public.producers
  add column if not exists sexe text check (sexe is null or sexe in ('masculin', 'feminin', 'autre'));

alter table public.legacy_bo_enrolments
  add column if not exists sexe text check (sexe is null or sexe in ('masculin', 'feminin', 'autre'));

alter table public.legacy_bo_actors
  add column if not exists sexe text check (sexe is null or sexe in ('masculin', 'feminin', 'autre'));
