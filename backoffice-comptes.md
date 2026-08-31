# Comptes de Connexion - Julàba BackOffice

> Interface d’administration sécurisée | RBAC 5 rôles

---

## Comptes de Démonstration

| # | Rôle | Email | Mot de passe | Zone assignée | Statut |
|---|-------|-------|--------------|------------------|--------|
| 1 | **Super Admin** | `aminata@julaba.ci` | `admin123` | — (global) | Actif |
| 2 | **Admin Général** | `koffi@julaba.ci` | `admin123` | — (global) | Actif |
| 3 | **Admin National** | `moussa@dge.ci` | `admin123` | National | Actif |
| 4 | **Gestionnaire Zone** | `fatou@julaba.ci` | `admin123` | Adjamé | Actif |
| 5 | **Opérateur Terrain** | `jean@julaba.ci` | `admin123` | Adjamé | Actif |
| 6 | **Gestionnaire Zone** | `affi@julaba.ci` | `admin123` | Bouaké | Actif |
| 7 | **Opérateur Terrain** | `yao@julaba.ci` | `admin123` | Kong | **Inactif** |

**Code MFA** : il n'y a plus de code fixe accepté en toute circonstance — chaque connexion génère un code aléatoire à 6 chiffres, à usage unique, valable 5 minutes. Aucun canal d'envoi (SMS/email) n'est encore branché, donc pour un test manuel local, définissez la variable d'environnement `BACKOFFICE_MFA_TEST_CODE` (ignorée en production) plutôt que de chercher le code dans les logs — il n'y est jamais écrit.

---

## Détail des Rôles & Permissions

### 1. Super Admin (`super_admin`)
- **Nom** : Aminata KONÉ
- **Email** : `aminata@julaba.ci`
- **Organisation** : Direction Jùlaba
- **Access** : **Tous les 24 modules** (lecture, écriture, suppression)
- **Droits spécifiques** :
  - Gestion utilisateurs BO (crủd)
  - Configuration institution
  - API Keys management
  - Event Monitor
  - Cron Dashboard
  - Suppression d’acteurs
  - Export PDF avec armoiries RCI
- **Hierarchie** : Niveau 5 (maximum)

### 2. Admin Général (`admin_general`)
- **Nom** : Koffi YAO
- **Email** : `koffi@julaba.ci`
- **Organisation** : Jùlaba
- **Access** : 17 modules sur 24
- **Modules accessibles** :
  - Dashboard, Acteurs, Enrôlement, Zones, Missions, Institutions,
  - Contenus, Monitoring IA, Marketplace, Livraison, Keiwa, Supervision,
  - Moderation, Mutations, Communication
- **Modules interdits** :
  - ✗ Utilisateurs BO
  - ✗ Rapports (export officiel)
  - ✗ Audit
  - ✗ Analytics Produit
  - ✗ Score Financier
  - ✗ API Keys
  - ✗ Event Monitor
  - ✗ Cron Dashboard
  - ✗ Config Institution
  - ✗ Scores
- **Hierarchie** : Niveau 4

### 3. Admin National (`admin_national`)
- **Nom** : Moussa TRAORÉ
- **Email** : `moussa@dge.ci`
- **Organisation** : DGE / ANSUT
- **Access** : 9 modules sur 24
- **Zone** : National (supervision)
- **Modules accessibles** :
  - Dashboard, Acteurs, Enrôlement, Supervision,
  - Rapports, Audit, Analytics, Scores, Communication
- **Restrictions** :
  - ✗ Pas de suppression d’acteurs
  - ✗ Pas de gestion utilisateurs
  - ✗ Pas de configuration système
- **Hierarchie** : Niveau 3

### 4. Gestionnaire Zone (`gestionnaire_zone`)
- **Comptes** : Fatou SORO (Adjamé) & Affi COULIBALY (Bouaké)
- **Emails** : `fatou@julaba.ci` / `affi@julaba.ci`
- **Access** : 7 modules sur 24
- **Zone** : Limitẻe à sa zone assignée
- **Modules accessibles** :
  - Dashboard, Acteurs, Enrôlement, Zones, Supervision,
  - Moderation, Mutations
- **Droits** :
  - Lecture/Écriture acteurs (sa zone uniquement)
  - Validation/rejet d’enrôlements
  - Consultation audit (sa zone)
- **Hierarchie** : Niveau 2

