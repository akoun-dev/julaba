# BANC-INDEXEDDB — Validation de la bascule du stockage de la file offline

**MODE-1010-ter · 25/09/2026 · Verdict : VERT (20/20 vérifications PASS)**

## Objet

Le design MODE-1010 (Task 170) conditionnait la bascule du flag `JULABA_QUEUE_STORE` à un banc validant ses 4 étapes : (1) enfilement/rejeu offline réel, (2) kill tab mid-write, (3) upgrade avec file préexistante, (4) quota. Le banc WF7 physique (appareil Android) n'étant pas disponible dans la sandbox, le banc a été exécuté sur **Chromium réel headless** (Playwright 1.63) — même moteur que les webviews Android Capacitor. La validation **avion/3G du background sync** (MODE-1011) et la **suite E2E parcours critique** (MODE-1012) restent au banc physique : elles portent sur le service worker et l'application complète, pas sur le stockage.

## Méthode (reproductible, 0 mock du code applicatif)

Le module **réel** `src/lib/offline-db.ts` est bundlé tel quel (`bun build`, IIFE) — aucune copie, aucune variante test — et chargé dans Chromium via une page banc servie en `http://localhost` (contexte sécurisé : Web Locks + IndexedDB actifs). Le flag de build est rendu mutable par scénario via `define` : `process.env.JULABA_QUEUE_STORE` → `window.__JULABA_QUEUE_STORE` (même sémantique qu'une constante inlinée par `next.config env`). Hors ligne réel = `context.set_offline(True)` (le serveur banc devient injoignable, comme un réseau coupé). Chaque scénario tourne dans un contexte navigateur neuf (stockage isolé) ; le scénario S2 utilise un **profil persistant** (`user_data_dir`) pour survivre au kill.

Commandes (à la racine du dépôt) :

```bash
bun build scripts/banc-indexeddb/banc-entry.ts --bundle --format=iife --target=browser \
  --define 'process.env.JULABA_QUEUE_STORE=window.__JULABA_QUEUE_STORE' \
  --external '@/lib/notifications/triggers' --external '@/lib/notifications/events' \
  --outfile scripts/banc-indexeddb/banc.bundle.js
python3 scripts/banc-indexeddb/banc.py
```

## Résultats — 20/20 PASS

| # | Scénario | Vérifications | Résultat |
|---|----------|---------------|----------|
| S1 | Enfilement offline réel + rejeu au retour réseau | 3 enfilements offline ok ; file FIFO `[0,1,2]` ; flush online `sent=3 remaining=0` ; file vide après rejeu ; `markSynced` retire l'entrée ciblée (11) seulement | 5/5 PASS |
| S2 | Kill tab mid-write (profil persistant) | état initial 10 entrées ; après kill en plein `clear+put` (300 entrées × 50 Ko) : file = ancien état (10) OU nouvel état complet (310), **jamais partiel** (10 observé = rollback) ; base utilisable après kill | 3/3 PASS |
| S3 | Upgrade avec file localStorage préexistante | clé legacy préexistante ; 4 entrées importées en IDB en FIFO ; clé legacy **purgée après commit** ; réouverture idempotente (4 puis 5) | 4/4 PASS |
| S4 | IndexedDB indisponible / échec d'écriture | 4a : flag `indexeddb` SANS IDB → repli transparent `localStorage` (enfilement fonctionnel) ; 4c : abort async de commit (forme réelle d'une erreur quota) → `{ok:false,'Stockage local indisponible'}` sans crash, file précédente **intacte** (rollback 5 entrées), écriture suivante fonctionnelle | 5/5 PASS |
| S5 | Concurrence Web Locks × IDB | 50 enfilements concurrents (1 page) : tous ok, 50 uniques, FIFO stricte ; 2 onglets réels × 30 enfilements : 60 entrées uniques, 0 écrasement | 2/2 PASS |

Détails bruts : `banc-results.json` (artefact d'exécution, régénéré par le script).

## Contrats confirmés par le banc

- **Rejeu verbatim MODE-943** : les entrées stockées sont relues à l'identique (payload jamais relu ni transformé par l'adaptateur).
- **Atomicité MODE-1010** : `clear+put` en UNE transaction → tout-ou-rien au kill tab (aucun état partiel observé).
- **Upgrade idempotent** : import localStorage DANS la transaction de création, purge APRÈS commit ; ré-import sans effet si la clé est déjà partie.
- **Repli transparent** : `hasIndexedDb()` protège tout — webview sans IDB ou environnement de test continuent en localStorage sans changement de contrat.
- **Échec d'écriture honnête** : un commit qui échoue renvoie `false` → `{ok:false}` (jamais de mensonge de succès), la file précédente reste intacte.
- **Sérialisation inter-onglets MODE-1005** : les Web Locks sérialisent la section critique AU-DESSUS de l'adaptateur — 0 perte avec 2 onglets concurrents.

## Décision appliquée (MODE-1010-ter)

- Défaut de build `JULABA_QUEUE_STORE` : `localstorage` → **`indexeddb`** (`next.config.ts` + fallback du module aligné).
- **Rollback instantané** : `JULABA_QUEUE_STORE=localstorage` à la build restaure l'adaptateur historique (le flag reste opérant aux deux extrémités).
- Tests unitaires : +2 (défaut ABSENT post-banc = indexeddb avec IDB présente ; garde `hasIndexedDb` intact sans IDB). Les tests existants stubent explicitement le flag et restent inchangés.

## Reste au banc physique WF7 (hors sandbox, non bloquant pour la bascule stockage)

1. Bascule observée sur webview Android réelle (Capacitor) : enfilement/rejeu offline avion → rejeu au retour.
2. Validation background sync MODE-1011 : événement `sync`/`periodicsync` avion/3G (le SW ne rejoue jamais — réveil clients postMessage).
3. Suite E2E parcours critique MODE-1012 : auth PIN → vente → offline → rejeu.
