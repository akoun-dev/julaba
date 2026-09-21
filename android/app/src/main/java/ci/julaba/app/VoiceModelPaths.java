package ci.julaba.app;

import android.content.Context;

import java.io.File;

/**
 * Source unique des chemins des packs STT privés. Les gros modèles ne sont
 * pas une dépendance de l'APK de base : un installateur vérifié les place ici
 * après consentement. Les assets restent un repli de compatibilité pour les
 * variantes terrain explicitement construites avec JULABA_BUNDLE_*.
 */
final class VoiceModelPaths {
    static final String FR_PACK = "fr-stt-v1";
    static final String FR_VERSION = "sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8";
    static final String BCI_PACK = "bci-stt-v1";
    static final String BCI_VERSION = "omnilingual-asr-300M-ctc-int8-2025-11-12";

    private VoiceModelPaths() { }

    static File directory(Context context, String pack, String version) {
        return new File(new File(new File(context.getFilesDir(), "models"), pack), version);
    }

    static File frenchDirectory(Context context) { return directory(context, FR_PACK, FR_VERSION); }
    static File ivoirianDirectory(Context context) { return directory(context, BCI_PACK, BCI_VERSION); }

    static boolean containsFrenchModel(Context context) {
        File root = frenchDirectory(context);
        return new File(root, "encoder-epoch-29-avg-9-with-averaged-model.int8.onnx").isFile()
            && new File(root, "decoder-epoch-29-avg-9-with-averaged-model.int8.onnx").isFile()
            && new File(root, "joiner-epoch-29-avg-9-with-averaged-model.int8.onnx").isFile()
            && new File(root, "tokens.txt").isFile();
    }

    static boolean containsIvoirianModel(Context context) {
        File root = ivoirianDirectory(context);
        return new File(root, "model.int8.onnx").isFile() && new File(root, "tokens.txt").isFile();
    }
}
