# Spécifications techniques — intégration Android du pack vocal et du lexique nouchi

**Projet :** Jùlaba  
**Pack concerné :** `ivoirian-tts-nouchi-v1`  
**Version de spécification :** 1.0  
**Date :** 21 septembre 2026  
**Statut :** spécification d’implémentation pilote

## 1. Objet et périmètre

Cette spécification décrit l’intégration, dans l’application Android Jùlaba, du fichier JSON `exemple-pack-vocal-lexique-nouchi.json`. Le fichier contient à la fois le manifeste du pack vocal, les métadonnées du modèle TTS, les règles de téléchargement, les contraintes de l’appareil, le lexique nouchi contrôlé et les phrases protégées pour les opérations sensibles.

L’intégration doit permettre à l’application de :

- découvrir un pack vocal compatible avec l’appareil ;
- afficher sa taille, sa version, sa licence et son statut ;
- télécharger ses artefacts avec reprise et annulation ;
- vérifier leur intégrité avant activation ;
- stocker le modèle dans l’espace privé de l’application ;
- charger le moteur vocal à la demande ;
- normaliser les montants, quantités et unités avant synthèse ;
- appliquer le lexique nouchi seulement dans les contextes autorisés ;
- conserver les confirmations financières en français clair ;
- revenir à la voix système sans blocage si le pack est indisponible ;
- fonctionner sans réseau après l’installation complète du pack.

Le périmètre ne comprend pas l’entraînement du modèle vocal, la collecte du corpus, la validation juridique de la licence ni la génération des valeurs SHA-256 définitives. Ces éléments sont des prérequis de release et sont explicitement traités dans cette spécification.

## 2. Architecture cible

L’intégration repose sur quatre couches :

```text
Écran React / réglages Voix & Langue
              │
              ▼
VoicePackService TypeScript
  - lecture du manifeste
  - règles de registre
  - téléchargement via Capacitor
  - normalisation du texte
              │
              ▼
Plugin Capacitor Android VoicePackPlugin
  - stockage privé
  - checksum SHA-256
  - espace disponible
  - extraction et activation atomique
              │
              ▼
Moteur TTS ONNX/Piper ou équivalent
  - modèle actif unique
  - synthèse locale
  - libération mémoire
```

Le lexique et les règles de registre restent dans la couche TypeScript afin d’être partagés par Android, iOS et le Web. Le plugin Android ne doit pas décider seul qu’un terme nouchi est autorisé dans une confirmation financière. Le plugin reçoit uniquement un texte déjà contrôlé et normalisé par la couche métier.

Le plugin Android est responsable des opérations qui nécessitent l’accès au système de fichiers, à l’espace disque, au calcul de hash et au chargement du moteur natif. La synthèse doit rester locale et ne doit envoyer ni texte sensible ni audio vers un serveur.

## 3. Emplacement et format des fichiers

### 3.1 Fichier manifeste embarqué

Le manifeste initial peut être livré dans l’application sous :

```text
android/app/src/main/assets/voice-packs/ivoirian-tts-nouchi-v1/manifest.json
```

Le manifeste embarqué doit être considéré comme un catalogue de découverte. Il ne doit pas contenir le modèle ONNX lourd et ne doit pas être utilisé pour activer un pack tant que les artefacts téléchargés n’ont pas été vérifiés.

Pour une application Capacitor, une copie du manifeste peut également être exposée à la couche Web dans :

```text
public/voice-packs/ivoirian-tts-nouchi-v1/manifest.json
```

Cette copie doit être générée à partir d’une seule source afin d’éviter une divergence entre l’asset Android et la version Web. La CI doit comparer leurs champs `pack.id`, `pack.version`, `artifacts.model.sha256` et `artifacts.lexicon.sha256`.

### 3.2 Stockage privé après téléchargement

Les fichiers installés doivent utiliser le stockage privé interne de l’application, jamais un répertoire public partagé :

