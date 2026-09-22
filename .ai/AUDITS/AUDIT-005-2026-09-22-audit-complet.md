# AUDIT #005 — 2026-09-22 — Audit complet du dépôt Jùlaba

- **Auditeur** : Super Z (Task 115 / MODE-963), à la demande du porteur (audit de sécurité global après la Task 114 — APK de test reconstruit)
- **Périmètre** : HEAD `356f1dc` (origin/main après Task 113) — audit transversal : routes API (pré-auth + back-office), libs d'auth, RLS/migrations, seed, dépendances npm, cible native Android (manifest, plugins vocaux, chaîne d'approvisionnement build)
- **Méthode** : 3 agents d'exploration en parallèle (surface API / libs + schéma / natif + dépendances) puis **relecture ligne à ligne** de chaque finding par l'auditeur, avec vérifications exécutées (suites vitest, tsc, eslint, build, `bun audit`)
- **Note d'intégrité** : l'exécution initiale de cet audit (commits `6b49dcf` + `451a373`, 43 fichiers +1222/−260, vitest 1571) a été **perdue dans une réinitialisation du sandbox** avant push (PAT révoqué, push à la charge du porteur). Les correctifs ont été **intégralement rejoués et re-vérifiés** le même jour sur `356f1dc` ; les empreintes SHA-256 des artefacts ont été recalculées depuis les releases officielles et concordent avec la session initiale. Le présent document fait foi.
- **Baseline finale** : vitest **1549/1549** (117 fichiers, +33 dont garde-fou seed scrypt) · `tsc --noEmit` 0 · `eslint .` 0 · `bun run build` OK · `bun audit` **104 → 56 vulnérabilités**

**Clés de lecture** : **[FAIT]** = vérifié (fichier:ligne cité) · **[PORTOR]** = action impossible depuis le code.

---

## 1. Verdict en une phrase

**Aucune faille P0 ; 2 P1 dont un corrigé ici et un resté côté porteur (migrations hébergées) ; ~22 P2 — la totalité des P2 actionnables est corrigée dans MODE-963**, le reste est explicitement assumé ou enregistré en dette.

## 2. Synthèse des constats

| N° | Sévérité | Constat | Traitement |
|---|---|---|---|
| F-01 | **P1** | Quotas IP pré-auth en mémoire process (BO login, lookup ident) — inopérants multi-instances/redémarrages ; lookup pré-auth expose le `phone` | **CORRIGÉ** (§3.1) |
| F-02 | **P1** | Migrations Supabase non appliquées sur la base hébergée (cumul, dont `auth_lockouts` 20260921130000 et 20260922100000) | **PORTOR** (§3.2) |
| F-03 | P2 | Interpolation de paramètres URL dans la grammaire `.or()` PostgREST sur 4 routes BO (audit, contenus, cooperatives, acteurs) | **CORRIGÉ** (§3.3) |
| F-04 | P2 | Seed : 12 PIN de démo en djb2 brut versionné dans git | **CORRIGÉ** (§3.4) |
| F-05 | P2 | `canAccessZone` fail-open (rôle zoné sans zone = accès national ; ressource sans zone = accessible) | **CORRIGÉ** (§3.5) |
| F-06 | P2 | Table morte `bo_mfa_challenges` après retrait MFA (MODE-961) | **CORRIGÉ** (§3.6) |
| F-07 | P2 | `next` 16.1.3 — 2 avis critiques RCE en amont ; `protobufjs` 6.11.6 via `onnx-proto` ; 8 dépendances sans aucun import | **CORRIGÉ** (§3.7) |
| F-08 | P2 | `allowBackup="true"` + `usesCleartextTraffic="true"` sur le WebView natif | **CORRIGÉ** (§3.8) |
| F-09 | P2 | Plugins natifs : `version`/`modelPath`/URL du bridge interpollés sans garde (traversal, source de téléchargement libre) | **CORRIGÉ** (§3.9) |
| F-10 | P2 | `fetch-android-deps.sh` sans vérification d'empreinte (AAR natif + modèles 350 Mo) | **CORRIGÉ** (§3.10) |
| F-11 | P2 | Route `/api` « Hello, world! » sans valeur (surface morte) | **CORRIGÉ** (§3.11) |
| A5-F15 | P3 | Typage `any` hérité du client admin (cf. docstring regénération types) | Dette (§5) |
| A5-F19 | P3 | Lockout par compte BO toujours en lire-modifier-écrit (`registerFailedAttempt` sur `bo_users`) — RPC `record_backoffice_auth_failure` à créer sur le modèle de 20260921130000 | **CORRIGÉ MODE-964** (migration 20260922110000 + branchement lockout.ts/route login) |
| A5-F21/F-22 | P3 | Couverture (routes API BO) et littératie formulaires — chantiers déjà ouverts | Dette (§5) |
| — | — | Vérifiés SANS action : MFA retiré par décision (MODE-961, non un finding), Omnilingual bci↔dyu réutilisé sans rechargement (VoiceServicePlugin L.161–168), sandbox `@capacitor/filesystem` bornée aux répertoires privés, sessions BO httpOnly + rotation 12 h, RLS deny-all par défaut sur le schéma durci | — |

