# Comptes de test — Authentification

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

> MFA : mode test → `BACKOFFICE_MFA_TEST_CODE=123456`

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

## Commande de test

```bash
# Lancer le serveur dev avec MFA test
BACKOFFICE_MFA_TEST_MODE=true BACKOFFICE_MFA_TEST_CODE=123456 bun run dev

# Exécuter les tests d'authentification
bun run scripts/test-auth-all-accounts.ts
```
