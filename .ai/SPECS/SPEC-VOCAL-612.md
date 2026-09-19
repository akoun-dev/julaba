# SPEC-VOCAL-612 — Auto-relance du micro après les questions de Tata + libellés cohérents + vouvoiement

*Source : rapport CTO (2026-09-19) — défaut micro dans `voice-modal.tsx` · Priorité P1 (UX bloquante vocale) · Agent 1 (Tech Lead)*
*Règle produit : vouvoiement de la marchande (fourni par le CTO — `references/copy.md` cité mais ABSENT du dépôt ; la règle est appliquée telle que formulée dans la demande).*

## 1. Défaut principal : le second démarrage du micro n'est pas branché

Quand Tata pose une question (confirmation OU quantité manquante), elle parle puis se
taut — aucune écoute n'est relancée : le marchand doit re-appuyer sur le micro
(bouton de la barre du bas), ce qui casse la conversation mains-libres.

**Correctif** — pattern éprouvé de `vente-rapide-modal.tsx` (refs d'indirection +
`requestAnimationFrame`) : relancer l'écoute dans le callback de fin de narration.

| # | Site | Avant | Après |
|---|------|-------|-------|
| 1 | Quantité manquante (§12, `executeIntent` vente sans quantité) | `speakBaoule(askText)` — aucune relance | réf posée → `set` → `speakBaoule(askText, cb)` avec `cb = rAF → startListeningRef` |
| 2 | Confirmation (`shouldConfirm`) | `speakBaoule(responseText)` puis réf posée | réf posée D'ABORD → `set` → `speakBaoule(askFull, cb)` avec relance |

- **Ordre imposé** : `pendingConfirmRef`/`pendingQuantityRef` sont posés AVANT de lancer
  l'écoute (la réponse suivante doit être interprétée comme confirmation/quantité).
- **Indirection obligatoire** : `processTranscript` (l533) précède `startListening` (l699)
  — référence directe = cycle de déclarations, exactement le BUG-001 (`react-hooks/
  immutability`). Même remède : `startListeningRef` synchronisée par `useEffect`.
- **Garde anti-boucle (scénario 4)** : les erreurs micro (`onError`) ne relancent JAMAIS
  l'écoute (message + fermeture programmée — comportement existant conservé). La relance
  n'existe que dans le callback de fin de narration des 2 questions ci-dessus.
- **Réponse incomprise (scénario 3)** : si un pending (confirm OU quantité) vient d'être
  consommé et que la réponse re-parsée est `unknown` → Tata reformule (« Je n'ai pas
  compris. Dites oui… / la quantité vendue. ») et ROUVRE l'écoute — limité à 2 relances
  (`confirmRetryRef`), ensuite « Je n'ai pas compris. Utilisez le clavier. » + fermeture.
  Une réponse reconnue comme autre commande valide s'exécute normalement (comportement
  historique conservé). Le compteur est remis à 0 à chaque NOUVELLE question posée.

## 2. Libellés UI alignés sur le comportement automatique

| État | Texte affiché |
|---|---|
| Question de confirmation (bulle) | phrase parlée (§3) + `Je vous écoute.` en sous-texte |
| Question de confirmation (sous-texte) | `Je vous écoute. Dites oui pour confirmer ou non pour annuler.` |
| Écoute active (bulle + label bas) | `Je vous écoute…` |
| Question de quantité (sous-texte) | `Je vous écoute. Dites la quantité vendue.` |
| Réponse incomprise | `Je n'ai pas compris. Réessayez.` (cas générique) / reformulation §1 |
| Micro indisponible | `Le micro n'est pas disponible. Vérifiez l'autorisation du micro ou utilisez le clavier.` |

- « Maintenez pour confirmer (oui) ou annuler (non) » (l852) : supprimé — ne correspond
  ni au bouton (clic-toggle depuis 0e14560) ni à l'écoute auto.
- « Appuyez pour envoyer » (label bas en écoute) : remplacé par « Je vous écoute… ».
- `describeSTTError` (`stt-factory.ts`) : `not-allowed`, `service-not-allowed`,
  `audio-capture` → la phrase « micro indisponible » ci-dessus (proposition clavier incluse).
- Arbitrage assumé (documenté) : la bulle de confirmation affiche la phrase PARLÉE qui
  contient déjà l'instruction — le sous-texte la répète volontairement (demande CTO,
  pédagogie marchand).

## 3. Phrases parlées (vouvoiement — Tata marchande)

