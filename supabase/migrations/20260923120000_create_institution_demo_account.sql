-- Migration: compte de démonstration Institution (AUDIT_MATRICE_47_CAS I-01 / INS-*)
--
-- Partenaire institutionnel du programme Jùlaba, profil LECTURE seule :
-- le rôle 'institution' est défini dans src/lib/backoffice-permissions.ts
-- (hiérarchie 0, canPerformAction refuse toute écriture). Radie des modules
-- de LECTURE autorisés : dashboard, acteurs, carte-acteurs, alertes,
-- supervision, rapports, audit.
--
-- Mot de passe : admin123 — convention partagée des comptes démo back-office
-- (scripts/test-auth-all-accounts.ts et bo-auth-screen.tsx > handleDemoLogin).
-- Format du hash scrypt:<salt>:<hash> identique à celui de supabase/seed.sql
-- et vérifiable via src/lib/backoffice-auth/password.ts (verifyPassword).
insert into public.bo_users (id, email, password_hash, name, role, zone, is_active)
values (
  'bo-user-inst-001',
  'institution@julaba.ci',
  'scrypt:9f2c1e7a4b8d0f3a6c5e8b1d4a7f0c9e:6c4de88f6aeb93b87ec0748bd03c73c172aa69b24d15e1c6d9aa20654652d3c2461fac89360babe2111e2e5e86f978c2c18999674b3535fc9d81f90c386a0c4d',
  'Direction générale du commerce',
  'institution',
  null,
  true
)
on conflict (email) do nothing;