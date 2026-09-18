# AGENT 1 — État de travail (Développement / Architecture)

```
AGENT ACTIF      : AGENT 1 (Expert Développement / Architecture)
TÂCHE            : NORM-302 — Code mort supprimé (TERMINÉ)
SOUS-TÂCHE       : browser.ts, ident-top-bar, custom.db, examples/, dep z-ai
PROGRESSION      : 100 %
STATUT           : TERMINÉ → prochaine tâche : DOC-306 (mise à jour AGENTS.md)
```

## Dernier état détaillé

```
AGENT ACTIF      : AGENT 1
TÂCHE            : NORM-302 — Suppression code mort
SOUS-TÂCHE       : Vérification 0 importeur puis suppression safe
PROGRESSION      : 100 %
STATUT           : TERMINÉ (598/598 · tsc 0 · lint 0 · build prod OK · CSP)
Supprimé :
  - src/lib/supabase/browser.ts (createSupabaseBrowserClient jamais importé)
  - src/components/identificateur/ident-top-bar.tsx (jamais importé)
  - db/custom.db (vestige Prisma, aucune référence)
  - examples/websocket/ (aucune référence depuis src/scripts)
  - dep z-ai-web-dev-sdk (package.json + bun.lock synchronisés)
Précaution :
  - z-ai dans tests/python-runtime-container.sh = nom d'image Docker,
    sans rapport — conservé
Prochaine action :
  DOC-306 — mise à jour AGENTS.md (10 stores, pipeline voix réel)
```

## État précédent (B5-051)

```
AGENT ACTIF      : AGENT 1
TÂCHE            : B5-051 — Branchement stt-factory + modales sur la façade
SOUS-TÂCHE       : Entrée unique + non-régression fr
PROGRESSION      : 90 % (smoke APK = B5-052 AGENT 2 ; E2E = B4-042 AGENT 2)
STATUT           : CODE_TERMINÉ (598/598 · tsc 0 · lint 0 · build prod OK)
Livrables :
  - stt-factory.ts : route bci → createBaouleTranscriptionSession (façade)
  - voice-modal.tsx + prod-voice-modal.tsx : prepareBaouleParserInput /
    speakBaoule / describeBaouleEngineError via la façade ;
    fetchJsonWithTimeout ré-exporté — entrée UNIQUE de la chaîne baoulé
  - baoule-engine.ts : ré-export fetchJsonWithTimeout + TIMEOUT_MS
  - stt-routing.test.ts : mock registerPlugin ajouté (chaîne façade → native-tts)
Non-régression vérifiée :
  - route fr de stt-factory inchangée · 32 tests tata-tts verts ·
    21 tests stt-routing/factory verts · suite 598/598
Roadmap agents terminée :
  - B1→B5 intégralement câblé côté AGENT 1 — restent B4-042 (E2E) et
    B5-052 (smoke APK) côté AGENT 2, puis validations utilisateur
    (B1-010 device, B3-032 natif, B3-033/034 GPU)
```

## État précédent (B5-050)

```
AGENT ACTIF      : AGENT 1
TÂCHE            : B5-050 — Moteur unifié BaouleVoiceEngine (contrat API)
SOUS-TÂCHE       : Façade B1→B4 + codes d'erreur dédiés + tests contrat
PROGRESSION      : 90 % (branchement = B5-051 ; smoke APK = B5-052)
STATUT           : CODE_TERMINÉ (598/598 · tsc 0 · lint 0 · build prod OK)
Livrables :
  - src/lib/voice/baoule-engine.ts — FAÇADE PURE (aucune logique dupliquée) :
    getBaouleEngineStatus/isBaouleEngineReady (sondes), initializeBaouleEngine
    (STT natif, jamais de téléchargement, état exact),
    createBaouleTranscriptionSession (STT bci offline),
    translateBaouleToFrench/prepareBaouleParserInput (garde B2-022),
    speakBaoule (ne lève jamais), installBaouleTranslator/Voice (opt-in)
  - BaouleEngineError (7 codes) + describeBaouleEngineError
  - __tests__/baoule-engine.test.ts (16 cas)
Principe clé :
  - chaque maillon reste dans son module d'origine — la façade ne fait
    qu'unifier le contrat et les erreurs pour B5-051 (branchement)
Prochaine action :
  B5-051 — brancher stt-factory (bci → engine) + modales sur la façade,
  non-régression fr ; B5-052 (AGENT 2) = smoke APK
```

