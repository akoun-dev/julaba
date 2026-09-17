package ci.julaba.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.k2fsa.sherpa.onnx.OnlineRecognizer;
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;
import com.k2fsa.sherpa.onnx.FeatureConfig;

import java.util.ArrayList;
import java.util.List;

/**
 * VoiceService — moteur de reconnaissance vocale unifié (Task 31).
 *
 * Implémente l'API de façade définie par la mission POC Baoulé (§14) :
 *   initialize() / isReady() / startRecording() / stopRecording() /
 *   transcribe() / release()
 *
 * Architecture cible : VoiceService route vers UN reconnaisseur par langue :
 *   - "fr"  → FrenchRecognizer  : sherpa-onnx (zipformer FR int8, déjà
 *             embarqué dans assets/models — le MÊME modèle que
 *             SherpaSttPlugin, mais en mode batch push-to-talk avec
 *             métriques, sans toucher au plugin streaming existant) ;
 *   - "bci" → BaouleRecognizer  : emplacement RÉSERVÉ pour Omnilingual ASR
 *             (omniASR-CTC-300M, bci_Latn). Tant que le benchmark du POC
 *             indépendant (dépôt julaba-baoule-asr-poc, docs/BENCHMARK.md)
 *             n'est pas validé sur appareil réel, transcribe("bci") répond
 *             par l'erreur explicite BAOULE_NOT_READY — jamais par un
 *             fallback silencieux vers le français (mission §18 : pas
 *             d'intégration avant rapport reproductible).
 *
 * Contraintes de mission respectées : 100 % local/offline (aucun appel
 * réseau, aucun envoi d'audio), Sherpa-ONNX français intact, pas de
 * fine-tuning, pas d'autres langues ivoiriennes que le Baoulé.
 *
 * Audio : 16 kHz, mono, PCM 16 bits (même configuration que SherpaSttPlugin),
 * durée maximale configurable (30 s par défaut, auto-stop interne).
 *
 * Enregistrement des codes d'erreur (mission §15) — chaque rejet préfixe son
 * code afin que la couche TS puisse le router :
 *   ENGINE_NOT_INITIALIZED, ALREADY_RECORDING, NO_RECORDING,
 *   PERMISSION_DENIED, MIC_UNAVAILABLE, ENGINE_ERROR, BAOULE_NOT_READY
 */
@CapacitorPlugin(
    name = "VoiceService",
    permissions = {
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "audio")
    }
)
public class VoiceServicePlugin extends Plugin {

    private static final String TAG = "VoiceService";
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int DEFAULT_MAX_DURATION_MS = 30000;
    private static final String DEFAULT_FR_MODEL_PATH =
        "models/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8";

    // Verrou protégeant recognizer/stream (initialisation, inférence, release).
    private final Object engineLock = new Object();

    /** Langue demandée au dernier initialize() réussi ("fr" ou "bci"), null sinon. */
    private volatile String engineLanguage = null;
    /** Initialisation du moteur français en cours (garde-fou anti double-load). */
    private volatile boolean loading = false;

    // --- Moteur français (sherpa-onnx) — mode batch sur buffer enregistré ---
    private OnlineRecognizer recognizer = null;
    private OnlineStream stream = null;

    // --- Capture micro (push-to-talk) ---
    private volatile boolean recording = false;
    private AudioRecord audioRecord = null;
    private Thread captureThread = null;
    private volatile int maxDurationMs = DEFAULT_MAX_DURATION_MS;
    private volatile long recordingStartRealtime = 0;
    /** Buffer PCM 16 bits de l'enregistrement en cours / du dernier enregistrement. */
    private final List<short[]> chunks = new ArrayList<>();
    /** Nombre total d'échantillons accumulés (protégé par chunks). */
    private int sampleCount = 0;

    // ------------------------------------------------------------------
    // initialize — charge le moteur pour la langue demandée
    // ------------------------------------------------------------------

