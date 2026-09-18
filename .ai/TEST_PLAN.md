# Plan de tests — Jùlaba

## 1. Base de validation systématique (après CHAQUE modification)

| Gate | Commande | Attendu |
|------|----------|---------|
| Tests unitaires | `bun run test` | 480+ verts (33 fichiers) |
| Types | `bunx tsc --noEmit` | 0 erreur |
| Lint | `bunx eslint .` | 0 erreur (2 erreurs BUG-001 en cours de correction) |
| Build (si pertinent) | `NODE_OPTIONS=--max-old-space-size=2000 bun run build` (FOREGROUND en sandbox) | succès |
| RLS (si migrations) | `bun run test:rls` | pgTAP vert |

## 2. Inventaire des suites existantes (33 fichiers vitest)

- **Voix (12)** : stt-routing (routing fr/bci), voice-service, stt-factory, tata-tts, kokoro-tts, piper-tts, localIntent (49 cas), nlu-ml, prodIntent, french-number, speech-text, stt.
- **IA (3)** : gemma-model, navigation-intent, producteur-navigation-intent.
- **Auth/sécurité (2)** : auth-multi, device-session.
- **Métier/offline (7)** : ventes-jour, objectifs, alertes-moteur, agent-code, relative-time, quick-sale (via vente-rapide), stores.
- **Notifications (9)** : channels, client, device, events, metrics, native, preferences, rules, schedule.
- **Vision (1)** : document-ocr (OCR CNI).
- SQL : `supabase/tests/rls.sql` (pgTAP, 2 tiers RLS).

## 3. Scénarios QA de la roadmap multilingue (AGENT 2 — à exécuter au fil des livraisons)

### B1 — ASR Baoulé (gate d'entrée, appareil réel requis)
1. Benchmark reproductible : ≥10 phrases bci, ≥2 locuteurs natifs, CER/WER + RTF/RAM (Tecno/Infinix, environnement marché).
2. Build allégé sans modèle → erreur `BAOULE_NOT_READY` affichée telle quelle (jamais de repli fr).
3. Web : `bci` → erreur explicite. Push-to-talk > 30 s → auto-stop propre. Continu bci → refus explicite.

### B2 — Traduction NLLB
1. Contrat de traduction bci↔fra : produits agricoles/commerce, quantités, montants, phrases courtes ET longues, oui/non.
2. **Garde d'architecture** : test « `parseIntent` ne reçoit jamais de texte bci brut ».
3. Timeout + erreur explicite si traducteur indisponible (pattern `nlu-ml.ts`).
4. Taille/latence du modèle offline sur entrée de gamme Android.

### B3 — TTS Baoulé
1. `ttsLanguage='bci'` → narration bci effective (remplace le signal `notifyBciNarrationLimitOnce`).
2. Téléchargement opt-in + cache offline après 1er téléchargement ; erreurs réseau affichées.
3. Compréhensibilité validée par locuteur natif (checklist simple).

### B4 — Chaîne E2E conversation
1. Scénario complet : dictée bci → trad fr → intention vente → confirmation IA fr → trad bci → TTS bci.
2. **Confirmation « oui » en baoulé** reconnue (parser bilingue).
3. Interruption réseau en pleine conversation → erreurs explicites, pas de blocage.

### B5 — BaouleVoiceEngine
1. Tests de contrat du moteur (initialize/isReady/transcribe/speak, codes d'erreur dédiés).
2. Routing stt-factory étendu (bci → engine), non-régression du fr (suite existante verte).
3. Smoke APK : `assembleDebug` + installation + conversation bci de bout en bout.

### Pièges de test connus (mémo sessions)
- `vi.mock(...).mockResolvedValue(false)` survit à `clearAllMocks` → re-stub explicite nécessaire.
- `agent-browser eval` cassé en sandbox → pages HTML de test avec logs rendus dans le DOM (`<pre id="log">`) + `agent-browser snapshot -s "#log"`.
- Fichiers ajoutés à `public/` après build → servis seulement après `bun x pm2 restart ecosystem.config.cjs --update-env`.
