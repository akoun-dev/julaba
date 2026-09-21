#!/usr/bin/env python3
"""Create a starter speech-collection kit for a consented Ivorian French voice.

The generated corpus is intentionally a starter set. It is not a substitute for
local linguistic review or a production-sized recording campaign.
"""
from pathlib import Path
import csv

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "voice" / "ivoirian-v1"
OUT.mkdir(parents=True, exist_ok=True)

phrases = {
    "greeting": [
        "Akwaba, bienvenue sur Jùlaba.",
        "Bonjour, Tata est là pour vous accompagner.",
        "Bonsoir, nous allons avancer étape par étape.",
        "Bienvenue dans votre espace marchand.",
        "Bienvenue dans votre espace producteur.",
        "Bienvenue dans votre espace coopérative.",
        "Je suis prête, dites-moi ce que vous voulez faire.",
        "On commence tranquillement.",
        "Merci d'utiliser Jùlaba.",
        "Votre activité compte, et chaque étape est importante.",
    ],
    "navigation": [
        "Voici l'accueil de votre espace.",
        "Ouvrez la caisse pour enregistrer une vente.",
        "Ouvrez le stock pour consulter vos produits.",
        "Ouvrez les ventes pour consulter votre historique.",
        "Ouvrez le profil pour modifier vos informations.",
        "Revenons à l'écran précédent.",
        "Vous êtes dans le menu principal.",
        "Choisissez une action parmi les options affichées.",
        "Appuyez sur le bouton suivant pour continuer.",
        "Vous pouvez aussi utiliser le clavier.",
        "Écoutez la question, puis choisissez votre réponse.",
        "Je peux répéter la consigne.",
    ],
    "encouragement": [
        "C'est bon, on avance bien.",
        "Très bien, continuons.",
        "Vous avez bien compris.",
        "Prenons notre temps.",
        "Pas de souci, on reprend ensemble.",
        "On va y arriver.",
        "Courage, la prochaine étape est simple.",
        "Votre travail avance bien aujourd'hui.",
        "Bravo, l'information est bien enregistrée.",
        "Daba, on continue avec la prochaine étape.",
        "On va enjailler le travail, mais on garde les chiffres clairs.",
        "Gbê, vous avez bien fait cette étape.",
    ],
    "product": [
        "Ajoutez le nom du produit.",
        "Quel est le prix du produit ?",
        "Combien d'unités avez-vous ?",
        "Le produit a bien été ajouté.",
        "Le produit a bien été modifié.",
        "Choisissez la catégorie du produit.",
        "Indiquez l'unité de mesure.",
        "Le manioc est disponible en stock.",
        "Le maïs est disponible en stock.",
        "Le cacao est disponible en stock.",
        "Le café est disponible en stock.",
        "Les bananes plantain sont disponibles en stock.",
        "Les tomates sont disponibles en stock.",
        "Le riz est disponible en stock.",
    ],
    "stock": [
        "Le stock est à jour.",
        "Ajoutez une entrée dans le stock.",
        "Enregistrez une sortie de stock.",
        "Vérifiez la quantité avant de confirmer.",
        "La quantité disponible est faible.",
        "Le produit n'est pas encore dans votre stock.",
        "Le comptage du stock est enregistré.",
        "Le mouvement de stock est en attente de synchronisation.",
        "La réception de la commande est enregistrée.",
        "Le transfert de stock est en attente.",
        "Le stock partagé de la coopérative est affiché ici.",
        "Vérifiez le produit avant de distribuer le stock.",
    ],
    "money_clear": [
        "Le montant reçu est de mille francs CFA.",
        "Le montant reçu est de cinq mille francs CFA.",
        "Le montant reçu est de dix mille francs CFA.",
        "La vente est enregistrée pour mille cinq cents francs CFA.",
        "Le paiement est enregistré pour vingt-cinq mille francs CFA.",
        "Le solde du crédit est de trois mille francs CFA.",
        "Le remboursement est enregistré.",
        "Vérifiez le montant avant de confirmer le paiement.",
        "Le montant doit être un nombre entier en francs CFA.",
        "Le client est enregistré pour cette vente à crédit.",
    ],
    "money_numbers": [
        "Un franc CFA.",
        "Dix francs CFA.",
        "Cent francs CFA.",
        "Mille francs CFA.",
        "Deux mille cinq cents francs CFA.",
        "Dix mille cinq cents francs CFA.",
        "Vingt-cinq mille francs CFA.",
        "Cent mille francs CFA.",
        "Un kilogramme de manioc.",
        "Cinq kilogrammes de maïs.",
        "Dix litres d'huile.",
        "Vingt sacs de riz.",
    ],
    "security_clear": [
        "Entrez votre numéro de téléphone.",
        "Entrez votre code secret à quatre chiffres.",
        "Le code secret est incorrect.",
        "Confirmez votre nouveau code secret.",
        "Les deux codes ne sont pas identiques.",
        "Votre session est protégée sur cet appareil.",
        "La connexion est refusée.",
        "Ne communiquez jamais votre code secret.",
        "Confirmez-vous cette action ? Répondez oui ou non.",
        "Je repasse en français clair pour éviter une confusion.",
    ],
    "producer": [
        "Déclarez une nouvelle récolte.",
        "Quel produit avez-vous récolté ?",
        "Indiquez la quantité récoltée.",
        "La récolte est enregistrée dans votre carnet.",
        "La récolte est publiée sur le marché.",
        "La commande du client est affichée.",
        "La commande est acceptée.",
        "La commande est refusée.",
        "La livraison est confirmée.",
        "Le cycle de production est ouvert.",
        "Le cycle de production est clôturé.",
        "Ajoutez une note dans le carnet de champ.",
    ],
    "cooperative": [
        "Voici les membres de votre coopérative.",
        "La demande d'adhésion est en attente.",
        "La cotisation est enregistrée.",
        "La trésorerie validée est affichée.",
        "Le besoin d'achat groupé est déposé.",
        "L'apport au stock commun est enregistré.",
        "Vérifiez le stock commun avant la distribution.",
        "Le journal des écritures est disponible.",
    ],
    "nouchi_controlled": [
        "Akwaba, on est ensemble pour commencer.",
        "On va gbê, puis on reprend calmement.",
        "Daba, regarde bien la prochaine étape.",
        "On peut enjailler la formation sans mélanger les chiffres.",
        "Le travail est propre, on continue doucement.",
        "On se comprend, je répète la consigne.",
        "C'est carré, l'information est bien enregistrée.",
        "On garde le français clair pour les montants.",
        "Le djô est expliqué seulement dans cet exemple de formation.",
        "Après l'exemple, revenons au français clair.",
    ],
    "questions": [
        "Que voulez-vous faire maintenant ?",
        "Voulez-vous enregistrer cette opération ?",
        "Avez-vous terminé la saisie ?",
        "Quel produit voulez-vous choisir ?",
        "Quelle quantité voulez-vous déclarer ?",
        "Voulez-vous consulter votre historique ?",
        "Souhaitez-vous répéter la consigne ?",
        "Voulez-vous revenir à l'accueil ?",
    ],
}

