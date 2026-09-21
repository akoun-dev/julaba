# Entraîner la voix ivoirienne et l’intégrer dans Sherpa-ONNX

## Résultat attendu

Cette procédure transforme les enregistrements WAV du corpus Jùlaba en un modèle Piper exporté au format ONNX, puis en un pack vocal utilisable offline par le plugin Android Sherpa-ONNX de Jùlaba.

La chaîne recommandée est la suivante :

```text
WAV + transcriptions
    → contrôle humain
    → conversion mono 22,05 kHz
    → metadata Piper
    → prétraitement Piper
    → fine-tuning VITS/Piper
    → export ONNX
    → tokens.txt + métadonnées ONNX
    → espeak-ng-data
    → test Sherpa-ONNX
    → checksums
    → manifeste du pack
    → installation Android offline
```

**Piper sert à entraîner et exporter la voix. Sherpa-ONNX sert ensuite à exécuter la voix sur Android.** Sherpa-ONNX n’est pas le framework d’entraînement principal de cette procédure.

## Préconditions obligatoires

Le locuteur doit avoir signé le consentement prévu dans [`VOICE_TALENT_CONSENT_TEMPLATE_FR.md`](VOICE_TALENT_CONSENT_TEMPLATE_FR.md). Les enregistrements ne doivent pas être poussés dans Git. Le dossier du corpus contient un `.gitignore` qui exclut les WAV, MP3 et FLAC bruts.

Le corpus doit être relu par deux locuteurs ivoiriens. Les phrases dans les contextes financiers, les quantités, l’identité et la sécurité doivent rester en français clair. Le nouchi est limité aux lignes marquées `nouchi-controlled`.

Pour un prototype, viser au moins **30 à 60 minutes** de voix validée. Pour une voix de production, viser **2 heures ou plus**, avec davantage de phrases inédites pour l’évaluation. Les 130 phrases incluses dans le dépôt sont un corpus de démarrage et ne suffisent pas à elles seules pour une voix de production.

## 1. Préparer les enregistrements

Déposer les prises dans `data/voice/ivoirian-v1/wav/` en utilisant exactement les noms de `audio_path` dans `metadata.csv`. Dans le CSV, changer `review_status` de `pending-recording` à `approved` uniquement après écoute et validation de la transcription.

Lancer le contrôle sans conversion :

```bash
python3 scripts/prepare-voice-dataset.py \
  --metadata data/voice/ivoirian-v1/metadata.csv \
  --root data/voice/ivoirian-v1
```

Puis créer les WAV de travail en mono, PCM 16 bits, 22 050 Hz :

```bash
python3 scripts/prepare-voice-dataset.py \
  --metadata data/voice/ivoirian-v1/metadata.csv \
  --root data/voice/ivoirian-v1 \
  --output data/voice/ivoirian-v1/processed \
  --convert
```

Le choix de 22 050 Hz correspond au profil Piper `medium`. Piper documente également un profil `low` à 16 000 Hz et un profil `high` à 22 050 Hz. Il faut garder le même échantillonnage entre le corpus prétraité et le checkpoint de départ.

## 2. Produire le format metadata de Piper

Le fichier Jùlaba est un CSV riche avec en-tête. Piper attend un fichier sans en-tête au format LJSpeech :

```text
identifiant|texte
```

Générer ce fichier après conversion des WAV :

```bash
python3 scripts/prepare-piper-metadata.py \
  --input data/voice/ivoirian-v1/metadata.csv \
  --audio-root data/voice/ivoirian-v1/processed \
  --output data/voice/ivoirian-v1/piper/metadata.csv
```

Copier ensuite les WAV validés dans le dossier Piper :

```bash
mkdir -p data/voice/ivoirian-v1/piper/wav
cp data/voice/ivoirian-v1/processed/*.wav \
  data/voice/ivoirian-v1/piper/wav/
```

Le script ne génère aucune transcription. Il refuse les fichiers absents et les contextes protégés qui ne sont pas marqués en registre clair.