### 5. Opérateur Terrain (`operateur_terrain`)
- **Comptes** : Jean KOUADIO (Adjamé) & Yao KONAN (Kong, inactif)
- **Emails** : `jean@julaba.ci` / `yao@julaba.ci`
- **Access** : 5 modules sur 24
- **Zone** : Limitẻe à sa zone assignée
- **Modules accessibles** :
  - Dashboard, Acteurs, Enrôlement, Supervision,
  - Moderation, Mutations
- **Droits** :
  - Lecture uniquement sur les acteurs
  - Soumission d’enrôlements
  - Signalement / Moderation
  - Gel d’acteurs (freeze)
- **Hierarchie** : Niveau 1

---

## Matrice des Permissions (24 modules x 5 rôles)

| Module | Super Admin | Admin Gén. | Admin Nat. | Gest. Zone | Opé. Terrain |
|--------|:-----------:|:-------------:|:----------:|:----------:|:--------------:|
| Tableau de bord | ✅ R/W | ✅ R/W | ✅ R/W | ✅ R/W | ✅ R |
| Acteurs | ✅ R/W/D | ✅ R/W | ✅ R/W | ✅ R/W | ✅ R |
| Enrôlement | ✅ R/W | ✅ R/W | ✅ R/W | ✅ R/W | ✅ R/W |
| Zones & Territoires | ✅ R/W | ✅ R/W | ✗ | ✅ R | ✗ |
| Missions | ✅ R/W | ✅ R/W | ✗ | ✅ R | ✗ |
| Supervision | ✅ R/W | ✗ | ✅ R/W | ✅ R | ✅ R |
| Utilisateurs BO | ✅ R/W/D | ✗ | ✗ | ✗ | ✗ |
| Rapports | ✅ R/W | ✗ | ✅ R/W | ✗ | ✗ |
| Audit | ✅ R/W | ✗ | ✅ R | ✅ R | ✗ |
| Institutions | ✅ R/W | ✅ R/W | ✗ | ✗ | ✗ |
| Modération | ✅ R/W | ✗ | ✗ | ✅ R/W | ✅ R/W |
| Mutations | ✅ R/W | ✗ | ✗ | ✅ R/W | ✅ R/W |
| Contenus | ✅ R/W | ✅ R/W | ✗ | ✗ | ✗ |
| Monitoring IA | ✅ R/W | ✅ R/W | ✗ | ✗ | ✗ |
| Event Monitor | ✅ R/W | ✗ | ✗ | ✗ | ✗ |
| Analytics Produit | ✅ R/W | ✗ | ✅ R/W | ✗ | ✗ |
| Score Financier | ✅ R/W | ✗ | ✅ R/W | ✗ | ✗ |
| API Keys | ✅ R/W/D | ✗ | ✗ | ✗ | ✗ |
| Marketplace | ✅ R/W | ✅ R/W | ✗ | ✗ | ✗ |
| Livraison | ✅ R/W | ✅ R/W | ✗ | ✗ | ✗ |
| Communication | ✅ R/W | ✗ | ✅ R/W | ✗ | ✗ |
| Cron Dashboard | ✅ R/W | ✗ | ✗ | ✗ | ✗ |
| Config Institution | ✅ R/W | ✗ | ✗ | ✗ | ✗ |
| Keiwa | ✅ R/W | ✅ R/W | ✗ | ✗ | ✗ |

> **Lẻgende** : ✅ = Accès | R = Lecture | R/W = Lecture/Écriture | R/W/D = Lecture/Écriture/Suppression | ✗ = Interdit

---

## Securité

- **Mots de passe** : scrypt salé (voir `src/lib/backoffice-auth/password.ts`)
- **MFA** : code aléatoire à 6 chiffres par tentative de connexion (pas de TOTP), hashé en SHA-256 côté serveur, à usage unique, expire après 5 min (voir `src/lib/backoffice-auth/mfa.ts`)
- **Session** : cookie httpOnly, token aléatoire hashé en SHA-256, durée fixe de 12h (pas de renouvellement automatique ni de minuteur d'inactivité séparé — voir `src/lib/backoffice-auth/session.ts`)
- **Verrouillage de compte** : 5 échecs de mot de passe puis verrouillage 15 min
- **Rate limiting IP** : 20 requêtes / 5 min par IP (best-effort, en mémoire — pas un substitut à un store partagé en déploiement distribué)
- **Audit** : chaque action est journalisée (`AuditLog` en base — utilisateur, action, module, IP, user-agent), sans signature cryptographique

---

*Jùlaba BackOffice v1.0 | Dernière mise à jour : Août 2026*