rows = []
for category, texts in phrases.items():
    register = "nouchi-controlled" if category == "nouchi_controlled" else "clear"
    if category in {"greeting", "navigation", "encouragement", "nouchi_controlled"}:
        register = "natural-ivorian" if category != "nouchi_controlled" else register
    context = {
        "money_clear": "sale_confirmation",
        "money_numbers": "amount_readback",
        "security_clear": "security_code",
        "nouchi_controlled": "encouragement",
    }.get(category, category)
    for index, text in enumerate(texts, start=1):
        utt_id = f"ci_{category}_{index:03d}"
        rows.append({
            "utt_id": utt_id,
            "audio_path": f"wav/{utt_id}.wav",
            "speaker_id": "speaker_01",
            "locale": "fr-CI",
            "register": register,
            "context": context,
            "text": text,
            "normalized_text": text,
            "protected_context": str(category in {"money_clear", "money_numbers", "security_clear"}).lower(),
            "review_status": "pending-recording",
        })

with (OUT / "metadata.csv").open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

with (OUT / "README.md").open("w", encoding="utf-8") as handle:
    handle.write(f"""# Corpus de collecte — français ivoirien et nouchi contrôlé\n\nCe corpus de démarrage contient **{len(rows)} phrases** à enregistrer par un locuteur ivoirien consentant. Il sert à lancer la collecte et doit être relu par des locuteurs ivoiriens avant enregistrement.\n\nLe fichier `metadata.csv` est le contrat de transcription. Les fichiers audio doivent être déposés dans `wav/` avec les noms indiqués dans `audio_path`. Les phrases des contextes `sale_confirmation`, `amount_readback` et `security_code` restent en français clair. Le nouchi est limité aux phrases explicitement marquées `nouchi-controlled`.\n\nLe corpus ne contient volontairement aucune donnée personnelle, aucun vrai numéro de téléphone et aucun code secret.\n""")

print(f"Generated {len(rows)} utterances in {OUT}")
