# Plan d’action prioritaire — APK, modèles vocaux et voix ivoirienne nouchi

**Projet :** Jùlaba  
**Date :** 21 septembre 2026  
**Base analysée :** révision `b5c679e`

## 1. Décision d’architecture recommandée

Jùlaba ne doit pas distribuer toutes les capacités vocales dans l’APK initial. L’architecture cible doit séparer trois niveaux :

1. **APK de base léger**, installable et utilisable pour l’authentification, l’interface, la vente tactile, la caisse, la synchronisation et les fonctions essentielles.
2. **Pack vocal français/ivoirien**, téléchargé avec consentement explicite. Il contient le moteur TTS, la voix, le lexique ivoirien et les ressources nécessaires à la narration naturelle.
3. **Packs spécialisés optionnels**, notamment reconnaissance Baoulé/Dioula, traduction et IA locale. Ils ne doivent pas être imposés à tous les utilisateurs.

Cette séparation est particulièrement importante parce que le projet utilise une architecture Capacitor hybride distante. L’application doit continuer à distinguer l’accessibilité de l’interface, qui dépend actuellement du serveur Next.js, de la disponibilité offline des modèles audio. Un modèle téléchargé n’est pas suffisant pour garantir un premier lancement sans réseau si la WebView n’a pas encore chargé le serveur distant.

## 2. État et poids à prendre en compte

Les valeurs ci-dessous proviennent des scripts et modules du dépôt. Elles doivent être re-mesurées dans un build signé, mais elles suffisent pour prendre une décision d’architecture.

| Élément | Poids ou ordre de grandeur | Décision recommandée |
|---|---:|---|
| Modèle français Sherpa Zipformer int8 | Quelques dizaines de Mo, environ 50 Mo selon la documentation | Pack vocal français optionnel ou modèle embarqué seulement dans une variante terrain dédiée. |
| Modèle Baoulé/Dioula omnilingual CTC 300M int8 | Environ 349 Mo | Ne pas l’embarquer dans l’APK général. Pack ASR ivoirien optionnel, uniquement pour les utilisateurs concernés. |
| Gemma 3 1B local | Environ 558 Mo | Téléchargement à la demande. Ne pas l’inclure dans l’APK. Réserver son usage aux appareils compatibles. |
| MMS TTS Baoulé/Dioula actuel | Environ 114 Mo par voix, format fp32 | Ne pas utiliser comme voix commerciale finale sans revue de licence et de qualité. Garder comme démonstrateur ou référence d’évaluation. |
| NLLB Dioula–français | Environ 872 Mo | Ne jamais embarquer. Pack de traduction très spécialisé, réservé aux utilisateurs qui activent le parcours multilingue. |
| NLLB Baoulé spécialisé | Environ 893 Mo | Ne jamais embarquer dans l’APK. Le réserver à un pilote expérimental, avec mesure RAM/latence et consentement clair. |
| Runtime Sherpa, ONNX, WebView et plugins natifs | Variable selon ABI et packaging | Utiliser les splits ABI et vérifier le poids réel de chaque variante. |

Le risque le plus important est la combinaison du modèle omnilingual de 349 Mo, du runtime natif et d’autres bibliothèques. Le fait que les modèles ne soient pas versionnés dans Git ne signifie pas qu’ils ne grossissent pas l’APK : le script `scripts/fetch-android-deps.sh` les place dans `android/app/src/main/assets/models` avant le build.

## 3. Budget de taille cible

Il faut définir des budgets avant toute optimisation :

| Cible | Budget recommandé |
|---|---:|
| APK de base universel, sans pack vocal lourd | 35–50 Mo téléchargés |
| Pack TTS français ivoirien/nouchi | 30–80 Mo |
| Pack STT français offline | 40–70 Mo |
| Pack Baoulé ou Dioula STT | 250–400 Mo selon le modèle retenu |
| Pack traduction | À maintenir hors du parcours standard ; idéalement moins de 250 Mo après modèle spécialisé distillé, sinon téléchargement exceptionnel Wi‑Fi |
| Mémoire maximale simultanée d’un parcours vocal courant | À fixer par appareil, cible initiale inférieure à 700–900 Mo de RAM supplémentaire |

