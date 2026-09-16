package ci.julaba.app;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Sortie voix native pour « Tata Nanti Lou ».
 *
 * CONTEXTE (bug corrigé) : la WebView Android n'implémente pas la Web Speech
 * API (speechSynthesis) — chaque tataSpeak() côté JS était donc un no-op
 * silencieux dans l'app native, du onboarding à la navigation marchand. Le
 * pont STT SherpaSttPlugin a été créé pour la même limitation côté micro,
 * mais aucun équivalent n'existait pour la synthèse. Ce plugin enveloppe
 * android.speech.tts.TextToSpeech — le moteur TTS système (Google TTS),
 * disponible hors ligne avec la voix française sur la quasi-totalité des
 * appareils Android.
 *
 * CONTRAT : speak() garde l'appel vivant (setKeepAlive) et le résout une
 * seule fois, depuis UtteranceProgressListener, quand l'énoncé est terminé
 * ({spoken: true}) ou a échoué/été interrompu ({spoken: false}). Côté JS,
 * src/lib/voice/tata-tts.ts mappe ce résultat sur son unique callback
 * 'done'/'error' (les appelants chaînent navigation/fermeture de modale
 * dessus — il ne doit jamais partir en double ni jamais partir du tout).
 */
@CapacitorPlugin(name = "TataTts")
public class TataTtsPlugin extends Plugin {

    private static final String TAG = "TataTts";

    private TextToSpeech tts = null;
    private final AtomicBoolean initTried = new AtomicBoolean(false);
    private final AtomicBoolean initInFlight = new AtomicBoolean(false);
    private volatile boolean initOk = false;

    private PluginCall pendingSpeakCall = null;
    private String currentUtteranceId = null;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        ensureInit();
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("ready", initOk);
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.resolve(makeResult(false, "texte_vide"));
            return;
        }

        ensureInit();

        if (!initOk) {
            if (initInFlight.get()) {
                // L'init du moteur est en cours : mettre l'appel en attente,
                // onInit le déclenchera dès que le moteur sera prêt.
                resolvePreviousSpeak("supplanté");
                pendingSpeakCall = call;
                call.setKeepAlive(true);
                return;
            }
            call.resolve(makeResult(false, "init_echouee"));
            return;
        }

        speakNow(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            if (tts != null && initOk) {
                tts.stop();
            }
        } catch (Exception e) {
            Log.w(TAG, "stop() a levé: " + e);
        }
        // stop() déclenche onStop (pas onDone) : résoudre ici.
        resolvePreviousSpeak("interrompu");
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        resolvePreviousSpeak("destruction");
        if (tts != null) {
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
        }
        initOk = false;
        initTried.set(false);
        super.handleOnDestroy();
    }

    private void ensureInit() {
        if (initOk) return;
        if (!initTried.compareAndSet(false, true)) return;

        initInFlight.set(true);
        Context ctx = getContext();
        tts = new TextToSpeech(ctx, status -> {
            initInFlight.set(false);
            initOk = (status == TextToSpeech.SUCCESS);
            if (initOk && tts != null) {
                try {
                    // La voix de Tata est française ; si les données de voix
                    // manquent sur l'appareil, on garde la voix par défaut du
                    // moteur plutôt que de taire l'assistante.
                    int langResult = tts.setLanguage(Locale.FRENCH);
                    if (langResult == TextToSpeech.LANG_MISSING_DATA
                            || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                        Log.w(TAG, "Voix française indisponible, voix système par défaut utilisée");
                    }
                    tts.setPitch(1.1f);
                    tts.setOnUtteranceProgressListener(progressListener);
                } catch (Exception e) {
                    Log.w(TAG, "Config TTS post-init a échoué: " + e);
                }
            } else {
                Log.w(TAG, "Init TextToSpeech échouée, status=" + status);
            }
            // Un speak() peut être en attente depuis avant la fin d'init.
            PluginCall queued = pendingSpeakCall;
            if (initOk && queued != null) {
                speakNow(queued);
            } else if (queued != null) {
                pendingSpeakCall = null;
                queued.resolve(makeResult(false, "init_echouee"));
            }
        });
    }

    private void speakNow(PluginCall call) {
        String text = call.getString("text", "");
        double rate = call.getDouble("rate", 0.9);
        double volume = call.getDouble("volume", 1.0);

        resolvePreviousSpeak("supplanté");
        pendingSpeakCall = call;
        call.setKeepAlive(true);
        currentUtteranceId = "tata-" + System.currentTimeMillis();

        try {
            tts.setSpeechRate(clamp((float) rate, 0.4f, 2.0f));
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, clamp((float) volume, 0f, 1f));
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, currentUtteranceId);
            if (result != TextToSpeech.SUCCESS) {
                pendingSpeakCall = null;
                currentUtteranceId = null;
                call.resolve(makeResult(false, "speak_refuse"));
            }
        } catch (Exception e) {
            Log.w(TAG, "speak() a levé: " + e);
            pendingSpeakCall = null;
            currentUtteranceId = null;
            call.resolve(makeResult(false, "exception"));
        }
    }

    private final UtteranceProgressListener progressListener = new UtteranceProgressListener() {
        @Override
        public void onStart(String utteranceId) { }

        @Override
        public void onDone(String utteranceId) {
            if (isCurrentUtterance(utteranceId)) {
                finishSpeak(true, null);
            }
        }

        @Override
        public void onError(String utteranceId) {
            if (isCurrentUtterance(utteranceId)) {
                finishSpeak(false, "tts_erreur");
            }
        }
    };

    private boolean isCurrentUtterance(String utteranceId) {
        return utteranceId != null && utteranceId.equals(currentUtteranceId);
    }

    private void finishSpeak(boolean spoken, String reason) {
        currentUtteranceId = null;
        PluginCall call = pendingSpeakCall;
        pendingSpeakCall = null;
        if (call != null) {
            call.resolve(makeResult(spoken, reason));
        }
    }

    private void resolvePreviousSpeak(String reason) {
        PluginCall previous = pendingSpeakCall;
        pendingSpeakCall = null;
        currentUtteranceId = null;
        if (previous != null) {
            previous.resolve(makeResult(false, reason));
        }
    }

    private JSObject makeResult(boolean spoken, String reason) {
        JSObject result = new JSObject();
        result.put("spoken", spoken);
        if (reason != null) result.put("reason", reason);
        return result;
    }

    private static float clamp(float v, float min, float max) {
        return Math.max(min, Math.min(max, v));
    }
}
