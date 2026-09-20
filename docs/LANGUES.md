# Langues — couverture réelle (traduction, reconnaissance, synthèse)

_Mis à jour le 2026-09-20 (Task 88, MODE-918) — re-vérification complète des faits après les demandes « Passons à l'intégration du Bété »._

Ce document fixe l'état des lieux **vérifié** de la couverture linguistique de Jùlaba. Il sert de référence pour ne pas repartir de zéro à chaque nouvelle demande de langue (Baoulé, Dioula, Bété, Sénoufo…).

## 1. Langues livrées dans l'app (fr / bci / dyu)

| Langue | Comprendre (ASR) | Traduire (NLLB) | Parler (TTS) | État |
| --- | --- | --- | --- | --- |
| Français | Sherpa/Native + Web Speech | — (langue pivot) | Kokoro/Piper/Native/Web | Stable |
| Baoulé (`bci`) | Omnilingual ASR (natif, table A1) | **Oui (bêta)** — finetune `GaindeNdiaye/nllb-baoule-v1` porté ONNX q8 (~893 Mo, proxy `/api/voix/nllb-baoule-v1`) | Voix pilote donor akan (~114 Mo, HF onnx-community/mms-tts-aka-ONNX) — qualité limitée assumée | Bêta (B2-023, MODE-914..917) |
| Dioula (`dyu`) | Omnilingual ASR (natif, table A1) | **Oui** — NLLB-200 dyu↔fra (~872 Mo) | **Oui (réelle)** — port ONNX `facebook/mms-tts-dyu` (~114 Mo, proxy `/api/voix/dyu-model`) | Bêta (MODE-914, qualité validée produit) |

L'interface n'offre que ces trois langues (sélecteur `src/components/voice/language-selector.tsx`, réglages `src/components/shared/voix-settings.tsx`). Il n'existe **aucune** entrée Bété/Sénoufo à activer ou désabler dans l'UI actuelle.

## 2. Le tableau « codes Meta/NLLB » circulant est faux pour 3 langues sur 4

Un tableau externe (conversation Qwen) affirme que `bci_Latn`, `dyu_Latn`, `ksy_Latn`, `bte_Latn` sont « les codes officiels dans FLORES-200 et NLLB-200 ». **C'est faux** :

- **NLLB-200 couvre exactement 202 codes langue** — re-compté le 2026-09-20 sur le `tokenizer.json` officiel de `facebook/nllb-200-distilled-600M` (17,3 Mo, vocabulaire 256 204 entrées ; vérifié deux fois : Task 83 et Task 88).
- Sur les 4 codes du tableau, **seul `dyu_Latn` existe** dans NLLB-200 :
  - `dyu_Latn` (dioula) : **PRÉSENT** ✓
  - `bci_Latn` (baoulé) : **ABSENT** — l'hypothèse fondatrice du dépôt était fausse (découverte P0 Task 83, corrigée par le port du finetune baoulé) ;
  - `bte_Latn` (bété) : **ABSENT** ;
  - `ksy_Latn` : **ABSENT** — et de toute façon `ksy` (ISO 639-3) est le code du **Khisa** (langue gur du Ghana/Bénin), PAS du sénoufo. Le code sénoufo le plus documenté est `spp` (Supyire) — **également absent de NLLB-200**.
- FLORES-200 ne liste que « Dyula | dyu_Latn » pour nos langues cibles.

Conséquence pratique : tout code Python appelant `tokenizer.src_lang = "bte_Latn"` (ou `bci_Latn`, `ksy_Latn`) sur NLLB lève une erreur (`Source language code "X" is not valid`). Un modèle qui ne connaît pas le token ne peut pas le « découvrir ».

## 3. Bété — NON INTÉGRABLE aujourd'hui (verdict factuel, sondé 2 fois)