Ces chiffres sont des **budgets de conception**, pas des mesures de build. La première tâche doit produire un tableau réel par variante : taille APK/AAB installée, taille téléchargée, taille décompressée, RAM au chargement, RAM pendant l’inférence et temps de première réponse.

## 4. Optimisation de l’APK Android

### 4.1 Passer à Android App Bundle et aux splits ABI

Le livrable de distribution doit être un `.aab`, pas un APK universel contenant les bibliothèques `arm64-v8a`, `armeabi-v7a`, x86 et x86_64. Les appareils de production ciblés sont principalement ARM ; les ABI de test ne doivent pas gonfler le package terrain.

Actions :

- activer la génération AAB dans le pipeline de release ;
- vérifier que Play délivre uniquement l’ABI nécessaire ;
- produire une variante `arm64-v8a` pour les appareils récents et une variante de compatibilité si les appareils cibles l’exigent ;
- inspecter `base/lib`, `base/assets` et `base/dex` avec `apkanalyzer` ou `bundletool` ;
- supprimer les doublons entre `VoiceServicePlugin` et `SherpaSttPlugin` ; le modèle français ne doit exister qu’une seule fois dans le package final ;
- vérifier que les bibliothèques natives de Sherpa ne contiennent pas des architectures inutiles.

### 4.2 Sortir les modèles des assets obligatoires

Le modèle français et le modèle omnilingual sont actuellement référencés dans les assets Android. Il faut modifier le contrat de build afin que l’absence d’un modèle optionnel ne soit pas une erreur de compilation.

Proposition de structure :

```text
APK de base
  assets/models/manifest.json
  aucun gros modèle vocal obligatoire

Répertoire applicatif privé après téléchargement
  files/models/fr-stt/<version>/...
  files/models/ivoirian-tts/<version>/...
  files/models/bci-stt/<version>/...

Manifeste signé ou vérifié
  modelId
  version
  sha256
  taille
  licence
  langues
  RAM minimale
  compatibilité ABI
```

Le plugin natif doit recevoir un chemin local résolu par le gestionnaire de modèles. Il ne doit plus supposer que `models/omnilingual.../model.int8.onnx` est toujours présent dans l’APK. En l’absence du pack, il doit renvoyer une erreur explicite et proposer le téléchargement, sans basculer silencieusement vers une autre langue.

### 4.3 Utiliser Play Asset Delivery si la distribution passe par Google Play

Pour les modèles très lourds qui doivent être disponibles presque immédiatement après installation, utiliser un asset pack séparé. Pour les modèles expérimentaux ou rarement utilisés, préférer le téléchargement à la demande via le gestionnaire applicatif Jùlaba.

Règle de décision :

- **TTS ivoirien/nouchi de base :** téléchargement explicite dans l’onboarding ou les réglages, car sa taille peut rester contenue.
- **STT Baoulé/Dioula :** téléchargement Wi‑Fi explicite, jamais inclus pour tous.
- **NLLB :** téléchargement exceptionnel, écran d’avertissement de taille, espace libre et RAM requis.
- **Gemma :** uniquement sur les appareils compatibles et après validation du budget mémoire.

### 4.4 Réduire le JavaScript initial

L’application charge une grande surface de composants et plusieurs moteurs lourds. Il faut charger les modules vocaux et IA de manière différée :

- `dynamic import()` pour Piper, Kokoro, MMS, NLLB, Tesseract et Transformers.js ;
- aucune initialisation de modèle dans le bootstrap global ;
- chargement du moteur uniquement à l’ouverture de « Voix & Langue » ou d’une action vocale ;
- libération explicite des sessions ONNX, AudioContext et buffers après inactivité ;
- une seule instance de moteur TTS active à la fois ;
- une seule instance STT active à la fois ;
- limitation des caches et suppression versionnée des anciens modèles.

