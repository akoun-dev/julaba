# Matrice de capacités voix & langues — Jùlaba

> AUDIT-012 P1-7 (audit externe Manus) : « La promesse de voix doit être présentée par capacité, plateforme et langue, non comme une fonctionnalité uniforme. […] une langue non disponible ne peut pas être présentée comme opérationnelle. »
> Source de vérité : `src/lib/voice/` (stt-factory, packs/registry, pack-manager), plugins natifs `ci.julaba.app`, worklog Tasks 32/157/159.
> Référentiel produit : `.ai/REQUIREMENTS.md` (roadmap Baoulé phase pilote) · `.ai/WORKFLOWS.md` WF3.

## Matrice par langue × plateforme (état réel, HEAD c3378bc + MODE-1004)

| Langue | STT — Android APK **full** | STT — Android APK **lite** | STT — Web (navigateur) | Traduction | TTS | Commandes supportées | Statut produit |
|---|---|---|---|---|---|---|---|
| **fr (français)** | ✅ Sherpa streaming **embarqué** (auto-endpoint, tête de chaîne single-shot — fix Task 157) ; batch VoiceService en filet (PTT) | ⬇️ Téléchargement pack opt-in requis | ⚠️ Web Speech (qualité variable, réseau souvent requis) | — (nativa) | ✅ TTS natif | Vente, stock, navigation, questions — complet | **Opérationnel** (Android full validé ; banc device recommandé après Task 157) |
| **bci (Baoulé)** | ❌ Erreur explicite « pack manquant » (omnilingual 349 Mo non embarqué) | ⬇️ Pack opt-in — releases **pas encore publiées** | ❌ | ❌ Modèle spécialisé **en préparation** (façade baoulé non opérationnelle) | ❌ | Chaîne NLLB bci↔fra non qualifiée | **Non opérationnel — ne pas présenter comme disponible** |
| **dyu (Dioula)** | ❌ Erreur explicite « pack manquant » | ⬇️ Pack opt-in — releases **pas encore publiées** | ❌ | ❌ | ❌ | — | **Non opérationnel — ne pas présenter comme disponible** |

Légende : ✅ disponible · ⬇️ téléchargement requis · ⚠️ dégradé/fallback · ❌ indisponible.

## Plateformes

| Plateforme | Contrat VoiceService | État |
|---|---|---|
| Android natif (APK) | SherpaSttPlugin + VoiceServicePlugin + TTS natif | ✅ Branché, qualifié 1.1/1.2 (fr) |
| **iOS** | Plugins Sherpa/TTS présents dans le dépôt mais **NON branchés** au contrat VoiceService ni au routage | ❌ **Non démontré** — ne pas annoncer |
| Web / WebView | Plugin natif renvoie `ready:false` ; fallback Web Speech | ⚠️ Fallback uniquement |

## Règles produit (verrouillées par cet audit)

1. **Une capacité non prouvée ne s'affiche pas comme disponible** : les sélecteurs/écrans ne doivent présenter fr comme « complet » et bci/dyu que comme « pack à télécharger (indisponible jusqu'à publication de `voice-models-v1`) ». Les erreurs « pack manquant » restent explicites (jamais silencieuses — leçon `32b70a8`).
2. **Wake word ≠ push-to-talk** : l'écoute permanente n'est garantie que sur Android natif ; en Web, l'UI présente le push-to-talk et ne promet pas l'écoute continue.
3. **Taille et consentement** : tout pack opt-in affiche sa taille (349 Mo omnilingual), l'espace requis, la progression et la reprise — le registry porte désormais sha256/sizeBytes (MODE-1003, A11-F03).
4. **Chaîne Baoulé complète** (STT bci → NLLB bci→fra → parseIntent → fra→bci → TTS bci, WF3/B4) : pas d'activation avant qualification du modèle de traduction et du parcours de bout en bout.

## Critères de passage « non opérationnel → opérationnel » (par langue)

- Pack publié sur release GitHub avec URLs + tailles + SHA-256 renseignés dans `registry.ts` ;
- Install sur device : téléchargement + checksum + reprise validés (matrice recette externe) ;
- WER / précision d'intention mesurés sur corpus annoté (P3 externe) ;
- Parcours de vente complet device : commande → confirmation française claire → mutation → narration.
