# AUDIT #011 — 2026-09-24 — Audit complet du dépôt Jùlaba (nouvelle passe transversale)

- **Auditeur** : Super Z (Task 158 / MODE-1002), à la demande du porteur (« fais un audit complet encore »)
- **Périmètre** : HEAD `32b70a8` (origin/main — inclut le fix android PACK_MISSING `32b70a8` + les commits voix/PIN `7e0acca`→`4f08aac`) — audit transversal : 127 routes API (`src/app/api/**`), libs d'auth/permissions, RLS/migrations/seed/pgTAP, cible native Android (manifest, config réseau, 8 fichiers Java `ci.julaba.app`), chaîne d'approvisionnement build, dépendances npm
- **Contexte de churn** : **120 commits / 396 fichiers (+44 190 / −14 272)** depuis AUDIT-005 (`356f1dc`) — familles nouvelles auditées pour la première fois : moteur marketplace (9 tables + 5 RPC), loyalty (8 tables), canal de cotisation Keiwa, rôle `institution`, routage langue « Tata » STT, confirmation vocale du code PIN
- **Méthode** : 3 agents d'exploration en parallèle (surface API / libs auth + schéma / natif + supply chain) puis **relecture ligne à ligne** de chaque finding majeur par l'auditeur, avec gates exécutées
- **Baseline exécutée** : vitest **2302/2302** (169 fichiers) · `tsc --noEmit` **0** · `eslint .` **0** · `bun run build` **OK** · `bun audit` **56** (1 critical, 37 high, 16 moderate, 2 low — stable vs AUDIT-005, chaînes build/dev uniquement)
- **Note d'intégrité** : audit conduit sur un environnement reconstruit deux fois dans la journée (resets sandbox) ; le dépôt audité est un re-clone vérifié de `origin/main` (HEAD lu `32b70a8`, arbre propre). Aucune correction n'est appliquée par cette passe : le présent rapport constate et priorise.

**Clés de lecture** : **[VÉRIFIÉ]** = relu ligne à ligne par l'auditeur (fichier:ligne cité) · **[AGENT]** = finding d'exploration avec preuve citée, non re-relu en détail · **[PORTOR]** = action impossible depuis le code.

---

## 1. Verdict en une phrase

**Un P0 financier** (RPC de cotisation Keiwa SECURITY DEFINER exposée à `anon` — débit de wallet sans authentification), **2 P1** (compte back-office actif provisionné par migration avec mot de passe public ; downloader de pack vocal qui tronque silencieusement les fichiers et peut réintroduire le crash natif corrigé par `32b70a8`), **8 P2 et 17 P3** — aucun finding n'est une régression des correctifs AUDIT-005, tous intacts : ce sont des failles **nouvelles du code ajouté depuis**.

## 2. Synthèse des constats

