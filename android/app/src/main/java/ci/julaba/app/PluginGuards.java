package ci.julaba.app;

import android.content.Context;

import java.io.File;
import java.io.IOException;

/**
 * AUDIT-005 — gardes de surface natives des plugins vocaux.
 *
 * Les plugins exposent au bridge JS des méthodes qui composent des chemins
 * filesystem à partir de paramètres appelant (version de modèle, modelPath)
 * ou qui téléchargent depuis une URL fournie. AVANT : VoicePackPlugin
 * validait ses segments, mais LiteRtModelPlugin (version → fichier, URL
 * libre), SherpaSttPlugin et VoiceServicePlugin (modelPath → asset/cache/
 * filesDir) interpollaient l'entrée JS sans garde — un bridge compromis
 * (ou un bug d'appel) pouvait écrire hors du répertoire visé, relire un
 * fichier arbitraire du stockage privé, ou faire télécharger un artefact
 * depuis un serveur non maîtrisé (le SHA-256 attendu restant imposé, la
 * menace principale était la substitution de source, pas le payload).
 *
 * Contrat uniforme :
 *  - safeSegment : segment de nom de fichier (pas de séparateur, pas de ..) ;
 *  - containedFile : résolution relative SANS sortie du répertoire de base ;
 *  - requirePrivatePath : chemin absolu (modèle caché) uniquement dans le
 *    stockage privé de l'app (filesDir / cacheDir / externalFilesDir) ;
 *  - requireAllowedUrl : téléchargements limités aux releases GitHub
 *    (+ localhost / réseau privé en http pour le développement).
 *
 * Les violations lèvent IllegalArgumentException, attrapées par les
 * try/catch des méthodes de plugin (reject du call, jamais de crash).
 */
final class PluginGuards {
    private PluginGuards() {
    }

    /** Segment de nom de fichier sûr : alphanumérique + . _ - , sans traversal. */
    static String safeSegment(String value) {
        if (value == null || !value.matches("[A-Za-z0-9._-]+") || value.contains("..")) {
            throw new IllegalArgumentException("PLUGIN_INVALID_PATH");
        }
        return value;
    }

    /**
     * Résout `relative` sous `base` en refusant toute sortie du répertoire
     * (traversal par .. ou chemin absolu injecté).
     */
    static File containedFile(File base, String relative) {
        File resolved = new File(base, relative);
        try {
            String canonicalBase = base.getCanonicalPath() + File.separator;
            String canonicalResolved = resolved.getCanonicalPath();
            if (!canonicalResolved.startsWith(canonicalBase)) {
                throw new IllegalArgumentException("PLUGIN_PATH_ESCAPE");
            }
            return resolved;
        } catch (IOException e) {
            throw new IllegalArgumentException("PLUGIN_PATH_ESCAPE", e);
        }
    }

    /**
     * Vérifie qu'un chemin ABSOLU de modèle reste dans le stockage privé de
     * l'app (filesDir, cacheDir, externalFilesDir). Un chemin relatif passe
     * sans modification (il est résolu par l'appelant via containedFile).
     */
    static String requirePrivatePath(String path, Context context) {
        if (path == null || !path.startsWith("/")) return path;
        try {
            String canonical = new File(path).getCanonicalPath();
            boolean inside = canonical.startsWith(context.getFilesDir().getCanonicalPath() + File.separator)
                || canonical.startsWith(context.getCacheDir().getCanonicalPath() + File.separator);
            File external = context.getExternalFilesDir(null);
            if (external != null) {
                inside = inside || canonical.startsWith(external.getCanonicalPath() + File.separator);
            }
            if (!inside) {
                throw new IllegalArgumentException("PLUGIN_PATH_ESCAPE");
            }
            return canonical;
        } catch (IOException e) {
            throw new IllegalArgumentException("PLUGIN_PATH_ESCAPE", e);
        }
    }

    /**
     * URL de téléchargement allowlistée : releases GitHub (redirections
     * objects/release-assets incluses), ou localhost / réseau privé en
     * clair UNIQUEMENT pour le développement (émulateur, poste interne).
     *
     * A11-F24 (AUDIT-011) : les préfixes « http://10. » et « http://192.168. »
     * laissaient passer des HÔTES choisis (http://10.evil.com) — et
     * « http://localhost » acceptait http://localhost.evil.com. Le réseau
     * privé n'est donc autorisé qu'en LITTÉRAUX IP stricts (localhost,
     * 127.0.0.1, 10.x.x.x, 192.168.x.x, 172.16-31.x.x) suivis d'un port
     * éventuel puis d'un / ou d'une fin d'URL. Backstop réel inchangé :
     * NSS bloque le cleartext hors debug.
     */
    private static final java.util.regex.Pattern DEV_CLEARTEXT_URL = java.util.regex.Pattern.compile(
        "^http://(?:(?:localhost|127\\.0\\.0\\.1|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}"
            + "|192\\.168\\.\\d{1,3}\\.\\d{1,3}"
            + "|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}))(?::\\d{1,5})?(?:[/?#]|$)");

    static String requireAllowedUrl(String url) {
        if (url != null && (
            url.startsWith("https://github.com/")
                || url.startsWith("https://objects.githubusercontent.com/")
                || url.startsWith("https://release-assets.githubusercontent.com/")
                || DEV_CLEARTEXT_URL.matcher(url).matches())) {
            return url;
        }
        throw new IllegalArgumentException("PLUGIN_URL_NOT_ALLOWED");
    }
}