La langue bété (langue kru, centre-ouest de la Côte d'Ivoire — régions Haut/Bas-Sassandra, Daloa, Gagnoa, Issia, Vavoua ; alphabet comportant entre autres ɛ, ɔ, ɩ, ʋ, gb, kp, bh, ny) n'a aujourd'hui **aucune** brique technique disponible :

| Brique nécessaire | État vérifié 2026-09-20 |
| --- | --- |
| Traduction fra↔bte (NLLB) | ✗ `bte_Latn` absent des 202 codes NLLB-200 |
| Reconnaissance vocale bété (Omnilingual ASR, ~1 408 codes table A1) | ✗ `bte_Latn` absent (bci ✓, dyu ✓) |
| Voix TTS bété (MMS-TTS) | ✗ aucune repo `facebook/mms-tts-bte/btg/btj/bqv` (inexistantes — vérifié API HF) |
| Modèle/dataset Bété sur Hugging Face (sonde exhaustive `bete`, `Bété`, `bte_Latn`) | ✗ **zéro résultat pertinent** : aucun finetune, aucun Whisper bété, aucun corpus public |

**Conclusion** : intégrer le bété n'est pas un problème de code, c'est un problème de **données**. La seule voie prouvée dans ce dépôt est celle du baoulé (B2-023) :

1. réunir un corpus de traduction bété↔français d'échelle comparable (~143 000 paires pour le finetune baoulé ; le lexique blog cité ci-dessous compte des centaines de mots — utile en appoint, pas suffisant) ;
2. finetuner `facebook/nllb-200-distilled-600M` en ajoutant le token `bte_Latn` (init d'un token latin proche) ;
3. porter le modèle en ONNX q8 (recette documentée Task 84 : quantisation DQL+MatMulInteger, merge If gabarit Xenova, tokenizer patché v2) ;
4. créer une voix TTS (approche donor : la voix baoulé pilote utilise MMS akan comme substitut) ;
5. intégrer via le registre `NLLB_MODELS` + cartes de téléchargement existantes.

## 4. Sénoufo — NON INTÉGRABLE aujourd'hui (même verdict)

- `ksy_Latn` n'existe pas dans NLLB-200 et `ksy` désigne une autre langue (Khisa). Le tableau « Sénoufo (Kassena) » du message d'origine confond deux langues.
- Le seul sondeage positif : **`facebook/mms-tts-spp` existe** (HTTP 200) — mais Supyire est une variété sénoufo du Mali/Burkina Faso, très différente du sénoufo de Côte d'Ivoire (Tagbana, Korhogo…), et il n'existe **aucun modèle de traduction** pour une quelconque variété sénoufo (`spp_Latn` absent de NLLB-200).
- Verdict identique au bété : il faut corpus + finetune + voix avant toute intégration.

## 5. Ressources enregistrées pour un futur finetune bété

- **Ressource fournie par l'utilisateur (2026-09-20)** : « Bété » sur desmotsetdeslangues.eklablog.com (article `bete-a126270134`, catégorie Dictionnaire) — présentation de la langue kru, alphabet bété complet (a ä b bh c d e ë ɛ f g gb gh i ï ɩ j k kp l m n ng ny o ö ɔ p s t u v ʋ w y z), mini-lexique thématique (animaux, corps humain, couleurs, nombres, saisons…). Copie locale : `bete_blog.json` (archive sandbox, hors dépôt). À réutiliser comme **appoint lexical** si un jour un corpus de phrases est constitué — un lexique de mots isolés ne suffit pas à entraîner un modèle de traduction.
- **Toute autre documentation bété est la bienvenue** (grammaires, conteurs, bibles/livres bilingues, corpus de radio) : elle servira au point 1 de la voie Bété ci-dessus. Les prérequis techniques (registre `NLLB_MODELS`, cartes UI, proxy, port ONNX) sont déjà tous en place — seule la donnée manque.

## 6. Références des vérifications

- `tokenizer.json` officiel NLLB-200 (facebook/nllb-200-distilled-600M) — 202 codes langue re-comptés 2026-09-20 (Task 83, re-vérifié Task 88).
- Hugging Face Hub : sondes API `models?search=bete|Bété|bte_Latn` + `datasets` (2026-09-20) — zéro résultat Bété pertinent.
- MMS-TTS : repos `facebook/mms-tts-{bte,btg,btj,bqv}` inexistantes ; `facebook/mms-tts-spp` existante (Supyire) ; `facebook/mms-tts-dyu` réellement intégrée (MODE-914).
- Omnilingual ASR (papier, table A1 ~1 408 codes) : bci ✓, dyu ✓, bte ✗ (vérifié Task 83).
- Historique détaillé : `worklog.md` (Tasks 83–87), `.ai/TASKS.md` (B2-023, MODE-913…917).
