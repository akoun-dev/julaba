# Surface: Producteur

Espace agricole de premier plan : le producteur suit ses cycles de culture,
publie ses récoltes et traite les commandes des marchands. Oral disponible
(mot de réveil « Julaba », modale vocale dédiée), offline-first.

> **Pourquoi ce fichier existe** : l'audit UI du 2026-09-20 (UI-MP-004/008/
> 011/012/015) a montré que l'absence de règles canoniques pour cet espace
> l'a fait dériver — actions métier muettes, mode soleil non appliqué, orange
> marchand dans la modale vocale. Toute nouvelle feature producteur DOIT
> respecter ce qui suit.

## Color System

| Token        | Value     | Usage                                        |
| ------------ | --------- | -------------------------------------------- |
| Primary      | `#2E8B57` | Boutons, badges actifs, FAB Tata, modale voix |
| Primary dark | `#1F6B41` | Dégradés, états pressés (`--prod-dark`)      |
| Primary dim  | 10 %      | Fonds d'icônes (`bg-[var(--prod-dim)]`)      |
| Background   | `#FAFAF7` | Page background (identique marchand)         |

- La couleur primaire vit dans `src/lib/design-tokens.ts` (`PROD_COLOR`) et
  les variables CSS `--vl-prod*` / `--prod-dark` / `--prod-dim` de
  `globals.css`. **Jamais de constante locale par fichier** (NORM-304).
- La modale vocale producteur porte le VERT de l'espace
  (`VOICE_LISTENING_COLOR_PROD` / `--vl-prod*`), jamais l'orange marchand
  `#D2622A` réservé à l'espace marchand (UI-MP-011).

## Voice & Haptics (obligatoire)

- **Chaque mutation métier est annoncée** : `announceProducteurAction(text)`
  (`src/lib/voice/producteur-actions.ts`) — `tataSpeak` + `haptic` en un
  appel. Libellés canoniques : « Commande acceptée. », « Commande refusée. »,
  « Livraison confirmée. », « Récolte publiée… », « Entrée ajoutée au
  carnet. » (UI-MP-004 ; WF4 : *jamais d'écriture silencieuse*).
- Refuser une commande = action commerciale irréversible → confirmation
  `AlertDialog` qui nomme l'objet et la conséquence, libellé Verbe + Objet
  (« Refuser la commande » / « Garder la commande ») (UI-MP-016).
- Les états de la modale vocale portent `role="status" aria-live="polite"`
  (lisible même TTS muet).

## Layout & States

- `screen-enter` + dégagement de barre
  `pb-[calc(6rem+env(safe-area-inset-bottom))]` (jamais `pb-40` figé,
  UI-MP-025).
- **Mode soleil : le producteur y a DROIT** (décision UI-MP-008 — travail en
  extérieur identique au marchand). `page.tsx` applique `.soleil` pour les
  rôles `marchand || producteur` ; tout nouvel écran lit `soleilMode`
  (`textClass = soleilMode ? 'text-black' : ''` + bump de taille des titres)
  et doit être vérifié en soleil.
- Modales : primitives Radix (`Dialog`, `Sheet`, `AlertDialog`) — jamais
  d'overlay `fixed inset-0` fait main (UI-MP-003).
- Cibles tactiles ≥ 44 px (`h-11 w-11` / `min-h-11`) (UI-MP-005).
- Chargements : squelettes (`animate-pulse`), jamais de texte « Chargement… »
  seul ni de spinner (UI-MP-030/031).

## Key Screens

| Écran                   | Fichier                     | Notes                          |
| ----------------------- | --------------------------- | ------------------------------ |
| Accueil activité        | `prod-home-screen.tsx`      | Cartes cliquables = `<button>` |
| Mes récoltes            | `prod-recoltes-screen.tsx`  | Publication → retour vocal     |
| Commandes               | `prod-commandes-screen.tsx` | Refus = confirmation obligatoire |
| Stock producteur        | `prod-stock-screen.tsx`     | Jetons `--vl-prod*`            |
| Cycles de production    | `prod-cycles-screen.tsx`    | Carnet de champ → retour vocal |
| Mon profil              | `prod-profil-screen.tsx`    |                                |
