# AUDIT #004 — 2026-09-21 — Authentification back-office « ne fonctionne plus »

- **Auditeur** : Super Z (Task 111 / MODE-960), à la demande du porteur — « Fais un audit complet, les comptes auth "Backoffice" ne fonctionnent plus »
- **Périmètre** : HEAD `5855bc1` (origin/main, 5 commits fidélité owner intégrés en fast-forward) — chaîne d'auth back-office complète (route login, MFA TOTP, lockout, session, environment), seed, migrations, écran de connexion, configuration
- **Méthode** : audit statique ligne à ligne + **vérifications exécutées** (hash du seed contre `verifyPassword` réel via bun ; suites vitest ; tsc/eslint) — pas de reproduction DB possible ici (pas de Docker/Supabase CLI dans le sandbox)
- **Baseline revalidée ce jour** : vitest **1534/1534** (113 fichiers + garde-fou hygiène) · `tsc --noEmit` 0 · `eslint .` 0

**Clés de lecture** : **[FAIT]** = vérifié (fichier:ligne cité) · **[HYPOTHÈSE]** = plausible, à instrumenter côté porteur.

---

## 1. Verdict en une phrase

**Le code d'authentification est sain** (aucun des 5 derniers commits owner ne touche la chaîne) ; les comptes « ne fonctionnent plus » pour des raisons **d'environnement et de configuration**, dont une **fuite de secrets P0 découverte au passage**.

## 2. Constat critique découvert : `.env` suivi par git sur dépôt public [FAIT]

- `git ls-files` liste **`.env`** — les règles `.gitignore` (ligne `.env`) ne s'appliquent pas à un fichier déjà suivi. Le dépôt est **public** (clone/`ls-remote` réussis sans token).
- Contenu exposé : `SUPABASE_SERVICE_ROLE_KEY` (contourne TOUTE la RLS), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, URL du projet hébergé `pqgcwcdtkxatwfjvatdg`, et une `SUPABASE_DB_URL` commentée avec mot de passe DB.
- Historique : `9f85f93` « renseigner l'URL de connexion Supabase », `c9c9a62` « **désactiver temporairement le MFA du back-office** » (le `.env` a servi de configuration de prod de fait).
- **Correctif appliqué (MODE-960)** : `git rm --cached .env` (le fichier local est conservé) + garde-fou vitest `src/lib/__tests__/git-hygiene.test.ts` qui échoue si `.env`/`.pem`/`*.keystore`/`credentials` reviennent dans l'index + `.env.example` documenté (avertissement + les 2 interrupteurs MFA).
- **Reste à la charge du porteur (impossible depuis le code)** : **rotation des clés Supabase** (Dashboard → Settings → API → régénérer `service_role` et `anon`, + mot de passe DB) — la clé reste dans l'historique git public tant que la rotation n'est pas faite. Une purge d'historique (git filter-repo/BFG) devient facultative après rotation.

## 3. Pourquoi les comptes back-office « ne fonctionnent plus » — 4 causes environnementales

### 3.1 Migrations non appliquées sur la base cible → 500 garanti [FAIT — cheminement prouvé]

La chaîne : POST `/api/backoffice/login` → `verifyPassword` OK → `createMfaChallenge()` (mfa.ts:55). Sans la migration `20260921110000_mfa_totp` :
1. `select('mfa_secret, totp_enrolled')` → colonne `totp_enrolled` inconnue → `user = null` (erreur PostgREST avalée, mfa.ts:85-89) ;
2. branche enrôlement → `update({ mfa_secret, totp_enrolled: false, ... })` → erreur colonne inconnue → **`if (saveError) throw saveError`** (mfa.ts:108) → catch global → **500 « Erreur lors de la connexion »** à CHAQUE connexion, mot de passe correct inclus.

Colonnes/tables critiques par migration : `mfa_secret`, `failed_login_attempts`, `locked_until`, `force_password_change` existent dans la migration d'origine `20260101000300_create_bo_users_table.sql` (lignes 13-16) ; `totp_enrolled/last_step/recovery_codes` = `20260921110000` ; `auth_lockouts` + RPC `record_auth_failure`/`reset_auth_failures` = `20260921130000` (verrous marchand/producteur/coopérateur) ; le reste (11 migrations désormais) porte Sprint B/C/D + fidélité.

