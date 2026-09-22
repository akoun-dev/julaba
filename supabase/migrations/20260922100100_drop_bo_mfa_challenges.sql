-- AUDIT-005 (2026-09-22) — suppression de la table bo_mfa_challenges.
--
-- MODE-961 (2026-09-21) a retiré la vérification MFA du back-office : la
-- connexion est mot de passe scrypt + verrous anti-force-brute + session.
-- La vérification MFA reposait sur la migration 20260921110000_mfa_totp,
-- jamais appliquée en production (colonne totp_enrolled inconnue → CHAQUE
-- connexion en 500) ; le retrait du code a laissé la table 20260101000500
-- en place. Aucun code ne la référence plus (vérifié : zéro occurrence
-- dans src/), elle ne portait que des challenges TOTP éphémères — la
-- conserver serait une surface morte (données résiduelles, schema_drift).
--
-- Contrat : drop table + index implicites ; les 2 assertions pgTAP
-- correspondantes (has_table + RLS) sont retirées de supabase/tests/rls.sql
-- (plan 176 → 174).

drop table if exists public.bo_mfa_challenges;