## 3. Installer Piper dans un environnement isolé

L’entraînement doit être réalisé sur une machine Linux avec GPU NVIDIA lorsque cela est possible. Le fine-tuning est possible sur CPU, mais il sera beaucoup plus lent. L’environnement d’entraînement ne doit pas être le téléphone Android ni le dépôt de production.

```bash
git clone https://github.com/rhasspy/piper.git
cd piper
# Remplacer MASTER_PIN par un commit testé et conservé dans les artefacts de build.
git checkout MASTER_PIN
sudo apt-get install -y python3-dev espeak-ng
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel setuptools
pip install -e src/python
bash src/python/build_monotonic_align.sh
```

Pour un entraînement GPU reproductible, utiliser l’image PyTorch recommandée par Piper ou une image CUDA équivalente validée avec la version du pilote de la machine. Ne pas mélanger sans test une version récente de PyTorch, PyTorch Lightning et un ancien checkpoint Piper.

## 4. Prétraiter le dataset avec Piper

```bash
source /chemin/vers/piper/.venv/bin/activate
python3 -m piper_train.preprocess \
  --language fr-fr \
  --input-dir /chemin/vers/julaba/data/voice/ivoirian-v1/piper \
  --output-dir /chemin/vers/training/ivoirian-v1 \
  --dataset-format ljspeech \
  --single-speaker \
  --sample-rate 22050
```

Le fichier produit doit contenir un `config.json`, un `dataset.jsonl` et les tenseurs audio prétraités. Vérifier dans `config.json` :

- `audio.sample_rate` vaut `22050` ;
- `num_speakers` vaut `1` ;
- `espeak.voice` est compatible avec les phonèmes utilisés ;
- `phoneme_id_map` est présent ;
- le nombre de lignes du `dataset.jsonl` correspond aux prises retenues.

`fr-fr` est un point de départ technique pour le français. Il ne crée pas automatiquement un accent ivoirien. L’accent vient principalement de la voix du locuteur, de la prosodie, des formulations et de la validation linguistique.

## 5. Choisir le checkpoint de départ

Le fine-tuning est préférable à un entraînement depuis zéro pour un premier modèle. Choisir un checkpoint Piper dont la fréquence d’échantillonnage et le profil de qualité sont compatibles avec le corpus. Un checkpoint français est préférable. À défaut, un checkpoint d’une autre langue peut être testé, mais la couverture phonétique doit être vérifiée et le résultat n’est pas garanti.

Conserver dans le dossier de release :

- l’URL du checkpoint ;
- son SHA-256 ;
- sa licence ;
- sa langue et son profil de qualité ;
- la version de Piper utilisée ;
- la version de PyTorch et de CUDA ;
- le nombre de phrases et la durée du corpus.

Ne jamais publier un checkpoint dont la licence interdit l’adaptation ou la redistribution.

## 6. Lancer le fine-tuning

Exemple de départ pour un GPU avec environ 24 Go de mémoire :

```bash
python3 -m piper_train \
  --dataset-dir /chemin/vers/training/ivoirian-v1 \
  --accelerator gpu \
  --devices 1 \
  --batch-size 16 \
  --validation-split 0.10 \
  --num-test-examples 16 \
  --max-epochs 3000 \
  --resume_from_checkpoint /chemin/vers/checkpoint-de-depart.ckpt \
  --checkpoint-epochs 100 \
  --precision 32 \
  --max-phoneme-ids 400
```

Commencer avec `batch-size 16` si la mémoire GPU est inconnue. Augmenter à 32 uniquement après vérification de la mémoire. Si une phrase dépasse la limite de phonèmes, ne pas la supprimer silencieusement : l’identifier, vérifier sa transcription et décider si elle doit être raccourcie ou conservée dans un jeu de test séparé.

Pour une petite première collecte, surveiller les échantillons générés plutôt que de choisir un checkpoint uniquement sur la perte. Une voix peut avoir une perte correcte tout en prononçant mal les nombres, les mots nouchi ou les noms de produits.

