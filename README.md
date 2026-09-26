# Jùlaba

Jùlaba est une application mobile et web offline-first destinée aux acteurs du commerce informel ivoirien. Elle aide les marchandes, producteurs, identificateurs et équipes de back-office à gérer les ventes, la caisse, le stock, les dépenses, les crédits, les commandes et les opérations de terrain.

Le produit est conçu pour fonctionner dans des contextes de connectivité intermittente, avec une interface guidée, des montants en FCFA et une interaction vocale adaptée aux usages du marché.

## Fonctionnalités

### Marchand

- Ouverture et fermeture de caisse.
- Vente rapide tactile ou vocale.
- Panier et calcul de monnaie à rendre.
- Historique des ventes.
- Dépenses et résumé de journée.
- Gestion des produits et du stock.
- Achats et fournisseurs.
- Crédits clients et remboursements.
- Points de vente et mode marché.
- Transferts de stock entre marchands.
- Tontines, fidélité et protection sociale.
- Portefeuille Keiwa.
- Académie et contenus de formation.

### Producteur

- Accueil et profil producteur.
- Déclaration de récoltes.
- Cycles de production.
- Stock et commandes.
- Journal d'activité.
- Communication avec les marchands.

### Identificateur

- Authentification terrain.
- Identification d'acteurs.
- Dossiers et brouillons.
- Missions.
- Suivi des identifications.
- Demandes de mutation.
- Rapports et statistiques.

### Back-office

- Gestion des acteurs, producteurs et identificateurs.
- Enrôlement et supervision.
- Gestion des institutions et zones.
- Audit et événements.
- Monitoring de l'IA et des synchronisations.
- Gestion des contenus, notifications et Academy.
- Commandes, livraisons et marketplace.
- Keiwa, tontines, scores et rapports.
- Gestion des sessions appareil.

## Architecture

Jùlaba utilise une architecture Next.js avec une navigation métier côté client.

```text
Capacitor / navigateur
        |
        v
Next.js 16 - App Router - route applicative /
        |
        +--> Route handlers API src/app/api/**
        |
        +--> Services vocaux offline et plugins Capacitor
        |
        v
Supabase
  +--> PostgreSQL
  +--> Auth
  +--> Storage
  +--> Realtime
  +--> RLS et RPC transactionnelles
```

### Stack principale

- Next.js 16 et React 19.
- TypeScript.
- Tailwind CSS 4 et composants Radix/shadcn.
- Zustand 5 avec persistance locale.
- Supabase PostgreSQL, Auth, Storage et Realtime.
- Capacitor 8 pour Android et iOS.
- Bun pour l'installation, les scripts et la CI.
- Vitest pour les tests.
- Recharts pour les graphiques du back-office.
- ONNX Runtime Web et Transformers.js pour certains modèles locaux.

## Source de vérité métier

Supabase/PostgreSQL est la source de vérité des données métier. Les stores Zustand et la file locale sont des projections ou des mutations en attente ; ils ne doivent jamais devenir une seconde base concurrente.

Les domaines critiques suivent ces règles :

- La caisse est écrite par les routes API et les RPC transactionnelles.
- Le stock est un journal de mouvements append-only ; les balances sont des projections lisibles.
- Les ventes et mouvements utilisent des identifiants d'opération idempotents.
- Les clients sont scoppés par marchand et identifiés par `clientId`.
- Une annulation ajoute une opération inverse ; elle ne supprime pas l'opération originale.
- Une erreur définitive de synchronisation devient un conflit visible et ne boucle pas indéfiniment.

Les contrats et invariants sont documentés dans :

- `docs/CONSTITUTION.md`
- `docs/adr/ADR-0001-source-unique-domaines.md`
- `src/lib/domain/truth-contracts.ts`
- `src/lib/domain/invariants.ts`

## Fonctionnement hors ligne

Les mutations qui ne peuvent pas atteindre le serveur sont placées dans une outbox locale FIFO.

