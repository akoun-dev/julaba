# AGENT 1 — État de travail (Développement / Architecture)

```
AGENT ACTIF      : AGENT 1 (Expert Développement / Architecture)
TÂCHE            : B4-041 — Confirmations bilingues + robustesse réseau (CODE_TERMINÉ)
SOUS-TÂCHE       : confirmations.ts + branches confirm 2 modales + fetchJsonWithTimeout
PROGRESSION      : 90 %
STATUT           : VALIDATION → prochaine tâche : B5-050 (baoule-engine.ts)
```

## Dernier état détaillé

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