## État précédent (B4-041)

```
AGENT ACTIF      : AGENT 1
TÂCHE            : B4-041 — Confirmations oui/non bilingues + robustesse réseau
SOUS-TÂCHE       : Module confirmations + câblage modales + borne réseau
PROGRESSION      : 90 % (liste bci = PILOTE, validation natif B3-032 ; latence device B1-010)
STATUT           : CODE_TERMINÉ (582/582 · tsc 0 · lint 0 · build prod OK)
Livrables :
  - src/lib/voice/confirmations.ts (parseConfirmation fr+bci, liste PILOTE
    documentée, normalizeConfirmationText NFD strip-tons)
  - voice-modal.tsx + prod-voice-modal.tsx (branches confirm → parseConfirmation)
  - conversation.ts + fetchJsonWithTimeout (10 s, REQ-B4c)
  - __tests__/confirmations.test.ts (39) + conversation.test.ts (+4)
Limites honnêtes :
  - formes bci = interjections les plus attestées des lexiques (ɛhɛ, ao) —
    PILOTE jusqu'à validation par locuteur natif (B3-032) ; extensible
Prochaine action :
  B5-050 — baoule-engine.ts (contrat API unifié initialize/isReady/
  transcribe/speak, encapsule B1→B4) ; B4-042 E2E = AGENT 2
```

## État précédent (B4-040)

```
AGENT ACTIF      : AGENT 1
TÂCHE            : B4-040 — Orchestrateur conversation bci→fr→IA→fr→bci
SOUS-TÂCHE       : Module orchestrateur + câblage modales + tests contrat
PROGRESSION      : 90 % (E2E mocks = B4-042 AGENT 2 ; smoke appareil avec B1-010)
STATUT           : CODE_TERMINÉ (539/539 · tsc 0 · lint 0 · build prod OK + CSP)
Livrables :
  - src/lib/voice/conversation.ts (resolveConversationInput — garde B2-022
    branchée en prod ; narrateResponse — fra→bci puis tataSpeak texte brut,
    repli tataSpeakWeb hors MMS + translationError ; seams de test)
  - voice-modal.tsx + prod-voice-modal.tsx (handleTranscript + 22 sites de
    narration migrés ; session fr = pass-through strict, zéro régression)
  - src/lib/voice/__tests__/conversation.test.ts (13 cas)
Décision documentée :
  - intent.rawTranscript = traduction française en session bci
    (findCatalogEntry + descriptions sync = français côté données)
Limites honnêtes :
  - oui/non bci via traduction NLLB (patterns natifs = B4-041) ; UI en fr
Prochaine action :
  B4-041 — confirmations oui/non bilingues + robustesse réseau ; puis
  B5-050 (baoule-engine.ts) ; B4-042 E2E = AGENT 2
```

## État précédent (B3-031)

```
AGENT ACTIF      : AGENT 1
TÂCHE            : B3-031 — Moteur pilote MMS-TTS baoulé
SOUS-TÂCHE       : Module + normalisateur + branchement + UI + tests
PROGRESSION      : 90 % (smoke appareil restant — rejoint B3-032)
STATUT           : CODE_TERMINÉ (526/526 · tsc 0 · lint 0 · build prod OK)
Livrables :
  - src/lib/voice/mms-tts.ts (downloadMmsBciVoice, mmsBciSpeak, isMmsBciVoiceReady,
    removeMmsBciVoice, normalizeBciText, buildMmsTokenizerJson, MmsError implicite
    via false + warn — contrat kokoro)
  - src/lib/voice/tata-tts.ts (chemin bci en amont, dispatchFrenchNarration extrait,
    texte BRUT au MMS, repli fr inchangé)
  - src/components/shared/bci-voice-card.tsx (+ insertion marchand/producteur)
  - src/lib/voice/__tests__/mms-tts.test.ts (25) + tata-tts.test.ts (+6)
Découverte/clé :
  - Cache API pré-rempli avec clés HF exactes → from_pretrained 100 % offline
  - transformers.js v2 = quantized true|false seulement → fp32 114 Mo (fp16 v3)
Prochaine action :
  B4-040 — orchestrateur conversation bci→fr→IA→fr→bci (B2 NLLB + B3 moteur prêts)
```
