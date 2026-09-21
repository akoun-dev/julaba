-- MODE-946 (AUDIT-003 D-2 / F-14) — alignement de la machine à états des
-- besoins coopératifs sur le flux RÉEL : en_attente (déposé) → consolidé
-- (groupé) → en_cours (en approvisionnement) → livre (distribution RPC
-- coop_distribuer_stock, MODE-942). Le statut 'approuve' n'a JAMAIS été
-- posé par le client ni par la RPC (F-14 « statut besoin approuve jamais
-- posé ») : le retirer du CHECK supprime une zone morte — aucun risque
-- données, la contrainte sortante garantit zéro ligne à 'approuve'.

alter table public.cooperative_besoins
  drop constraint if exists cooperative_besoins_statut_check;

alter table public.cooperative_besoins
  add constraint cooperative_besoins_statut_check
  check (statut in ('en_attente', 'consolide', 'en_cours', 'livre'));