**Drift supplémentaire [FAIT]** : le renommage `20260921150000_sprint_c_index_grants` → `20260921151000_` (collision de timestamp avec `cooperative_backoffice_governance`, contenu 100 % identique) fait que toute base ayant appliqué l'ancien nom échoue au `db push`. Procédure `supabase migration repair` documentée dans `supabase/migrations/README.md` (Task 111).

### 3.2 Enrôlement TOTP en production = nouveau parcours, pas une panne [FAIT]

En prod (`NODE_ENV=production`), `isMfaBypassAllowed()` et le mode test sont **ignorés par construction** (environment.ts:7-18, commentaire MODE-941) : la première connexion affiche l'**enrôlement** (secret base32 + URI otpauth + 8 codes de récupération) — écran `bo-auth-screen.tsx` lignes 483-488, support vérifié. Un porteur qui s'attendait à l'ancien code inline lit ce nouvel écran comme « ça ne marche plus ». Ce comportement est **voulu** (AUDIT-003 S-02 : l'ancien code 6 chiffres n'était jamais livré — aucune canal d'envoi).

### 3.3 Verrouillage compte / limite IP [FAIT]

5 échecs → **423** pendant 15 min (lockout.ts, `MAX_FAILED_ATTEMPTS = 5`) ; 20 requêtes IP / 5 min → **429** (lockout.ts:40-51, mémoire du processus — réinitialisée par redéploiement). Après plusieurs tentatives infructueuses (3.1), ces verrous aggravent l'impression de panne.

### 3.4 Seed [VÉRIFIÉ — non en cause]

Les **7 hash scrypt de `supabase/seed.sql` vérifient tous `admin123`** avec l'implémentation réelle `verifyPassword` (script exécuté : `scripts/audit-verify-seed-hashes.ts`, 7/7 OK). `password.ts` gère le legacy plaintext avec re-hash transparent ; `auth-login-server.ts:144-149` fait de même pour les `pin_hash` djb2 des espaces app. Si la base cible n'a jamais reçu le seed (`supabase db reset` local, ou seed non joué sur l'hébergé), tous les comptes renvoient 401.

## 4. Ce qui est SAIN (auditée et vérifiée)

- Chaîne complète : login → lockout → scrypt (timing-safe) → re-hash → MFA TOTP RFC-6238 (anti-rejeu `totp_last_step`, fenêtre ±1 pas) + codes de récupération usage unique → session `bo_sessions` (token aléatoire 32 o, hashé sha256, TTL 12 h, révocation) — cohérente de bout en bout.
- Énumération : 401 générique (email inconnu / mot de passe erroné / compte inactif indistinguables) ; `/api/backoffice/demo-accounts` liste vide en prod.
- Espaces app : login coopérateur miroir du producteur, verrous serveur RPC atomiques, re-hash djb2→scrypt au succès.
- Les 5 commits owner (fidélité) : `backoffice-permissions.ts` et `backoffice-store.ts` strictement additifs (modules `demandes-info`/`loyalty`), aucune route d'auth modifiée.

## 5. Livrables MODE-960

| Livrable | Fichier |
|---|---|
| `.env` retiré du suivi git | `git rm --cached .env` (local conservé) |
| Garde-fou « secrets jamais suivis » (3 tests) | `src/lib/__tests__/git-hygiene.test.ts` |
| COMPTES-TEST : section Coopératives (Mariam/Ibrahim) + diagnostic éclair + prérequis migrations | `COMPTES-TEST.md` |
| `.env.example` : avertissement + distinction des 2 interrupteurs MFA | `.env.example` |
| Procédure `migration repair` du renommage | `supabase/migrations/README.md` |
| Vérification exécutable des hash du seed | `scripts/audit-verify-seed-hashes.ts` |

## 6. Actions porteur (dans l'ordre)

1. **Rotation immédiate des clés Supabase** (`service_role`, `anon`, mot de passe DB) — P0, la clé actuelle est publique.
2. Réaligner l'historique de migrations puis pousser : `supabase migration repair` (voir README migrations) + `supabase db push` — les 11 migrations incluent celles sans lesquelles le login back-office 500.
3. Vérifier les variables d'environnement Vercel (jamais compter sur le `.env` commité — il n'est plus suivi).
4. Tester : `supabase db reset` local puis `BACKOFFICE_MFA_TEST_MODE=true BACKOFFICE_MFA_TEST_CODE=123456 bun run dev` + `bun run scripts/test-auth-all-accounts.ts` ; en prod, parcourir l'enrôlement TOTP une fois par compte.