## 5. Stratégie vocale ivoirienne avec nouchi

### 5.1 Ne pas confondre voix, langue et registre

Une **voix ivoirienne naturelle** comporte au moins quatre dimensions :

1. timbre et identité de la locutrice ou du locuteur ;
2. prononciation du français ivoirien ;
3. prosodie, rythme et intonation du commerce local ;
4. vocabulaire et expressions nouchi.

Le nouchi n’est pas simplement un accent appliqué à un modèle français. C’est un registre lexical et sociolinguistique variable selon l’âge, la ville, le milieu professionnel et la situation. Il faut donc éviter de promettre « le nouchi » comme une langue uniforme. Le produit doit parler d’un **registre ivoirien nouchi validé pour les usages Jùlaba**, avec un niveau de familiarité réglable.

### 5.2 Architecture recommandée pour le TTS

La meilleure première version n’est pas un grand modèle multilingue de plusieurs centaines de mégaoctets. C’est une pile en quatre couches :

```text
Texte métier canonique en français
        ↓
Normalisation Jùlaba
  montants, unités, produits, dates, abréviations
        ↓
Lexique ivoirien/nouchi contrôlé
  variantes prononcées, contractions, pauses, registre
        ↓
TTS léger adapté au français ivoirien
        ↓
Post-traitement audio
  débit, pauses, volume, coupure des silences
```

Le texte métier canonique doit rester en français standard pour les confirmations financières et les messages de sécurité. Le nouchi doit être appliqué par un **lexique éditorial contrôlé**, avec des phrases validées par des locuteurs ivoiriens. Il ne faut pas laisser un modèle génératif inventer une reformulation nouchi pour un montant, une dette, un remboursement ou une confirmation de vente.

Exemple de séparation :

```text
Sens métier : "Vente enregistrée : 3 sacs de riz pour 25 000 FCFA."

Version standard : "Vente enregistrée : trois sacs de riz pour vingt-cinq mille francs."
Version ivoirienne : phrase courte, rythme naturel, terme nouchi autorisé si validé.

Confirmation sensible : rester explicite et non ambiguë.
```

### 5.3 Données nécessaires pour une voix réellement naturelle

Pour un pilote crédible, constituer un corpus propriétaire ou correctement licencié :

- 5 à 10 heures de parole propre pour un premier fine-tuning ou une adaptation ;
- 15 à 30 heures si l’on veut couvrir plus de styles, vitesses et contextes ;
- une locutrice ivoirienne principale pour garantir la cohérence de Tata Nanti Lou ;
- idéalement une seconde voix de secours, sans mélange dans le même modèle ;
- phrases métier : montants FCFA, unités locales, produits, noms de marchés, quartiers, salutations, remboursements, refus, alertes et confirmations ;
- variations contrôlées de français ivoirien et de nouchi ;
- enregistrement en studio ou environnement acoustique traité, puis un petit sous-corpus en environnement de marché pour tester la robustesse du traitement, pas pour entraîner directement la voix sans nettoyage ;
- transcription exacte, orthographe normalisée, prononciation attendue et niveau de registre pour chaque phrase.

Le corpus doit comporter une fiche de consentement, les droits d’usage commercial, le droit de retrait, la durée de conservation et les conditions de redistribution. Les checkpoints MMS actuels sont documentés en CC-BY-NC-4.0 ; ils ne doivent pas être considérés comme utilisables en production commerciale sans décision juridique et produit.

### 5.4 Choix technologique par phase

#### Phase pilote : modèle léger spécialisé

Évaluer en priorité une architecture légère de type Piper/équivalent ONNX ou un modèle TTS compact exportable en ONNX. L’objectif est un poids de 30 à 80 Mo, une inférence CPU locale et une latence faible.

Avantages :

- téléchargement et cache simples ;
- bonne compatibilité avec l’architecture actuelle de `tata-tts.ts` ;
- coût mémoire inférieur à MMS et Kokoro ;
- possibilité de spécialiser le lexique et la prosodie sans embarquer un modèle de traduction.

