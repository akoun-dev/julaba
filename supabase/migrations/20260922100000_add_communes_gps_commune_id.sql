-- Migration: MODE-979 (DET-COOP-008) — référentiel GPS des communes +
-- cooperatives.commune_id / producers.commune_id.
--
-- La dette : la commune de la coopérative était en TEXTE LIBRE
-- (cooperatives.commune, migration 20260920100000 l.48) et les producteurs
-- n'avaient AUCUNE localisation — il était donc impossible de trier les
-- récoltes par proximité (parité julaba-app §2.2/§4.3 : « Récoltes
-- prévues » triées par distance Haversine depuis la commune de la coop).
--
-- Ici :
--   1. table `communes` : référentiel des 41 communes (13 communes du
--      district d'Abidjan + 28 villes de région) avec coordonnées de
--      référence PUBLIQUES (centre administratif approximatif, précision
--      de l'ordre du km — largement suffisante pour un tri de proximité
--      par tranches 25/100 km) ;
--   2. cooperatives.commune_id (FK nullable) — la colonne `commune` texte
--      libre est CONSERVÉE (rétrocompatibilité, aucune donnée détruite) ;
--   3. producers.commune_id (FK nullable) — le producteur renseigne sa
--      commune (profil producteur) ;
--   4. backfill BEST-EFFORT : une coopérative dont la commune saisie en
--      texte libre correspond EXACTEMENT au nom d'une commune du
--      référentiel est liée (correspondance exacte uniquement — jamais de
--      correspondance floue inventée) ;
--   5. le tri Haversine lui-même vit côté application
--      (src/lib/cooperatives/proximite.ts, module pur testé) — pas de
--      RPC supplémentaire (classe SEC-813 : pas de nouvelle surface
--      SECURITY DEFINER).

-- ── 1. Référentiel des communes ────────────────────────────────────────
create table if not exists public.communes (
  id     uuid primary key default gen_random_uuid(),
  nom    text not null unique,
  region text not null,
  lat    double precision not null,
  lng    double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_communes_updated_at on public.communes;
create trigger set_communes_updated_at
  before update on public.communes
  for each row execute function public.set_updated_at_legacy();
alter table public.communes enable row level security;

-- RLS deny-all : le référentiel se lit exclusivement via les routes
-- serveur (annuaire /api/communes, session appareil vérifiée).

insert into public.communes (nom, region, lat, lng) values
  -- District d'Abidjan (13 communes)
  ('Abobo',        'Abidjan', 5.4192, -4.0219),
  ('Adjamé',       'Abidjan', 5.3719, -4.0236),
  ('Attécoubé',    'Abidjan', 5.3379, -4.0492),
  ('Cocody',       'Abidjan', 5.3479, -3.9867),
  ('Koumassi',     'Abidjan', 5.2906, -3.9517),
  ('Marcory',      'Abidjan', 5.2983, -3.9861),
  ('Plateau',      'Abidjan', 5.3261, -4.0206),
  ('Port-Bouët',   'Abidjan', 5.2644, -3.9917),
  ('Treichville',  'Abidjan', 5.2986, -4.0094),
  ('Yopougon',     'Abidjan', 5.3406, -4.0919),
  ('Anyama',       'Abidjan', 5.4944, -4.0519),
  ('Bingerville',  'Abidjan', 5.3544, -3.8864),
  ('Songon',       'Abidjan', 5.3306, -4.2431),
  -- Centre / Est
  ('Yamoussoukro', 'Yamoussoukro', 6.8276, -5.2893),
  ('Toumodi',      'Bélier', 6.5519, -5.0186),
  ('Dimbokro',     'N''Zi', 6.6469, -4.3533),
  ('Bouaké',       'Gbêkê', 7.6906, -5.0300),
  ('Abengourou',   'Indénié-Djuablin', 6.7297, -3.4964),
  ('Bondoukou',    'Gontougo', 8.0403, -2.8000),
  ('Adzopé',       'La Mé', 6.1058, -3.8622),
  -- Centre-Ouest / Ouest
  ('Daloa',        'Haut-Sassandra', 6.8776, -6.4503),
  ('Issia',        'Haut-Sassandra', 6.5217, -6.5833),
  ('Sinfra',       'Marahoué', 6.1122, -5.9067),
  ('Oumé',         'Gôh', 6.3769, -5.4167),
  ('Gagnoa',       'Gôh', 6.1319, -5.9506),
  ('Man',          'Tonkpi', 7.4125, -7.5539),
  ('Duékoué',      'Guémon', 6.7383, -7.3514),
  ('Guiglo',       'Cavally', 6.5436, -7.4919),
  -- Sud-Ouest
  ('Soubré',       'Nawa', 5.7831, -6.5978),
  ('San-Pédro',    'San-Pédro', 4.7485, -6.6363),
  ('Sassandra',    'San-Pédro', 4.9531, -6.0786),
  -- Sud (Agnéby / Lôh-Djiboua / Grands-Ponts)
  ('Tiassalé',     'Agnéby-Tiassa', 5.8989, -4.8197),
  ('Agboville',    'Agnéby-Tiassa', 5.9328, -4.2186),
  ('Divo',         'Lôh-Djiboua', 5.8372, -5.3561),
  ('Dabou',        'Grands-Ponts', 5.3283, -4.3769),
  -- Sud-Comoé
  ('Grand-Bassam', 'Sud-Comoé', 5.2000, -3.7383),
  ('Bonoua',       'Sud-Comoé', 5.2742, -3.5967),
  ('Aboisso',      'Sud-Comoé', 5.4669, -3.2075),
  -- Nord
  ('Korhogo',        'Poro', 9.4508, -5.6272),
  ('Ferkessédougou', 'Tchologo', 9.5928, -5.1947),
  ('Boundiali',      'Bagoué', 9.5219, -6.7417)
on conflict (nom) do nothing;

-- ── 2. cooperatives.commune_id ─────────────────────────────────────────
alter table public.cooperatives
  add column if not exists commune_id uuid references public.communes(id);

create index if not exists idx_cooperatives_commune
  on public.cooperatives(commune_id);

-- ── 3. producers.commune_id ────────────────────────────────────────────
alter table public.producers
  add column if not exists commune_id uuid references public.communes(id);

create index if not exists idx_producers_commune
  on public.producers(commune_id);

-- ── 4. Backfill best-effort (correspondance de nom EXACTE seulement) ──
update public.cooperatives
  set commune_id = public.communes.id
  from public.communes
  where public.communes.nom = public.cooperatives.commune
    and public.cooperatives.commune_id is null;
