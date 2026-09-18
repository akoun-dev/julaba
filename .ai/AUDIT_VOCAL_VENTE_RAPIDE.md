# AUDIT — Vocal « Vente rapide » (VenteRapideModal)

*Date : 2026-09-19 · Auteur : Super Z (AGENT 1, audit statique) · Déclencheur : retour utilisateur « j'ai l'impression qu'il casse »*

**Périmètre** : le parcours vocal complet de la vente rapide — ouverture de la modale, écoute STT, parsing d'intention, enregistrement (`completeQuickSale`), narration TTS, phase de confirmation — comparé point par point à la modale vocale générale (`voice-modal.tsx`) qui, elle, est branchée sur la chaîne à jour (VoiceService / Sherpa / Baoulé / Web Speech).

**Méthode** : lecture statique de l'intégralité de la chaîne (`vente-rapide-modal.tsx`, `stt.ts`, `stt-factory.ts`, `tata-tts.ts`, `wake-word.ts`, `localIntent.ts`, `quick-sale.ts`, `speech-text.ts`, `stock-store.ts`, `page.tsx`), sans appareil physique. Chaque constat cite ses preuves (fichier:ligne) et un scénario de reproduction. Les deux constats P0 sont cohérents avec le ressenti utilisateur sur APK et doivent être confirmés au prochain smoke device (rejoint B1-010 / B5-052).

---

## 1. Architecture actuelle — le constat principal

La vente rapide a été construite **avant** l'arrivée de la chaîne STT multi-moteurs (Tasks 31/32/35 et B5-051) et **n'a jamais été migrée**. Elle vit dans un parallèle architectural :

| Élément | Modale vocale générale (`voice-modal.tsx`) | Vente rapide (`vente-rapide-modal.tsx`) |
|---|---|---|
| Porte d'entrée micro | `canAttemptSTT()` — vrai sur natif dès qu'un moteur PEUT être tenté | `isAnySTTAvailable()` — vrai seulement si Web Speech **ou** Sherpa déjà chargé |
| Session STT | `await createSmartSingleShotSTT()` — routage complet : bci → façade BaouleVoiceEngine ; fr natif → VoiceService batch offline → Sherpa → Web Speech | `createSingleShotSTT()` — **Web Speech API brute, aucun routage** |
| Langue | Sélecteur global (fr / bci) | `fr-FR` figé |
| Réseau | `fetchJsonWithTimeout` (10 s) sur les appels métier | `fetch` nu sans timeout |
| Tests | suites de contrat + routing | **aucun test dédié** |

Autrement dit : **tout ce qui a été réparé et durci dans le reste de l'appli n'existe pas dans la vente rapide** — or c'est précisément l'écran que le marchand manipule cent fois par jour sur le terrain. Ce décalage explique le ressenti « ça casse ».

---

## 2. Constats

### P0-1 — Mauvais moteur STT : blocage total du vocal sur l'APK

**Preuve** : `vente-rapide-modal.tsx:10-11` importe `createSingleShotSTT` depuis `./stt` (Web Speech brut) au lieu de la factory `createSmartSingleShotSTT` de `stt-factory.ts`. La porte d'entrée (ligne 28) utilise `isAnySTTAvailable()` au lieu de `canAttemptSTT()`.

**Mécanique de casse sur Android (WebView)** : le WebView Capacitor n'implémente **pas** Web Speech → `isSTTAvailable()` renvoie false. Deux cas :

- **Cas A — Sherpa chargé** (wake word actif, `initSherpaModel()` réussi) : la porte passe (`_sherpaState === 'ready'`), la modale passe en mode voix, mais la session créée est une session Web Speech. Son `start()` est un **no-op silencieux** (`stt.ts:92` : `if (!isSTTAvailable() || listening) return`). Résultat : la modale affiche « J'écoute... » avec le spinner **à l'infini**, sans erreur, sans timeout, micro jamais ouvert. Le bouton reste bloqué tant que l'utilisateur ne ferme pas la modale.
- **Cas B — Sherpa non chargé** (wake word désactivé) : la porte renvoie false → mode clavier forcé, **silencieusement**, alors que le moteur offline VoiceService batch (le moteur FR prioritaire sur natif, Task 32) est parfaitement disponible.

**Scénario de reproduction** : APK → « Vente rapide » → bouton micro → spinner infini « J'écoute... » (cas A) ou pas de bouton micro du tout (cas B).