| N° | Sévérité | Constat | Preuve | Traitement recommandé |
|---|---|---|---|---|
| A11-F01 | **P0** | RPC `cooperative_cotiser_keiwa` SECURITY DEFINER **sans revoke** : appelable via la clé anon PostgREST, débit de wallet Keiwa sans session ni PIN | migration `20260923110000:41-49,157` | **HOTFIX** (§5.1) |
| A11-F02 | **P1** | Migration `20260923120000` provisionne un compte BO **actif** (`institution@julaba.ci`) avec mot de passe `admin123` publié dans git | migration `:9-22` | **CORRIGER** (§5.2) |
| A11-F03 | **P1** | `model-downloader.ts` écrit chaque bloc **sans `append: true`** → le fichier final ne contient que le dernier bloc 512 Ko ; corrompu mais accepté (seul `length() > 0` est exigé nativement) → sherpa `exit()` = crash corrigé par `32b70a8` réintroduit par la voie « corrompu » | `src/lib/voice/packs/model-downloader.ts:151-155,168-172` ; `SherpaSttPlugin.java:362` | **CORRIGER** avant release `voice-models-v1` (§5.3) |
| A11-F04 | P2 | `/api/auth/lookup` pré-auth **sans aucun quota** : énumération de comptes + oracle de configuration (role, firstName, phone, authMethods[]) | `src/app/api/auth/lookup/route.ts:21-107` | Garde IP partagée (§5.4) |
| A11-F05 | P2 | `/api/cooperatives/cooperateurs` : GET pré-auth sans quota (oracle) ; POST auto-provisioning illimité (spam comptes/coopératives) | `src/app/api/cooperatives/cooperateurs/route.ts:23-51,53-178` | Garde IP + quota POST |
| A11-F06 | P2 | `/api/v1/auth/otp` : envoi OTP pré-auth sans quota avec `shouldCreateUser: true` → SMS pumping + création massive d'identités | `src/app/api/v1/auth/otp/route.ts:24-27` | Quota IP avant appel |
| A11-F07 | P2 | Open redirect `/api/v1/auth/callback` : `next=//evil.com` passe le contrôle `startsWith('/')` | `src/app/api/v1/auth/callback/route.ts:8,13` | Rejeter `//` et `\` |
| A11-F08 | P2 | Frontière de zone non appliquée sur `/api/backoffice/ventes` pour `gestionnaire_zone` : CA horaire, tickets, transcripts et téléphones de TOUTES les zones | `src/app/api/backoffice/ventes/route.ts:56-175` | Forcer `eq('zone', …)` ou retirer le rôle du module |
| A11-F09 | P2 | `force_password_change` purement UI : session BO pleinement valide émise AVANT rotation, flag jamais consulté serveur | `login/route.ts:101,119-121` ; 0 occurrence dans `backoffice-auth/` | Refuser les routes BO tant que le flag est vrai |
| A11-F10 | P2 | Seed : 7 comptes PIN (merchant-4..7, producteur-4..6) avec hash **hex invalide** (caractères `g`–`s`) → connexions impossibles ; le garde-fou vitest n'extraie que les 12 comptes commentés → la garantie « jamais de hash non scrypt » n'est plus exhaustive | `supabase/seed.sql:787-797` ; `seed-pin-hashes.test.ts:33,42-48` | Régénérer + élargir le test |
| A11-F11 | P2 | `VoiceServicePlugin` construit recognizeurs avec AssetManager **non null** sur des chemins **absolus** — contredit le contrat sherpa documenté dans SherpaStt (exit(255)) ; `32b70a8` n'a corrigé que SherpaStt | `VoiceServicePlugin.java:719,768` vs `SherpaSttPlugin.java:125-130` | Motif conditionnel SherpaStt + banc device |
| A11-F12 | P3 | `/api/backoffice/cooperatives` : filtre périmètre appliqué à `operateur_terrain` seulement, pas à `gestionnaire_zone` (l'autre rôle zoné) | `backoffice/cooperatives/route.ts:46-49` | Étendre le filtre |
| A11-F13 | P3 | Fuite d'erreur brute (`error.message` Postgres) sur création de mission — seule occurrence des 127 routes | `backoffice/missions/route.ts:149` | Message générique |
| A11-F14 | P3 | Module marketplace terrain : messages d'erreur Postgres renvoyés verbatim (contrat « codes métier » trop large, erreurs non métier incluses) | `api/marketplace/route.ts:12-17` ; `orders/[id]/route.ts:64-86` | Mapper les codes connus |
| A11-F15 | P3 | `/api/backoffice/users` : `role` écrit sans validation contre `BoRole` | `backoffice/users/route.ts:32-36,92-96` | `z.enum(BoRole)` |
| A11-F16 | P3 | `besoins/consolider` : `\` non échappé avant `[%_]` → LIKE pattern malformé → 500 | `cooperatives/besoins/consolider/route.ts:41-42` | Échapper `\` d'abord |
| A11-F17 | P3 | `/api/marketplace` GET public expose le `phone` des vendeurs (harvest anonyme possible) — vraisemblablement by-design, à décider | `api/marketplace/route.ts:20-41` | Décision produit |
| A11-F18 | P3 | `loyalty_refresh_level` SECURITY DEFINER sans revoke (classe SEC-813, inoffensif : recalcul idempotent) | `20260921180000:191-212` | Revoke service_role |
| A11-F19 | P3 | pgTAP figé à `plan(174)` : **aucune** assertion RLS sur les 8 tables loyalty, 9 tables marketplace, canal keiwa | `supabase/tests/rls.sql:3` | Compléter les assertions |
| A11-F20 | P3 | PIN en clair (courant + ancien) persistés dans la file offline localStorage, lisibles par tout script de la WebView | `src/lib/marchand-pin.ts:48,58,68` ; `offline-db.ts:7-9,107` | Hasher avant mise en file |
| A11-F21 | P3 | Clés API « demo » en clair dans le seed (`legacy-api-key-001`…) — aucun consommateur, hygiène | `supabase/seed.sql:485,1381-1382` | Neutraliser/hasher |
| A11-F22 | P3 | `VoicePackPlugin.safeSegment` n'exclut pas `..` (divergence avec `PluginGuards.safeSegment`) | `VoicePackPlugin.java:57-62` | Réutiliser PluginGuards |
| A11-F23 | P3 | `VoicePackPlugin.validateUrl` accepte tout `https://` (vs allow-list `requireAllowedUrl`) — mitigé par SHA-256 obligatoire | `VoicePackPlugin.java:364-366` | Harmoniser |
| A11-F24 | P3 | Préfixes `http://10.` / `http://192.168.` trop larges (`10.evil.com` passe) — backstop réel : NSS bloque le cleartext | `PluginGuards.java:98-99` | Matcher les littéraux IP |
| A11-F25 | P3 | `SherpaSttPlugin.initModel` ne libère pas recognizer/stream précédents (fuite mémoire native en ré-init répétée) | `SherpaSttPlugin.java:130-131` | `release()` avant réassignation |
| A11-F26 | P3 | `VoiceModelPaths.java` entièrement morte + pointe un layout trompeur (`filesDir/models/` vs réel `filesDir/voice-models`) | `VoiceModelPaths.java:13-26` | Supprimer |
| A11-F27 | P3 | Dépendance morte `onnxruntime-web` (0 import ; surface supply chain inutile) | `package.json:90` | Retirer |
| A11-F28 | P3 | FileProvider `external-path path="."` (périmètre large, template stock ; provider non exporté → risque faible) | `res/xml/file_paths.xml` | Scoper au dossier images |

