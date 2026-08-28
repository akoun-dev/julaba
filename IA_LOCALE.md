# IA locale hors-ligne — état de l'implémentation

Suite à la demande de câbler une IA locale (STT / TTS / NLU / Vision / OCR)
inspirée du document technique "IA LOCALE HORS-LIGNE — Jùlaba", ce document
recense précisément ce qui a été implémenté, testé, et ce qui reste
best-effort / non vérifiable dans cet environnement.

Toutes les briques ci-dessous partagent le même principe : **best-effort,
jamais bloquant**. Un échec de chargement (réseau coupé, modèle non encore
téléchargé, WASM non supporté) fait retomber silencieusement sur le
comportement existant (règles regex, Web Speech API, saisie manuelle) —
aucune de ces briques ne peut empêcher un marchand ou un identificateur de
terminer son travail.

## Vue d'ensemble

| Brique | Fichier | État | Testé ici |
|---|---|---|---|
| NLU niveau 2 (fallback ML) | `src/lib/voice/nlu-ml.ts` | ✅ Implémenté | ⚠️ Partiel (voir ci-dessous) |
| Vision — flou photo | `src/lib/vision/photo-quality.ts` | ✅ Implémenté | ✅ Algorithme pur, pas de dépendance réseau |
| Vision — détection visage | `src/lib/vision/photo-quality.ts` | ✅ Implémenté | ✅ Modèle vérifié et téléchargé (229 Ko) |
| OCR documents | `src/lib/vision/document-ocr.ts` | ✅ Implémenté | ✅ Données langue vérifiées et téléchargées (596 Ko) |
| TTS Piper (opt-in) | `src/lib/voice/piper-tts.ts` | ✅ Implémenté | ❌ Non exécutable ici (voir ci-dessous) |
| STT sherpa-onnx | `src/lib/voice/sherpa-stt.ts` | ⚠️ Scaffold seulement | Voir `SHERPA_ONNX.md`, inchangé dans cette passe |

## 1. NLU — fallback ML (`nlu-ml.ts`)

Le parseur regex existant (`src/lib/voice/localIntent.ts`, ~30 produits,
nombres en toutes lettres, abréviations de marché) couvre déjà l'essentiel
du "niveau 1" du document technique. Ce qui a été ajouté est un "niveau 2" :
quand ce parseur renvoie `unknown` avec une confiance faible, la transcription
est reclassée via `@xenova/transformers` (`zero-shot-classification`,
`Xenova/distilbert-base-uncased-mnli`, quantifié, chargé à la demande).

**Limite connue et assumée** : ce modèle est entraîné en anglais (MNLI). Le
transfert cross-lingue vers le français fonctionne pour des phrases courtes
mais reste moins fiable qu'un modèle multilingue dédié — aucun n'était
disponible de façon claire sur le hub Xenova au moment de l'implémentation.
Le rôle de cette brique n'est donc pas d'extraire un montant ou un produit
(le regex reste seul responsable de l'extraction d'entités) mais de deviner
*quel type* d'intention a été énoncé, pour transformer un "Je n'ai pas
compris" générique en une question ciblée
(`buildClarifyingIntent` dans `localIntent.ts`).

Câblé dans `src/components/marchand/voice-modal.tsx` : seulement déclenché
si `intent.type === 'unknown' && confidence < 0.6`, avec timeout de 4s et
repli silencieux en cas d'échec.

**Non testé ici** : le téléchargement réel du modèle (`huggingface.co`,
utilisé en interne par `@xenova/transformers`) est bloqué par la politique
réseau de cet environnement — voir section "Ce qui n'a pas pu être vérifié".

## 2. Vision — qualité photo d'enrôlement (`photo-quality.ts`)

Deux vérifications indépendantes, exécutées après chaque capture de la
photo de l'acteur dans `ident-identification-screen.tsx` (pas sur la photo
de l'étal, qui n'est pas un portrait) :

1. **Flou** — variance du filtre de Laplace sur une copie réduite en niveaux
   de gris, calculée en pur Canvas 2D, sans modèle ni réseau. Toujours
   disponible, y compris complètement hors ligne.
2. **Présence de visage** — `@mediapipe/tasks-vision` `FaceDetector`, modèle
   `blaze_face_short_range` (float16, 229 Ko, **auto-hébergé** dans
   `public/models/`, téléchargé et vérifié depuis
   `storage.googleapis.com/mediapipe-models` — source officielle Google).
   Le runtime WASM (~12 Mo, trop volumineux pour être committé) reste sur le
   CDN par défaut de MediaPipe (jsdelivr) — l'app Capacitor nécessite déjà
   une connexion pour charger sa coquille (mode "hybrid remote"), ce n'est
   donc pas une régression de la capacité hors-ligne.

Avertissements non bloquants affichés sous la photo : "Photo floue",
"Aucun visage détecté", "Plusieurs visages détectés".

## 3. OCR — capture de documents (`document-ocr.ts`)

Tesseract.js, worker dédié (Web Worker), déclenché automatiquement pour
chaque document image ajouté dans l'étape "Localisation & Documents"
(pas pour les PDF, non reconnaissables tels quels). Le texte détecté
s'affiche sous le document avec un bouton "Ajouter aux notes" — jamais
copié automatiquement, l'identificateur reste en contrôle.

