-- Une seule caisse ouverte par marchand, quel que soit l'appareil.
-- On conserve la plus ancienne session ouverte en cas de données historiques
-- incohérentes avant la création de l'index.
with ranked as (
  select id,
         row_number() over (partition by merchant_id order by opened_at asc, id asc) as rn
  from public.legacy_caisse_sessions
  where is_open
)
update public.legacy_caisse_sessions s
set is_open = false,
    closed_at = coalesce(closed_at, now())
from ranked r
where s.id = r.id and r.rn > 1;

create unique index if not exists idx_legacy_caisse_sessions_one_open
  on public.legacy_caisse_sessions(merchant_id)
  where is_open;

create index if not exists idx_legacy_caisse_sessions_opened_desc
  on public.legacy_caisse_sessions(merchant_id, opened_at desc);