```text
<filesDir>/voice-packs/ivoirian-tts-nouchi-v1/1.0.0/
├── manifest.json
├── model.onnx
├── lexicon.json
├── pronunciation-rules.json
├── install.json
└── .active
```

Le fichier `install.json` est généré localement après installation. Il contient notamment :

```json
{
  "packId": "ivoirian-tts-nouchi-v1",
  "version": "1.0.0",
  "installedAt": "2026-09-21T12:00:00Z",
  "activatedAt": "2026-09-21T12:00:03Z",
  "modelSha256Verified": true,
  "lexiconSha256Verified": true,
  "licenseAccepted": true,
  "offlineReady": true
}
```

L’écriture doit être atomique. Le pack est téléchargé dans un répertoire temporaire, puis renommé vers son répertoire versionné uniquement après vérification de tous les fichiers. Le marqueur `.active` est créé en dernier.

## 4. Contrat du manifeste JSON

### 4.1 Champs obligatoires

Les champs suivants sont obligatoires pour le pack pilote :

| Chemin JSON | Type | Règle |
|---|---|---|
| `manifestVersion` | entier | Doit être égal à `1`. |
| `pack.id` | chaîne | Identifiant stable, en minuscules et sans espace. |
| `pack.version` | chaîne | Version sémantique `MAJOR.MINOR.PATCH`. |
| `pack.minAppVersion` | chaîne | Version minimale compatible de l’application. |
| `pack.supportedLocales` | tableau | Doit contenir `fr-CI`. |
| `artifacts.model.relativePath` | chaîne | Nom relatif, jamais chemin absolu. |
| `artifacts.model.sizeBytes` | entier | Doit être supérieur à zéro. |
| `artifacts.model.sha256` | chaîne | Hash hexadécimal de 64 caractères en production. |
| `artifacts.lexicon.sha256` | chaîne | Hash définitif du lexique installé. |
| `downloadPolicy.verifyBeforeActivation` | booléen | Doit être `true`. |
| `languagePolicy.neverUseNouchiForFinancialConfirmation` | booléen | Doit être `true`. |
| `license.commercialUseReviewRequired` | booléen | Doit être `true` tant que le pilote n’est pas juridiquement validé. |

Les valeurs `REPLACE_WITH_*` présentes dans l’exemple sont interdites dans un build de production. La CI doit échouer si elles apparaissent dans le manifeste de release.

### 4.2 Validation du schéma

La validation doit être effectuée à deux moments :

1. **À la compilation**, par un script Node ou TypeScript utilisant le schéma JSON versionné.
2. **À l’installation**, avant toute activation, par le `VoicePackService`.

Les propriétés inconnues doivent être tolérées pour permettre une évolution rétrocompatible, mais les champs critiques inconnus ou incompatibles doivent conduire à un refus d’activation. Le champ `manifestVersion` permet d’introduire une migration explicite.

Erreurs minimales attendues :

```text
VOICE_PACK_INVALID_MANIFEST
VOICE_PACK_UNSUPPORTED_VERSION
VOICE_PACK_MISSING_ARTIFACT
VOICE_PACK_INVALID_SIZE
VOICE_PACK_INVALID_CHECKSUM
VOICE_PACK_LICENSE_NOT_ACCEPTED
VOICE_PACK_DEVICE_UNSUPPORTED
VOICE_PACK_INSUFFICIENT_STORAGE
VOICE_PACK_NOT_OFFLINE_READY
```

## 5. Téléchargement et installation

### 5.1 Déclenchement

Le téléchargement doit être déclenché uniquement par une action explicite de l’utilisateur depuis l’écran « Profil → Voix & Langue ». L’ouverture d’un écran métier ou la première phrase vocale ne doit jamais lancer un téléchargement silencieux.

L’interface doit afficher avant confirmation :

- le nom de la voix ;
- la taille totale estimée ;
- l’espace libre requis ;
- la licence et son statut ;
- la disponibilité hors ligne après installation ;
- la possibilité de supprimer le pack ultérieurement ;
- la recommandation d’utiliser le Wi-Fi.

