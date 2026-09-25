# SLO — Objectifs de niveau de service (julaba)

_MODE-1012 (plan 90 j) · créé le 2026-09-25 · alimenté par `/api/healthz`, `/api/readyz`, `/api/metrics`_

## 1. Périmètre et sources de vérité

Ce document fixe les objectifs de service de l'application julaba (API métier
+ disponibilité de l'appareil vers le serveur) et décrit comment les mesurer.
Trois sondes alimentent le suivi :

| Sonde | Rôle | Garantie |
| --- | --- | --- |
| `/api/healthz` | Liveness — le process répond, **aucune** dépendance externe touchée | Si échec : le process est mort, le routeur doit le sortir (AUDIT-012 P1-11) |
| `/api/readyz` | Readiness — dépendances vérifiées (Supabase joignable) | Si échec : le process vit mais ne doit PAS recevoir de trafic métier |
| `/api/metrics` | Compteurs agrégés au format Prometheus (par instance de process) | Suivi SLO : volume par route, classes de statut, latence p50/p95 |

**Honnêteté de mesure** : les compteurs de `/api/metrics` vivent dans le
process Node. Sur Vercel (serverless), chaque instance a les siens — la sonde
reflète l'instance interrogée, pas le trafic global. Pour une vue agrégée
multi-instances, la plateforme (Vercel Analytics / drain externe) reste la
source d'autorité ; `/api/metrics` sert au diagnostic par instance et aux
sondes simples. Les labels sont des **routes fixes** (jamais d'identifiant
utilisateur) et des **classes de statut** (2xx/4xx/5xx) : rien de requêtable
n'est exposé.

## 2. Objectifs (fenêtre glissante 30 jours)

| Indicateur | Objectif | Budget d'erreur (30 j) | Source |
| --- | --- | --- | --- |
| Disponibilité app (toutes routes) | **99,5 %** des requêtes hors 5xx | ~3 h 36 min d'indisponibilité équivalente | `julaba_api_requests_total{status_class="5xx"}` / total |
| Disponibilité API métier critique (ventes, marketplace, session) | **99,7 %** | ~2 h 11 min | idem, filtré sur `route` ∈ {`ventes_create`, `ventes_list`, `marketplace_orders_create`, `marketplace_catalog`, `session_claim`} |
| Latence p95 API métier critique | **< 800 ms** | — | `julaba_api_request_duration_ms{quantile="0.95"}` |
| Readiness (dépendance Supabase) | échec continu > 60 s = incident | — | `/api/readyz` |

Le **budget d'erreur** se consomme par les 5xx et les échecs de readiness.
Quand le budget d'un mois est épuisé : geler les déploiements non correctifs
et prioriser la fiabilité (règle standard des SRE, calibrée ici pour une app
de terrain où une vente perdue est une perte sèche pour la marchande).

## 3. Interprétation des classes de statut

- **2xx** : succès attendu (201 création incluse).
- **4xx** : refus légitime (validation, autorisation, idempotence 23505
  relecte en 200/201 — voir MODE-1004). Les 4xx ne consomment PAS le budget :
  ils sont le contrat (un 400 Zod MODE-1007 est une réponse correcte).
- **5xx** : défaut serveur. Chaque 5xx sur route critique est investigué
  (logs Vercel) et consomme le budget. Les exceptions handler attrapées par
  les routes renvoient déjà 5xx JSON ; les exceptions relancées après
  enregistrement (`withApiMetrics`) remontent à Next (page 500).

## 4. Offline-first et ce que le SLO ne mesure pas

L'app est offline-first : une vente saisie hors ligne est **enfileée
localement** (file offline, MODE-1005 Web Locks / MODE-1010 adaptateurs) et
rejetée au retour du réseau — avec background sync (MODE-1011, événement
`sync`/`periodicsync` tag `julaba-flush`) quand le navigateur l'autorise.
Une indisponibilité serveur de quelques minutes ne perd donc PAS de vente :
elle dégrade la fraîcheur des balances affichées. Le SLO couvre la
**disponibilité du service serveur**, pas la disponibilité de la saisie —
celle-ci est conçue pour rester 100 % locale.

## 5. Rejets de la file offline (complément)

Les rejets définitifs (4xx au rejeu) deviennent des `SyncConflict` tracés
localement + miroir serveur (`/api/sync-conflicts/report`). Ce canal n'est
PAS un SLO mais un garde-fou produit : tout volume anormal de conflits
indique un décalage de contrat client/serveur (cf. procédure MODE-1004 —
vérifier les builders de payload contre les schémas Zod).

## 6. Bancs et vérifications périodiques

- **Migration drift** : `bun run scripts/check-migration-drift.ts` (compare
  fonctions/triggers hébergés vs migrations commitées — MODE-1004 a prouvé
  le risque : 2 migrations appliquées chez l'hébergeur mais jamais commitées).
- **SBOM** : `bun run scripts/generate-sbom.ts` (CycloneDX 1.5, artefact CI).
- **Banc device WF7** (manuel, avant toute bascule de flag build) :
  IndexedDB (`JULABA_QUEUE_STORE=indexeddb`), background sync (avion/3G),
  E2E parcours critique (auth PIN → vente → offline → rejeu).