Limites :

- il faut entraîner ou adapter la voix ;
- la qualité dépend fortement du corpus ;
- la gestion du nouchi doit être faite dans la normalisation et le lexique, pas seulement dans le modèle.

#### Phase de recherche : modèle plus expressif

Évaluer Kokoro ou un modèle TTS plus expressif uniquement pour les appareils capables de supporter sa mémoire et son runtime WASM. Il peut servir de référence de qualité, mais ne doit pas devenir le chemin par défaut sur les téléphones d’entrée de gamme sans mesure.

#### MMS Baoulé/Dioula

Conserver MMS comme voie de recherche ou de support linguistique lorsqu’un checkpoint réellement adapté existe, mais ne pas le présenter comme la voix ivoirienne nouchi. Le module actuel indique que le Baoulé utilise un donor akan et que le Dioula est porté en fp32 d’environ 114 Mo. Cela ne garantit ni une voix ivoirienne naturelle, ni une licence commerciale compatible, ni une prosodie nouchi.

### 5.5 Lexique et normalisation nouchi

Créer un registre versionné :

```json
{
  "terme": "gbê",
  "categorie": "salutation",
  "registre": "familier",
  "prononciation": "...",
  "langue_source": "nouchi",
  "valide_par": ["locuteur_01", "locuteur_02"],
  "usage": ["accueil"],
  "interdit_dans": ["confirmation_financiere"]
}
```

Le lexique doit couvrir au minimum :

- noms de produits et variantes de marché ;
- unités, nombres et montants FCFA ;
- noms propres et lieux ivoiriens ;
- salutations et encouragements ;
- réponses oui/non et reformulations ;
- termes de stock, crédit, dette, tontine et livraison ;
- mots nouchi acceptés, mots ambigus et mots interdits dans les messages sensibles.

Prévoir trois modes dans les réglages :

- **Français clair**, pour les messages financiers et les utilisateurs qui le préfèrent ;
- **Ivoirien naturel**, avec rythme et vocabulaire local modéré ;
- **Ivoirien familier**, avec nouchi contrôlé, uniquement après validation utilisateur.

## 6. Plan d’action par urgence

### P0 — 0 à 2 semaines : sécuriser les décisions et mesurer

1. Geler l’ajout de nouveaux modèles lourds dans l’APK universel.
2. Générer un AAB de référence et mesurer par ABI : taille téléchargée, taille installée, assets, `.so`, dex et ressources.
3. Produire un inventaire unique des modèles avec version, taille, licence, RAM minimale, langues et statut commercial.
4. Vérifier si le modèle français est présent deux fois entre Sherpa et VoiceService.
5. Ajouter un gestionnaire de packs avec manifeste, SHA-256, progression, reprise après interruption, annulation et suppression.
6. Définir le budget mémoire sur deux appareils Tecno/Infinix et un appareil intermédiaire.
7. Décider avec les utilisateurs cibles du registre de français ivoirien et du niveau de nouchi acceptable.
8. Révoquer ou clarifier les licences des modèles MMS avant tout usage commercial.

### P1 — 2 à 6 semaines : alléger et livrer un premier pack vocal

1. Sortir le modèle omnilingual 349 Mo de l’APK général.
2. Sortir Gemma et NLLB de l’APK et de tout téléchargement automatique.
3. Mettre en place les splits ABI et le pipeline AAB.
4. Ajouter le pack `ivoirian-tts-v1` avec une voix enregistrée par une locutrice ivoirienne.
5. Implémenter la normalisation des montants, unités, lieux, noms de produits et pauses.
6. Créer le premier lexique nouchi validé, limité à l’accueil, aux encouragements et aux messages non financiers.
7. Tester la lecture offline après redémarrage, changement de compte et suppression/réinstallation du pack.
8. Exposer dans l’interface la taille, l’espace requis, la licence, la version et la possibilité de supprimer le pack.