Le manifeste indique `allowMeteredNetwork: false` et `allowCellularOverride: true`. L’application doit donc bloquer par défaut le téléchargement sur réseau mobile, tout en proposant une action de dérogation explicite.

### 5.2 URL des artefacts

Les URLs de téléchargement ne doivent pas être déduites à partir d’un identifiant utilisateur ou d’un chemin arbitraire. La configuration de production doit associer chaque `pack.id`, `pack.version` et nom de fichier à une URL allowlistée, par exemple :

```text
https://cdn.julaba.app/voice-packs/ivoirian-tts-nouchi-v1/1.0.0/model.onnx
https://cdn.julaba.app/voice-packs/ivoirian-tts-nouchi-v1/1.0.0/lexicon.json
https://cdn.julaba.app/voice-packs/ivoirian-tts-nouchi-v1/1.0.0/pronunciation-rules.json
```

Le serveur CDN doit fournir `Content-Length`, `ETag`, `Cache-Control` et, si possible, la prise en charge des requêtes HTTP `Range`. Le client doit vérifier que la taille transférée correspond à `sizeBytes`.

### 5.3 Reprise, annulation et nettoyage

Le téléchargement doit utiliser un fichier temporaire `.part` et mémoriser :

```json
{
  "packId": "ivoirian-tts-nouchi-v1",
  "version": "1.0.0",
  "artifact": "model.onnx",
  "downloadedBytes": 24000000,
  "expectedBytes": 48234496,
  "etag": "REPLACE_WITH_ETAG",
  "updatedAt": "2026-09-21T12:00:00Z"
}
```

En cas d’interruption réseau, le téléchargement reprend uniquement si l’ETag du serveur est inchangé. Dans le cas contraire, le fichier partiel est supprimé et le téléchargement redémarre.

Une annulation utilisateur doit supprimer les fichiers temporaires, mais conserver le manifeste de catalogue. Une erreur d’installation doit supprimer le répertoire temporaire complet et ne doit jamais remplacer la version active précédente.

## 6. Vérification cryptographique

Le checksum SHA-256 est obligatoire pour chaque artefact. Le calcul doit être effectué sur le fichier téléchargé avant extraction ou activation.

Pseudo-flux :

```text
Télécharger vers .part
        ↓
Vérifier la taille
        ↓
Calculer SHA-256
        ↓
Comparer au manifeste signé ou distribué par canal sûr
        ↓
Déplacer vers le répertoire versionné
        ↓
Écrire install.json
        ↓
Créer .active
```

Le hash présent dans le manifeste doit être protégé contre une modification en transit. Pour la production, le manifeste doit être servi en HTTPS depuis une source contrôlée et, idéalement, signé avec une clé de release. Une évolution ultérieure pourra ajouter :

```json
{
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "julaba-release-2026-01",
    "value": "REPLACE_WITH_BASE64_SIGNATURE"
  }
}
```

La clé privée ne doit jamais être présente dans le dépôt ni dans l’application. La clé publique de vérification peut être embarquée dans l’application et renouvelée via une procédure de rotation planifiée.

## 7. Gestion du lexique et des registres

### 7.1 Chargement

Le lexique doit être chargé depuis le répertoire du pack actif, puis validé par son hash. Le cache mémoire doit contenir une seule version active du lexique. Lorsqu’une nouvelle version est activée, l’ancien cache est invalidé.

Le service TypeScript doit exposer une API similaire à :

```ts
export type VoiceRegister =
  | 'clear'
  | 'natural-ivorian'
  | 'nouchi-controlled'

export type VoiceContext =
  | 'greeting'
  | 'navigation'
  | 'encouragement'
  | 'success_non_financial'
  | 'sale_confirmation'
  | 'payment_confirmation'
  | 'credit_balance'
  | 'refund'
  | 'stock_quantity'
  | 'identity_data'
  | 'security_code'

export type VoiceTextRequest = {
  text: string
  register: VoiceRegister
  context: VoiceContext
  amount?: number
  locale?: 'fr-CI'
}

export type PreparedVoiceText = {
  text: string
  effectiveRegister: VoiceRegister
  lexiconIdsApplied: string[]
  forcedClearReason?: string
  protected: boolean
}
```

