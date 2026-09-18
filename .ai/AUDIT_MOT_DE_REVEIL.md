# Audit — Mot de réveil « Julaba » (2026-09-19, Task 55 — VOCAL-606)

**Demande utilisateur** : « assure toi que le mot de reveil est correctement implémenté ».
**Périmètre vérifié** : chaîne complète `wake-word.ts` → `stt-factory.ts` (createSmartContinuousSTT) → `wake-word-manager.tsx` → 4 modales vocales (voice-modal, vente-rapide-modal, open-caisse-modal, prod-voice-modal) → réglages (`app-store` : voiceEnabled && wakeWordEnabled).

## 1. Ce qui était déjà correct (vérifié)

- **Auto-relance du continu natif** : `createSherpaContinuousSTT` redémarre la reconnaissance après chaque résultat final (stt-factory.ts:253-257) — le listener ne devient plus sourd après la première phrase.
- **Réveil → modale directe** : détection = `setVoiceAutoRecord(true)` + `openVoiceModal()` (wake-word-manager.tsx:44-49) — dire « Julaba » suffit, comme un appui long.
- **Pause pendant l'init** : le fix VOCAL-604 (`_paused`) annule un `startWakeWordListener()` en vol quand une modale ouvre pendant le chargement du modèle (3 tests verts).
- **Variantes du mot** : `julaba / djulaba / jula ba / jou laba` (wake-word.ts:11-16) ; « djoula » volontairement exclu (nom de la langue, faux positifs) ; résultats intermédiaires ignorés ; anti-rebond 5 s.
- **Montage conditionnel** : `WakeWordManager` monté seulement authentifié + rôle marchand/producteur (page.tsx:442).

## 2. Défauts trouvés (4) et corrections

### F1 — P1 : double start concurrent à la fermeture de modale (sessions orphelines)
À la fermeture d'une modale, le **body** de l'effet ET son **cleanup** (qui capture l'ancienne valeur `true`) appellent chacun `resumeWakeWord()` → deux `startWakeWordListener()` concurrents → deux sessions créées et démarrées ; la variable module n'en retient qu'une, l'autre écoute pour toujours (contention de micro, double détection, batterie).
Preuve : voice-modal.tsx:60-64 et prod-voice-modal.tsx:62-66 (cleanup inconditionnel), open-caisse-modal.tsx:99-105, vente-rapide-modal.tsx:389-404 (body + cleanup).
**Correctif** : compteur de génération `_startGen` dans `startWakeWordListener` — un start supplanté (génération dépassée à la résolution d'un await) avorte la session qu'il vient de créer ; le gagnant seul démarre.

### F2 — P1 : le réglage « mot de réveil » était ignoré au resume
`resumeWakeWord()` relançait le listener sans consulter `wakeWordEnabled`/`voiceEnabled` : avec le mot de réveil **désactivé** dans les réglages, il suffisait d'ouvrir puis fermer n'importe quelle modale vocale pour rallumer le micro de fond en secret.
Preuve : wake-word.ts:195-201 (ancien code — aucun test du réglage).
**Correctif** : `setWakeWordEnabled(bool)` (nouvelle API) pilotée par `WakeWordManager` (reflète `voiceEnabled && wakeWordEnabled`, posée false au démontage/logout) ; `resumeWakeWord()` ne redémarre que si activé.

### F3 — P1 : résurrection du micro de fond pendant une modale (> 10 s)
Détection → état `detected` + timer « retour à l'écoute » armé (10 s). La modale ouvre → `pauseWakeWord()` avortait la session mais **n'annulait pas ce timer** et laissait l'état `detected` (il ne convertissait que `listening`). Une vente vocale dure régulièrement > 10 s : le timer voyait `detected`, repassait `listening` et relançait `session.start()` — micro de fond actif pendant la modale, exactement la contention que la pause doit empêcher.
Preuve : wake-word.ts:229-236 + 187-189 (ancien code).
**Correctif** : `pauseWakeWord()` annule `_resetTimer` et repasse l'état à `inactive` depuis `listening` **et** `detected` ; garde `if (_paused) return` dans le callback du timer (ceinture et bretelles). Le chemin de récupération « détection sans ouverture de modale → l'écoute repart à 10 s » est conservé et testé (F3b).

### F4 — P2 : session zombie après logout / coupure réglage pendant un start en vol
`stopWakeWordListener()` pendant l'`await initSherpaModel()` (ou la création de session) ne empêchait pas l'affectation `session = await createSmartContinuousSTT(...)` une fois l'await résolu → listener actif après déconnexion.
**Correctif** : `stopWakeWordListener()` incrémente `_startGen` ; le start en vol voit sa génération dépassée et avorte (ou ne crée jamais).

### Hygiène — cleanups alignés
`voice-modal.tsx`, `prod-voice-modal.tsx`, `open-caisse-modal.tsx` : cleanup conditionnel « resume seulement si la modale ÉTAIT ouverte » (même motif que vente-rapide-modal, audité VOCAL-604). Le double-resume résiduel à la fermeture reste bénin grâce à la génération (F1), mais ne part plus d'ouvertures.

## 3. Tests (8 nouveaux — `__tests__/wake-word-lifecycle.test.ts`)

| Test | Couverture |
|------|-----------|
| F1 double resume → une seule session vivante | génération anti-double-session |
| F4 stop pendant start en vol → aucune session créée | logout sans zombie |
| F3 détection puis pause + 11 s → rien ne ressuscite | timer annulé par la pause |
| F3b détection sans pause + 11 s → l'écoute repart | récupération voulue conservée |
| F2 réglage coupé → resume ne démarre rien | respect des réglages |
| F2b réglage actif → resume relance | pas de régression |
| détection « julaba » → beep + haptique + TTS + callback | flux nominal |
| interim / « djoula » / « bonjour » → pas de réveil | faux positifs |

**Résultat global** : **636/636 (43 fichiers)** · tsc 0 · eslint 0 · build prod OK. Baseline précédente 628/628 : aucun test modifié sauf le `beforeEach` de `wake-word-pause.test.ts` (déclare désormais le service activé — nouvelle contract `setWakeWordEnabled`).

## 4. Limites

- Audit statique + tests unitaires : le comportement réel du micro (Sherpa natif, WebView Android) reste à confirmer sur appareil — rejoint **B1-010 / B5-052** (smoke APK), notamment « Julaba » dit au démarrage puis vente vocale > 10 s.
- Arrière-plan natif (app en tâche de fond) : aucune gestion `appStateChange` — hors périmètre de cette passe, à évaluer au smoke device (batterie/vie privée).
