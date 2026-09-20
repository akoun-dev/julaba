-- MODE-922 — Correctif du module Coopérative (colonne « actif »).
--
-- La migration 20260920100000 crée l'index idx_cooperative_membres_membre
-- sur (membre_id, actif) SANS créer la colonne actif : à l'exécution, la
-- création d'index échoue (42703) et les requêtes runtime qui filtrent
-- eq('actif', true) (resolver, anti-double-adhésion, recherche marchand)
-- renvoient une erreur PostgREST — tout le parcours « marchand membre »
-- était cassé sur le projet distant.
--
-- Cette migration converge TOUT état intermédiaire (colonne absente ou
-- déjà présente) de façon idempotente, et ajoute :
--   1. la colonne actif, miroir calculé de statut (trigger) ;
--   2. l'index unique partiel uniq_coop_membre_actif — invariant
--      « une seule adhésion active par marchand » (même contrat que
--      julaba-app : le résolveur d'adhésion active prend LIMIT 1) ;
--   3. la FK cooperative_stock_mouvements.besoin_id → cooperative_besoins
--      (SET NULL — supprimer un besoin n'ampute pas la traçabilité).

-- 1. Colonne actif (backfill cohérent avec le statut avant NOT NULL).
alter table public.cooperative_membres
  add column if not exists actif boolean;

update public.cooperative_membres
  set actif = (statut = 'actif')
  where actif is null;

alter table public.cooperative_membres
  alter column actif set default true,
  alter column actif set not null;

-- 2. Trigger : actif est DÉRIVÉ de statut (true uniquement pour 'actif'),
--    quel que soit l'appelant (routes, replays offline, RPC futurs).
create or replace function public.cooperative_membres_sync_actif()
returns trigger
language plpgsql
as $$
begin
  new.actif := (new.statut = 'actif');
  return new;
end;
$$;

drop trigger if exists trg_cooperative_membres_sync_actif
  on public.cooperative_membres;
create trigger trg_cooperative_membres_sync_actif
  before insert or update of statut on public.cooperative_membres
  for each row execute function public.cooperative_membres_sync_actif();

-- 3. Index de requête (le même que la migration originelle, désormais
--    exécutable) + index unique partiel (invariant anti-double-adhésion,
--    filet anti-course : le 23505 est traduit en 409 côté routes).
create index if not exists idx_cooperative_membres_membre
  on public.cooperative_membres(membre_id, actif);

create unique index if not exists uniq_coop_membre_actif
  on public.cooperative_membres(membre_id)
  where actif = true;

-- 4. FK besoin_id (DO block idempotent — la contrainte peut déjà exister).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cooperative_stock_mouvements_besoin_id_fkey'
      and conrelid = 'public.cooperative_stock_mouvements'::regclass
  ) then
    alter table public.cooperative_stock_mouvements
      add constraint cooperative_stock_mouvements_besoin_id_fkey
      foreign key (besoin_id) references public.cooperative_besoins(id)
      on delete set null;
  end if;
end $$;
