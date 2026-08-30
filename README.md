# Jùlaba — Plateforme Commerciale Multi-Acteurs

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.0-2D3748?logo=prisma)](https://www.prisma.io/)
[![Bun](https://img.shields.io/badge/Bun-1.0-F9F1E0?logo=bun)](https://bun.sh/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.0-119EFF?logo=capacitor)](https://capacitorjs.com/)

**Jùlaba** est une plateforme commerciale multi-acteurs conçue pour les marchés émergents. Elle permet aux commerçants, agents identificateurs, producteurs et administrateurs de gérer leurs activités quotidiennes via une application mobile offline-first avec commande vocale en français.

## 📋 Table des Matières

- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Technologies](#-technologies)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Démarrage](#-démarrage)
- [Structure du Projet](#-structure-du-projet)
- [Commandes Disponibles](#-commandes-disponibles)
- [Base de Données](#-base-de-données)
- [Tests](#-tests)
- [Déploiement](#-déploiement)
- [Modules](#-modules)
- [Contribuer](#-contribuer)
- [Licence](#-licence)

## ✨ Fonctionnalités

### Pour les Commerçants (Marchands)
- **Gestion de Caisse** : Suivi des ventes et encaissements
- **Gestion de Stock** : Inventaire des produits avec catégorisation
- **Suivi des Dépenses** : Traçabilité des dépenses par catégorie
- **Historique des Ventes** : Consultation des transactions passées
- **Commande Vocale** : Interface hands-free en français pour saisir ventes et dépenses
- **Mode Offline** : Fonctionnement complet sans connexion internet
- **Tontines** : Gestion des cotisations solidaires
- **Programme de Fidélité** : Gestion des clients fidèles

### Pour les Agents Identificateurs
- **Identification sur Terrain** : Enrôlement des nouveaux commerçants
- **Suivi des Dossiers** : Tracking des soumissions en temps réel
- **Brouillons** : Sauvegarde locale des dossiers incomplets
- **Synchronisation** : Sync automatique lors du retour en ligne

### Pour les Producteurs Agricoles
- **Gestion des Récoltes** : Suivi quantitatif et qualitatif
- **Commandes** : Gestion des commandes clients
- **Cycles de Production** : Planification et suivi
- **Stocks** : Gestion des inventaires agricoles

### Pour les Administrateurs (Backoffice)
- **Tableau de Bord** : Vue d'ensemble des activités
- **Gestion des Acteurs** : Administration des comptes marchands, identificateurs, producteurs
- **Supervision** : Monitoring des opérations en temps réel
- **Rapports & Analytics** : Statistiques et insights business
- **Gestion des Zones** : Organisation géographique
- **Modération IA** : Supervision des modèles d'intelligence artificielle
- **Clés API** : Gestion des accès programmatiques
- **Communication** : Envoi de notifications et annonces

## 🏗️ Architecture

### Single Page Application (SPA)
- **Route Unique** : `/` - Toute la navigation est gérée côté client
- **État Global** : 5 stores Zustand avec persistance localStorage
- **Rendu Hybride** : Next.js App Router avec composants clients majoritaires

### Offline-First
- **Base Locale** : SQLite embarqué via Capacitor
- **File d'Attente** : Mutations mises en queue et synchronisées automatiquement
- **Gestion des Conflits** : Résolution intelligente des conflits de sync

### Voice-First UI
- **Reconnaissance Vocale** : Web Speech API + Sherpa ONNX
- **Synthèse Vocale** : Piper TTS + Web Speech API
- **Wake Word** : Détection de mot d'éveil "Hey Jùlaba"
- **NLU Locale** : Classification d'intents via Transformers.js

## 🛠️ Technologies

| Catégorie | Technologie |
|-----------|-------------|
| **Framework** | Next.js 16 (App Router) |
| **Langage** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 + shadcn/ui |
| **Icônes** | Lucide React |
| **État** | Zustand + persist middleware |
| **Base de Données** | Prisma + SQLite |
| **Mobile** | Capacitor 8 (iOS/Android) |
| **Voice** | Web Speech API, Sherpa ONNX, Piper TTS |
| **Charts** | Recharts (backoffice) |
| **Runtime** | Bun |
| **Tests** | Vitest |
| **Linting** | ESLint 9 |

## 📦 Prérequis

- **Node.js** : v20+ ou **Bun** : v1.0+
- **npm** ou **bun** comme gestionnaire de paquets
- **Git** pour le versioning

## 🚀 Installation

```bash
# Cloner le repository
git clone https://github.com/votre-org/julaba.git
cd julaba

# Installer les dépendances
bun install

# Générer le client Prisma
bun run db:generate

# Configurer la base de données
bun run db:push

# (Optionnel) Seeder la base de données
bun run seed
```

## ▶️ Démarrage

```bash
# Mode développement
bun run dev

# L'application sera disponible sur http://localhost:3000
```

## 📁 Structure du Projet

```
julaba/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # Routes API
│   │   ├── globals.css         # Styles globaux
│   │   ├── layout.tsx          # Layout racine
│   │   └── page.tsx            # Route unique (SPA)
│   ├── components/
│   │   ├── ui/                 # Composants shadcn/ui (non modifiables)
│   │   ├── marchand/           # Écrans commerçants (*-screen.tsx)
│   │   ├── identificateur/     # Écrans agents (ident-*-screen.tsx)
│   │   ├── producteur/         # Écrans producteurs (prod-*-screen.tsx)
│   │   ├── backoffice/         # Écrans admin (bo-*-screen.tsx)
│   │   └── shared/             # Composants partagés
│   ├── lib/
│   │   ├── stores/             # Stores Zustand (app-store, backoffice-store, etc.)
│   │   ├── voice/              # Sous-système vocal (stt, tts, nlu, wake-word)
│   │   ├── backoffice-auth/    # Authentification backoffice
│   │   ├── hooks/              # Hooks personnalisés
│   │   ├── vision/             # Vision par ordinateur
│   │   ├── db.ts               # Singleton client Prisma
│   │   ├── utils.ts            # Utilitaires (cn, formatFCFA)
│   │   ├── capacitor.ts        # Intégration Capacitor
│   │   ├── offline-db.ts       # Base offline SQLite
│   │   └── sync-handlers.ts    # Handlers de synchronisation
│   └── hooks/                  # Hooks React personnalisés
├── prisma/
│   ├── schema.prisma           # Schéma de base de données
│   └── seed.ts                 # Script de seeding
├── tests/                      # Scripts de test runtime
├── docs/                       # Documentation technique
│   ├── CAPACITOR.md            # Guide Capacitor
│   ├── IA_LOCALE.md            # IA locale (voice, NLU)
│   ├── OFFLINE.md              # Architecture offline
│   └── SHERPA_ONNX.md          # Configuration Sherpa ONNX
├── public/                     # Assets statiques
├── android/                    # Projet Android Capacitor
├── ios/                        # Projet iOS Capacitor
└── capacitor-www/              # Build web pour Capacitor
```

## ⌨️ Commandes Disponibles

| Commande | Description |
|----------|-------------|
| `bun run dev` | Démarrer en mode développement |
| `bun run build` | Construire pour la production |
| `bun run start` | Démarrer le serveur de production |
| `bun run lint` | Linter le code avec ESLint |
| `bun run test` | Exécuter les tests unitaires |
| `bun run test:watch` | Tests en mode watch |
| `bun run db:push` | Push du schéma Prisma vers la DB |
| `bun run db:generate` | Générer le client Prisma |
| `bun run db:migrate` | Créer et appliquer une migration |
| `bun run db:reset` | Reset complet de la base de données |
| `bun run seed` | Seeder la base de données |

## 🗄️ Base de Données

### Configuration

La base de données est configurée via la variable d'environnement `DATABASE_URL` dans `.env` :

```env
DATABASE_URL=file:./custom.db
```

### Modèles Principaux

- **Merchant** : Commerçants avec authentification PIN/pattern/visuel
- **Product** : Produits avec stock et prix
- **Sale** : Ventes avec items associés
- **Expense** : Dépenses catégorisées
- **CaisseSession** : Sessions de caisse quotidiennes
- **BoActor** : Acteurs système (marchands, identificateurs, producteurs)
- **DeviceSession** : Sessions device-binding pour sécurité
- **Notification** : Notifications in-app

### Migrations

```bash
# Créer une nouvelle migration
bun run db:migrate

# Appliquer les migrations existantes
bun prisma migrate deploy
```

## 🧪 Tests

Les tests sont écrits avec **Vitest** et suivent la convention `*.test.ts` ou `*.test.tsx`.

```bash
# Exécuter tous les tests
bun run test

# Mode watch pour le développement
bun run test:watch
```

### Structure des Tests

```
src/
└── lib/
    └── voice/
        └── __tests__/
            ├── nlu-ml.test.ts      # Tests classification intents
            ├── tata-tts.test.ts    # Tests synthèse vocale Tata
            ├── localIntent.test.ts # Tests intents locaux
            └── piper-tts.test.ts   # Tests synthèse vocale Piper
```

### Écrire un Test

```typescript
import { describe, it, expect } from 'vitest'
import { maFonction } from '@/lib/mon-module'

describe('maFonction', () => {
  it('devrait retourner la valeur attendue', () => {
    expect(maFonction('input')).toBe('output')
  })
})
```

## 🚢 Déploiement

### Build de Production

```bash
# Construire l'application
bun run build

# Le output standalone est dans .next/standalone/
```

### Docker (Optionnel)

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build
CMD ["bun", ".next/standalone/server.js"]
```

### Reverse Proxy

L'application utilise **Caddy** comme reverse proxy (voir `Caddyfile`).

## 📱 Modules Mobiles

### Capacitor

Configuration dans `capacitor.config.ts` :

```typescript
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.julaba.app',
  appName: 'Jùlaba',
  webDir: 'capacitor-www',
  // ... autres configurations
}
```

### Plugins Capacitor

- **Biometric Auth** : Authentification biométrique
- **Secure Storage** : Stockage sécurisé des credentials
- **SQLite** : Base de données locale
- **Camera** : Prise de photos
- **Geolocation** : Positionnement GPS
- **Push Notifications** : Notifications push
- **Background Runner** : Tâches en arrière-plan

### Build Mobile

```bash
# Sync vers les plateformes mobiles
npx cap sync

# Ouvrir Android Studio
npx cap open android

# Ouvrir Xcode
npx cap open ios
```

## 🔐 Sécurité

### Device Binding

Chaque appareil est lié à un compte utilisateur via `DeviceSession` :

- Première réclamation gagne (first-claim-wins)
- Token hash stocké côté serveur
- Cookie de session device requis pour toutes les API calls

### Authentification

- **Marchands/Producteurs/Identificateurs** : PIN/Pattern/Code visuel (local)
- **Backoffice** : JWT server-side via NextAuth

## 🌍 Internationalisation

- **Langue** : Français (standard)
- **Devise** : FCFA (Franc CFA) - affiché via `formatFCFA()`
- **Fuseaux Horaires** : UTC avec conversion locale

## 📊 Backoffice

Le backoffice utilise un thème sombre/clair géré manuellement (pas de `dark:` Tailwind).

### Rôles et Permissions

Voir `src/lib/backoffice-permissions.ts` pour la matrice des permissions.

## 🤝 Contribuer

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amelioration`)
3. Commit des changements (`git commit -m 'Ajouter fonctionnalité'`)
4. Push vers la branche (`git push origin feature/amelioration`)
5. Ouvrir une Pull Request

### Guidelines

- Utiliser **Lucide React** pour les icônes (pas d'emojis)
- Textes en **français standard**
- Montants en **entiers** (FCFA)
- Suivre le **Product Design Skill** (voir `.agents/skills/product-design/SKILL.md`)

## 📄 Licence

Propriétaire - Tous droits réservés.

## 📞 Support

Pour toute question ou problème, veuillez ouvrir une issue sur le repository GitHub.

---

**Jùlaba** - Donner du pouvoir aux acteurs économiques des marchés émergents 🚀
