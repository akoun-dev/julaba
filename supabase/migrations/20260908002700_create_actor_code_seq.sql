-- Migration: séquence actor_code_seq — codes d'acteur lisibles (#M-1001, #P-1002…)
-- (scission de 20260908002700_enrolment_functions.sql, 1 objet = 1 fichier).

-- Codes d'acteur lisibles (#M-1001, #P-1002...) attribués sans course critique.
create sequence if not exists public.actor_code_seq start 1000;

-- Journal d'audit append-only : les clients n'ont aucune policy insert/update
-- sur audit_events, seules les fonctions de confiance écrivent.
