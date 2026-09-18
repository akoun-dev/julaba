# ÉVAL-B3 — Évaluation des moteurs TTS Baoulé offline (B3-030)

- **Date** : 2026-09-19 · **Auteur** : AGENT 1 (boucle autonome, Task 44) · **Statut** : ✅ Terminée
- **Exigence source** : REQ-B3a — évaluer les moteurs candidats voix bci offline (critères : taille, latence, compréhensibilité, licence, compat WASM/natif) et produire **un rapport AVANT intégration**.
- **Méthode** : sondage API Hugging Face (références et tailles exactes) + **smoke test réel** dans ce sandbox (chargement + synthèse + mesures RTF), scripts versionnés dans `.ai/eval-b3/`.
- **Toute la roadmap B3 repose sur ce constat : il n'existe AUCUN moteur TTS baoulé prêt à l'emploi au 2026-09-19.** L'intégration B3-031 ne peut pas consister à « brancher un modèle existant » : elle doit livrer le **moteur** (plombage technique) sur un checkpoint provisoire, et la voix baoulé réelle exige un **entraînement** (décision utilisateur, GPU hors sandbox).

---

## 1. Inventaire des candidats (mesuré, pas supposé)

| Candidat | Existence voix bci | Licence | Verdict |
|---|---|---|---|
| `facebook/mms-tts-bci` (MMS officiel) | **N'existe pas** (MMS-TTS couvre 1 107 langues ; bci absent) | — | ❌ écarté |
| `rnjema-unima/mms-tts-bci-baseline` | **PAS un modèle entraîné** — voir §2 | CC-BY-NC-4.0 | ❌ direct · ✅ comme kit de fine-tuning |
| Tout autre fine-tune bci publié | **Aucun** (recherche HF `mms-tts-bci` : 1 seul résultat, le kit ci-dessus) | — | ❌ écarté |
| Piper (`rhasspy/piper-voices`) | 37 langues, **pas de bci** | runtime MIT | ⚠️ piste B (entraînement custom) |
| Kokoro-82M (déjà intégré, fr) | Pas de bci (9 langues, pas de pipeline d'extension réaliste) | Apache-2.0 | ❌ écarté |
| eSpeak-NG | Pas de baoulé (il faudrait écrire lexique + règles phonèmes) | GPLv3 | ❌ écarté |
| Donor MMS akan (`facebook/mms-tts-aka`, port ONNX disponible) | Voix akan (langue cousine Kwa/Anyi-Baoulé) | CC-BY-NC-4.0 | ⚠️ piste C (pilote technique uniquement) |

## 2. Le piège du « baseline » bci (découverte clé)

Le seul dépôt HF se présentant comme du TTS baoulé (`rnjema-unima/mms-tts-bci-baseline`, tagué `proxy-checkpoint`) est en réalité un **kit de départ pour fine-tuning**, pas un modèle parlant baoulé. Son model card est explicite : *« Model weights are not stored here »* — `config.json` pointe vers `facebook/mms-tts-aka`, et le script `run_vits_finetuning.py` charge les poids du **donor akan** au moment de l'entraînement. Une inférence directe sur ce dépôt produit donc de l'**akan**, pas du baoulé. Le dépôt fournit trois patches de config (pad_token_id, tokenizer_config, preprocessor) qui rendent le checkpoint entraînable, plus la recette complète (dataset `google/WaxalNLP` config `bci_tts`). Aucun fine-tune bci entraîné n'est publié en ligne à ce jour.

## 3. Données d'entraînement disponibles (déterminant pour la suite)

| Donnée | Contenu | Licence | Usage commercial |
|---|---|---|---|
| `google/WaxalNLP` — config **`bci_tts`** | TTS : 180+ h **monolocuteur**, scripts phonétiquement équilibrés, 17 langues dont **Baoulé** (University of Ghana) | **CC-BY-4.0** | ✅ Oui (avec attribution) |
| `google/WaxalNLP` — ASR | 1 250 h transcrits, 19 langues (pas de bci confirmé dans les providers listés) | CC-BY-4.0 / CC-BY-SA-4.0 | ✅ Oui |

C'est le point favorable majeur : le corpus baoulé pour TTS **existe et est licitement commercial**. La contrainte de licence ne vient pas des données, mais du **checkpoint de base** (§5).

## 4. Mesures réelles sandbox (smoke test, onnxruntime-node, fp32)

Port ONNX du donor akan `onnx-community/mms-tts-aka-ONNX` (le seul membre de la famille MMS avec un port ONNX utilisable proche du baoulé) :

| Variante | Taille exacte | Remarque |
|---|---|---|
| onnx/model.onnx (fp32) | **114,28 Mo** | utilisée pour le smoke sandbox |
| onnx/model_fp16.onnx | **58,16 Mo** | cible device Android (B3-031) |
| onnx/model_q4f16.onnx | 56,87 Mo | alternative compacte |
| (pas de variante int8/q8) | — | VITS se dégrade fortement en int8 ; le port n'en propose pas |

**Synthèse mesurée** (machine sandbox, backend natif Node) :

| Échantillon | Texte | Synthèse | Audio produit | RTF |
|---|---|---|---|---|
| akwaba | « Akwaba ! » | 250 ms | 0,78 s WAV 16 kHz | 0,32 |
| ahou | « Ahou ! Ahou ! » | 353 ms | 0,98 s | 0,36 |
| yako | « Yako. » | 256 ms | 0,80 s | 0,32 |
| phrase-longue | 6 formules | 990 ms | 3,10 s | 0,32 |

- **RTF moyen 0,33** (3× plus rapide que le temps réel) sur CPU serveur sandbox. Sur un Android d'entrée de gamme en WASM (onnxruntime-web), attendre RTF ≈ 1-3 — **à mesurer sur appareil** (même incertitude que NLLB B2 ; le smoke sandbox démontre le plombage, pas la latence device).
- Chargement modèle : 0,9-1,3 s. Latence par phrase courte : 250-350 ms → compatible conversation.
- **4 échantillons WAV valides** produits : `.ai/eval-b3/samples/{akwaba,ahou,yako,phrase-longue}.wav` (écoute immédiate possible).
- ⚠️ Caveat qualité : ces échantillons ont été synthétisés avec les poids du **donor akan** — ils valident le **plombage**, pas la phonétique baoulé (B3-032 jugera).

## 5. Contraintes techniques découvertes (à intégrer dans B3-031)

1. **Vocab donor = 30 caractères**, dont une seule lettre à ton (`á`). Le baoulé standard note les tons (à, á, è, é, ǹ…) : tels quels, ces caractères seraient supprimés par la whitelist ou rendus `<unk>`. **Le module B3-031 doit donc inclure un normalisateur orthographique bci** (retrait des diacritiques de tons, conservation de ɛ, ɔ, ʼ, apostrophes) avant tout envoi au moteur. Ce normalisateur disparaîtra (ou s'adaptera) quand le checkpoint fine-tuné aura son propre vocab.
2. **Le port ONNX n'inclut pas de `tokenizer.json`** (requis par transformers.js v2). Solution éprouvée fournie : `.ai/eval-b3/build_tokenizer_json.py` reconstruit le tokenizer fast depuis `vocab.json` (schéma copié sur le port fonctionnel `Xenova/mms-tts-fra`). Réutilisable telle quelle pour le port du futur checkpoint bci fine-tuné. Piège documenté : `re.escape()` Python produit des échappements regex invalides en JavaScript (flag `u`) — seuls `\ ] ^ -` doivent être échappés dans la classe.
3. **Licence du modèle ≠ licence des données** : tout fine-tune VITS partant d'un checkpoint MMS hérite du **CC-BY-NC-4.0** (le model card du baseline le confirme : « MMS base governs fine-tuned model »). Un modèle NC est **inutilisable en production commerciale jùlaba** — uniquement évaluation/pilote interne.

## 6. Pistes et arbitrage

| | Piste A — Fine-tune VITS sur donor MMS | Piste B — Voix Piper custom | Piste C — Proxy akan brut |
|---|---|---|---|
| Voix baoulé réelle | ✅ (après entraînement sur `bci_tts`) | ✅ (après entraînement) | ❌ akan |
| Licence du produit final | **CC-BY-NC-4.0** (héritée) → pilote seulement | **Libre** (runtime MIT, corpus CC-BY-4.0) | CC-BY-NC-4.0 |
| Effort | GPU 1-4 h, pipeline documentée (finetune-hf-vits) | GPU quelques heures (piper-training), sous-échantillonnage du corpus (1-5 h suffisent) | 0 |
| Taille livrable device | ~58 Mo (fp16) | ~20-60 Mo (format Piper) | ~58 Mo |
| Intégration | **nouveau module** `mms-tts.ts` (transformers.js, pattern DADR-001) | **slot existant** `piper-tts.ts` (déjà en chaîne tata-tts) | module identique à A |
| Risque qualité | attendue bonne (warm-start + corpus mono-locuteur propre) | bonne (pipeline Piper éprouvée), prosodie à écouter | médiocre pour du bci (langue cousine seulement) |
| Production jùlaba | ❌ sauf accord licence avec Meta/Waxal | ✅ | ❌ |

**Conclusion d'arbitrage** : A et B ne sont pas concurrentes mais **complémentaires et séquentielles** — A valide le moteur et l'expérience bci tout de suite (et servira de banc de test B3-032 comparatif), B est la voie de production licitement propre. C n'est qu'un sous-produit de A (le même module avec le checkpoint donor).

## 7. Recommandation (replanification B3-031/B3-032)

1. **B3-031 (redéfinie — moteur pilote)** : créer `src/lib/voice/mms-tts.ts` selon DADR-001 (opt-in utilisateur, Cache API, progression, erreurs explicites, CSP `'wasm-unsafe-eval'` à valider en build de prod) avec : normalisateur orthographique bci (§5.1), checkpoint proxy akan fp16 (58 Mo), branchement `tata-tts.ts` (remplacement effectif de `notifyBciNarrationLimitOnce` quand `ttsLanguage='bci'`), marquage UI explicite « voix pilote (qualité limitée) ». Smoke device inclus.
2. **B3-033 (nouvelle — entraînement bci réel, GPU hors sandbox, décision utilisateur requise)** : fine-tune VITS sur `google/WaxalNLP:bci_tts` via le kit `mms-tts-bci-baseline` (recette complète fournie par le kit), port ONNX (procédure §5.2), puis bascule du module B3-031 vers ce checkpoint. Produit final NC → pilote/évaluation.
3. **B3-034 (nouvelle — piste production Piper, décision utilisateur requise)** : entraîner une voix Piper bci sur le même corpus (CC-BY-4.0) → produit libre ; réutilise le slot `piper` existant. À arbitrer après écoute comparative A/B par l'utilisateur.
4. **B3-032 (inchangée, élargie)** : validation locuteur natif comparative — proxy akan vs fine-tune bci (si disponible) vs Piper — sur une checklist de phrases du domaine (vente, montants, confirmations).
5. **Décisions attendues de l'utilisateur** (bloquantes pour B3-033/034 seulement, pas pour B3-031) :
   - budget/plateforme GPU (Colab/Kaggle/VPS) pour les entraînements ;
   - ordre des pistes (VITS d'abord recommandé : recette déjà packagée par le kit baseline) ;
   - éventuelle demande de licence commerciale à Waxal/UNIMA si la piste A devait viser la production.

## 8. Artefacts produits (versionnés)

- `.ai/eval-b3/smoke-mms-akan.mjs` — smoke test synthèse (chargement local, WAV, mesures RTF).
- `.ai/eval-b3/build_tokenizer_json.py` — génération tokenizer.json VITS (réutilisable pour tout futur port MMS).
- `.ai/eval-b3/samples/*.wav` — 4 échantillons (plombage, voix donor akan).
- Procédure documentée en tête de script ; modèle local non versionné (114 Mo, hors dépôt).

## 9. Sources

- API HF : `facebook/mms-tts-bci` (404), `rnjema-unima/mms-tts-bci-baseline` (model card, blobs), `onnx-community/mms-tts-aka-ONNX` (blobs), `Xenova/mms-tts-fra` (référence tokenizer), `rhasspy/piper-voices` (arborescence), `google/WaxalNLP` (README datasets).
- Mesures : exécution réelle `.ai/eval-b3/smoke-mms-akan.mjs` (2026-09-19, onnxruntime-node fp32, CPU sandbox).
