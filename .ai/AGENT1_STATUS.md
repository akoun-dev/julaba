# AGENT 1 — État de travail (Développement / Architecture)

```
AGENT ACTIF      : AGENT 1 (Expert Développement / Architecture)
TÂCHE            : B3-031 — Moteur pilote TTS baoulé (CODE_TERMINÉ, smoke appareil restant)
SOUS-TÂCHE       : mms-tts.ts + normalisateur bci + tata-tts + UI
PROGRESSION      : 90 %
STATUT           : VALIDATION → prochaine tâche : B4-040 (orchestrateur chaîne)
```

## Dernier état détaillé

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
