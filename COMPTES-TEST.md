# Comptes de test — Authentification

> **Prérequis — migrations appliquées** : la connexion back-office (et les
> verrous anti-force-brute de TOUTES les applications) exige que les
> migrations Supabase soient appliquées sur la base cible
> (`supabase db push`). Sans `20260921110000_mfa_totp`, l'étape MFA échoue
> en « Erreur lors de la connexion » (colonne `totp_enrolled` inconnue) ;
> sans `20260921130000_auth_lockouts`, les verrous marchand/producteur/coopérateur
> ne fonctionnent pas. `supabase migration list` pour vérifier.

## Backoffice (email + password + MFA TOTP)

| Rôle | Nom | Email | Mot de passe | Actif |
|------|-----|-------|-------------|-------|
| super_admin | Aminata KONE | aminata@julaba.ci | admin123 | ✓ |
| admin_general | Koffi YAO | koffi@julaba.ci | admin123 | ✓ |
| admin_national | Moussa TRAORE | moussa@dge.ci | admin123 | ✓ |
| gestionnaire_zone | Fatou SORO | fatou@julaba.ci | admin123 | ✓ |
| operateur_terrain | Jean KOUADIO | jean@julaba.ci | admin123 | ✓ |
| gestionnaire_zone | Affi COULIBALY | affi@julaba.ci | admin123 | ✓ |
| admin_general | Yao KONAN | yao@julaba.ci | admin123 | ✗ |

> **MFA (MODE-934)** : en production, le second facteur est un **TOTP**
> (application d'authentification). À la première connexion, l'écran affiche
> le **secret base32** à recopier dans Google Authenticator/Authy/Aegis
> (« Saisir une clé de provision ») + l'URI `otpauth://` + **8 codes de
> récupération** à conserver (usage unique). Vérification = code 6 chiffres.
>
> **Mode test (dev uniquement)** : `BACKOFFICE_MFA_TEST_MODE=true` +
> `BACKOFFICE_MFA_TEST_CODE=123456` conserve l'ancien code inline — utiliser
> ce mode pour les comptes de test sans application d'authentification.
>
> ⚠️ **Deux interrupteurs distincts, ne pas confondre** :
> - `BACKOFFICE_MFA_TEST_MODE` — le code 6 chiffres est vérifié inline (dev) ;
> - `BACKOFFICE_MFA_DISABLED` — contournement TOTAL du second facteur.
> Les deux sont **ignorés en production** (`NODE_ENV=production`) même si
> une variable de déploiement est configurée par erreur : en prod, la
> connexion exige l'enrôlement TOTP ci-dessus.
>
> **Un compte « ne fonctionne plus » ? Diagnostic éclair** :
> 1. 401 « Identifiants invalides » → compte absent de `bo_users` (seed
>    non joué sur la base cible) ou compte inactif (yao@julaba.ci) ;
> 2. 500 « Erreur lors de la connexion » après mot de passe OK →
>    migrations non appliquées (voir prérequis en tête de fichier) ;
> 3. 423 → compte verrouillé 15 min (5 échecs) ; 429 → limite IP
>    (20 tentatives / 5 min) ;
> 4. Écran secret/QR en prod → c'est l'enrôlement TOTP NORMAL, pas une
>    panne : recopier le secret dans une application d'authentification.

---

## Marchand (téléphone + PIN)

| Nom | Téléphone | PIN | Catégorie |
|-----|-----------|-----|-----------|
| Awa KONE | 0701020304 | 1234 | détaillant |
| Fatoumata KEITA | 0705060708 | 1235 | détaillant |
| Salimata CISSE | 0501020304 | 1236 | détaillant |
| Bakari DIALLO | 0541111111 | 1111 | détaillant |
| Clarisse BONI | 0542222222 | 2222 | détaillant |

---

## Producteur (téléphone + PIN)

| Nom | Téléphone | PIN |
|-----|-----------|-----|
| Kouadio | 0744444444 | 0000 |
| Moussa | 0123456789 | 0001 |
| Adama | 0177777777 | 0002 |
| Issa | 0543333333 | 3333 |
| Mariam | 0544444444 | 4444 |

---

## Identificateur (téléphone ou code agent JID-XXXX)

| Nom | Téléphone | Code agent | Zone | Actif |
|-----|-----------|------------|------|-------|
| Kouamé Bamba | 0555555555 | JID-0001 | Adjamé | ✓ |
| Fatou Soro | 0700000001 | JID-0002 | Cocody | ✓ |
| Affi Coulibaly | 0700000002 | JID-0003 | Yopougon | ✓ |
| Koffi Diallo | 0700000003 | JID-0004 | Bouaké | ✓ |
| Mariam Ouattara | 0540000005 | JID-0005 | Adjamé | ✓ |
| Ibrahim Traoré | 0540000006 | JID-0006 | Yopougon | ✓ |
| Awa Cissé | 0540000007 | JID-0007 | Bouaké | ✓ |
| Serge N'Guessan | 0540000008 | JID-0008 | San Pedro | ✓ |
| Adjoua Kouamé | 0540000009 | JID-0009 | Korhogo | ✓ |
| Bakary Touré | 0540000010 | JID-0010 | Daloa | ✗ |

> Le PIN identificateur est créé sur l'appareil à la première connexion (jamais stocké en base).
> Le compte désactivé (Bakary Touré) est refusé à la connexion.

---

## Coopérative (téléphone + PIN) — coopérateurs

| Nom | Téléphone | PIN | Coopérative présidée | Commune |
|-----|-----------|-----|---------------------|---------|
| Mariam | 0561111111 | 1234 | Coopérative des femmes de Koumassi | Koumassi |
| Ibrahim | 0562222222 | 1235 | Coopérative agricole de Yopougon | Yopougon |

> Connexion via l'espace coopérative (`/api/cooperatives/cooperateurs/login`,
> même contrat que producteur : code BRUT vérifié côté serveur — MODE-936).
> Les `pin_hash` djb2 historiques du seed sont re-hachés scrypt
> transparentment au premier login réussi. La coopérative présidée est
> résolue serveur via `cooperatives.responsable_id`.

---

## Commande de test

```bash
# Lancer le serveur dev avec MFA test
BACKOFFICE_MFA_TEST_MODE=true BACKOFFICE_MFA_TEST_CODE=123456 bun run dev

# Exécuter les tests d'authentification
bun run scripts/test-auth-all-accounts.ts
```
