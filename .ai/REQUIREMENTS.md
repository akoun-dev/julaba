# Exigences — Jùlaba (incl. roadmap multilingue « Baoulé phase pilote »)

*Source : demandes utilisateur + analyse AGENT 2. Statuts reflétés dans `TASKS.xlsx` (source de vérité).*

## A. Exigences transverses (mission)

- **REQ-T1** — Fonctionnement 100 % offline sur natif après installation des modèles.
- **REQ-T2** — Erreurs explicites utilisateur, jamais de fallback silencieux entre langues/moteurs.
- **REQ-T3** — Validation systématique avant tout commit : `bun run test` + `bunx tsc --noEmit` + `bunx eslint .`.
- **REQ-T4** — FCFA entiers, UI en français standard.
- **REQ-T5** — Téléchargements de modèles uniquement opt-in (action utilisateur explicite), avec progression et messages d'erreur affichés (pattern Task 41).

## B. Exigences existantes livrées (référentiel)

| Domaine | Contenu | Statut |
|---------|---------|--------|
| Auth multi-comptes | PIN/schéma/visuel/biométrie, session↔appareil, BO MFA+lockout | Livré, 480 tests verts |
| Vente | Caisse, vente rapide vocale avec confirmation (`quick-sale.ts`), stock, dépenses | Livré (ce8aa12) |
| Offline | File FIFO, 12 handlers rejeu idempotents, conflits → BO | Livré |
| Backoffice | 24+ modules RBAC, objectifs, alertes, carte, sync-conflicts | Livré |
| Enrôlement | Wizard 5 étapes, OCR CNI, GPS, codes JID-XXXX | Livré |
| Voix FR | STT Sherpa offline, NLU 2 niveaux, TTS 4 moteurs, wake-word | Livré |
| Sélecteur langue fr/baoulé | Réglages marchand + producteur (sttLanguage + ttsLanguage persistés) | Livré (bfec4f8) |
| B1 — ASR Baoulé | Omnilingual CTC 300M int8 embarqué, route dédiée sans fallback | Livré — **validation terrain pendante** |

## C. Roadmap multilingue « Baoulé phase pilote » (demande active)

**Architecture cible validée par l'utilisateur :**

```
ENTRÉE (ASR Baoulé) → texte bci → [NLLB traduction bci→fra] → Français
  → IA Jùlaba « Tata Nanti Lou » (fr)
  → [NLLB traduction fra→bci] → texte bci → TTS Baoulé → SORTIE 🔊
```

Chaque chaîne doit être **valide indépendamment** ; ne pas développer les 5 langues en même temps (baoulé = pilote unique).

### B1 — ASR Baoulé (Omnilingual `bci_Latn`) — ✅ embarqué / ◐ validation
- REQ-B1a : transcription offline sur Android ARM64 (fait — plugin + modèle embarqué).
- REQ-B1b : **benchmark sur téléphone réel** (≥10 phrases, ≥2 locuteurs natifs, CER/WER + RTF/RAM, environnement marché) → `docs/BENCHMARK.md`. *Action utilisateur requise (appareil physique).*

### B2 — Traduction NLLB-200 bci↔fra — ❌ à construire (priorité P1, cœur du pivot)
- REQ-B2a : module `src/lib/voice/nllb-translation.ts` — API de type `traduire(texte, { source: 'bci_Latn' | 'fra_Latn', cible })` → `boolean`-style résultats explicites, jamais de fallback silencieux.
- REQ-B2b : modèle NLLB-200 distillé (ONNX, offline, opt-in téléchargement + cache + progression — pattern `kokoro-tts.ts`), compatible CSP `'wasm-unsafe-eval'`.
- REQ-B2c : validation qualité sur phrases courtes/longues, vocabulaire agricole et commerce (produits, quantités, montants, oui/non).
- REQ-B2d : garde d'architecture : `parseIntent()` ne doit **jamais** recevoir de texte bci brut (test).

### B3 — TTS Baoulé offline — ❌ à construire (P1)
- REQ-B3a : évaluer les moteurs candidats voix bci offline (ex. MMS-TTS bci, Piper custom) — critères : taille, latence, compréhensibilité, licence, compat WASM/natif.
- REQ-B3b : intégration dans la chaîne `tata-tts` (remplacer `notifyBciNarrationLimitOnce` par une narration bci effective quand `ttsLanguage='bci'`), opt-in + cache.
- REQ-B3c : validation qualité (compréhensibilité par locuteur natif).

### B4 — Chaîne conversation bci→fr→IA→fr→bci — ❌ à construire (P2, dépend B2+B3)
- REQ-B4a : orchestrateur de la chaîne complète (ASR bci → trad fr → NLU/IA → réponse fr → trad bci → TTS bci).
- REQ-B4b : **confirmations oui/non en baoulé** (le parser `yes/no` actuel est 100 % français — cas critique).
- REQ-B4c : gestion d'erreurs/timeout explicite à chaque maillon ; interruption réseau en pleine conversation.

### B5 — Moteur `BaouleVoiceEngine` + intégration Jùlaba — ❌ à construire (P2, dépend B2+B3+B4)
- REQ-B5a : module unifié `src/lib/voice/baoule-engine.ts` (API type `initialize/isReady/transcribe/speak`, codes d'erreur dédiés) encapsulant B1→B4.
- REQ-B5b : branchement `stt-factory` + `voice-modal` + `prod-voice-modal` sans régression du français.
- REQ-B5c : tests de contrat + routing étendu + smoke APK.

## D. Exigences d'infrastructure/sécurité connexes

- **REQ-I1** (P0, action utilisateur) : révoquer le PAT GitHub `ghp_EUGEmf…` exposé en clair.
- **REQ-I2** (P2) : déploiement prod (Vercel) puis régénérer l'APK SANS `CAPACITOR_SERVER_URL` (dépendance à la preview sandbox éphémère).
- **REQ-I3** (P3) : mettre à jour `AGENTS.md` (obsolète : 7 stores vs 10 réels, pipeline voix décrit « Web Speech »).
- **REQ-I4** (P2) : corriger les 2 erreurs eslint `react-hooks/immutability` de `vente-rapide-modal.tsx` (BUG-001, introduites par ce8aa12).