    @PluginMethod
    public void initialize(PluginCall call) {
        String language = call.getString("language", "fr");
        if (!"fr".equals(language) && !"bci".equals(language)) {
            call.reject("ENGINE_ERROR: langue non prise en charge \"" + language
                + "\" (langues disponibles : fr, bci)");
            return;
        }

        if ("bci".equals(language)) {
            // Emplacement réservé du BaouleRecognizer : initialize réussit
            // (le slot existe, l'API est stable) mais le moteur reste
            // indisponible jusqu'à la validation du benchmark du POC.
            engineLanguage = "bci";
            JSObject status = statusObject();
            status.put("initialized", true);
            call.resolve(status);
            return;
        }

        // Français — idempotent si déjà chargé.
        if (recognizer != null && "fr".equals(engineLanguage)) {
            JSObject status = statusObject();
            status.put("initialized", true);
            call.resolve(status);
            return;
        }
        if (loading) {
            call.reject("ENGINE_ERROR: initialisation du moteur déjà en cours");
            return;
        }

        final String modelPath = call.getString("modelPath", DEFAULT_FR_MODEL_PATH);
        loading = true;
        // Chargement sur thread dédié : ~1 à 2 s sur appareil d'entrée de
        // gamme, on ne bloque pas le thread appelant du bridge.
        new Thread(() -> {
            try {
                OnlineRecognizer fresh = buildFrenchRecognizer(modelPath);
                synchronized (engineLock) {
                    releaseFrenchEngineLocked();
                    recognizer = fresh;
                    stream = recognizer.createStream("");
                }
                engineLanguage = "fr";
                Log.i(TAG, "Moteur français prêt (sherpa-onnx, " + modelPath + ")");
                JSObject status = statusObject();
                status.put("initialized", true);
                call.resolve(status);
            } catch (Exception e) {
                Log.e(TAG, "Échec du chargement du moteur français", e);
                call.reject("ENGINE_ERROR: échec du chargement du moteur français : "
                    + e.getMessage());
            } finally {
                loading = false;
            }
        }, "voice-service-init").start();
    }

    // ------------------------------------------------------------------
    // isReady — état du moteur courant
    // ------------------------------------------------------------------

    @PluginMethod
    public void isReady(PluginCall call) {
        call.resolve(statusObject());
    }

