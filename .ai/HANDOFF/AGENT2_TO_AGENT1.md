# HANDOFF AGENT 2 → AGENT 1

## Consigne n° 1 — 2026-09-18 : ordre d'exécution validé

```
BUG ID / Consigne : BUG-001 + plan d'exécution roadmap
Fonctionnalité    : vente rapide vocale (BUG-001) ; roadmap Baoulé (plan)
Priorité          : BUG-001 = P2 (débarrasse le gate) ; B2 = P1 (cœur du pivot)
Action demandée   : voir séquence ci-dessous
```

**Séquence demandée à AGENT 1 :**

1. **BUG-001** — corriger les 2 erreurs `react-hooks/immutability` dans `src/components/marchand/vente-rapide-modal.tsx` (lignes ~63, ~91). Préserver le comportement (confirmation vocale + synchro). Tests : suite vente + lint 0 erreur.
2. **B2 — Module NLLB-200** (`src/lib/voice/nllb-translation.ts`) : conformément à REQUIREMENTS §C-B2. Respecter DADR-001 (pattern kokoro-tts : opt-in, cache, progression, erreurs explicites, CSP). Livrer avec tests de contrat + test de garde « parseIntent jamais bci brut » + HANDOFF.
3. **B3 — TTS Baoulé** : évaluation moteurs candidats documentée (taille/latence/licence) AVANT intégration.
4. **B4/B5** : après B2+B3 validés.

**Étapes de reproduction BUG-001** : `bunx eslint .` (depuis `/home/z/julaba`).

**Résultat attendu** : 0 erreur lint, 480+ tests verts, comportement de vente vocale inchangé.

**Fichiers suspects** : `src/components/marchand/vente-rapide-modal.tsx` (introduit/modifié par `ce8aa12`).

**Régression** : vérifier que `voice-modal.tsx` (qui utilise aussi `completeQuickSale`) reste vert (`stt-routing`, `voice-service` suites).

*Note : BUG-001 est préexistant (commit `ce8aa12` d'une session concurrente) — la correction est déclarative au registre, sans recherche de responsable.*
