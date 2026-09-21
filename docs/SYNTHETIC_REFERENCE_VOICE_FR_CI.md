# Voix synthétique de référence — français ivoirien prototype

## Positionnement

Jùlaba utilise provisoirement une **voix française synthétique de référence**. Elle n’est pas la copie d’un locuteur réel. Elle ne doit pas être présentée comme la voix d’une personne, comme une voix ivoirienne validée ou comme un accent représentatif de toute la Côte d’Ivoire.

Le profil sert à rendre le prototype plus chaleureux et plus cohérent avant la disponibilité d’un locuteur ivoirien consentant. Il combine un moteur TTS français déjà disponible, une préparation textuelle contrôlée et une prosodie adaptée aux usages de l’application.

Le profil est défini dans `src/lib/voice/synthetic-reference-voice.ts` sous l’identifiant `fr-ci-synthetic-reference-v1`.

## Ce qui est activé

Le texte passe par les règles existantes de `prepareIvorianVoiceText`. Les montants et les unités sont normalisés en français clair. Les contextes de vente, paiement, crédit, remboursement, stock, identité et sécurité forcent le registre clair. Le nouchi n’est utilisé que pour les entrées approuvées du lexique et dans les contextes autorisés.

La prosodie est ensuite ajustée selon le contexte :

- les confirmations sensibles utilisent un débit plus lent et des pauses plus longues ;
- les salutations restent posées et légèrement montantes ;
- les encouragements utilisent un débit plus vivant et une hauteur légèrement plus chaleureuse ;
- les autres messages utilisent les réglages neutres du profil.

Le moteur natif Android/iOS est utilisé lorsqu’il est disponible. Le navigateur utilise Web Speech avec la voix française disponible. Aucun téléchargement de modèle vocal n’est nécessaire pour ce profil.

## Ce qui n’est pas affirmé

Cette solution ne prouve pas que la voix possède un accent ivoirien authentique. Les règles textuelles et la prosodie donnent une couleur produit inspirée du contexte ivoirien, mais elles ne remplacent pas l’évaluation par des locuteurs ivoiriens.

Le nouchi reste volontairement limité. Le système ne doit pas inventer de nouveaux termes, transformer une confirmation financière en nouchi ou utiliser le registre nouchi dans un message de sécurité.

## Tests fonctionnels

Les tests unitaires vérifient :

- l’identifiant et le statut prototype du profil ;
- la baisse du débit dans les confirmations de paiement ;
- l’allongement des pauses dans les contextes sensibles ;
- la prosodie plus chaleureuse des encouragements.

Les tests métier doivent ensuite couvrir au minimum :

| Domaine | Exemple de phrase | Exigence |
|---|---|---|
| Accueil | « Akwaba, bienvenue sur Jùlaba. » | Voix chaleureuse et intelligible |
| Vente | « Vente enregistrée pour mille cinq cents francs CFA. » | Français clair, montant exact |
| Stock | « Cinq kilogrammes de maïs sont disponibles en stock. » | Quantité et unité compréhensibles |
| Nouchi contrôlé | « On va gbê, puis on reprend calmement. » | Terme limité au contexte autorisé |
| Sécurité | « Ne communiquez jamais votre code secret. » | Aucun nouchi, débit ralenti |

La validation de l’accent, de l’acceptabilité culturelle et de la naturalité doit être réalisée ultérieurement par au moins deux relecteurs ivoiriens. Elle ne doit pas être déduite du seul résultat technique du moteur TTS.

## Passage ultérieur à une vraie voix ivoirienne

Lorsque le locuteur sera disponible, ce profil pourra rester le fallback du prototype. Le pack entraîné devra avoir un nouvel identifiant, une licence explicite, un corpus validé et des tests de comparaison avec cette référence synthétique. Il ne faut pas remplacer silencieusement le profil prototype par une voix humaine sans mettre à jour la documentation, le consentement et le manifeste du pack.