## 3. Détail des correctifs appliqués (MODE-963)

### 3.1 F-01 (P1) — garde IP partagée + lookup sans PII [FAIT]

**Constat** : deux routes pré-authentification comptabilisaient leurs quotas dans des `Map` du process Node — `isIpRateLimited` (lockout.ts) pour `/api/backoffice/login`, `simpleRateHits` pour `/api/identificateur/auth/lookup`. Sur Vercel (multi-instances), chaque instance porte son compteur : le quota réel d'un attaquant est N × 20, et chaque redéploiement le remet à zéro. La base dispose pourtant depuis MODE-936 de `auth_lockouts` + RPC atomiques (`record_auth_failure`, `get_auth_lock`, `reset_auth_failures`) — utilisés par les trois logins terrain mais PAS par le back-office. Par ailleurs le lookup renvoyait le `phone` du compte : confirmation d'existence pré-auth d'une donnée personnelle, sans nécessité (l'app connaît le numéro saisi ; la session claim s'appuie sur `id`).

**Correctif** :
- `src/lib/auth-lookup-guard.ts` (nouveau) — garde IP adossée à `auth_lockouts`, politique 20 échecs / 5 min → verrou 15 min (`IP_*` de auth-pin.ts), réponse 429 + entête `Retry-After`, **contrat fail-open documenté** (base injoignable = requête laissée passer, journalisée ; les verrous par compte restent la barrière principale) ;
- `/api/backoffice/login` : `isIpRateLimited` remplacé par la garde ; échecs (identifiants inconnus, mot de passe erroné) comptés sur le scope `ip:<addr>`, succès → reset ; lockout par compte inchangé (423) ;
- `/api/identificateur/auth/lookup` : Map process supprimée, garde partagée branchée ; sonde de compte inconnu/désactivé comptée dans le quota IP ; **`phone` retiré de la réponse** (`id` conservé pour la session claim) ;
- client `ident-auth-screen.tsx` aligné : connexion par numéro → téléphone local ; par code agent → téléphone du compte déjà caché sur l'appareil, sinon le code sert de clé locale ;
- `isIpRateLimited` supprimé de lockout.ts/index.ts (zéro appelant restant).

### 3.2 F-02 (P1) — migrations hébergées [PORTOR]

La base hébergée traîne un cumul de migrations non appliquées (AUDIT-004 : cause racine des 500 du login BO). La migration 20260921130000 (`auth_lockouts`) est indispensable au correctif F-01 : sans elle, les RPC échouent et la garde fail-open laisse passer (disponibilité préservée, anti-force-brute dégradé au seul verrou par compte). Procédure déjà documentée dans `supabase/migrations/README.md` : `supabase migration repair` si besoin → `db push` → rejouer les tests rls/acl/auth-lockouts. **Seul P1 restant non résolu — à la charge du porteur.**

### 3.3 F-03 (P2) — injection de filtres PostgREST [FAIT]

