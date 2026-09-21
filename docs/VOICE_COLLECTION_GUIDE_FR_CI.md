# Guide de collecte vocale — français ivoirien et nouchi contrôlé

## Objectif

Ce guide prépare un corpus destiné à entraîner ou adapter une voix de synthèse pour Jùlaba. La priorité est d’obtenir une voix naturelle, intelligible et stable en français de Côte d’Ivoire. Le nouchi est enregistré comme un **registre contrôlé**. Il ne doit pas remplacer le français clair dans les confirmations de vente, les paiements, les soldes, les remboursements, les quantités de stock, l’identité ou les codes de sécurité.

Le corpus de démarrage se trouve dans `data/voice/ivoirian-v1/metadata.csv`. Il contient 130 phrases. Cette première version permet de lancer la collecte et de détecter les problèmes de prise de son. Elle ne constitue pas encore un corpus de production. Après cette phase, il faudra compléter la couverture phonétique et faire relire les formulations par au moins deux locuteurs ivoiriens.

## Profil du locuteur

Le locuteur doit être majeur, ivoirien ou avoir une maîtrise native du français ivoirien utilisé dans le produit. Il doit comprendre les phrases qu’il enregistre et signaler toute formulation qui ne lui paraît pas naturelle. Une seule voix principale doit être utilisée pour un pack donné. Les prises d’un second locuteur servent uniquement à l’évaluation, sauf si le pack est conçu comme une voix multi-locuteurs.

## Matériel et environnement

Un téléphone récent peut convenir pour le prototype. Il doit être placé à une distance constante de 15 à 25 centimètres de la bouche. Le locuteur doit parler face au microphone, sans le toucher. Il faut choisir une pièce calme, sans ventilateur, circulation, musique, réverbération forte ni conversation voisine.

Pour la production, il est préférable d’utiliser un microphone externe et une interface audio. Les enregistrements doivent être conservés en WAV PCM mono, à 24 kHz ou 22,05 kHz, avec une profondeur de 16 ou 24 bits. Le MP3 peut servir à transmettre un aperçu, mais il ne doit pas être la source finale d’entraînement.

## Déroulement d’une séance

Le locuteur commence par cinq phrases de test. On vérifie le bruit de fond, le niveau, la distance au microphone et la prononciation. Une séance ne doit pas dépasser 30 à 45 minutes sans pause. Il est préférable de faire plusieurs petites séances qu’une longue séance fatigante.

Chaque phrase du CSV doit être lue exactement comme elle est écrite. Le locuteur peut refaire une phrase si elle sonne artificielle, mais la nouvelle formulation doit être notée et validée avant de remplacer la transcription. Il faut laisser environ 300 millisecondes de silence avant et après la phrase, sans claquement de langue ni bruit de manipulation.

Les phrases de registre `nouchi-controlled` doivent être dites naturellement, sans exagérer l’accent. Si un terme paraît ambigu, le locuteur doit le signaler plutôt que l’inventer. Les phrases marquées `protected_context=true` restent en français clair.

## Nommage des fichiers

Le fichier audio doit utiliser exactement le nom indiqué dans `audio_path`, par exemple `wav/ci_greeting_001.wav`. Les fichiers doivent rester dans le dossier du corpus. Il ne faut pas mettre le nom civil du locuteur dans le nom de fichier ; l’identifiant `speaker_01` suffit.

## Contrôle immédiat

Après chaque séance, écouter au hasard au moins dix fichiers avec un casque. Rejeter une prise si elle contient une coupure, un bruit de fond audible, une saturation, une respiration trop forte, une phrase différente du texte, une diction précipitée ou une intonation artificielle. Les prises rejetées sont marquées `rejected` dans les métadonnées et ne sont pas supprimées avant archivage.

## Critères de qualité recommandés

Le niveau moyen doit rester suffisamment haut pour être intelligible sans atteindre 0 dBFS. Un pic autour de -6 dBFS à -3 dBFS est généralement une bonne cible de départ. Le bruit entre deux phrases doit rester faible et stable. Les segments contenant une saturation ou un souffle important doivent être réenregistrés plutôt que corrigés agressivement.

Le script `scripts/prepare-voice-dataset.py` convertit les fichiers retenus en WAV mono et vérifie les correspondances entre les fichiers et `metadata.csv`. Il ne remplace pas l’écoute humaine.

## Validation linguistique

Avant l’entraînement, deux relecteurs ivoiriens vérifient les phrases. Ils contrôlent le naturel du français, les termes agricoles, les unités, les formulations commerciales et les mots nouchi. Les phrases financières sont validées séparément et restent en français clair. Toute phrase contestée est retirée du corpus ou réécrite avec un nouvel identifiant.

## Étapes après la collecte

Le corpus validé est nettoyé, converti en WAV mono, segmenté et séparé en ensembles d’entraînement, de validation et de test. Le test contient des phrases jamais utilisées pour l’entraînement. Il doit couvrir notamment les montants, les quantités, les produits, les noms de lieux, les questions et le nouchi contrôlé.

Une voix ne sera intégrée dans Jùlaba qu’après vérification de l’autorisation du locuteur, des checksums du pack, de la qualité audio, de la compréhension des phrases sensibles et du fonctionnement offline sur un appareil Android représentatif.