    // ------------------------------------------------------------------
    // startRecording — capture micro 16 kHz mono PCM16 (push-to-talk)
    // ------------------------------------------------------------------

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (engineLanguage == null) {
            call.reject("ENGINE_NOT_INITIALIZED: appeler d'abord initialize()");
            return;
        }
        if (recording) {
            call.reject("ALREADY_RECORDING: un enregistrement est déjà en cours");
            return;
        }
        if (getActivity() != null &&
            ActivityCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED) {
            saveCall(call);
            requestPermissionForAlias("audio", call, "audioPermissionCallback");
            return;
        }
        startCapture(call);
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        if (call == null) return;
        if (getActivity() != null &&
            ActivityCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED) {
            startCapture(call);
        } else {
            call.reject("PERMISSION_DENIED: permission microphone refusée");
        }
    }

    private void startCapture(PluginCall call) {
        try {
            int minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (minBuffer <= 0 || minBuffer == AudioRecord.ERROR
                || minBuffer == AudioRecord.ERROR_BAD_VALUE) {
                minBuffer = SAMPLE_RATE; // secours : 1 s de PCM16
            }

            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                minBuffer * 2
            );
            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                audioRecord.release();
                audioRecord = null;
                call.reject("MIC_UNAVAILABLE: impossible d'initialiser le micro");
                return;
            }

            synchronized (chunks) {
                chunks.clear();
                sampleCount = 0;
            }
            maxDurationMs = call.getInt("maxDurationMs", DEFAULT_MAX_DURATION_MS);
            recordingStartRealtime = SystemClock.elapsedRealtime();
            recording = true;
            audioRecord.startRecording();

            captureThread = new Thread(this::captureLoop, "voice-service-capture");
            captureThread.start();

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("maxDurationMs", maxDurationMs);
            call.resolve(result);
        } catch (SecurityException se) {
            recording = false;
            Log.e(TAG, "Permission refusée pendant le démarrage de la capture", se);
            call.reject("PERMISSION_DENIED: " + se.getMessage());
        } catch (Exception e) {
            recording = false;
            Log.e(TAG, "Échec du démarrage de la capture", e);
            call.reject("MIC_UNAVAILABLE: " + e.getMessage());
        }
    }

    /**
     * Boucle de capture : lit le micro par tranches de 100 ms et accumule le
     * PCM brut en mémoire. S'arrête d'elle-même à maxDurationMs (auto-stop) —
     * stopRecording() reste à appeler pour récupérer buffer et métriques.
     */
    private void captureLoop() {
        int chunkSamples = SAMPLE_RATE / 10; // 100 ms
        short[] buffer = new short[chunkSamples];

        while (recording) {
            if (SystemClock.elapsedRealtime() - recordingStartRealtime >= maxDurationMs) {
                Log.i(TAG, "Auto-stop : durée maximale d'enregistrement atteinte ("
                    + maxDurationMs + " ms)");
                recording = false;
                break;
            }
            int read = audioRecord.read(buffer, 0, chunkSamples);
            if (read <= 0) continue;
            short[] piece = new short[read];
            System.arraycopy(buffer, 0, piece, 0, read);
            synchronized (chunks) {
                chunks.add(piece);
                sampleCount += read;
            }
        }

        // Libération du micro sur le thread de capture (arrêt normal ou auto-stop).
        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) { }
            try { audioRecord.release(); } catch (Exception ignored) { }
            audioRecord = null;
        }
    }

    // ------------------------------------------------------------------
    // stopRecording — arrête la capture, conserve le buffer pour transcribe()
    // ------------------------------------------------------------------

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (!recording && captureThread == null && sampleCountTotal() == 0) {
            call.reject("NO_RECORDING: aucun enregistrement en cours");
            return;
        }
        stopCaptureInternal();
        JSObject result = new JSObject();
        result.put("audioDurationMs", audioDurationMs());
        result.put("sampleCount", sampleCountTotal());
        call.resolve(result);
    }

    private void stopCaptureInternal() {
        recording = false;
        Thread thread = captureThread;
        if (thread != null) {
            try {
                thread.join(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            captureThread = null;
        }
        // Ceinture et bretelles : la boucle de capture libère déjà audioRecord.
        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) { }
            try { audioRecord.release(); } catch (Exception ignored) { }
            audioRecord = null;
        }
    }

    // ------------------------------------------------------------------
    // transcribe — inférence batch sur le dernier enregistrement + métriques
    // ------------------------------------------------------------------

    @PluginMethod
    public void transcribe(PluginCall call) {
        String language = call.getString("language", engineLanguage);
        if (language == null) {
            call.reject("ENGINE_NOT_INITIALIZED: appeler d'abord initialize()");
            return;
        }
        if ("bci".equals(language)) {
            // Mission §18 : pas d'intégration du Baoulé avant un
            // docs/BENCHMARK.md reproductible du POC sur appareil réel.
            call.reject("BAOULE_NOT_READY: moteur Baoulé (Omnilingual ASR omniASR-CTC-300M, "
                + "bci_Latn) non intégré — en attente de la validation du benchmark du POC "
                + "julaba-baoule-asr-poc");
            return;
        }
        if (recording) {
            // Push-to-talk permissif : transcribe() stoppe implicitement la capture.
            stopCaptureInternal();
        }
        final int totalSamples;
        synchronized (chunks) {
            totalSamples = sampleCount;
        }
        if (totalSamples == 0) {
            call.reject("NO_RECORDING: aucun audio enregistré — appeler d'abord "
                + "startRecording() puis stopRecording()");
            return;
        }
        synchronized (engineLock) {
            if (recognizer == null || stream == null) {
                call.reject("ENGINE_NOT_INITIALIZED: moteur français non chargé — appeler "
                    + "initialize({ language: 'fr' })");
                return;
            }
        }

        // Instantané du buffer hors verrou : la capture est déjà arrêtée.
        final float[] pcm = new float[totalSamples];
        synchronized (chunks) {
            int offset = 0;
            for (short[] piece : chunks) {
                for (int i = 0; i < piece.length; i++) {
                    pcm[offset + i] = piece[i] / 32768.0f; // int16 → float32 [-1, 1]
                }
                offset += piece.length;
            }
        }
        final long audioDurationMs = Math.round((totalSamples * 1000.0) / SAMPLE_RATE);

        // Inférence sur thread dédié (quelques secondes possibles sur audio long).
        new Thread(() -> {
            try {
                long start = SystemClock.elapsedRealtime();
                String text;
                synchronized (engineLock) {
                    if (recognizer == null || stream == null) {
                        call.reject("ENGINE_NOT_INITIALIZED: moteur relâché pendant "
                            + "l'inférence — appeler initialize() à nouveau");
                        return;
                    }
                    recognizer.reset(stream);
                    stream.acceptWaveform(pcm, SAMPLE_RATE);
                    while (recognizer.isReady(stream)) {
                        recognizer.decode(stream);
                    }
                    text = recognizer.getResult(stream).getText();
                }
                long inferenceDurationMs = SystemClock.elapsedRealtime() - start;
                double realtimeFactor = audioDurationMs > 0
                    ? inferenceDurationMs / (double) audioDurationMs
                    : 0.0;

                JSObject result = new JSObject();
                result.put("text", text != null ? text : "");
                result.put("language", language);
                result.put("audioDurationMs", audioDurationMs);
                result.put("inferenceDurationMs", inferenceDurationMs);
                result.put("realtimeFactor", Math.round(realtimeFactor * 1000.0) / 1000.0);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Échec de la transcription", e);
                call.reject("ENGINE_ERROR: " + e.getMessage());
            }
        }, "voice-service-infer").start();
    }

    // ------------------------------------------------------------------
    // release — libère moteur + buffer
    // ------------------------------------------------------------------

    @PluginMethod
    public void release(PluginCall call) {
        stopCaptureInternal();
        synchronized (chunks) {
            chunks.clear();
            sampleCount = 0;
        }
        synchronized (engineLock) {
            releaseFrenchEngineLocked();
        }
        engineLanguage = null;
        loading = false;
        JSObject result = new JSObject();
        result.put("released", true);
        call.resolve(result);
    }

    // ------------------------------------------------------------------
    // Interne
    // ------------------------------------------------------------------

    private JSObject statusObject() {
        JSObject status = new JSObject();
        if ("fr".equals(engineLanguage) && recognizer != null) {
            status.put("ready", true);
            status.put("language", "fr");
            status.put("engine", "sherpa-onnx-zipformer-fr-2023-04-14-int8");
        } else if ("bci".equals(engineLanguage)) {
            status.put("ready", false);
            status.put("language", "bci");
            status.put("engine", "omnilingual-asr-ctc-300M (emplacement réservé — "
                + "benchmark POC en cours)");
        } else {
            status.put("ready", false);
            status.put("language", engineLanguage);
            status.put("engine", null);
        }
        return status;
    }

    private int sampleCountTotal() {
        synchronized (chunks) {
            return sampleCount;
        }
    }

    private long audioDurationMs() {
        synchronized (chunks) {
            return Math.round((sampleCount * 1000.0) / SAMPLE_RATE);
        }
    }

    private OnlineRecognizer buildFrenchRecognizer(String modelPath) {
        String encoderPath = loadAssetFile(modelPath
            + "/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
        String decoderPath = loadAssetFile(modelPath
            + "/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
        String joinerPath = loadAssetFile(modelPath
            + "/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx");
        String tokensPath = loadAssetFile(modelPath + "/tokens.txt");

        OnlineTransducerModelConfig transducerConfig = new OnlineTransducerModelConfig();
        transducerConfig.setEncoder(encoderPath);
        transducerConfig.setDecoder(decoderPath);
        transducerConfig.setJoiner(joinerPath);

        OnlineModelConfig modelConfig = new OnlineModelConfig();
        modelConfig.setTransducer(transducerConfig);
        modelConfig.setTokens(tokensPath);
        modelConfig.setNumThreads(2);
        modelConfig.setDebug(false);

        FeatureConfig featConfig = new FeatureConfig();
        featConfig.setSampleRate(SAMPLE_RATE);
        featConfig.setFeatureDim(80);

        OnlineRecognizerConfig config = new OnlineRecognizerConfig();
        config.setFeatConfig(featConfig);
        config.setModelConfig(modelConfig);
        config.setEnableEndpoint(false); // batch : une utterance complète par buffer
        config.setDecodingMethod("greedy_search");

        return new OnlineRecognizer(getContext().getAssets(), config);
    }

    private void releaseFrenchEngineLocked() {
        if (stream != null) {
            try { stream.release(); } catch (Exception ignored) { }
            stream = null;
        }
        if (recognizer != null) {
            try { recognizer.release(); } catch (Exception ignored) { }
            recognizer = null;
        }
    }

    /**
     * Le AAR sherpa-onnx attend des chemins filesystem : copie l'asset vers
     * le cache (même approche éprouvée que SherpaSttPlugin).
     */
    private String loadAssetFile(String path) {
        try {
            if (getContext() == null) return path;
            java.io.InputStream is = getContext().getAssets().open(path);
            byte[] buffer = new byte[is.available()];
            is.read(buffer);
            is.close();

            java.io.File file = new java.io.File(getContext().getCacheDir(), path);
            file.getParentFile().mkdirs();
            java.io.FileOutputStream fos = new java.io.FileOutputStream(file);
            fos.write(buffer);
            fos.close();
            return file.getAbsolutePath();
        } catch (Exception e) {
            Log.w(TAG, "Impossible de lire l'asset : " + path, e);
            return path;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopCaptureInternal();
        synchronized (chunks) {
            chunks.clear();
            sampleCount = 0;
        }
        synchronized (engineLock) {
            releaseFrenchEngineLocked();
        }
        engineLanguage = null;
    }
}
