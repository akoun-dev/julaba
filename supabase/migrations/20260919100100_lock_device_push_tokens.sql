-- SEC-814 — Verrouillage de la table device_push_tokens
-- (audit PHASE 1, anomalie N°2 — haute).
--
-- La table était exposée PostgREST sans RLS ET avec des grants complets à
-- anon (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) : n'importe qui avec l'anon
-- key pouvait LIRE tous les push tokens et les EFFACER en masse.
--
-- Tier service_role (même architecture que les routes /api/*) : RLS
-- activée sans policy publique (deny-all PostgREST) + retrait des grants
-- anon/authenticated. L'accès applicatif continue de passer par le client
-- service_role (src/lib/supabase/admin.ts).

alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from anon;
revoke all on public.device_push_tokens from authenticated;
