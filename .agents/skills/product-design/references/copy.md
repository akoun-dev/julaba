# Copy Standards

All user-facing language in Jùlaba.

## Language

- **Language:** French (standard metropolitan French, not nouchi/phonetic).
- **Tone:** Respectful, direct, concise. Market vendors do not read long paragraphs.
- **Formality:** "Vous" for marchand/identificateur (professional respect). "Vous" for backoffice.
- **Exception:** "Maman {Name}" greeting on marchand home (PD-003).

## Canonical Verbs

| Action              | French            | Notes                                          |
| ------------------- | ----------------- | ---------------------------------------------- |
| Save                | Enregistrer       |                                                |
| Delete              | Supprimer         | Destructive — always confirm                   |
| Cancel              | Annuler           |                                                |
| Confirm             | Confirmer         |                                                |
| Edit                | Modifier          |                                                |
| Search              | Rechercher        |                                                |
| Add / Create        | Ajouter / Créer   | "Ajouter" for items, "Créer" for new entities |
| Send                | Envoyer           |                                                |
| Close               | Fermer            |                                                |
| Go back             | Retour            | Always with ArrowLeft icon                     |
| Submit (form)       | Enregistrer       | Not "Soumettre" or "Valider"                  |
| Login               | Se connecter      |                                                |
| Logout              | Se déconnecter    |                                                |
| Validate (enrolment)| Valider           | Backoffice only                                |
| Reject (enrolment)  | Rejeter           | Backoffice only, requires reason                |
| Suspend (actor)     | Suspendre         | Backoffice only, requires reason                |

## Destructive Action Copy

Destructive CTAs follow **Verb + Object**. Never use "Confirmer", "OK", or a bare verb.

| Action              | Correct CTA             | Wrong CTA          |
| ------------------- | ----------------------- | ------------------ |
| Delete product      | Supprimer le produit    | OK / Confirmer     |
| Suspend actor       | Suspendre l'acteur      | Confirmer           |
| Reject dossier      | Rejeter le dossier      | OK                 |
| Clear cart          | Vider le panier         | Annuler            |

## Error Messages

Format: **What happened + what to do.** Never just "Error" or "Une erreur est survenue."

| Situation               | Correct                                   | Wrong                         |
| ------------------------ | ----------------------------------------- | ----------------------------- |
| Wrong PIN                | Code incorrect. Réessayez.               | Erreur.                        |
| Network failure          | Pas de connexion. Vérifiez votre réseau. | Erreur réseau.                 |
| Empty cart on sale       | Le panier est vide. Ajoutez des articles. | Panier vide.                   |
| Insufficient stock       | Stock insuffisant pour cette vente.      | Quantité invalide.             |
| Missing required field   | Remplissez tous les champs obligatoires.  | Champs manquants.              |
| MFA code wrong           | Code incorrect. Vérifiez votre application. | Erreur de vérification.    |

## Empty States

Format: **Short description + actionable button.**

| Surface       | Empty state text                              | Action button          |
| ------------- | -------------------------------------------- | ---------------------- |
| Cart          | Votre panier est vide.                       | Ajouter un article    |
| Sales history | Aucune vente enregistrée aujourd'hui.       | —                      |
| Stock         | Votre stock est vide.                         | Ajouter un produit    |
| Drafts        | Aucun brouillon.                              | Nouveau dossier       |
| Audit log     | Aucune entrée d'audit.                        | —                      |

## Voice Copy (Tata Nanti Lou)

The voice assistant speaks in second person, with a warm but professional tone.

| Situation           | Voice response                                   |
| ------------------- | ------------------------------------------------ |
| Sale confirmed      | "Vente enregistrée !"                             |
| Expense confirmed   | "Dépense enregistrée !"                           |
| Intent unclear      | "Je n'ai pas compris. Réessayez."                 |
| Credit blocked      | "Désolé, les crédits ne sont pas gérés par Jùlaba." |
| Listening start     | "Je vous écoute !"                                |
| Error               | "Une erreur est survenue. Réessayez."              |

## Labels & Placeholders

- Labels: sentence case, no trailing colon. ("Email professionnel" not "Email Professionnel :")
- Placeholders: show the expected format. ("vous@julaba.ci" not "Email")
- Button text: sentence case, no trailing period.

## Numbers & Currency

- Use `formatFCFA()` for all displayed amounts.
- Example output: "2 500 FCFA" (thin space as thousands separator, per French convention).
- Do not display amounts as raw integers in the UI.
- Bill breakdown uses full banknote names: "1 × 10 000 FCFA, 1 × 5 000 FCFA".

## Backoffice Terminology

| Term                    | French            | Notes                      |
| ----------------------- | ----------------- | -------------------------- |
| Enrollment              | Enrôlement        | Not "enrollment"           |
| Field agent             | Identificateur    |                            |
| Market vendor           | Marchand(e)       | Feminine when applicable   |
| Cooperative             | Coopérative       |                            |
| Zone / Territory        | Zone / Territoire |                            |
| Dashboard               | Tableau de bord   |                            |
| Audit log               | Journal d'audit   |                            |
| Actor                   | Acteur            |                            |
| Identifier (person)     | Identificateur    |                            |

See also `glossary.md` for the full product vocabulary.