### 7.2 Règle de sélection du registre

Le registre demandé par l’utilisateur ne doit jamais avoir priorité sur le contexte métier. La règle est :

```text
Si le contexte appartient à protectedDomains
    alors effectiveRegister = clear
    et aucun terme nouchi n’est appliqué
Sinon si le registre demandé = nouchi-controlled
    appliquer uniquement les entrées approved ou approved-with-context
Sinon
    utiliser le registre demandé
```

Un terme `needs-local-validation`, `rejected` ou absent du lexique doit être laissé dans sa forme canonique ou provoquer un retour au registre clair, selon la gravité du contexte.

### 7.3 Normalisation des montants

La normalisation doit précéder l’application du lexique. Les valeurs suivantes doivent être converties en forme parlée française :

```text
25000       → vingt-cinq mille francs CFA
25 000 FCFA → vingt-cinq mille francs CFA
kg          → kilogrammes
L           → litres
```

Les nombres ambigus, les décimales non prévues ou les montants supérieurs à la limite du manifeste doivent produire une demande de clarification ou utiliser le TTS français clair. Aucun remplacement nouchi ne doit modifier la valeur numérique.

## 8. Pont Capacitor Android

### 8.1 Plugin requis

Créer un plugin natif :

```text
android/app/src/main/java/ci/julaba/app/VoicePackPlugin.java
```

Déclaration indicative :

```java
@CapacitorPlugin(name = "VoicePack")
public class VoicePackPlugin extends Plugin {
    @PluginMethod
    public void getInstalledPacks(PluginCall call) {}

    @PluginMethod
    public void getStorageInfo(PluginCall call) {}

    @PluginMethod
    public void installPack(PluginCall call) {}

    @PluginMethod
    public void cancelInstall(PluginCall call) {}

    @PluginMethod
    public void deletePack(PluginCall call) {}

    @PluginMethod
    public void activatePack(PluginCall call) {}

    @PluginMethod
    public void releaseEngine(PluginCall call) {}
}
```

Le plugin doit être enregistré dans la classe principale de l’application ou selon la procédure Capacitor utilisée par le dépôt. Il ne doit pas dupliquer la responsabilité de `VoiceServicePlugin`, qui gère actuellement la reconnaissance vocale et le microphone.

### 8.2 Contrat `installPack`

Entrée :

```json
{
  "packId": "ivoirian-tts-nouchi-v1",
  "version": "1.0.0",
  "licenseAccepted": true,
  "allowCellularOverride": false
}
```

Sortie initiale :

```json
{
  "accepted": true,
  "operationId": "voice-install-uuid"
}
```

Événements :

```text
VoicePack.installProgress
VoicePack.installCompleted
VoicePack.installFailed
VoicePack.installCancelled
```

Payload de progression :

```json
{
  "operationId": "voice-install-uuid",
  "packId": "ivoirian-tts-nouchi-v1",
  "artifact": "model.onnx",
  "downloadedBytes": 24000000,
  "totalBytes": 48234496,
  "percent": 49,
  "state": "downloading"
}
```

Les états autorisés sont :

```text
queued
checking_storage
downloading
verifying
installing
ready
cancelled
failed
```

### 8.3 Résolution du chemin du modèle

Le moteur TTS ne doit jamais recevoir directement un chemin provenant du JSON sans validation. Le plugin doit résoudre le chemin à partir de `packId` et `version` dans un répertoire privé préalablement vérifié.

La méthode `activatePack` doit refuser :

- un pack non installé ;
- un checksum non vérifié ;
- une version incompatible avec l’application ;
- une licence non acceptée ;
- un manifeste comportant une valeur placeholder ;
- un fichier situé hors de `filesDir/voice-packs`.

## 9. Intégration dans `tata-tts.ts`

La chaîne de synthèse existante doit être étendue sans supprimer les replis actuels. L’ordre recommandé est :