## 7. Évaluer la voix avant export

Créer un jeu de test qui n’a pas été utilisé pour le fine-tuning. Il doit contenir au minimum :

- salutations et navigation ;
- phrases avec « Akwaba » et des formulations ivoiriennes naturelles ;
- phrases nouchi explicitement autorisées ;
- montants en francs CFA ;
- quantités et unités ;
- noms de produits ;
- questions et confirmations ;
- phrases de sécurité en français clair.

Évaluer séparément l’intelligibilité, la naturalité, la prononciation des termes ivoiriens, la lisibilité des nombres, la stabilité du débit, les silences et les artefacts audio. Deux relecteurs ivoiriens doivent écouter les sorties. Une phrase financière mal prononcée est un blocage de release, même si la voix paraît naturelle sur des phrases générales.

Générer des sorties de contrôle avec Piper :

```bash
printf '%s\n' 'Akwaba, bienvenue sur Jùlaba.' | piper \
  --model /chemin/vers/model.onnx \
  --output_file /chemin/vers/evaluation-piper/akwaba.wav
```

## 8. Exporter le checkpoint en ONNX

Choisir le meilleur checkpoint après l’évaluation, puis l’exporter :

```bash
python3 -m piper_train.export_onnx \
  /chemin/vers/best.ckpt \
  /chemin/vers/ivoirian-nouchi-medium.onnx

cp /chemin/vers/training/ivoirian-v1/config.json \
  /chemin/vers/ivoirian-nouchi-medium.onnx.json
```

Ne pas modifier manuellement le graphe ONNX après export sans conserver une copie et un checksum du fichier original.

## 9. Préparer Sherpa-ONNX

Installer les dépendances de conversion dans un environnement séparé :

```bash
python3 -m venv /chemin/vers/sherpa-convert/.venv
source /chemin/vers/sherpa-convert/.venv/bin/activate
pip install --upgrade pip
pip install onnx==1.17.0 onnxruntime==1.17.1
```

Générer `tokens.txt` et ajouter les métadonnées Sherpa :

```bash
python3 scripts/export-piper-sherpa-assets.py \
  /chemin/vers/ivoirian-nouchi-medium.onnx \
  --output-dir /chemin/vers/pack/ivoirian-tts-nouchi-v1
```

Télécharger une copie contrôlée de `espeak-ng-data` depuis la release Sherpa-ONNX utilisée par l’équipe, puis l’extraire dans le pack :

```bash
curl -L --fail -o /chemin/vers/pack/espeak-ng-data.tar.bz2 \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/espeak-ng-data.tar.bz2
tar -xjf /chemin/vers/pack/espeak-ng-data.tar.bz2 \
  -C /chemin/vers/pack
```

Le pack final doit au minimum contenir :

```text
ivoirian-tts-nouchi-v1/
├── model.onnx
├── tokens.txt
└── espeak-ng-data/
```

Le plugin Android de Jùlaba attend ces trois ressources. Il refuse l’activation si une ressource est absente.

## 10. Tester Sherpa-ONNX hors de l’application

Installer le runtime Python de test :

```bash
pip install sherpa-onnx
```

Puis générer une sortie :

```bash
sherpa-onnx-offline-tts \
  --vits-model=/chemin/vers/pack/model.onnx \
  --vits-tokens=/chemin/vers/pack/tokens.txt \
  --vits-data-dir=/chemin/vers/pack/espeak-ng-data \
  --output-filename=/chemin/vers/evaluation-sherpa.wav \
  'Akwaba, bienvenue sur Jùlaba.'
```

Comparer `evaluation-sherpa.wav` avec la sortie Piper. Les deux sorties doivent être compréhensibles et proches avant le test Android. Si Piper fonctionne mais Sherpa échoue, vérifier d’abord le `tokens.txt`, les métadonnées ONNX, le chemin `espeak-ng-data` et la version du runtime.

## 11. Calculer les checksums et compléter le manifeste

