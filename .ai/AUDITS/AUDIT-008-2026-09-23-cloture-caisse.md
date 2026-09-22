# AUDIT #008 — 2026-09-23 — Clôture de caisse : audit métier / états / données (modal « Fermer la journée », session, rapport)

- **Auditeur** : agent pair (Agent Manager, ses_f37706677ffeLw8bTz9FAD3Ebj), à la demande du porteur ; supervision et spot-check par Super Z (Task 136)
- **Périmètre** : HEAD `c06ffb1` (MODE-983 poussé) — la chaîne de clôture de caisse marchand : `close-day-modal.tsx`, `caisse-store.ts`, API `caisse-session` (PATCH) et `caisse-report`, notifications (`events.ts`, `use-notifications-watcher.ts`, `schedule.ts`), modèle de données `legacy_caisse_sessions` (migration 20260919120000), séparateur CSV `caisse-report.ts`
- **Méthode** : audit métier/états/données par l'agent pair (findings cités fichier:ligne, « ne modifie aucun fichier ») ; le superviseur a re-vérifié les 5 findings critiques sur les sources avant consignation — **tous confirmés**
- **Objet** : garantir qu'une clôture financière ne peut ni perdre de données, ni mentir (faux succès / faux écart), ni diverger entre appareils — livrable : findings priorisés, invariants, scénarios limites, recommandations, verdict

**Clés de lecture** : findings transcrits fidèlement du livrable pair · spot-check superviseur noté ✓ en fin de section.

---

## 1. Verdict en une phrase

**Non approuvable en l'état pour une clôture financière fiable** : P0 perte potentielle du panier ; P1 divergence locale/serveur, formule d'écart erronée, faux succès en session absente/double clôture et rapport tronqué non annoncé.

---

## 2. Findings priorisés

| Priorité | Preuves | Risque | Recommandation |
|---|---|---|---|
| **P0** | `src/lib/stores/caisse-store.ts:193-200` vide `cart`, `amountReceived`, `hasActiveCart` dès `closeSession`; la modale est accessible depuis accueil/Mode Marché (`src/app/page.tsx:545-547`, `src/components/marchand/home-screen.tsx:392-395`, `src/components/marchand/market-mode-screen.tsx:146-149`) sans garde panier | Perte irréversible d'une vente non encaissée contenue dans le panier | Bloquer si panier actif ou demander une confirmation destructive explicite; ne jamais supprimer silencieusement |
| **P1** | `closeSession` marque localement fermé puis fire-and-forget PATCH, erreurs avalées (`caisse-store.ts:189-217`); API ferme seulement `.eq('is_open', true)` et peut renvoyer `session:null` (`src/app/api/marchand/caisse-session/route.ts:83-92`) | Hors ligne/erreur: utilisateur croit la journée fermée alors que le serveur reste ouvert; divergence inter-appareils | Clôture idempotente avec file offline durable, même sessionId, statut `à synchroniser`, confirmation serveur |
| **P1** | Notification calcule `expected=todaySales-todayExpenses` (`close-day-modal.tsx:144-147`), alors que le solde produit est `fond+sales-expenses` (`home-screen.tsx:93-96,156`) et le modèle session sépare starting/ending cash (`20260919120000_create_merchant_market_sessions.sql:19-25`) | Faux écart systématique (fond initial ignoré), et déficit masqué par `Math.max(0, expected)` | Standardiser `attendu=fond initial+ventes-dépenses`, préserver le signe |
| **P1** | Aucun garde de session dans `closeSession` (`caisse-store.ts:189-200`); modal affiche succès après appel (`close-day-modal.tsx:134-147`) | Session absente/déjà fermée: faux succès et suppression possible du panier | Résultat typé `closed/already_closed/no_session`, refus si `session?.isOpen !== true` |
| **P1** | Double clôture protégée seulement côté API par `is_open=true`, résultat ignoré (`route.ts:86-89`; modal `:140-143`) | Double clic/deux appareils: seconde clôture annoncée comme réussie | Réponse idempotente explicite `already_closed`, une seule notification |
| **P1** | Rapport plafonné à 1000 ventes (`src/app/api/marchand/caisse-report/route.ts:17,34-45,126-128`); `borne` n'est pas affichée/annoncée dans la modale (`close-day-modal.tsx:218-246`) | Rapport serveur présenté comme complet alors qu'il est tronqué | Agrégation/pagination sans plafond ou afficher/parler immédiatement le statut partiel |
| **P1** | Rapport session-scoped, mais `todaySales/todayExpenses` device-day (`close-day-modal.tsx:78,95-97`; `caisse-store.ts:316-337`) | Plusieurs sessions ou périmètres différents donnent de faux écarts | Totaux par session ou séparation visuelle stricte session vs journée appareil |
| **P1** | Dépenses sans `session_id`, séparées dans CSV (`caisse-report.ts:43-46,73-80`; route:14-15) | Rapport non réconciliable fond+ventes+dépenses; dépenses d'un autre périmètre possibles | Rattacher dépenses à session ou marquer clairement rapport ventes serveur + agrégats appareil non réconciliés |
| **P2** | `parseInt(fond,10)||0` (`close-day-modal.tsx:51-54`); API seulement entier >=0 sans plafond (`caisse-session/route.ts:44-45,85`) | `1000abc` accepté, décimale tronquée, valeurs extrêmes possibles | Validation stricte entier FCFA, safe integer/plafond, contrat UI/API identique |
| **P2** | Étape et fond non persistés (`close-day-modal.tsx:51-52`); `showCloseDay` non persisté (`app-store.ts:353-357,419-439`) | Reload/crash abandonne la clôture; après reload le rapport done est inaccessible | Persister brouillon minimal ou historique de rapport par session |
| **P2** | Rapport lancé après `done`, avant confirmation PATCH (`close-day-modal.tsx:66-87,140-147`) | Rapport peut lire état serveur antérieur; session absente donne succès sans rapport | Attendre/observer clôture serveur ou afficher explicitement local/offline |
| **P2** | API rapport authentifie device (`route.ts:25-32`) et filtre ventes merchant+session (`:36-42`), mais ne vérifie pas existence/ownership d'une session; session inconnue peut être zéros (`route-caisse-report.test.ts:144-153`) | Identifiant inexistant présenté comme rapport valide | Vérifier `legacy_caisse_sessions`, distinguer session inconnue de session vide |
| **P2** | Erreur items transformée en `topProduits=[]` (`route.ts:72-77`), tests l'acceptent (`route-caisse-report.test.ts:163-172`) | Rapport partiel sans signal d'incomplétude | Retourner/afficher `produitsIndisponibles` |
| **P3** | Dédup notification par jour, pas session (`events.ts:110-123`); action toujours `caisse` | Seconde clôture/correction masquée; action peu pertinente après fermeture | Clé par sessionId, action rapport |
| **P3** | Rappel natif annulé dès fermeture locale (`use-notifications-watcher.ts:99-106`, `schedule.ts:74-81`) même PATCH échoué | Rappel disparaît localement alors que serveur ouvert | Annuler après confirmation serveur, sinon état sync requise |

