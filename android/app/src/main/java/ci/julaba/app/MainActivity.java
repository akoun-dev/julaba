package ci.julaba.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Task 30 — edge-to-edge uniforme sur TOUTES les versions d'Android
        // (recommandé par la doc SystemBars quand insetsHandling != "disable" ;
        // déjà forcé par le système sur Android 15+ / targetSdk 36) : barres
        // système transparentes, WebView dessine dessous, et l'app gère les
        // insets côté web (viewport-fit="cover" + env()/--safe-area-inset-*,
        // utilitaires *-safe dans globals.css). À appeler AVANT
        // super.onCreate (le bridge y installe son contenu). Capacitor 9
        // fera cela par défaut (insetsHandling: "native").
        EdgeToEdge.enable(this);
        // SherpaSttPlugin is a local plugin (not published to npm), so it
        // needs manual registration — Capacitor's autolinking only covers
        // plugins that ship their own npm package. See SherpaSttPlugin.java.
        registerPlugin(SherpaSttPlugin.class);
        registerPlugin(LiteRtModelPlugin.class);
        // Sortie voix native — la WebView Android n'implémente pas la Web
        // Speech API (speechSynthesis) : sans ce pont, Tata est muette.
        registerPlugin(TataTtsPlugin.class);
        // Gestionnaire des packs TTS versionnés : stockage privé, checksum,
        // activation atomique et événements de progression.
        registerPlugin(VoicePackPlugin.class);
        // Task 31 — moteur vocal unifié (API initialize/isReady/startRecording/
        // stopRecording/transcribe/release) : français = sherpa-onnx en mode
        // batch push-to-talk, baoulé = emplacement réservé (stub BAOULE_NOT_READY
        // tant que le benchmark du POC julaba-baoule-asr-poc n'est pas validé).
        // Voir docs/VOICE_SERVICE.md.
        registerPlugin(VoiceServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
