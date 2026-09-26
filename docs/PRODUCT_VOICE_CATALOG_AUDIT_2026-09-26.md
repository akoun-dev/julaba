# Audit du catalogue produit et de l’enregistrement vocal — Jùlaba

**Date :** 2026-09-26  
**Périmètre :** vente rapide, Tata, saisie clavier de la vente rapide, stock marchand, API des ventes et lexique vocal.

## Conclusion

Le constat de l’utilisateur était fondé. Avant cette correction, la vente vocale ne pouvait reconnaître comme produit qu’un nom présent dans `PRODUCT_VOCAB`. Ce lexique contient 32 produits canoniques et leurs alias. Pour une marchandise absente de cette liste, `extractProduct()` renvoyait `null`; le parseur retournait alors une intention générique ou inconnue au lieu de `sale`. La branche de secours `Article` existait dans l’interface, mais elle n’était pratiquement pas atteignable pour une nouvelle marchandise, car l’intention `sale` exigeait un produit reconnu.

Le backend n’imposait pourtant pas cette restriction. `saleItemSchema` exige seulement un `productName` non vide et rend `productId` optionnel. La route `/api/marchand/sales` sait donc enregistrer une ligne de vente libre. Le blocage se situait principalement dans la reconnaissance vocale et non dans le schéma de vente.

## Ce qui était préenregistré

Le fichier `src/lib/voice/lexique-ivoirien.ts` contient le vocabulaire contrôlé utilisé par l’extracteur vocal. Il couvre notamment les tomates, oignons, piments, aubergines, gombos, bananes, ignames, manioc, riz, maïs, arachides, huile, poisson, viande, œufs, produits laitiers et quelques produits complémentaires.

Ce lexique est utile pour les alias ivoiriens et les variantes de transcription. Il ne doit cependant pas être confondu avec le catalogue personnel du marchand. Un marchand peut posséder un produit qui n’est pas dans ce lexique, et une même appellation peut désigner des produits différents selon le point de vente.

## Parcours concernés

### Tata et vente rapide

Le parseur reconnaît d’abord un produit contrôlé. La vente est ensuite planifiée avec `productId` si le nom correspond au stock local. Lorsque le nom ne correspond pas au stock, le système peut techniquement envoyer une ligne avec `productName` seul. Cette possibilité n’était pas correctement exposée par le parseur vocal.

La correction ajoute une extraction prudente pour les phrases explicites de vente, par exemple :

- « j’ai vendu 2 sacs de charbon à 3 000 francs » ;
- « vendu savon 1 500 francs ».

Dans ces cas, Tata crée une vente libre avec le nom parlé et sans `productId`. La vente est enregistrée, mais aucun stock n’est décrémenté automatiquement.

### Saisie clavier

Le clavier du modal accepte déjà une phrase libre, mais il passe par le même `parseIntent`. La correction bénéficie donc aussi à ce parcours. Le texte d’aide peut continuer à donner un produit connu en exemple sans limiter les valeurs acceptées.

### Stock et consultations

La correction ne transforme pas une marchandise libre en produit de stock. Les commandes de consultation, de perte, d’achat, de réapprovisionnement et de marge restent liées à un produit du stock, car ces actions exigent un identifiant produit et une unité de référence. C’est le comportement correct : une vente libre peut être enregistrée comme historique, mais une opération de stock doit cibler un article créé et configuré.

## Risques et limites restantes

Une vente libre n’a pas de `productId`. Elle ne bénéficie donc pas du contrôle de stock, du décrément de stock, du calcul de marge ni des unités commerciales configurées. L’interface doit le signaler clairement pour éviter qu’un marchand pense que son stock a été mis à jour.

L’extraction libre est volontairement limitée aux formulations explicites de vente et à un nom court. Elle ne doit pas devenir un extracteur générique de texte, car cela créerait des faux positifs avec les dépenses, les commandes fournisseur et les commandes de navigation.

Le lexique contrôlé reste utile pour les alias nouchi et les transcriptions STT. Il doit être enrichi à partir de remontées terrain validées, mais son absence ne doit plus empêcher une vente historique libre.

## Recommandations prioritaires

1. Afficher après une vente libre un message explicite : « Vente enregistrée hors stock ; ajoutez ce produit dans Mes produits pour suivre son stock. »
2. Ajouter dans l’écran des ventes une action « Convertir en produit de stock » qui préremplit le nom parlé et laisse le marchand définir unité, prix et stock initial.
3. Conserver le nom libre et le transcript vocal dans l’historique pour permettre une correction manuelle.
4. Éviter d’ajouter tous les produits métier dans le lexique vocal. Le lexique doit contenir les alias de reconnaissance, tandis que le catalogue marchand reste dynamique.
5. Ajouter des tests terrain sur les marchandises ivoiriennes qui ne figurent pas dans le vocabulaire de base : charbon, attiéké préparé, bissap, pagne, chaussures, accessoires, produits transformés et services vendus au marché.

## État de validation

La correction ajoute des tests pour une marchandise inconnue avec quantité et pour un article libre sans quantité explicite. Le typecheck TypeScript doit être exécuté après intégration, puis la suite ciblée `src/lib/voice/__tests__/localIntent.test.ts` doit être validée sur l’environnement de développement.

## Références

[1]: src/lib/voice/lexique-ivoirien.ts "Lexique ivoirien contrôlé du parseur vocal"
[2]: src/lib/voice/intent/products.ts "Extraction des produits et marchandises libres"
[3]: src/lib/voice/intent/parse-intent.ts "Parseur principal des intentions vocales"
[4]: src/lib/validation/marchand.ts "Schéma de validation des ventes marchandes"
[5]: src/app/api/marchand/sales/route.ts "API d’enregistrement des ventes"