```bash
cd /chemin/vers/pack
sha256sum model.onnx tokens.txt
find espeak-ng-data -type f -print0 | sort -z | xargs -0 sha256sum > espeak-ng-data.sha256
```

Remplacer dans `exemple-pack-vocal-lexique-nouchi.json` les placeholders du modèle par les tailles et SHA-256 réels. Le champ `espeakData` doit pointer vers l’archive téléchargée ou vers la ressource d’installation prévue par le backend. Le lexique JSON contrôlé ne remplace pas `tokens.txt` : le premier contient les règles métier et de prononciation, tandis que le second correspond au vocabulaire phonémique du modèle Piper.

Ne jamais publier le pack avec `REPLACE_WITH_*`, une taille nulle ou une URL temporaire. Le plugin Android refuse les checksums non conformes.

## 12. Installer le pack dans Jùlaba

Le manifeste doit fournir les URLs HTTPS et les SHA-256 pour :

- `model.onnx` ;
- `tokens.txt` ;
- `espeak-ng-data.zip` ou l’archive équivalente attendue par l’implémentation ;
- le lexique contrôlé ;
- les règles de prononciation.

Après téléchargement, le plugin :

1. vérifie l’URL autorisée ;
2. vérifie la taille ;
3. calcule le SHA-256 ;
4. extrait l’archive dans un chemin privé ;
5. refuse les chemins ZIP traversant le dossier cible ;
6. marque le pack actif uniquement lorsque les trois ressources runtime sont présentes.

Tester ensuite `tataSpeakWithContext`. La fonction tente le pack natif uniquement si un pack prêt est installé. En cas d’échec, elle utilise le moteur TTS existant et ne bloque pas le parcours métier.

## 13. Critères de mise en production

Le pack ne doit pas être diffusé avant les validations suivantes :

- consentement signé et licence vérifiée ;
- absence de données personnelles dans les transcriptions ;
- validation linguistique par deux relecteurs ivoiriens ;
- test de tous les montants et quantités avec au moins 99 % de compréhension correcte ;
- test sur un appareil Android d’entrée de gamme ;
- test avec et sans connexion réseau après installation ;
- mesure de la taille décompressée et de la mémoire pendant la synthèse ;
- vérification des checksums sur une installation propre ;
- vérification que le nouchi n’est jamais utilisé pour les confirmations financières ou de sécurité ;
- conservation du checkpoint, du modèle exporté, du manifeste et des versions logicielles.

## Dépannage

**Piper refuse le dataset.** Vérifier le séparateur `|`, l’absence d’en-tête, la présence de chaque WAV et la cohérence entre le sample rate du corpus et celui du checkpoint.

**La voix prononce mal les mots nouchi.** Ne pas ajouter immédiatement des variantes arbitraires au lexique. Vérifier la transcription, ajouter une phrase enregistrée par le locuteur et faire valider la prononciation avant une nouvelle itération.

**Les montants sont mal prononcés.** Ajouter des phrases d’entraînement et de test couvrant chaque structure numérique. Les montants restent en français clair ; le nouchi ne doit pas masquer une valeur.

**Sherpa génère une erreur de modèle.** Vérifier que le modèle est un VITS Piper exporté, que `tokens.txt` vient bien de `phoneme_id_map`, que les métadonnées ONNX sont présentes et que le dossier eSpeak correspond au runtime.

**La mémoire Android est insuffisante.** Tester un modèle Piper `low` ou une variante quantifiée compatible, limiter la concurrence à une synthèse, libérer `OfflineTts` et `AudioTrack` après lecture et mesurer sur Tecno/Infinix plutôt que sur un appareil haut de gamme.

## Références

[1]: https://github.com/rhasspy/piper/blob/master/TRAINING.md "Piper Training Guide"
[2]: https://k2-fsa.github.io/sherpa/onnx/tts/piper.html "Sherpa-ONNX Piper model conversion and testing"
[3]: https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models "Sherpa-ONNX TTS model releases"
[4]: https://github.com/rhasspy/piper-checkpoints "Piper training checkpoints"
