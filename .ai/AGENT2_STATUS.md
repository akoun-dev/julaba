# AGENT 2 — État de travail (Chef de projet technique / QA)

```
AGENT ACTIF      : AGENT 2 (Chef de projet technique / QA)
TÂCHE            : Validation B4-042 (E2E chaîne bci, mocks)
SOUS-TÂCHE       : Scénario TEST_PLAN §3-B4 + garde de bout en bout + non-régression fr
PROGRESSION      : 100 %
STATUT           : B4-042 VALIDÉ (603/603) · B2-021/B3-031/B4-040/B4-041/B5-050/B5-051 EN_VALIDATION (device) · B5-052 BLOQUÉ (appareil)
```

## Validations effectuées (2026-09-19 — bloc B4/B5)

| Vérification | Méthode | Résultat |
|--------------|---------|----------|
| **B4-042 E2E chaîne** | `baoule-chain-e2e.test.ts` (5 scénarios) : STT bci → trad fr obligatoire → `parseIntent` vente (2 000 F, tomate) → confirm `ɛhɛ`/`ao` bilingue → NLLB fra→bci → `tataSpeak` texte brut bci | 5/5 → **VALIDÉ** |
| Garde de bout en bout | E2E : traducteur absent → `BaouleEngineError` BAOULE_TRANSLATOR_NOT_READY, `parseIntent` jamais atteint (verrou demandé en remontée n°2 du 2026-09-18) | VALIDÉ |
| Repli explicite | E2E : fra→bci impossible → narration française HORS chemin MMS (`tataSpeakWeb`) + `translationError` | VALIDÉ |
| Non-régression fr | E2E dédié : pass-through strict, aucune traduction, `oui`/`non` inchangés, narration française directe | VALIDÉ |
| Façade B5-050 | `baoule-engine.test.ts` (16 cas) : initialize sans téléchargement, session STT, mapping erreurs, speak, installs opt-in | VALIDÉ |
| Types / lint / build | `tsc --noEmit` · `eslint .` · `bun run build` | 0 / 0 / OK · CSP `wasm-unsafe-eval` intacte |
| Suite complète | `bun run test` | **603/603 (39 fichiers)** |
| Branchement B5-051 | stt-factory route bci via la façade ; 2 modales migrées ; route fr inchangée (21 tests stt verts, 32 tata-tts verts) | VALIDÉ |
| NORM-302 / DOC-306 | 0 importeur vérifié avant suppression ; AGENTS.md aligné (10 stores, pipeline voix réel) | VALIDÉ |

## Verdicts registre (2026-09-19)

- **B4-042 → TERMINÉ 100 %** (E2E mocks — sa définition ne dépend pas d'un appareil).
- **B5-052 → BLOQUÉ (appareil requis)** : le volet « tests de contrat » est couvert (baoule-engine.test.ts + E2E) ; le smoke APK (assembleDebug + conversation bci de bout en bout sur téléphone) rejoint B1-010/B3-032 — mêmes sessions terrain.
- B2-021, B3-031, B4-040, B4-041, B5-050, B5-051 restent **VALIDATION 90 %** : le code est vert et branché, la validation FINALE exige l'appareil (latence NLLB réelle, voix MMS audible, RTF, RAM) et l'oreille d'un locuteur natif (B3-032).

## Remontées AGENT 2

1. Décision d'architecture B4-040 acceptée : `intent.rawTranscript` porte la traduction française en session bci (catalogue + descriptions sync françaises côté données) — cohérent, documenté dans conversation.ts.
2. Repli descendant via `tataSpeakWeb` validé : le texte français n'atteint jamais la voix MMS akan (testé).
3. Liste confirmations bci = PILOTE (ɛhɛ/ɔ/o/ehe = oui ; ao = non) : à faire confirmer/étendre par le locuteur natif en B3-032 — le module est prévu pour ça.
4. Risque « o » court (= oui) si l'ASR bci renvoie un o parasite : mitigé par l'ancrage premier token ; à surveiller au smoke appareil.

## Prochaine action

- Terrain (regroupé, appareil requis) : B1-010 (benchmark ASR) + B2-021 (latence NLLB) + B3-031/B5-052 (smoke voix + APK) + B3-032 (écoute locuteur natif → décision B3-033/034).
- Utilisateur : SEC-402 (PAT, P0) + INF-401 (déploiement prod).
