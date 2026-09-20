-- SEC-813bis — Clôture de la régression SEC-813 (AUDIT-003, anomalie S-01 — P0)
--
-- AUDIT-003 (2026-09-21, MODE-933) a constaté que 3 fonctions SECURITY
-- DEFINER créées APRÈS le durcissement SEC-813 (20260919100000) répètent
-- exactement le pattern insuffisant documenté par ce dernier :
--
--   « Supabase accorde EXECUTE explicitement à anon + authenticated à la
--    création, même après un "revoke ... from public". »
--
-- Sans ce revoke, l'anon key PostgREST peut appeler directement :
--   1. merchant_record_credit_op   — mutation du cahier de crédit de
--      N'IMPORTE QUEL marchand (requireDeviceOwner vit dans la route API,
--      pas dans la base) ;
--   2. merchant_reverse_sale       — annulation de ventes arbitraire ;
--   3. purge_expired_notifications — purge paramétrable de l'archivage
--      (aucun revoke du tout à la création, PUBLIC inclus).
--
-- Vérification post-application (cf. supabase/tests/acl.sql) :
--   has_function_privilege('anon',          'public.<rpc>', 'EXECUTE') = false
--   has_function_privilege('authenticated', 'public.<rpc>', 'EXECUTE') = false
--   has_function_privilege('service_role',  'public.<rpc>', 'EXECUTE') = true
--
-- Idempotente : revoke répété = no-op, applicable en prod sans garde.

-- 1. Cahier de crédit marchand (créée 20260919130100, revoke public seul).
revoke execute on function public.merchant_record_credit_op(text, uuid, text, text, text, bigint, text)
  from anon, authenticated;

-- 2. Annulation de vente marchande (créée 20260919150100, revoke public seul).
revoke execute on function public.merchant_reverse_sale(text, uuid, text, text)
  from anon, authenticated;

-- 3. Purge des notifications (créée 20260917160000, AUCUN revoke à la
--    création — PUBLIC inclus) : trois revokes + grant service_role
--    explicite pour coller au contrat « service_role seul ».
revoke execute on function public.purge_expired_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_notifications(integer)
  to service_role;
