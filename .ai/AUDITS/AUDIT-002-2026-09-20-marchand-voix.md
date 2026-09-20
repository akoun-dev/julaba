# Audit — Interface marchand + intégration voix (branchement complet)

_Date : 2026-09-20 (Task 89, MODE-919) · HEAD audité : 9e53dc4 · Gates : vitest 1224/1224 · tsc 0 · eslint 0_

Demande : « Fais un audit de l'interface marchand, aussi l'intégration de la voix si tout est correctement branché. »

Méthode : (1) deux inventaires statiques exhaustifs (27 composants marchand + 28 modules voix) avec vérification programmatique des imports ; (2) lecture ciblée des zones à risque ; (3) **smoke E2E navigateur sur build production** (preview live) : intro → 0701020304 → PIN 1234 → accueil marchand → Mode Marché → Voix & Langue → test de voix → MES PRODUITS.

## 1. Verdict global

**L'interface marchand et la chaîne vocale sont correctement branchées.** Aucun `navigate()` fantôme, aucune route API appelée inexistante, aucun sélecteur zustand fantôme, 100 % de la file offline couverte par des handlers de sync, chaîne TTS fr/bci/dyu câblée de bout en bout avec légendes et erreurs honnêtes. L'audit a néanmoins découvert **3 bugs réels dans la chaîne voix (corrigés dans la foulée, commit MODE-919)** et une liste de dettes/UX à arbitrer.

## 2. Bugs réels découverts ET CORRIGÉS (voice)