Auto-hébergé (vérifié par téléchargement direct dans cet environnement) :
- `public/tesseract/worker.min.js` (111 Ko) — script worker copié depuis
  `node_modules/tesseract.js/dist/`.
- `public/tessdata/fra.traineddata.gz` (596 Ko, variante "fast") —
  téléchargé et vérifié depuis le miroir officiel
  `raw.githubusercontent.com/naptha/tessdata`.

Le cœur WASM de Tesseract (~2,8 Mo) reste sur le CDN par défaut
(jsdelivr) pour la même raison que MediaPipe ci-dessus.

Une fonction `extractCniNumber()` reconnaît le motif `CI` + 8-14 chiffres
dans le texte détecté, prête à être branchée sur un champ dédié si un champ
"numéro CNI" est ajouté au dossier plus tard — pas fait dans cette passe
car `Dossier` n'a pas ce champ aujourd'hui.

## 4. TTS — voix Piper en option (`piper-tts.ts`)

Ajout d'un moteur alternatif, **désactivé par défaut**, à la synthèse vocale
existante (`tata-tts.ts`, Web Speech API — reste le comportement par
défaut). Activable dans Profil → Voix & Langue → "Voix haute qualité
(bêta)", après téléchargement explicite (jamais automatique) d'une voix
Piper française (`fr_FR-siwis-low`, ~25 Mo estimés, quantité exacte non
vérifiable ici — voir ci-dessous).

`tataSpeak()` bascule vers Piper uniquement si l'utilisateur l'a activé
*et* que le modèle est effectivement téléchargé ; tout échec (modèle non
prêt, synthèse en erreur) retombe automatiquement sur Web Speech API dans
le même appel, sans que l'appelant ait à le gérer.

## Ce qui n'a pas pu être vérifié ici

Cet environnement de développement a une politique réseau qui bloque
`huggingface.co`, `cdn.jsdelivr.net` et `cdnjs.cloudflare.com` en accès
direct (testé par `curl`, échecs 403 confirmés le 2026-08-28). Ces hôtes
sont uniquement utilisés par :
- `@xenova/transformers` pour télécharger le modèle NLU (`huggingface.co`).
- `@mintplex-labs/piper-tts-web` pour télécharger la voix Piper
  (`huggingface.co/diffusionstudio/piper-voices`) et son runtime ONNX
  (`cdnjs.cloudflare.com`).
- Le runtime WASM auto-hébergé partiellement pour MediaPipe/Tesseract
  (`cdn.jsdelivr.net`, conservé volontairement sur CDN, voir plus haut).

Ces trois hôtes sont ceux officiellement utilisés par les librairies elles-
mêmes (pas un choix arbitraire de ce projet) et sont très probablement
accessibles normalement pour un utilisateur final (téléphone Android/iOS
en Côte d'Ivoire) — le blocage constaté est spécifique à la politique
d'accès sortant de cet environnement de build, pas à l'app en production.
Mais faute de pouvoir déclencher un téléchargement réel ici, le code de
`nlu-ml.ts` et `piper-tts.ts` a été implémenté contre l'API réelle et
documentée des librairies (vérifiée en lisant leurs types et leur code
source dans `node_modules`), avec repli silencieux systématique, mais
**n'a pas été exercé de bout en bout**. À tester sur un appareil réel avant
d'activer largement, en particulier :
- Que `Xenova/distilbert-base-uncased-mnli` se télécharge et s'exécute
  correctement dans une WebView Capacitor (mémoire/CPU d'un téléphone
  d'entrée de gamme).
- Que la taille réelle de `fr_FR-siwis-low` correspond à l'estimation
  (~25 Mo) et que le téléchargement + lecture audio fonctionnent dans la
  WebView (pas seulement un navigateur desktop).

Ce qui a en revanche été vérifié par téléchargement réel et réussi dans cet
environnement (voir sections 2 et 3) : le modèle de détection de visage
MediaPipe et les données de langue Tesseract français, tous deux
auto-hébergés dans `public/`.

## Vérifications effectuées

- `npx tsc --noEmit` : aucune erreur.
- `npm run lint` : 0 erreur (uniquement des avertissements pré-existants
  liés aux emojis dans le JSX, non liés à ce travail).
- `npm run build` (Turbopack) : build de production réussi. A nécessité un
  ajout à `next.config.ts` (`turbopack.resolveAlias`) pour stubber les
  imports Node.js morts (`fs`, `path`) présents dans le code glue emscripten
  isomorphe de `@mintplex-labs/piper-tts-web`.
- Démarrage `npm run dev` + vérification que les assets auto-hébergés
  (`/models/blaze_face_short_range.tflite`, `/tessdata/fra.traineddata.gz`,
  `/tesseract/worker.min.js`) sont bien servis (200, tailles attendues).
- Pas de test fonctionnel en conditions réelles (WebView Capacitor sur
  appareil, micro/caméra physiques) — hors de portée de cet environnement,
  comme documenté pour les fonctionnalités Capacitor précédentes.