**Impact** : c'est très probablement LE « il casse » ressenti. Sur le navigateur (preview), Web Speech existe et masque le problème — d'où un bug invisible en dev et cassant en production terrain. Au passage, la route Baoulé (B5-051) et le moteur VoiceService sont contournés : même en les réparant ailleurs, la vente rapide n'en bénéficie jamais.

**Correction proposée (VOCAL-602)** :
1. Porte d'entrée : `canAttemptSTT()` (vrai sur natif par défaut).
2. Session : sur natif → `createSmartSingleShotSTT()` (async acceptable hors contrainte d'activation web) ; sur web → garder la création **synchrone** `createSingleShotSTT` — le commentaire en tête de `startListening` documente une vraie contrainte (perte de l'activation utilisateur si on `await` avant `SpeechRecognition.start()`), il ne faut PAS la régresser. Recommandation : encapsuler cette stratégie hybride dans la factory (`startSmartSingleShotSTT`) pour que les deux modales partagent la même logique.
3. Watchdog d'écoute : si aucun résultat/erreur après 12–15 s → erreur explicite + repli clavier (voire P1-5).

### P0-2 — Le montant dicté est écrasé par le prix catalogue

**Preuve** : `vente-rapide-modal.tsx:49` :

```ts
const unitPrice = product?.priceUnit || Math.floor(intent.amount / (intent.quantity || 1))
```