### 3.1 Confirmation principale (vente) — `localIntent.ts`
`responseText` de la vente réécrit :
`Je vais enregistrer la vente de [2 kilos de] tomates pour 2 000 francs. Dites oui pour
confirmer ou non pour annuler.` — le parenthésé technique « (2 unités à 1 000 F) » est
supprimé (illisible à l'oral). Constante partagée `CONFIRM_ASK` exportée par
`tata-phrases.ts` et importée par `localIntent.ts` (aucun cycle).
Les autres intents confirmés (dépense, réappro, achat…) conservent leur `responseText` ;
le modal y ajoute `CONFIRM_ASK` au moment de la pose (garde anti-doublon).

### 3.2 Refus de confirmation (honnêteté par type)
« D'accord, j'annule. » → vente (confirm ou quantité) : **« D'accord, la vente n'est pas
enregistrée. »** ; tout autre type : **« D'accord, rien n'est enregistré. »** (le pending
peut être une dépense — ne jamais dire « la vente » à tort).

### 3.3 `tata-phrases.ts` — conversion intégrale tutoiement → vouvoiement
- §18 refus stock : « **Vous avez** seulement 10 kilos de tomates en stock. Je ne peux
  pas enregistrer une vente de 15 kilos. » / « **Vous n'avez** plus de stock de X. »
- §38 check : « **Il vous reste** 63 kilos d'oignons… » / « **Vous n'avez** plus
  d'oignons. » / « **Vous ne m'avez** jamais dit combien **vous avez** d'oignons.
  **Comptez votre** stock d'abord, je le noterai. »
- §39 warning : « Attention, il ne **vous** reste que 4 kilos de tomates. »
- §12 demande de quantité : « **Combien de kilos de tomates avez-vous vendus ?** » /
  « **Combien de tomates avez-vous vendues ?** » — accord du participe par heuristique
  graphique (finit par `es` → `vendues`, `s`/`x` → `vendus`, sinon `vendu`) ; l'oral
  prononce [vɑ̃dy] identiquement (documenté, non audible).
- §29 marge : « Je ne sais pas combien **vous avez** acheté le riz. **Enregistrez** un
  achat d'abord, et je **vous** dirai **votre** marge. » / « sur le riz **vous perdez** » /
  « **vous gagnez** ».
- Montants : conservés en chiffres formatés (« 2 000 francs ») — la couche voix
  (`toSpeechText`) les verbalise déjà en lettres ; écrire les nombres en toutes lettres
  dans le texte ne changerait rien à l'oral et casserait 10+ verrous de tests (arbitrage
  documenté, réversible à la demande du CTO).

### 3.4 Sœurs du même flux (cohérence)
- `day-summary.ts` : « **Il vous reste** X francs en caisse. » (§ VOCAL-611).
- `voice-modal.tsx` : « Ce produit n'est pas dans **votre** stock. » (×2).
- Hors périmètre (documenté) : `prod-voice-modal.tsx` (espace producteur), fixtures TTS
  arbitraires (`speech-text`/`tata-tts`/`kokoro-tts` — testent la verbalisation, pas la
  source), fixtures « j'annule » de `conversation`/`baoule-chain-e2e` (couche narration).

## 4. Tests (avant code — rouges vérifiés)

1. **tata-phrases.test.ts** : 5 verrous §18 vouvoiés ; check §38 élision/vide ; warning ;
   marge 3 vérités.
2. **voice-stock-intents.test.ts** : askQuantity §12 vouvoié (2 verrous) ; NOUVEAUX :
   accord `vendus/vendues/vendu` (tomates/bassines vs oignons/riz/kilos) + `CONFIRM_ASK`.
3. **localIntent.test.ts** : NOUVEAU — responseText vente avec quantité+unité, sans
   quantité, sans produit (« Article ») — contient « Je vais enregistrer la vente » et
   `CONFIRM_ASK`, ne contient plus « c'est bien ça ».
4. **stt-routing.test.ts** : 3 cas micro → phrase « micro indisponible ».
5. **day-summary.test.ts** : 10 verrous « Il vous reste X francs en caisse ».

## 5. Scénarios CTO couverts (vérification appareil — rejoint B5-052)

1. Vente confirmée : Tata lit → micro s'ouvre → « oui » enregistre, « non » annule.
2. Vente sans quantité : Tata demande → micro s'ouvre → « deux kilos » poursuit.
3. Réponse incomprise : reformulation + ré-écoute (max 2) → clavier.
4. Erreur micro : pas de boucle, message clavier.
5. `vente-rapide-modal.tsx` : pattern `requestAnimationFrame(() => startListeningRef)`
   conservé à l'identique (aucun changement de ce fichier).
