-- Migration: MODE-908 (§18) — étiquetage des ventes par point de vente.
-- `selling_point_client_id` sur legacy_sales porte le merchant_selling_points.id
-- (résolu côté route à partir du client_id envoyé par l'appareil) : la vente
-- reste joignable au point où elle a été réalisée. Colonne nullable SANS
-- défaut : les ventes antérieures (et tout insert qui n'envoie pas la
-- colonne) continuent de fonctionner avant comme après la migration — la
-- route n'écrit la colonne QUE si un point résolvable est fourni (jamais
-- de vente bloquée par un point inconnu ou une table non encore migrée).

alter table public.legacy_sales
  add column if not exists selling_point_client_id text;

-- Stats par point de vente : regroupement des ventes étiquetées.
create index if not exists idx_legacy_sales_selling_point_client_id
  on public.legacy_sales(selling_point_client_id);
