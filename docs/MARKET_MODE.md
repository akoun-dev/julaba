# Mode Marché

Le Mode Marché est la surface offline-first du marchand. Il ne remplace pas la
caisse, le stock ou Tata : il les rassemble dans une entrée persistée et un
tableau de bord adapté au marché.

## Architecture

```text
HomeScreen
  -> MarketModeScreen
       -> market-mode-store (configuration persistée)
       -> network-store (état de connexion)
       -> offline-db (file FIFO locale)
       -> SyncFlusher (rejeu automatique)
       -> caisse-store / stock-store (données locales persistées)
       -> market-mode-location (permission GPS explicite)
```

La route est `mode-marche`. La route existante `marche` reste la marketplace
fournisseur et n'est pas modifiée.

## Offline

Les ventes, dépenses, produits et mouvements de stock réutilisent
`src/lib/offline-db.ts`. Les écritures sont placées dans la file locale quand le
serveur est indisponible, puis rejouées par `SyncFlusher` au retour du réseau.
La file est FIFO, limitée à 500 entrées, et les requêtes sont idempotentes côté
serveur. Un rejet définitif devient un conflit local au lieu d'être perdu.

Le Mode Marché affiche le nombre d'opérations en attente et propose
« Synchroniser » lorsqu'une connexion est disponible. Une opération de vente
reste soumise aux validations métier existantes, notamment le refus strict du
stock insuffisant.

## Configuration

`src/lib/stores/market-mode-store.ts` persiste uniquement les préférences et
l'état de configuration : activation, préférence hors connexion, choix de
localisation, nom du marché, position capturée et langue Tata.

Le français et le Baoulé sont proposés car leurs moteurs existent dans le
projet. Dioula/Jula, Sénoufo et Bété sont explicitement indiqués comme bientôt
disponibles et ne sont pas présentés comme fonctionnels.

## Localisation

La permission GPS n'est demandée qu'après le choix « Utiliser ma position
actuelle ». Le plugin Capacitor est utilisé sur Android/iOS et l'API du
navigateur sur le web. Un refus ou une indisponibilité n'empêche ni l'activation
du Mode Marché ni les ventes. « Choisir un marché » conserve seulement un nom,
sans demander le GPS.

## Synchronisation

`SyncFlusher` reste le moteur unique : démarrage, reconnexion, focus et
visibilité déclenchent le flush existant. Il met aussi à jour le compteur et le
statut du Mode Marché. La synchronisation manuelle de l'écran réutilise
`flushAllPendingSync`; elle n'ajoute pas une seconde file.

## Limites connues

- Le stockage de la file existante est `localStorage`, plafonné à 500 entrées,
  et n'est pas un coffre chiffré.
- La géolocalisation est une capture ponctuelle, pas un suivi en arrière-plan.
- Les données serveur non encore chargées restent représentées par les stores
  persistés disponibles sur l'appareil ; le Mode Marché ne fabrique pas de
  données métier hors ligne.
- La validation finale du micro, du GPS et de la synchronisation doit être
  exécutée sur un APK Android réel.