**Constat** : 4 routes BO interpolent des paramètres d'URL dans `.or("col.ilike.%${valeur}%")` — `user` (audit), `search` (contenus), `search` (acteurs), `id` (cooperatives, `.or("cooperative_id.eq.${id},…")`). Une valeur contenant `,` `(` `)` casse la grammaire et permet d'AJOUTER des filtres arbitraires (équivalent PostgREST d'une injection SQL) sur des routes tournant avec le client service_role.

**Correctif** : `src/lib/postgrest-search.ts` (nouveau) — `sanitizeSearchTerm` (retire séparateurs `,()`, backslash, jokers LIKE `%_`, compacte les espaces, borne 64 caractères) appliqué aux 3 filtres de recherche ; `isUuid` (regex stricte) imposé sur `id` coopérative — valeur non-UUID → 400. 10 tests.

### 3.4 F-04 (P2) — seed PIN en djb2 [FAIT]

**Constat** : `supabase/seed.sql` stockait les PIN des 12 comptes de démo (5 marchands, 5 producteurs, 2 coopérateurs) en djb2 brut (`1509442` = PIN 1234). Un seed est versionné dans le dépôt public : son djb2 valait mot de passe en clair pour toute base seedée (10 000 combinaisons, cassage instantané).

**Correctif** : les 12 `pin_hash` régénérés en scrypt salé au format back-office (`scrypt:<saltHex>:<hashHex>`, compatibles `verifyCode`/re-hash transparent existants) + garde-fou vitest `seed-pin-hashes.test.ts` (5 tests : exactement 12 comptes, aucun hash purement numérique, format scrypt strict, **chaque PIN documenté vérifie contre son hash via l'implémentation réelle**, un PIN erroné est refusé). Le test de cohérence djb2↔seed (`simple-hash-seed.test.ts`) est retiré (contrat obsolete) ; djb2 reste utilisé UNIQUEMENT côté client pour le cache local du PIN.

### 3.5 F-05 (P2) — canAccessZone fail-closed [FAIT]

**Constat** : `canAccessZone` (backoffice-auth/permission.ts) était fail-open sur deux angles : un rôle zoné (`gestionnaire_zone`, `operateur_terrain`) **sans zone assignée** passait tous les contrôles (accès national de fait — compte mal approvisionné, zone perdue lors d'une réorganisation), et une **ressource sans zone** (périmètre global) était accessible à un rôle zoné.

**Correctif** : fail-closed — rôle zoné sans zone → refus ; ressource sans zone → refus pour un rôle zoné. 7 tests (matrice complète rôles × zones). Les 7 sites d'appel (enrolments, missions, objectifs, identificateurs, information-requests, acteurs) sont analysés : le durcissement aligne le comportement sur la sémantique « périmètre » déjà documentée (un opérateur de zone ne voit pas les objectifs nationaux).

### 3.6 F-06 (P2) — table morte bo_mfa_challenges [FAIT]

MODE-961 a retiré le MFA du back-office (décision porteur) mais laissait la table `20260101000500` en place — surface morte (données résiduelles, drift de schéma). **Correctif** : migration `20260922100000_drop_bo_mfa_challenges.sql` (drop table, zéro référence code restante vérifiée) + retrait des 2 assertions pgTAP correspondantes dans `supabase/tests/rls.sql` (**plan 176 → 174**).

### 3.7 F-07 (P2) — dépendances [FAIT]

**Constat** : `next` 16.1.3 (2 avis critiques RCE en amont corrigés en 16.3.x), `protobufjs` 6.11.6 épinglé par `onnx-proto` (dépendance onnxruntime-web), 8 dépendances sans aucun import dans le dépôt.

**Correctif** : `next` + `eslint-config-next` → **16.3.5** (build et smoke vérifiés) ; `overrides` package.json → `"protobufjs": "7.6.6"` (la leçon MODE-954 est appliquée : `bun update <dépendance transitive>` la promouvrait dépendance directe — l'override est le bon outil) ; suppression des **8 dépendances mortes** vérifiées par scan systématique : `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@hookform/resolvers`, `input-otp`, `@reactuses/core`, `@tanstack/react-query`, `@tanstack/react-table`. **Résultat : `bun audit` 104 → 56 vulnérabilités** (0 exposition directe : le résiduel est hérité de chaînes dev/optiques — sharp/libvips, tar 7.x accepté car un override ^8 casse `cap sync`).

### 3.8 F-08 (P2) — durcissement du manifest natif [FAIT]

`allowBackup="true"` → **`false`** (l'app porte des PIN/médias d'enrôlement en stockage privé — pas de sauvegarde adb/cloud) ; `usesCleartextTraffic="true"` → **`networkSecurityConfig="@xml/network_security_config"`** (nouveau) : TLS obligatoire par défaut, exception clair limitée à localhost + 10.0.2.2 (live-reload dev). `SCHEDULE_EXACT_ALARM` : vérifié absent (les rappels locaux sont volontairement inexacts — commentaire manifest).

### 3.9 F-09 (P2) — plugins natifs : chemins et hôtes [FAIT]

**Constat** : `LiteRtModelPlugin` interpolait `version` (paramètre bridge) dans un chemin de fichier (`models/gemma/<version>.litertlm` — traversal par `..`/`/` possible) et acceptait une **URL de téléchargement arbitraire** (seul le SHA-256 du payload était vérifié — la source, elle, était libre) ; `SherpaSttPlugin` et `VoiceServicePlugin` résolvaient `modelPath` (bridge) vers cacheDir/filesDir/voice-models sans garde de contenu (traversal, chemin absolu injecté).

**Correctif** : `PluginGuards.java` (nouveau, contrat uniforme) — `safeSegment` (segment sans séparateur ni `..`), `containedFile` (résolution relative sans sortie du répertoire de base, via canonical path), `requirePrivatePath` (chemin absolu uniquement dans filesDir/cacheDir/externalFilesDir), `requireAllowedUrl` (releases GitHub + localhost/réseau privé en dev). Appliqué à : LiteRtModelPlugin (version + URL), SherpaSttPlugin (écriture cache contenue + repli absolu gardé), VoiceServicePlugin (cache + filesDir/voice-models + chemins retournés), VoicePackPlugin déjà durci (safeSegment + allowlist URL propres). Violations → `IllegalArgumentException` attrapée par les méthodes de plugin (reject du call, jamais de crash).

### 3.10 F-10 (P2) — chaîne d'approvisionnement build [FAIT]

`fetch-android-deps.sh` téléchargeait AAR natif + modèles sans vérification d'intégrité : un miroir compromis ou une réédition silencieuse de release pouvait injecter du code natif dans l'APK. **Correctif** : empreintes SHA-256 **épinglées dans le script** (recalculées aujourd'hui depuis les releases officielles k2-fsa, concordantes avec la session initiale : AAR `633c2432…`, FR `77d4cbd6…`, BCI `cdcd0559…`), vérification systématique dans `fetch()` (cache inclus), divergence → abandon du build avec effacement du fichier.

### 3.11 F-11 (P2) — surface morte [FAIT]

`src/app/api/route.ts` (« Hello, world! ») supprimé — route racine d'API sans appelant ni valeur, pur bruit de surface.

## 4. Ce qui a été vérifié SANS action [FAIT]

- **Retrait MFA** : décision porteur assumée (MODE-961), non un finding — la base mono-facteur s'appuie sur scrypt timing-safe + verrous (durcis ici) + sessions httpOnly 12 h + `force_password_change` ;
- **Voix multilingue** : réutilisation Omnilingual bci↔dyu confirmée côté natif (bascule `engineLanguage` sans rechargement des 349 Mo — VoiceServicePlugin L.161–168) ; chargements NLLB/MMS restés lazy après MODE-962 ;
- **`@capacitor/filesystem`** : usages bornés aux répertoires privés de l'app (Directory.Data/Documents) ;
- **RLS** : deny-all par défaut conservé sur le schéma durci ; plan pgTAP recalé sur 174 ;
- **Sessions BO** : cookie httpOnly/sameSite, rotation à chaque login, révocation au logout inchangés.

## 5. Dette enregistrée à l'issue de l'audit

| ID | Contenu | Prio |
|---|---|---|
| S-14 | ~60 sélecteurs zustand BO hors convention (`store => state.x` inline → resélections ciblées) — chantier mécanique large, à découper | P3 |
| A5-F19 | ~~Lockout par compte BO en lire-modifier-écrit (bo_users.failed_login_attempts)~~ — **TRAITÉ MODE-964** : RPC `record_backoffice_auth_failure` (migration 20260922110000) — incrément + seuil + verrou en UN statement UPDATE atomique ; `currentAttempts` supprimé des paramètres ; fail-open symétrique F-01 ; pgTAP 14 assertions + 9 tests vitest | P3 |
| A5-F15 | Client admin typé `any` (docstring admin.ts) — régénération des types via schéma live (NORM-305) | P3 |
| A5-F21 | ~~Couverture de tests des routes API BO (candidats : login, lookup, acteurs, audit)~~ — **TRAITÉ MODE-965** : 39 tests de contrat (login/lookup/actors/audit) | P3 |
| A5-F22 | (absorbée dans F-22 existant — littératie formulaires) | P3 |

## 6. Rappels porteur (inchangés depuis AUDIT-004)

1. **Appliquer les migrations hébergées** (F-02 — le seul P1 restant) puis rejouer les tests rls/acl/auth-lockouts ;
2. **Rotation des clés Supabase** (AUDIT-004 §2 — la service_role reste dans l'historique public) ;
3. Rebuild d'un **APK release signé** pour la mise en champ (le debug de test n'est pas livrable) ;
4. Banc vocal sur appareil réel (docs/VOICE_PERFORMANCE.md — cycle FR→BCI→FR→DYU→BCI, logs `[Voice]`, `dumpsys meminfo`).