**Note d'élévation** : `normalizeIp` lit le premier maillon de `X-Forwarded-For` (`auth-pin.ts:116-120`). Correct derrière le Caddy actuel (`header_up … {remote_host}` remplace l'en-tête) et sur Vercel ; derrière un proxy qui **concatène**, le premier maillon est choisissable par le client → A11-F04/F05/F06 passent P1 (contournement du verrou IP par rotation XFF ; le verrou **par compte** reste). À figer par règle de déploiement.

## 3. Détail des constats majeurs [VÉRIFIÉ]

### 3.1 A11-F01 (P0) — RPC `cooperative_cotiser_keiwa` exposée à anon

**Constat** : la migration `20260923110000_cotisation_canal_keiwa.sql` crée (l.41-50) `cooperative_cotiser_keiwa(p_cooperative_id uuid, p_marchand_id text, p_montant integer, p_description text, p_client_id text)` en `security definer set search_path = public` — et le fichier se termine l.157 (`$$;`) **sans aucun revoke/grant**. Or le dépôt documente lui-même le défaut (`20260921100000_revoke_rpc_post_audit.sql:5-8` : Supabase accorde EXECUTE à `anon` + `authenticated` à la création) et la classe de régression SEC-813 : les 5 RPC marketplace créées LE MÊME JOUR portent toutes leurs revokes (`20260923130000:419-425`, `20260923130100:73`, `20260923130200:118`, `20260923140000:48`) — seule la RPC keiwa a été oubliée. Vérifié par balayage : aucun `revoke` ne la cible nulle part dans `supabase/`.

**Impact** : via la clé anon (publique par design, embarquée dans l'APK et le bundle web), n'importe qui peut appeler la RPC sur PostgREST avec `p_marchand_id`/`p_cooperative_id` arbitraires. Les gardes internes existent (membre actif l.76-84, règle annuelle l.90-98, idempotence l.61-70) mais **aucune n'authentifie l'appelant** : un tiers peut **débiter le wallet Keiwa de tout marchand membre actif d'un montant arbitraire** (verrou `for update` l.108-111, débit l.122-125, écriture de trésorerie `'validee'` l.138-144, flag d'adhésion l.147-149) et créer des wallets (get-or-create l.104-106). Pas d'enrichissement direct pour l'attaquant — sabotage financier et corruption du livre de trésorerie, à l'égal de S-01/AUDIT-003 (P0).