```text
Pack ivoirien actif et prêt
  → préparer le texte selon contexte et registre
  → synthèse locale ivoirienne
  → repli TTS neural existant si autorisé
  → TTS natif Android
  → Web Speech si disponible
```

Pour une confirmation financière, le chemin doit être :

```text
Texte canonique français
  → normalisation montants/unités
  → registre clear imposé
  → synthèse du pack ou TTS natif
```

Le TTS ne doit jamais télécharger un modèle pendant `speak()`. Si le pack n’est pas prêt, la fonction doit retourner un état d’indisponibilité et utiliser le repli déjà prévu par `tata-tts.ts`.

Le contrat applicatif doit conserver le principe existant : une seule utterance active, arrêt de l’ancienne utterance lors d’une nouvelle demande et watchdog empêchant un appel bloqué.

## 10. Sécurité et confidentialité

Le texte envoyé au moteur TTS peut contenir des montants, des noms de clients ou des informations de crédit. Le traitement doit être local. Les logs de diagnostic ne doivent pas enregistrer le texte brut ni l’audio.

Les exigences minimales sont :

- stockage privé interne ;
- aucun modèle exécutable depuis le stockage externe public ;
- validation de chemin contre la traversée de répertoires ;
- SHA-256 obligatoire ;
- manifeste signé ou servi depuis une origine de confiance ;
- refus des placeholders en release ;
- aucun enregistrement audio par défaut ;
- pas de synchronisation du lexique utilisateur vers le serveur sans consentement ;
- séparation entre consentement de licence et préférence vocale ;
- suppression complète du modèle et des caches lors de la désinstallation du pack.

Le pack vocal ne doit pas permettre d’exécuter du code. Les fichiers acceptés sont limités à une allowlist stricte : `manifest.json`, `model.onnx`, `lexicon.json`, `pronunciation-rules.json` et `install.json` généré localement.

## 11. Performance et mémoire

Le moteur doit être chargé sur un thread dédié. Le thread UI ne doit pas attendre l’initialisation du modèle.

Les métriques à collecter localement sont :

- temps de chargement du moteur ;
- temps jusqu’au premier échantillon audio ;
- durée de synthèse ;
- facteur temps réel ;
- pic de mémoire supplémentaire ;
- température et consommation approximative lors d’une session longue ;
- nombre de replis vers le TTS natif ;
- raison du repli.

Les valeurs cibles du manifeste sont :

| Mesure | Cible pilote |
|---|---:|
| Premier son | inférieur à 1,2 s |
| Facteur temps réel | inférieur ou égal à 0,8 |
| Pic mémoire supplémentaire | inférieur à 350 Mo |
| Modèles actifs simultanément | 1 |
| Taille du modèle TTS | environ 46 Mo dans l’exemple |

Les cibles doivent être mesurées sur au moins un appareil Tecno, un appareil Infinix et un appareil Android intermédiaire. Une cible non tenue ne doit pas être masquée par un simple allongement du timeout.

## 12. Tests requis

### 12.1 Tests de manifeste

- manifeste valide accepté ;
- `manifestVersion` inconnu refusé ;
- checksum absent ou invalide refusé ;
- taille incohérente refusée ;
- licence non acceptée refusée ;
- version minimale non satisfaite refusée ;
- placeholder `REPLACE_WITH_*` refusé en release.

### 12.2 Tests d’installation

- téléchargement complet en Wi-Fi ;
- reprise après coupure réseau ;
- reprise après fermeture de l’application ;
- annulation et nettoyage des fichiers temporaires ;
- manque d’espace disque ;
- modification d’ETag ;
- checksum incorrect ;
- activation atomique ;
- conservation de l’ancienne version si la nouvelle installation échoue ;
- suppression du pack actif avec retour automatique au TTS natif.

### 12.3 Tests du lexique