### P1 — 6 à 10 semaines : validation linguistique et terrain

1. Réaliser une évaluation MOS auprès de locuteurs ivoiriens, avec comparaison Web Speech, voix actuelle, Piper adapté et modèle de référence.
2. Mesurer la compréhension sur 100 phrases Jùlaba : ventes, stock, crédits, montants et alertes.
3. Tester le nouchi sur trois niveaux de familiarité et deux générations d’utilisateurs.
4. Mesurer latence première syllabe, temps de synthèse, RAM, chauffe, batterie et interruptions.
5. Tester les messages financiers avec une règle stricte : aucune ambiguïté nouchi dans un montant, une dette ou une confirmation.
6. Corriger les prononciations par lexique avant de réentraîner le modèle.

### P2 — 2 à 4 mois : industrialiser la voix

1. Versionner les packs avec migration et suppression des anciennes versions.
2. Ajouter une télémétrie locale anonymisée : succès, échec, latence et moteur utilisé, sans enregistrer l’audio par défaut.
3. Ajouter un mode faible mémoire qui libère le moteur après chaque phrase.
4. Préparer un pack TTS français ivoirien de secours et une voix alternative.
5. Évaluer un modèle nouchi plus expressif uniquement si le premier modèle léger ne répond pas aux critères de compréhension et de naturel.
6. Formaliser les licences des voix, du corpus, des checkpoints, du lexique et des outils de conversion.

## 7. Critères d’acceptation

La voix ivoirienne/nouchi peut être activée par défaut pour un groupe pilote seulement si :

- 90 % des 100 phrases métier sont comprises sans répétition par les testeurs cibles ;
- les montants FCFA, quantités et unités sont correctement prononcés à 99 % sur le jeu de test critique ;
- la latence de démarrage reste compatible avec une interaction conversationnelle ;
- le pack fonctionne sans réseau après téléchargement et redémarrage ;
- la RAM reste sous le budget défini pour les appareils d’entrée de gamme ;
- le texte financier canonique reste explicite, même en mode nouchi ;
- les utilisateurs peuvent revenir au français clair à tout moment ;
- la licence autorise effectivement l’usage prévu par Jùlaba.

## 8. Recommandation finale

La stratégie la plus sûre est de **ne pas chercher immédiatement un modèle unique qui comprend le nouchi, traduit le Baoulé, raisonne et parle avec une voix naturelle**. Ce modèle serait trop lourd, difficile à valider et risquerait de produire des erreurs métier.

Il faut d’abord livrer une **voix TTS légère, ivoirienne et naturelle**, adaptée à un corpus propriétaire, puis lui adjoindre un lexique nouchi contrôlé. Le Baoulé, le Dioula, la traduction et Gemma doivent rester des packs séparés. Cette architecture améliore simultanément la taille de l’APK, la fiabilité offline, la maîtrise des licences et la qualité d’expérience.

## Références

[1]: `scripts/fetch-android-deps.sh` "Téléchargement des dépendances Android et modèles Sherpa"
[2]: `android/app/src/main/java/ci/julaba/app/VoiceServicePlugin.java` "Chargement des modèles français et omnilingual natifs"
[3]: `src/lib/voice/mms-tts.ts` "Moteurs MMS, tailles, licences et limites Baoulé/Dioula"
[4]: `src/lib/voice/nllb-translation.ts` "Modèles de traduction, tailles et stratégie de cache"
[5]: `docs/CAPACITOR.md` "Architecture Capacitor hybride distante et stockage local"
[6]: `docs/IA_LOCALE.md` "État des moteurs locaux TTS, STT et NLU"
[7]: `docs/SHERPA_ONNX.md` "Modèles Sherpa, packaging et validation sur appareil"
[8]: https://zenodo.org/records/6705861 "Baule speech dataset"
[9]: https://ai.meta.com/blog/multilingual-model-speech-recognition/ "Massively Multilingual Speech"
[10]: https://huggingface.co/ArissBandoss/dioula-tts "Dioula TTS model reference"