**Correctif** : migration `20260924xxxxxx_revoke_cotiser_keiwa.sql` — `revoke all on function public.cooperative_cotiser_keiwa(uuid,text,integer,text,text) from public, anon, authenticated; grant execute … to service_role;` + assertion pgTAP ACL + **push hébergé immédiat** (cf. §6 : la migration mère est peut-être DÉJÀ appliquée en prod — le P0 y serait alors actif).

### 3.2 A11-F02 (P1) — compte BO `admin123` provisionné par migration

**Constat** : `20260923120000_create_institution_demo_account.sql:9` documente en clair « Mot de passe : admin123 » et insère (l.13-23) un compte BO **actif** (`is_active: true`) dans `bo_users`. Contrairement à `supabase/seed.sql` (bases locales uniquement), **une migration s'applique à la base hébergée** : si appliquée en prod (cf. F-02 AUDIT-005 — migrations hébergées en retard, donc probablement pas encore), un login back-office réel est disponible avec un mot de passe publié dans un dépôt public. Le rôle `institution` est lecture seule (`backoffice-permissions.ts:159-167` — dashboard, acteurs, audit, rapports) : pas d'écriture, mais lecture de données métier réelles + point d'ancrage (le hash scrypt ne protège rien puisque le plaintext est dans git).