```text
Action utilisateur
      |
      +--> requête serveur réussie --> projection locale réalignée
      |
      +--> réseau indisponible
              |
              v
          outbox locale
              |
              v
          reconnexion / focus / visibilité
              |
              v
          rejeu idempotent
              |
              +--> succès : entrée supprimée
              +--> erreur transitoire : entrée conservée
              +--> erreur définitive : conflit enregistré
```

La file est gérée par :

- `src/lib/offline-db.ts`
- `src/lib/sync-handlers.ts`
- `src/components/shared/sync-flusher.tsx`

Chaque nouvelle entrée reçoit un `operationId` et un `ownerId`. Une entrée sans propriétaire ou appartenant à un autre compte est bloquée afin d'éviter qu'un téléphone partagé rejoue les mutations d'un marchand sous le compte d'un autre.

## Voix

La voix est conçue pour rester explicite : aucun fallback entre langues ne doit être silencieux.

### Reconnaissance vocale

- Français natif : VoiceService puis Sherpa selon le contexte.
- Français web : Web Speech API.
- Baoulé : VoiceService omnilingual natif, mode push-to-talk.
- Dioula : même famille de moteur omnilingual lorsque le modèle est disponible.
- NLU français : parseur local, puis classification locale optionnelle.
- Les actions financières doivent rester confirmables.

Entrées principales :

- `src/lib/voice/stt-factory.ts`
- `src/lib/voice/voice-service.ts`
- `src/lib/voice/sherpa-stt.ts`
- `src/lib/voice/localIntent.ts`
- `src/lib/voice/prodIntent.ts`

### Synthèse vocale

La chaîne Tata utilise les moteurs disponibles selon la plateforme et les ressources installées :

```text
TTS natif Capacitor
  -> Kokoro opt-in
  -> Piper opt-in
  -> Web Speech sur navigateur
```

Les langues locales utilisent leurs chemins dédiés lorsqu'ils sont installés :

- Baoulé pilote MMS.
- Dioula MMS.
- Traduction NLLB opt-in pour les réponses dynamiques.

La vitesse française par défaut est `0,9`. Les moteurs partagent un orchestrateur « dernière demande gagnante » afin d'éviter les superpositions audio entre Tata, les notifications et la navigation.

Fichiers principaux :

- `src/lib/voice/tata-tts.ts`
- `src/lib/voice/native-tts.ts`
- `src/lib/voice/mms-tts.ts`
- `src/lib/voice/kokoro-tts.ts`
- `src/lib/voice/piper-tts.ts`
- `src/lib/voice/nllb-translation.ts`
- `src/lib/voice/baoule-engine.ts`
- `src/lib/voice/audio-postprocess.ts`

Les modèles vocaux volumineux sont téléchargés uniquement après une action explicite de l'utilisateur. Le téléchargement de modèles peut nécessiter plusieurs centaines de mégaoctets et doit être proposé de préférence en Wi-Fi.

## Prérequis

- Bun installé.
- Node.js compatible avec les outils Supabase si les scripts locaux Supabase sont utilisés.
- Docker si `supabase start` est utilisé.
- Un projet Supabase pour les environnements distants.
- Android Studio pour construire l'application Android.
- Xcode pour construire l'application iOS.

## Installation

```bash
bun install
```

Créer un fichier `.env.local` avec les variables nécessaires à l'environnement. Ne jamais committer de secret.