**Spot-check superviseur (Task 136)** ✓ P0 panier (vidage inconditionnel confirmé) · ✓ formule `expected` sans fond + clamp `Math.max(0,…)` · ✓ fire-and-forget `void fetch(...).catch(() => {})` · ✓ `session: null` non distingué (API `.eq('is_open', true)` + `maybeSingle()`) · ✓ `PLAFOND_VENTES = 1000`.

---

## 3. Invariants métier attendus

1. Session existante, appartenant au marchand, ouverte ; absence/déjà fermée = résultat explicite, jamais succès générique.
2. Une clôture par session ; double clic, rejeu offline et second appareil idempotents.
3. Montant FCFA entier strict, pas décimale/texte/NaN/overflow ; même règle UI/store/API/base.
4. Attendu cohérent : fond initial + ventes - dépenses ; mêmes périmètres temporel/sessionnel ; déficit signé.
5. Aucun panier non enregistré supprimé silencieusement.
6. Clôture offline durable/rejouable, même sessionId et countedCash.
7. Rapport borné/partiel explicitement annoncé ; ventes non sync et dépenses appareil séparées.
8. Notifications cohérentes avec statut financier et session.

---

## 4. Scénarios limites

- Panier actif puis clôture depuis accueil/Mode Marché : blocage/confirmation et aucune perte.
- Double clic ou deux appareils : une clôture, seconde `already_closed`, une notification.
- PATCH offline/500 : local `à synchroniser`, reprise idempotente.
- Reload avant/après validation : brouillon conservé ou abandon explicite ; rapport retrouvable.
- Session absente localement ou déjà fermée serveur : refus honnête, panier intact.
- Fond 0/négatif/décimal/`1000abc`/valeur énorme : validation stricte.
- Ventes appareil non sync ou serveur en avance : écarts de compte et montant explicites.
- >1000 ventes : rapport complet ou borne annoncée UI+voix.
- Erreur items : rapport partiel explicite.
- Dépense offline pendant clôture : conservation et périmètre indiqué.
- Net négatif : écart signé, aucun clamp masquant le déficit.
- Rappel sur autre appareil : statut serveur prioritaire.

---

## 5. Chantier proposé (PLAN — arbitrage porteur)

**MODE-984 — fiabilisation de la clôture de caisse** (aucun arbitrage d'architecture requis : ce sont des corrections de défauts, pas des choix produit). Regroupement proposé en 3 tranches, chacune gates complets + commit :

1. **Tranche 1 — P0 + garde d'état** : garde panier actif (blocage/confirmation destructive explicite depuis les 3 points d'entrée) ; résultat typé `closed | already_closed | no_session` dans `closeSession` (refus si `session?.isOpen !== true`, jamais de faux succès) ; le panier n'est vidé QUE si la session était réellement ouverte.
2. **Tranche 2 — vérité financière** : `attendu = fond initial + ventes - dépenses` sans clamp (déficit signé affiché/parlé) ; harmonisation des périmètres (session vs journée appareil, étiquetage explicite) ; validation FCFA stricte entier plafonné (UI = API) ; notification dédupliquée par sessionId.
3. **Tranche 3 — offline & rapport** : clôture idempotente rejouable (file durable, même sessionId/countedCash, statut `à synchroniser`, rappel annulé après confirmation serveur) ; API : distinction `already_closed`/`no_session`, vérification existence/ownership de session dans le rapport, `produitsIndisponibles` signalé, borne >1000 annoncée UI+voix ; persistance du brouillon de clôture.

Décisions produit à trancher par le porteur : blocage dur vs confirmation destructive pour le panier (recommandé : confirmation), et rattacher les dépenses à la session (migration) vs étiquetage honnête du rapport (recommandé : étiquetage d'abord, migration ensuite).