**Correctif** : ne pas provisionner de compte réel par migration — passer par seed local uniquement, ou mot de passe aléatoire + `force_password_change` (qui, voir A11-F09, doit d'abord devenir effectif côté serveur) ; purger le plaintext du commentaire et de `scripts/test-auth-all-accounts.ts:67-96` / `bo-auth-screen.tsx:168` avant mise en prod du back-office.

### 3.3 A11-F03 (P1) — downloader de pack vocal : écritures qui tronquent

**Constat** : `model-downloader.ts:151-155` et `168-172` appellent `Filesystem.writeFile({ path, directory: Directory.Data, data: toBase64(merged) })` **sans `append: true`** — le contrat `@capacitor/filesystem` tronque le fichier à chaque écriture. Le flux d'écriture par blocs (512 Ko, l.133-160) écrase donc le fichier à chaque bloc : le fichier final ne contient que le **dernier bloc**. La reprise (`isFileOnDisk` l.202-205) skippe tout fichier non vide → le fichier tronqué est considéré complet. Côté natif, `resolveModelFile` n'exige que `length() > 0` (`SherpaSttPlugin.java:362`, `VoiceServicePlugin.java:850`) → sherpa-onnx reçoit un modèle corrompu et **appelle `exit()`** — le crash exact corrigé par `32b70a8` (PACK_MISSING), réintroduit par la voie « corrompu » au lieu d'« absent ». Latent tant que la release `voice-models-v1` n'est pas publiée ; le cas échéant, tout téléchargement de pack bci/dyu depuis l'APK crasherait l'app.

**Correctif** : `append: true` sur les trois `writeFile` (premier bloc inclus, fichier créé vide avant) — ou accumulation mémoire + écriture unique ; ajouter la taille attendue + SHA-256 par fichier dans le registry des packs et refuser toute divergence AVANT le marquage « installé » ; tester l'install complète sur device.

### 3.4 P2 — résumés vérifiés

- **A11-F04** : `src/app/api/auth/lookup/route.ts` — 0 occurrence de `checkIpLock`/`recordIpFailure`/`auth_lockouts` (vérifié) ; réponse `found/role/firstName/phone/authMethods` (l.60-105) : énumération + oracle hors des verrous existants. Même garde que `/api/identificateur/auth/lookup` (qui, elle, est correctement branchée).
- **A11-F05** : GET/POST `cooperateurs` volontairement pré-auth mais sans quota ; POST insère comptes + coopérative (l.53-178).
- **A11-F06** : `signInWithOtp({ …, shouldCreateUser: true })` sans garde préalable — la 429 ne vient que de Supabase.
- **A11-F07** : `next=//evil.com` passe `startsWith('/')` (l.8) et `new URL(next, origin)` l.13 produit `https://evil.com/`.
- **A11-F08** : `/api/backoffice/ventes` — aucun forçage de `zone` pour `gestionnaire_zone` (à comparer avec `information-requests/route.ts:46` qui filtre correctement) ; réponse inclut `merchantPhone` (l.146).
- **A11-F09** : `force_password_change` — **0 occurrence** dans `src/lib/backoffice-auth/` (vérifié) : `getSessionUser` et `requireBackofficePermission` ne consultent jamais le flag ; session émise avant tout contrôle (l.101,119-121).
- **A11-F10** : `seed.sql:787-797` — les 7 hashes contiennent des caractères hors hex (`g`–`s`, visibles : `…ggghhhiijj…`) ; `verifyCode` tronque le `Buffer.from(…,'hex')` → toujours false ; le test n'extraie que les lignes commentées `-- PIN \d{4}$` (12/19).
- **A11-F11** : `VoiceServicePlugin.java:719,768` — `new Online/OfflineRecognizer(getContext().getAssets(), config)` sur chemins absolus ; contrat sherpa documenté à `SherpaSttPlugin.java:125-130` (assetManager null obligatoire, exit(255) sinon). Réserve : comportement exact de l'AAR 1.13.8 à valider sur device (banc vocal complet fr/bci/dyu).

## 4. Ce qui a été vérifié SANS action [VÉRIFIÉ/AGENT]

- **Correctifs AUDIT-005 tous intacts** (preuves fichier:ligne dans les rapports d'exploration) : `sanitizeSearchTerm`/`isUuid` branchés (actors:15,27 ; audit:18,33 ; contenus:49,57 ; cooperatives:36-39) ; **aucune nouvelle interpolation PostgREST non protégée** sur les 127 routes (loyalty `${role}` validé zod ; transfers `${merchantId}` lié session ; notifications whitelistée ; mutations ILIKE échappé) ; garde IP partagée login BO + lookup ident, `phone` absent de la réponse lookup ; pas de route racine « Hello, world! » ; plus aucune Map process pour les quotas ; `canAccessZone` fail-closed (`permission.ts:50-55`) ; seed 12 PIN scrypt + garde vitest (nuance A11-F10) ; `bo_mfa_challenges` toujours morte ; RPC `record_backoffice_auth_failure` atomique branchée ; `allowBackup=false` + NSS stricte (diff vide depuis `d3cd669`) ; PluginGuards appliqués (LiteRt version+URL+SHA, Sherpa, VoiceService, VoicePack zip-slip protégé) ; `fetch-android-deps.sh` SHA-256 épinglés + vérif systématique ; aucune signingConfig/secret versionné.
- **Le rework SherpaStt de `32b70a8` relu ligne à ligne — sain** : `resolveModelFile` strict (l.352-390), `IOException PACK_MISSING` avant toute construction (l.380-384), catch/reject propre (l.94-101), `assetManager=null` (l.129-130), boucle d'écoute robuste sans log de transcript (l.251-309), `handleOnDestroy` libère (l.392-410) ; `ensureSherpaReady` TS cohérent (`stt-factory.ts:173-190`).
- **PIN vocal** (`00ed8c4`/`4f08aac`) : le code PIN **n'est plus énoncé** par Tata (`auth-code-flows.ts:412-416` → « Dites oui ou non. ») ; aucun log de PIN/token natif ni TS.
- **RLS des nouvelles familles** : cooperatives (7 tables enable, deny-all), loyalty (8 tables, self-read bornées, audit_logs deny-all), marketplace (9 tables deny-all + 4 RPC revoked) — seulement A11-F18 (loyalty_refresh_level) et A11-F19 (couverture pgTAP) en marge.
- **Sessions/cookies** : BO httpOnly/sameSite/secure(prod), TTL 12 h, rotation, sha256 en base, `is_active` relu à chaque requête ; appareils TTL 365 j + révocation douce + takeover uniquement après code de liaison one-shot atomique.
- **Surface client** : `createSupabaseAdminClient` derrière `server-only`, 0 import client ; `NEXT_PUBLIC_*` limité à URL/anon/modèle ; aucun `eval` ; comparaisons timing-safe (`password.ts:31-39`, `auth-pin.ts:67-90`) ; IDOR : tous les `[id]` vérifient le périmètre.
- **`bun audit` 56** — stable vs AUDIT-005, chaînes build/dev uniquement (tar critical via capacitor/cli + onnxruntime-node, browserslist, picomatch, lodash, minimatch) ; rien dans le bundle runtime WebView.

## 5. Plan de correction recommandé

> **Exécution (MODE-1003, Task 159 — même jour)** : plan exécuté à la demande du porteur.
> Statut par point : ✅ traité · ⏸️ reporté motivé · 📋 décision à prendre.

1. **HOTFIX P0 (A11-F01)** ✅ — migration `20260924100000_revoke_cotiser_keiwa.sql` + 4 assertions pgTAP ACL (plan 21→25). **Le push hébergé Supabase reste à faire par le porteur** (credential DB) — c'est le seul constat actif côté prod dès que la migration mère y est appliquée.
2. **P1** ✅ — A11-F02 (migration `20260924110000` : compte désactivé + hash jeté côté hébergé ; compte démo déplacé en seed local ; purge du plaintext des écrans/scripts conservée comme précondition de mise en prod réelle — cf. DEBT A11-F02) ; A11-F03 (`appendFile()` + fichier vide préalable + gardes transport/disque/sha256+sizeBytes avant « installé » ; `sha256.ts` incrémental testé FIPS + différentiel ; registry optionnel en attente des empreintes de la release — `publish-voice-models.sh` les émet).
3. **P2** ✅ — F04-F06 gardes IP/quota (lookup, cooperateurs GET+POST, otp) ; F07 `isSafeNextPath` (rejet `//` et `\`) ; F08 zone ventes serveur fail-closed (J-1 zonée) ; F09 `force_password_change` bloquant serveur (change-password = seule sortie) ; F10 hashes régénérés (19/19) + garde exhaustif à commentaire PIN obligatoire ; F11 motif AssetManager appliqué à VoiceServicePlugin (banc device toujours requis 📋, cf. §6.5).
4. **P3** ✅ sauf deux — F12 zone cooperatives ; F13 message générique ; F14 registre fermé des codes métier marketplace (`marketplace-errors.ts`) ; F15 `estBoRole` ; F16 backslash d'abord ; F18 revoke loyalty_refresh_level (`20260924120000`) ; F19 rls.sql +36 assertions (plan 174→210) ; F21 clés API neutralisées ; F22/F23/F24/F25/F26/F27/F28 natif+hygiène traités. **⏸️ A11-F17** 📋 décision produit (exposition phone). **⏸️ A11-F20** — requiert un changement de CONTRAT serveur (l'API vérifie l'ancien PIN brut ; le rejeu offline verbatim MODE-943 doit le rester) → dette documentée (DEBT_REPORT).
5. **Règle de déploiement** 📋 — garantir le remplacement (non-concaténation) de `X-Forwarded-For` par le frontal — sinon élever F04-F06 en P1 (dépôt en DEBT_REPORT, action porteur/infra).

Java (F11, F22-F26, F28) modifié sans compilation possible dans l'environnement (toolchain perdue aux resets) : correctifs mécaniques calqués sur les motifs existants du dépôt — **compilation + banc vocal device à la prochaine reconstruction APK**.

## 6. Rappels porteur

1. **Appliquer les migrations hébergées** (récurrent F-02/AUDIT-005) — devenu urgent : A11-F01/F02 sont des migrations, leur application en prod doit être accompagnée du hotfix revoke ;
2. **Rotation des clés Supabase** (SEC-402 — la service_role reste dans l'historique public) ;
3. **Révoquer le PAT** partagé dans le chat (10ᵉ+ usage) — tout push futur exigera un token neuf one-shot ;
4. **APK release signé** à reconstruire après correctifs (le `32b70a8` actuel corrige le crash mais la chaîne pack vocal A11-F03 doit être fixée avant la release `voice-models-v1`) ;
5. **Banc vocal sur appareil réel** (fr push-to-talk + install pack bci/dyu) pour trancher A11-F11.
