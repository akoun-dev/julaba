# AGENT 1 — État de travail (Développement / Architecture)

```
AGENT ACTIF      : AGENT 1 (Expert Développement / Architecture)
TÂCHE            : B3-030 — Évaluation moteurs TTS Baoulé offline (LIVRÉE)
SOUS-TÂCHE       : Rapport .ai/EVAL_B3_TTS.md + smoke réel + scripts
PROGRESSION      : 100 %
STATUT           : TERMINÉ → prochaine tâche : B3-031 (moteur pilote MMS-TTS)
```

## Dernier état détaillé

```
AGENT ACTIF      : AGENT 1
TÂCHE            : B3-030 — Évaluation moteurs TTS Baoulé offline
SOUS-TÂCHE       : Sondage HF (tailles/licences exactes) + smoke sandbox réel
PROGRESSION      : 100 %
STATUT           : TERMINÉ (rapport + mesures + échantillons versionnés)
Livrables :
  - .ai/EVAL_B3_TTS.md (rapport complet : candidats, mesures, licences, pistes)
  - .ai/eval-b3/smoke-mms-akan.mjs (smoke synthèse — RTF 0,33, 4 WAV valides)
  - .ai/eval-b3/build_tokenizer_json.py (procédure tokenizer.json VITS réutilisable)
  - .ai/eval-b3/samples/*.wav (4 échantillons, voix donor akan = plombage)
Constats clés :
  - AUCUN TTS baoulé prêt à l'emploi (le « bci-baseline » = kit fine-tuning, poids akan)
  - Corpus Waxal bci_tts 180 h CC-BY-4.0 → entraînement licitement commercial possible
  - Modèles MMS CC-BY-NC → pilote seulement ; production = Piper custom (B3-034)
  - Vocab donor 30 chars sans tons → normalisateur bci requis dans B3-031
Registre :
  - B3-030 → TERMINÉ ; B3-031 redéfinie (moteur pilote) ; B3-033/B3-034 créées
Décisions requises utilisateur (bloquent B3-033/034, PAS B3-031) :
  - budget/plateforme GPU pour entraînements ; ordre des pistes ; écoute échantillons
Prochaine action :
  B3-031 — src/lib/voice/mms-tts.ts (pattern DADR-001) + normalisateur bci + tata-tts
```
