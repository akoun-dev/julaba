# Audit voix & audio — Marchand, Producteur, Système audio, Multilingue

Date : 2026-09-23
Périmètre : uniquement Marchand, Producteur, système audio et multilingue.

## État constaté

### Marchand
- La vente vocale est déjà conversationnelle : confirmation avec produit, quantité et montant, puis écoute de la vente suivante.
- Une vente refusée pour stock insuffisant est annoncée avec la quantité réellement disponible ; aucune vente n'est enregistrée par écrêtage.
- Le résumé du jour utilise les données réelles et peut détailler les ventes et dépenses.
- Correction appliquée : l'ouverture de caisse ne dit plus « Bonne journée » ; la confirmation reste centrée sur l'action.
- Le Mode Marché conserve l'accès vocal et le fonctionnement offline des ventes.

### Producteur
- La modale vocale utilise la même chaîne STT native/offline pour Baoulé et Dioula.
- Une déclaration de récolte est relue avant écriture et attend une confirmation « oui/non ».
- Les actions marketplace producteur disposent de retours métier ; les transitions de commande sont explicites.
- Correction appliquée : pendant le chargement d'un modèle vocal, l'interface n'affiche plus « J'écoute » comme si le micro était déjà actif.

### Système audio
- tataSpeak centralise la narration et applique une génération de parole : une nouvelle narration annule une narration obsolète et son callback est protégé contre les anciens appels.
- Les bips start/stop/succès/erreur et les vibrations restent locaux.
- Les chemins natifs et Web Speech disposent d'un fallback audible ; les moteurs neuronaux ne déclenchent pas de téléchargement implicite.
- Correction appliquée : le STT expose désormais onStatus avec preparing puis listening, afin de distinguer chargement du modèle et écoute réelle.

### Multilingue
- Le sélecteur Français / Baoulé / Dioula ne charge aucun modèle au changement de langue.
- ASR Baoulé/Dioula : même moteur Omnilingual natif, chargé à la demande, avec sonde de disponibilité avant initialisation.
- NLLB : traduction chargée uniquement lorsqu'elle est nécessaire ; aucun téléchargement implicite.
- MMS : voix Baoulé/Dioula chargées uniquement lorsqu'elles sont installées et demandées ; sinon repli français explicite.
- La chaîne multilingue ne laisse pas passer silencieusement un transcript Baoulé/Dioula brut vers le parseur français.

## Modifications de ce passage

1. src/lib/voice/stt.ts
   - ajout du callback de cycle de vie onStatus.
2. src/lib/voice/stt-factory.ts
   - émission de preparing avant la résolution d'une session native ;
   - émission de listening au démarrage réel de la session.
3. src/components/marchand/vente-rapide-modal.tsx
   - affichage « Je prépare la voix... » pendant le chargement ;
   - retour à l'état d'écoute lorsque la session est réellement prête.
4. src/components/producteur/prod-voice-modal.tsx
   - même distinction préparation/écoute.
5. src/components/marchand/open-caisse-modal.tsx
   - suppression de la formule de clôture « Bonne journée » dans la confirmation d'ouverture.
6. src/components/marchand/home-screen.tsx
   - même correction sur l'ouverture de caisse depuis l'accueil.

## Règles retenues

- Changer de langue ne doit jamais déclencher un chargement lourd.
- « Je prépare la voix » et « J'écoute » sont deux états différents.
- Une action réussie ne doit pas provoquer une formule de fin de conversation.
- « Bonne journée / À bientôt » reste réservé à une fin explicite ou à une vraie clôture de journée.
- Une erreur de modèle ou de traduction doit être explicite ; aucun fallback silencieux.
- Les actions vocales doivent conserver une alternative UI/clavier lorsque le micro ou le modèle n'est pas disponible.

## Validation

Les modifications ont été appliquées sur main. Aucun test automatisé n'a été exécuté dans ce passage via l'interface GitHub ; il reste recommandé d'exécuter au minimum typecheck, lint et tests voix avant publication APK.