Variables courantes :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-cle-anon
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role
```

Les variables serveur supplémentaires sont documentées dans les fichiers de configuration et les scripts de déploiement. Les clés `service_role`, clés de chiffrement et secrets de session ne doivent jamais être exposés au client.

## Développement

Démarrer Next.js :

```bash
bun run dev
```

Le serveur démarre sur le port `3000`.

Commandes utiles :

```bash
bun run lint
bun run typecheck
bun run test
bun run test:watch
bun run build
```

## Supabase local

Démarrer l'environnement local :

```bash
bun run supabase:start
```

Réinitialiser la base locale avec les migrations :

```bash
bun run supabase:reset
```

Arrêter Supabase :

```bash
bun run supabase:stop
```

Afficher ou appliquer les migrations selon l'environnement :

```bash
supabase migration list
supabase db push
```

Après une modification SQL, vérifier que les colonnes utilisées par les index, contraintes, fonctions et RPC existent bien dans la même migration ou dans une migration antérieure.

## Tests

Les tests sont organisés près des domaines concernés.

```text
src/lib/voice/__tests__/       STT, TTS, NLU et chaînes vocales
src/lib/stock/__tests__/       Stock, mouvements et transferts
src/lib/stores/__tests__/      Caisse, stock et projections Zustand
src/app/api/**/__tests__/      Routes API et contrats HTTP
src/lib/domain/__tests__/      Invariants métier
```

Les tests de domaine doivent couvrir au minimum :

- double envoi d'une même opération ;
- vente sans stock suffisant ;
- rejeu après reconnexion ;
- changement de compte sur terminal partagé ;
- conflit définitif serveur ;
- annulation append-only ;
- interruptions et superpositions vocales ;
- scénario sans réseau.

## Structure du projet

```text
src/
├── app/
│   ├── api/                  # Route handlers serveur
│   ├── page.tsx              # Point d'entrée applicatif
│   └── ...
├── components/
│   ├── marchand/             # Écrans et flux marchand
│   ├── producteur/           # Écrans et flux producteur
│   ├── identificateur/       # Écrans terrain
│   ├── backoffice/           # Administration
│   ├── shared/               # Composants partagés
│   └── ui/                   # Primitives UI
├── lib/
│   ├── domain/               # Contrats et invariants métier
│   ├── stores/               # Stores Zustand et projections locales
│   ├── stock/                # Service central et règles stock
│   ├── voice/                # STT, TTS, NLU et traduction
│   ├── offline-db.ts         # Outbox locale
│   ├── sync-handlers.ts      # Rejeu des mutations
│   └── supabase/             # Clients et types Supabase
├── plugins/                  # Plugins Capacitor natifs
└── hooks/                    # Hooks React partagés
supabase/
└── migrations/               # Schéma, RPC, contraintes et RLS
docs/
├── CONSTITUTION.md           # Gouvernance technique
├── adr/                      # Décisions d'architecture
└── ...
```

## Sécurité

- Les composants client ne doivent pas utiliser directement le client Supabase administrateur.
- Toute route API doit vérifier le propriétaire de l'appareil ou la session appropriée.
- Les écritures critiques doivent utiliser les RPC ou services serveur prévus.
- Les politiques RLS doivent rester restrictives par défaut.
- Les données financières ne doivent pas être déduites uniquement d'un agrégat local.
- Les erreurs doivent être explicites côté utilisateur mais ne doivent pas exposer de secret ni de détails internes inutiles.
- Les logs vocaux ne doivent pas contenir de transcription sensible ou de contenu audio brut sans politique explicite.

## Contribution

Avant toute modification :

1. Identifier le rôle utilisateur et le parcours concerné.
2. Vérifier la source de vérité de l'entité modifiée.
3. Lire les invariants et ADR concernés.
4. Préserver le comportement offline et le rejeu idempotent.
5. Ajouter les tests du cas nominal et des erreurs.
6. Exécuter `bun run lint`, `bun run typecheck` et les tests pertinents.

Ne pas créer une seconde implémentation d'un concept existant. Ne pas ajouter de suffixes `V2`, `New`, `Old` ou `Copy` pour contourner une convergence nécessaire.

## Documentation utile

- `AGENTS.md` : règles de travail du dépôt.
- `.ai/ARCHITECTURE.md` : architecture technique détaillée.
- `docs/CONSTITUTION.md` : principes de gouvernance.
- `docs/adr/ADR-0001-source-unique-domaines.md` : source unique des domaines métier.
- `docs/comparaison-repositories-julaba.md` : comparaison avec `SOMET1010/julaba-app`.
- `docs/OFFLINE.md` : fonctionnement de la synchronisation offline.
- `docs/DEBT_REPORT.md` : dette technique identifiée lorsqu'il est présent.

## Licence et statut

Le projet est en développement actif. Les fonctionnalités vocales Baoulé et Dioula, certains modèles locaux et plusieurs intégrations externes peuvent rester expérimentaux et nécessitent une validation terrain avant un déploiement large.
