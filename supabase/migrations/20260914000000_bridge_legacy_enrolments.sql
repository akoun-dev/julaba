-- Keep the modern enrolments table populated while the legacy backoffice
-- endpoints are being retired. Existing legacy dossiers are copied once;
-- new dossiers are mirrored by the POST /api/backoffice/enrolments handler.
insert into public.enrolments (
  organization_id,
  zone_id,
  dossier_id,
  actor_name,
  actor_type,
  phone,
  has_photo,
  has_gps,
  identificateur_name,
  status,
  validated_at,
  reject_reason,
  created_at,
  updated_at
)
select
  o.id,
  z.id,
  l.dossier_id,
  l.actor_name,
  case when l.actor_type = 'cooperative' then 'cooperatif' else l.actor_type end,
  l.phone,
  l.has_photo,
  l.has_gps,
  l.identificateur_name,
  l.status,
  l.validated_at,
  l.reject_reason,
  l.created_at,
  l.updated_at
from public.legacy_bo_enrolments l
cross join lateral (
  select id
  from public.organizations
  where is_active = true
  order by created_at asc
  limit 1
) o
join public.zones z
  on z.organization_id = o.id
 and lower(trim(z.name)) = lower(trim(l.zone))
on conflict (organization_id, dossier_id) do update set
  actor_name = excluded.actor_name,
  actor_type = excluded.actor_type,
  phone = excluded.phone,
  has_photo = excluded.has_photo,
  has_gps = excluded.has_gps,
  identificateur_name = excluded.identificateur_name,
  status = excluded.status,
  validated_at = excluded.validated_at,
  reject_reason = excluded.reject_reason,
  updated_at = excluded.updated_at;