Dès que le produit dicté existe au stock avec un `priceUnit` (et `getProductByName` matche en `includes` — c'est le cas courant), le prix catalogue est pris **à la place** du montant dicté. Or pour un intent `sale`, `parseIntent` exige un montant (`localIntent.ts:563`) : le montant dicté est donc *toujours disponible* et *toujours jeté* quand le produit est connu. Le montant annoncé puis enregistré est recalculé ligne 65 : `(intent.quantity || 1) * unitPrice`.

**Scénarios chiffrés** (prix catalogue fictifs) :

| Phrase dictée | Stock | Enregistré aujourd'hui | Attendu |
|---|---|---|---|
| « tomates 2000 » | Tomates à 500 | **500 FCFA** | 2 000 FCFA |
| « trois sacs de riz 2000 » | Riz à 5 000 | **15 000 FCFA** | 2 000 FCFA |
| « j'ai vendu 3 tomates à 500 » | (peu importe) | **500 FCFA** (le dernier nombre est pris comme total — `extractAmount`, `localIntent.ts:300-301`) | 1 500 FCFA (3 × 500) |
| « tomates 2000 » sans produit au stock | — | 2 000 FCFA ✅ | 2 000 FCFA |

Le format « X à Y » aggrave le tableau : `parseIntent` extrait bien `unitPrice` (ligne 557-561) mais la modale **l'ignore** ; et `extractAmount` prend le *dernier* nombre (le prix unitaire) comme montant total au lieu de quantité × prix.

**Impact** : impact métier direct — caisse du jour, ventes, objectifs faussés, silencieusement (la vente rapide n'affiche pas la question de confirmation `responseText` que la modale générale montre : le mauvais montant part **directement en base/file offline**). C'est la seconde moitié du « il casse » : quand il ne se bloque pas, il enregistre des montants faux.

**Correction proposée (VOCAL-603)** :
1. Le montant dicté fait loi : `total = intent.amount`, `unitPrice = Math.round(intent.amount / (intent.quantity || 1))` — le `priceUnit` du stock ne sert qu'en secours si aucun montant n'a été dicté (hors périmètre d'un intent `sale`), ou au plus comme garde-fou d'avertissement.
2. Format « X à Y » : si quantité et prix unitaire reconnus → `amount = quantity × unitPrice` (à corriger côté `parseIntent`/`extractAmount`).
3. Annoncer le montant réellement enregistré (recaler la phrase de confirmation sur `total`) et signaler l'écart éventuel avec un prix catalogue connu plutôt que de l'écraser en silence.

### P1-3 — Race wake-word : le listener de fond repart pendant la modale

**Preuve** : `vente-rapide-modal.tsx:199-206` — le cleanup de l'effet de fermeture appelle `resumeWakeWord()` ; à l'ouverture (`false → true`), React exécute d'abord ce cleanup **avant** le corps du nouvel effet. `resumeWakeWord()` → `startWakeWordListener()` qui `await initSherpaModel()` ; pendant cet await, le corps du nouvel effet appelle `pauseWakeWord()` — mais `session` vaut encore `null` (l'ancien a été stoppé, le nouveau pas encore créé). Quand l'await se résout, le **nouveau** listener démarre et reste actif pendant toute la modale.

**Impact** : deux reconnaisseurs se disputent le micro (sur natif : Sherpa streaming de fond contre la session de la modale — contention pouvant faire échouer ou faire taire la session de la vente rapide) ; risque que Tata/paroles ambiantes déclenchent « Julaba » en pleine vente (auto-ouverture de la modale générale pendant la vente rapide). Contribution probable aux comportements erratiques sur appareil.

**Correction proposée (VOCAL-604)** : ne reprendre le wake word qu'à la fermeture *effective* (cleanup conditionnel via ref « la modale était ouverte ») ; rendre `pauseWakeWord()` capable d'annuler un démarrage en cours (flag/génération consulté après l'`await` dans `startWakeWordListener`).

### P1-4 — `completeQuickSale` : fetch sans timeout + stock décrémenté avant la persistance

**Preuve** : `quick-sale.ts:55-65` — `fetch` nu, aucun timeout : sur réseau mobile précaire, la promesse peut rester suspendue longtemps → modale figée en « processing » sans retour ni erreur (pendant ce temps l'utilisateur force-quit, la vente n'est ni enregistrée ni mise en file). Par ailleurs le stock est décrémenté (lignes 30-37) **avant** toute persistance : si le fetch échoue ET que `queuePendingSync` échoue aussi, la vente est refusée mais le stock est déjà sorti (incohérence mineure mais réelle). Enfin `result.synced` est ignoré par la modale : l'utilisateur ne sait jamais si sa vente est partie ou attendra la synchronisation.

**Correction proposée (VOCAL-604)** : réutiliser `fetchJsonWithTimeout` (10 s, déjà disponible et branché dans la conversation B4-041) ; décrémenter le stock après le verdict (succès réseau OU file locale confirmée) ; annoncer « enregistrée, sera synchronisée » quand `!synced`.

### P1-5 — Aucun watchdog d'écoute

La phase d'écoute n'a aucun garde-fou temporel : si un moteur ne répond jamais (session native muette, bridge bloqué, cas P0-1), l'UI reste « J'écoute... » indéfiniment. Web Speech a son propre timeout `no-speech`, mais rien ne couvre les moteurs natifs ni les no-op silencieux. **Correction (VOCAL-602)** : timer 12–15 s par session → erreur explicite (« Je n'ai rien entendu, utilisez le clavier ») + libération propre.

### P1-6 — Sessions STT dupliquées : fuite de micro

`startListening` et `listenForConfirmation` ne font **jamais** `sttSessionRef.current?.abort()` avant d'en créer une nouvelle, et le garde `if (isListening ...)` lit un state React potentiellement périmé (double déclenchement callback TTS + tap utilisateur, cf. `tataSpeak` cancel → `onend` tardif → rAF → `startListening`). Deux sessions coexistent : la première fuit (micro tenu, résultats livrés à des closures périmées). **Correction (VOCAL-602)** : abort systématique avant création + compteur de génération pour ignorer les callbacks d'une session remplacée.

### P2-7 — Intents non métier traités en « erreur »

Dans `handleSale`, tout intent non-`sale` tombe dans la branche erreur ambre + bip d'erreur :

- « oui » au prompt initial → `parseIntent` type `yes` avec `responseText: ''` → **erreur au texte vide** : bip d'erreur, texte ambre vide, `tataSpeak('')` muet.
- « stop / arrête / plus rien » → censé fermer, reste ouvert sur un message d'erreur.
- Navigation (« mes ventes », « ma caisse ») → Tata annonce « J'ouvre tes ventes passées. »… **sans rien ouvrir** (mensonge UX).
- Consultation (« combien j'ai vendu aujourd'hui ») → « Consultation en cours... » sans aucune consultation.

**Correction (VOCAL-605)** : router ces intents — `yes` → relancer l'écoute vente ; `no`/`cancel` → fermer poliment ; navigation → fermer la modale puis naviguer (ou dire explicitement « fermez la vente rapide d'abord ») ; consultation → annoncer le vrai total du jour (déjà dans `caisse-store`).

### P2-8 — Phase de confirmation trop ferme

`listenForConfirmation` : toute erreur STT (y compris `network`, `not-allowed`) → « D'accord, bonne journée ! » + fermeture. La vente étant déjà enregistrée, c'est bénin, mais l'utilisateur qui voulait enchaîner est éjecté. De plus toute réponse qui n'est pas « oui » ferme la modale (« encore tomates 2000 » → fermé au lieu d'enchaîner une nouvelle vente). **Correction (VOCAL-605)** : sur erreur micro en phase confirm → proposer le clavier oui/non (la vente est déjà enregistrée — le dire) ; sur réponse ni oui ni non → repasser au `parseIntent` et enchaîner une nouvelle vente si produit+montant reconnus.

### P2-9 / P2-10 — Hygiène

- Code mort : `pendingConfirmRef` (écrit, jamais lu), state `error` (jamais setté, UI morte), `AMOUNT_PATTERNS` (`localIntent.ts:85-88`, jamais utilisé).
- Typos narrées : « Daccord » ×3 (lignes 91, 119, 124) → « D'accord ».
- Survente silencieuse : `Math.max(0, stockQty - qty)` écrête sans avertir (vend 5 quand reste 2 → stock 0, aucun signalement).
- Pas de barge-in : l'écoute ne démarre qu'à la fin du prompt TTS (sur natif, watchdog jusqu'à 30 s si le moteur muet ne répond jamais — `nativeSpeak`, `tata-tts.ts:230-234`) ; l'utilisateur qui parle pendant le prompt n'est pas écouté.
- Baoulé absent : la modale ignore `voice-language-store` et le sélecteur bci (fr-FR figé, `parseIntent` français) — la correction P0-1 donne le routage STT gratuitement ; les prompts bci relèvent de la suite B4 (à arbitrer).

### Ce qui fonctionne bien (à préserver)

La machine à états est claire (`idle → listening → processing → confirm/success/error`) ; les transitions sont systématiquement accompagnées (bip + haptique + TTS — jamais de retour muet) ; les erreurs Web Speech sont traduites en messages actionnables avec bascule clavier automatique en phase vente ; chaque vente est confirmée verbalement avec le montant ; la file offline existe ; le wake word est mis en pause pendant la modale (intention correcte, exécution râblée P1-3). Les corrections ci-dessus ne touchent pas ces acquis.

---

## 3. Plan de correction proposé (→ registre)

| ID | Priorité | Contenu | Critères d'acceptation |
|---|---|---|---|
| VOCAL-601 | — | **Cet audit** (constat + plan) | Document + registre à jour |
| VOCAL-602 | **P0** | Vente rapide branchée sur la factory STT (porte `canAttemptSTT`, session hybride sync-web/async-natif, watchdog 12-15 s, abort avant recréation + génération) | Sur APK simulé sans Web Speech : session native tentée, jamais de spinner infini ; web : création synchrone préservée ; suite de tests dédiée verte |
| VOCAL-603 | **P0** | Montant dicté = vérité (fin de l'override `priceUnit`), « X à Y » = qty × prix unitaire, annonce du montant réellement enregistré | Les 4 scénarios chiffrés §P0-2 passent dans des tests unitaires |
| VOCAL-604 | P1 | Race wake-word (resume à la fermeture effective + pause annulant un start en cours), `fetchJsonWithTimeout` dans `completeQuickSale`, décrément stock après verdict, `synced` annoncé | Aucun listener de fond actif pendant la modale (test) ; fetch simulé suspendu → erreur à 10 s + file offline |
| VOCAL-605 | P2 | Intents non métier (oui vide, stop → fermer, navigation effective, consultation = total réel), confirmation robuste (clavier sur erreur, enchaînement non-oui), hygiène (code mort, typos, survente signalée) | Parcours « oui / stop / mes ventes / combien vendu » testés ; 0 référence morte |

**Ordre** : 602 + 603 ensemble (même fichier, même batterie de tests) → 604 → 605. Validation finale : smoke sur appareil (rejoint B1-010 / B5-052) — l'audit statique ne remplace pas un test terrain APK.

## 4. Limites de l'audit

Audit statique sans appareil : les constats P0-1 et P1-3 sont démontrés par le code (no-op silencieux prouvé `stt.ts:92`, race d'ordre React/cleanup prouvée) mais leur manifestation exacte sur un téléphone donné (quel moteur gagne la course au micro, message réel affiché) doit être confirmée par un smoke APK. Les volumes/latences TTS ne sont pas concernés (aucun changement TTS requis — la chaîne `tata-tts` existante est saine pour ce flux).