| # | Bug | Localisation | Impact | Correctif |
| --- | --- | --- | --- | --- |
| V1 | **Sonde NLLB permissive** : « au moins un fichier en cache » = prêt | `nllb-translation.ts` (isModelCached) | Un téléchargement interrompu (893 Mo) affichait « installée » ET autorisait Transformers.js à re-télécharger silencieusement les fichiers manquants **en pleine conversation** (contredit la garantie « jamais de téléchargement implicite ») | Sonde STRICTE : config.json + tokenizer.json + encoder q8 + decoder_merged q8 exigés (mêmes gabarits d'URL que le chargement réel) ; +2 tests (partiel → false / translateText → NLLB_NOT_READY sans appel pipeline) |
| V2 | **Succès de téléchargement voix annoncé sans persistance** : `putInCache` avalait les échecs `cache.put` (quota) → carte « installée », voix disparue au reboot sans explication | `mms-tts.ts` (downloadMmsVoice) | Fausse confiance UI + re-téléchargement 114 Mo muet | Le téléchargement vérifie la persistance RÉELLE (sonde stricte poids+tokenizer) avant de retourner true ; sinon `false` → la carte affiche son erreur honnête ; +1 test quota |
| V3 | **Repli web français asymétrique et mensonger** : `tataSpeakWeb` signalait « voix pilote non disponible » (bci seulement) même quand l'échec venait de la TRADUCTION, et ne signalait RIEN en session dioula | `tata-tts.ts` | Session dioula : repli français sans aucun signal (violait la doctrine « jamais de repli silencieux ») | Notice unique honnête 1×/session selon la langue : « traduction ou voix X n'a pas pu être utilisée » ; rien en fr |

## 3. Interface marchand — ce qui est SOLIDE (preuves)

- **Navigation** : routeur central `src/app/page.tsx:335-379` ; toutes les cibles (tuiles accueil, Mode Marché, voix locale `localIntent.ts:129-229`, Gemma zod `navigation-intent.ts`) sont des `ScreenRoute` valides — **aucun navigate fantôme** (tsc 0).
- **Réseau** : ~30 appels marchand vérifiés un à un → chaque route appelée existe (`/api/marchand/sales|expenses|products|purchases|stock/*|transfers*|keiwa|tontines*|supplier-orders|contenus*|credit-ops|partners|selling-points|sale-reversals|market-sessions`, `/api/session/*`, `/api/auth/lookup`…). **Aucune route fantôme.**
- **Offline** : 18 types d'opérations mis en file → 18 handlers de flush (`sync-handlers.ts`) pointant vers la bonne route ; conflits → `/api/sync-conflicts/report` ; verrou anti-concurrence + re-flush à la reconnexion/focus.
- **Stores** : 11 stores consommés sans sélecteur fantôme ; `caisse-store`/`stock-store`/`market-mode-store`/credits/selling-points tous cohérents.
- **Qualité** : zéro TODO/FIXME, zéro `any`, zéro `console.*` dans les 27 composants marchand ; les handlers principaux affichent un état parlé/écrit, pas d'échec silencieux.
- **E2E** : parcours complet joué sur build prod, **zéro erreur page** ; écran Voix & Langue complet (3 langues, 4 cartes, notices exactes), légendes de test réactives vérifiées en direct (« Voix baoulé pilote non installée… test s'expliquera en français »), erreur honnête sans voix système.

## 4. Chaîne voix — câblage vérifié (fr / bci / dyu)

| Maillon | État | Preuves |
| --- | --- | --- |
| Sélecteur de langue (fr/bci/dyu, persisté) | OK | `voice-language-store.ts:29-61` ; écrit uniquement par `language-selector.tsx:61`, lu par stt-factory/tata-tts/conversation/voix-settings |
| Bouton « Tester la voix » | OK | `voix-settings.tsx:361-371` → `handleTestVoice:206-259` ; sondes au montage + 4 s + au clic (MODE-915/916 en place) |
| Légendes véridiques | OK (E2E) | `voice-test-caption` rendu (voix-settings.tsx:383-394) ; captions bci/dyu « non installée → s'expliquera en français » vérifiées en live |
| Chaîne MMS bci/dyu | OK | `tata-tts.ts:397-428 / 435-462` → `mmsDyuSpeak/mmsBciSpeak` → synthèse par phrase + post-traitement MODE-917 (`audio-postprocess`, `spoken-numbers`) ; tout-ou-rien conservé |
| Traduction NLLB | OK après V1 | Registre `NLLB_MODELS` (dyu→HF 872 Mo, bci→hub local 893 Mo) ; garde B2-022 ; erreurs typées françaises |
| Proxies same-origin | OK | `/api/voix/dyu-model` (streaming GitHub Release) ; `/api/voix/nllb-baoule-v1/resolve/main/[...path]` (whitelist exacte des 8 fichiers) |
| STT bci/dyu | OK | `stt-factory.ts` → Omnilingual ASR natif sans repli ; erreurs formulées (`describeSTTError`) |
| Plugins natifs Android | OK | `VoiceServicePlugin`, `SherpaSttPlugin`, `TataTtsPlugin` présents et pontés |

## 5. Dettes & recommandations (NON corrigées — à arbitrer)

1. **Écrans sans bouton tactile** : `tontines`, `keiwa`, `fidelite`, `protection-sociale` ne sont atteignables QU'À LA VOIX (`localIntent.ts`) — un micro indisponible les rend inaccessibles. Ajouter des tuiles accueil.
2. **Réception de commande fournisseur non câblée** : handler sync `stock-reception` prêt (`sync-handlers.ts:145`) + route PATCH prête, mais aucun bouton UI (CommandesScreen sait seulement annuler) — reste STK-809 UI.
3. **Code mort** : modal « Ouvrir ma caisse » interne à home-screen (home-screen.tsx:47,136-143,373-404, inatteignable depuis le passage à la modale globale) ; actions `openCreditsScreen/openFournisseursScreen/openPointsVenteScreen` (app-store.ts:322-331) jamais appelées ; route `register` vestigiale.
4. **`deleteProduct` non offline-sécurisé** (stock-store.ts:231-243) : DELETE direct, pas de file ni de refus parlé hors ligne — asymétrie avec la doctrine offline-first.
5. **Tailles codées en dur en double des constantes** (~114/~872/~893 Mo dans voix-settings.tsx et test-phrase.ts) — dérive possible à la prochaine mise à jour de modèles.
6. **Routes API sans consommateur** : `/api/marchand/stock/prices` (le calcul sert déjà via `/marge`) et `/api/marchand/stock/backfill` (service-side) — surface morte côté client, à garder ou retirer consciemment.
7. **Diagnostics voix inutilisés** : `getEffectiveTtsEngine`, `getBaouleEngineStatus`, `getVoiceServiceStatus`… prévus mais non exposés dans Voix & Langue (écran d'audit F11 jamais monté).

## 6. Validation post-correctifs

- vitest **1224/1224** (81 fichiers, +2) · tsc 0 · eslint 0 · build prod OK · preview live 200.
- E2E navigateur post-correctifs : parcours complet sans erreur ; légendes bci/dyu et erreur honnête FR vérifiées en direct (headless sans voix système → « Aucune voix installée… » affiché, jamais de silence).
