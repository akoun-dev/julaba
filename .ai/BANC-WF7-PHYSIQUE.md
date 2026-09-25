# BANC-WF7-PHYSIQUE — Runbook du banc appareil réel (volets A/B/C)

**MODE-1013 · 25/09/2026 · statut : PRÊT-À-EXÉCUTER (appareil requis)**

Ce runbook exécute ce qui n'était pas possible dans la sandbox : la validation sur **webview Android réelle** de la bascule IndexedDB (MODE-1010-ter), du background sync (MODE-1011) et la suite E2E parcours critique (MODE-1012). Tout est préparé et committé : la suite instrumentée `ParcoursCritiqueE2E.java` (4 tests), le script adb `scripts/banc-wf7.sh`, ce runbook. Un appareil branché en USB + une machine avec SDK Android suffisent à le dérouler en une session (~45 min).

## Prérequis (une seule fois)

| # | Prérequis | Commande / vérification |
|---|-----------|-------------------------|
| P1 | Machine avec JDK 21 + SDK Android (`local.properties`) | `java -version` + fichier `android/local.properties` |
| P2 | APK 1.3 construit depuis `c23b251`+ (bascule `JULABA_QUEUE_STORE=indexeddb` incluse par défaut) | `VARIANT=full TYPE=apk ./scripts/build-android.sh` |
| P3 | Serveur déployé ≥ `c23b251` (l'app est hybride remote : la webview charge le serveur) | Vérifier le déploiement Vercel après push |
| P4 | Appareil Android réel, débogage USB, webview système à jour | `./scripts/banc-wf7.sh check` |
| P5 | Compte marchand de test réel (base hébergée) + quelques produits en stock | login applicatif |
| P6 | Débogage webview pour l'inspection storage | `chrome://inspect` sur la machine (USB) → inspecter `ci.julaba.app` |

## Volet A — Webview avion → rejeu (bascule IndexedDB réelle, MODE-1010-ter)

| Étape | Action (script / manuel) | Résultat attendu |
|-------|--------------------------|------------------|
| A1 | `./scripts/banc-wf7.sh install` puis lancer l'app, **en ligne** | splash puis écran auth |
| A2 | **Manuel** : login PIN marchand (compte de test) | écran marchand chargé |
| A3 | **Manuel** : noter le nombre de ventes du jour (écran ventes) | N ventes |
| A4 | `./scripts/banc-wf7.sh avion on` | bandeau « hors ligne » de l'app |
| A5 | **Manuel** : créer une vente (caisse) | vente confirmée localement, bandeau réseau visible |
| A6 | `chrome://inspect` → Application → Storage : `indexedDB.databases()` | **`julaba-offline` présent** (bascule ACTIVE) et clé localStorage `julaba-offline-queue-v1` **absente** ; store `queue` contient la vente |
| A7 | `./scripts/banc-wf7.sh relance` (force-stop + relance), avion toujours ON, re-login | la vente en attente est toujours listée (persistance IndexedDB **inter-processus**) |
| A8 | `./scripts/banc-wf7.sh avion off` (ou 3G : couper le wifi, activer les données) | rejeu automatique (online/focus + événement SW `sync`) |
| A9 | **Manuel** : écran ventes + vérification côté base hébergée (ou BO ventes) | N+1 ventes, la vente offline présente serveur, file vide (`queue` = 0 entrée en A6-style) |

**Critères PASS** : A6 bascule active + A7 persistance + A9 rejeu serveur avec 0 perte et 0 doublon (idempotence `operationId`).

## Volet B — Background sync 3G/avion (MODE-1011)

| Étape | Action | Résultat attendu |
|-------|--------|------------------|
| B1 | Reproduire A4–A5 (file non vide en avion), `./scripts/banc-wf7.sh logs` dans un terminal | logcat actif |
| B2 | `avion off` | événement SW `sync` (tag `julaba-flush`) → postMessage au client → flusher existant rejoue ; le **SW ne rejoue jamais lui-même** (aucun fetch dans `public/sw.js` — rejeu visible dans les logs CLIENT, pas SW) |
| B3 | `chrome://inspect` → console : `const r = await navigator.serviceWorker.ready; await r.sync.register('julaba-flush'); true` | `true` (SyncManager réel de la webview Android) |
| B4 | `chrome://inspect` : `(await (await navigator.serviceWorker.ready).periodicSync.getTags())` | `['julaba-flush']` — si vide/erreur : webview sans periodic sync (non bloquant, chemin principal = online/focus, comportement silencieux documenté MODE-1011) |
| B5 | Test 3G réelle : wifi OFF, données ON, refaire un cycle enfilement → rejeu | rejeu sur réseau mobile (la vraie condition terrain) |

**Critères PASS** : B2 rejeu automatique au retour réseau via réveil client + B3 `true`. B4 informatif.

## Volet C — Suite E2E instrumentée (MODE-1012, `connectedAndroidTest`)

Exécution (machine de build, appareil branché) :

```bash
./scripts/banc-wf7.sh connected-test    # ou : cd android && ./gradlew connectedAndroidTest
```

| Test (`ParcoursCritiqueE2E`) | Ce qu'il prouve sur l'appareil |
|------------------------------|-------------------------------|
| `t1_webviewContexteSecuriseEtApisRequises` | contexte sécurisé + `indexedDB` + Web Locks + service worker **actif** dans la webview réelle |
| `t2_filePersisteAuRedemarrageWebviewAvecFifo` | file seedée dans la base **dédiée** `julaba-offline-banc` (jamais la file réelle) survit au `reload()` de la webview, FIFO par clé primaire |
| `t3_backgroundSyncEnregistrableSurWebviewAndroid` | `reg.sync.register('julaba-flush')` réussit (SyncManager réel) + SW servi = `sw.js` |
| `t4_webLocksSerialisentReellementSurAppareil` | sérialisation réelle `A-in,A-out,B-in` sous verrou (MODE-1005 sur la webview) |

**ISOLEMENT** : la suite n'écrit jamais dans la file réelle de l'appareil (base `julaba-offline-banc` créée/supprimée par test) — le parcours métier auth → vente → offline → rejeu sur la VRAIE file est le volet A manuel, preuve serveur à l'appui.

**Critères PASS** : 4/4 tests + `AppContextSmokeTest` (MODE-1004) vert.

## Grille d'enregistrement (à remplir sur l'appareil)

| Volet | Étape | PASS/FAIL | Observations (modèle webview, heure, logs) |
|-------|-------|-----------|---------------------------------------------|
| A | A1–A9 | ☐☐☐☐☐☐☐☐☐ | |
| B | B1–B5 | ☐☐☐☐☐ | |
| C | T1–T4 + smoke | ☐☐☐☐☐ | |

À l'issue : consigner les résultats dans `.ai/TASKS.md` (MODE-1013 → statuts volets), CHANGELOG, et si tout est vert — la bascule IndexedDB est validée BOUT EN BOUT (Chromium 20/20 + appareil réel).

## Recette de construction de l'APK (rappel)

```bash
# machine de build (JDK 21 + SDK Android) :
VARIANT=full TYPE=apk ./scripts/build-android.sh
# → android/app/build/outputs/apk/debug/app-debug.apk (assembleDebug, test appareil)
VARIANT=lite TYPE=bundle ./scripts/build-android.sh
# → .aab release (signature = keystore du propriétaire, hors périmètre banc)
```

La bascule `JULABA_QUEUE_STORE=indexeddb` est le défaut depuis `c23b251` — **aucune variable à définir** ; rollback éventuel : `JULABA_QUEUE_STORE=localstorage` avant la build.