- entrée approuvée appliquée dans son contexte ;
- entrée interdite ignorée dans son contexte ;
- entrée à validation locale non utilisée en production ;
- terme inconnu entraînant un fallback explicite ;
- montant conservé exactement après normalisation ;
- confirmation financière sans terme nouchi ;
- changement de registre appliqué sans redémarrage de l’application ;
- cache invalidé après changement de version du lexique.

### 12.4 Tests Android réels

Les tests doivent être réalisés sur appareils physiques et non uniquement sur émulateur :

- Android 8 ou version minimale supportée ;
- Android 13 ou plus récent ;
- appareil 2 Go de RAM ;
- appareil 3 à 4 Go de RAM ;
- stockage presque plein ;
- réseau mobile uniquement ;
- réseau Wi-Fi interrompu ;
- mode avion après installation ;
- redémarrage de l’appareil ;
- changement de compte utilisateur ;
- sortie de l’application pendant la synthèse ;
- appel téléphonique ou interruption audio pendant la synthèse.

## 13. Critères d’acceptation de la version pilote

La fonctionnalité sera acceptée lorsque :

1. l’APK de base ne contient pas le modèle TTS lourd ni les modèles NLLB ou omnilingual non requis ;
2. le pack est téléchargé uniquement après consentement explicite ;
3. tous les artefacts sont vérifiés par SHA-256 avant activation ;
4. l’application fonctionne sans réseau après installation ;
5. une erreur de pack n’empêche pas la vente tactile ni les parcours critiques ;
6. les confirmations financières sont toujours en registre clair ;
7. les montants et quantités conservent leur valeur exacte ;
8. les termes nouchi sont appliqués seulement dans les contextes approuvés ;
9. la mémoire et la latence respectent les budgets du manifeste ;
10. le modèle, le corpus vocal et le lexique disposent de droits validés avant distribution commerciale.

## 14. Découpage de réalisation

### Lot A — contrat et validation

Créer le schéma JSON, le validateur CI et les types TypeScript. Remplacer les valeurs placeholder par un manifeste de build généré. Ajouter les tests de contexte protégé et de normalisation des montants.

### Lot B — gestionnaire de packs

Implémenter `VoicePackService` côté TypeScript et `VoicePackPlugin` côté Android. Ajouter le stockage privé, le téléchargement reprenable, le calcul SHA-256, l’activation atomique et les événements Capacitor.

### Lot C — moteur TTS

Adapter le moteur TTS choisi afin qu’il reçoive un chemin local vérifié. Ajouter l’initialisation asynchrone, le chargement unique, `releaseEngine()` et le mode faible mémoire.

### Lot D — interface utilisateur

Ajouter dans « Voix & Langue » les cartes d’installation, la progression, l’espace requis, le registre actif, le statut offline, l’acceptation de licence et la suppression du pack.

### Lot E — validation terrain

Mesurer la compréhension, la latence, la mémoire et la qualité de prononciation sur des appareils Android représentatifs et auprès de locuteurs ivoiriens. Le pack doit rester en statut `pilot` tant que ces mesures ne sont pas documentées.

## 15. Références

[1]: `exemple-pack-vocal-lexique-nouchi.json` "Manifeste et lexique nouchi contrôlé utilisés comme contrat d’intégration"
[2]: `src/lib/voice/tata-tts.ts` "Orchestration actuelle des moteurs TTS et des replis"
[3]: `android/app/src/main/java/ci/julaba/app/VoiceServicePlugin.java` "Plugin Android actuel pour la reconnaissance vocale et les modèles Sherpa"
[4]: `android/app/build.gradle` "Configuration Android, dépendances natives et AAR Sherpa"
[5]: `docs/CAPACITOR.md` "Architecture Capacitor et stockage des fonctionnalités natives"
[6]: https://developer.android.com/reference/android/content/Context#getFilesDir() "Android Context.getFilesDir"
[7]: https://developer.android.com/topic/security/data "Android app data and files security"
[8]: https://capacitorjs.com/docs/plugins "Capacitor plugin development documentation"
[9]: https://developer.android.com/build/building-cmdline "Android command-line build and packaging documentation"
