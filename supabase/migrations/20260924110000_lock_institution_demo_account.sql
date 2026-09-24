-- A11-F02 (AUDIT-011, 2026-09-24, MODE-1003) — P1 : neutralisation du
-- compte BO de démonstration « institution » provisionné PAR MIGRATION.
--
-- Constat (AUDIT-011 §3.2) : 20260923120000_create_institution_demo_account
-- insère un compte BO ACTIF (institution@julaba.ci / role institution) dont
-- le mot de passe (admin123) est publié en clair dans le dépôt — et une
-- MIGRATION s'applique à la base HÉBERGÉE (contrairement à supabase/seed.sql,
-- qui ne tourne qu'en local). Un login back-office réel serait disponible
-- avec un mot de passe public dès l'application de la migration en prod.
--
-- Traitement (recommandation §5.2) : ne PAS provisionner de compte réel par
-- migration. Ce fichier neutralise le compte où qu'il existe déjà :
--   • is_active = false — le login refuse (et getSessionUser re-lecture
--     is_active à CHAQUE requête : toute session vivante est tuée) ;
--   • password_hash = hash scrypt d'un mot de passe JETÉ (généré aléatoirement
--     hors dépôt, jamais persisté en clair) — même si le compte était
--     réactivé par erreur, admin123 ne vaut plus rien. Le hash figure dans
--     git par nécessité d'idempotence, mais il ne vérifie AUCUN mot de passe
--     connu : il neutralise, il n'accorde pas.
--
-- Le compte de démonstration reste disponible en LOCAL : supabase/seed.sql
-- (exécuté après les migrations sur un `db reset` local) le réinsère actif
-- avec la convention démo — jamais sur la base hébergée. Le plaintext
-- « admin123 » de la migration mère et des écrans démo reste à purger
-- avant la mise en production réelle du back-office (registre dette,
-- AUDIT-011 §5.2).
--
-- Idempotente : l'update ne touche que les lignes existantes, répété = no-op.

update public.bo_users
set password_hash = 'scrypt:b7878e70289b8e3e37176d94dce68bd2:639b057df323857eac97942531249c7d519cb6800d1b7b9568e3eb0c75610b983f221aab45e6697594e4502754e4b24a680bb6c5efc3a6fd78007b5ba52d0d77',
    is_active = false
where email = 'institution@julaba.ci'
  and role = 'institution';
