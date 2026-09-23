package ci.julaba.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioManager;
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
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineOmnilingualAsrCtcModelConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
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
 * Architecture : VoiceService route vers UN reconnaisseur par langue :
 *   - "fr"  → FrenchRecognizer  : sherpa-onnx (zipformer FR int8, embarqué
 *             dans assets/models — le MÊME modèle que SherpaSttPlugin, mais
 *             en mode batch push-to-talk avec métriques, sans toucher au
 *             plugin streaming existant) ;
 *   - "bci" → BaouleRecognizer  : Omnilingual ASR (Meta, 1600 langues,
 *             CTC 300M int8) via sherpa-onnx OfflineRecognizer — modèle
 *             embarqué dans assets (100 % offline) ou téléchargeable via
 *             scripts/fetch-android-deps.sh ; bci_Latn est une langue
 *             supportée du modèle. L'intégration (Task 35) lève le verrou
 *             mission §18 sur demande explicite du propriétaire : le
 *             BENCHMARK.md du POC reste la validation qualité recommandée
 *             (CER/WER avec locuteurs natifs), mais elle n'est plus un
 *             prérequis d'exécution.
 *
 * Garde-fous maintenus : si le modèle Baoulé n'est pas embarqué dans le
 * build (apk allégé) ou si le moteur n'a pas été initialisé, transcribe
 * ("bci") répond par l'erreur explicite BAOULE_NOT_READY — jamais par un
 * fallback silencieux vers le français.
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
    /** Modèle Baoulé : Omnilingual ASR 1600 langues CTC 300M int8 (k2-fsa). */
    private static final String DEFAULT_BCI_MODEL_PATH =
        "models/omnilingual-asr-300M-ctc-int8-2025-11-12";
    /**
     * MODE-953 — dossier DISQUE des packs vocaux téléchargés par
     * l'utilisateur (Réglages → Voix & Langue) dans filesDir. Un pack
     * installé ÉCRASE l'asset du build (version téléchargée prioritaire) —
     * même arborescence relative que les assets (models/...).
     */
    private static final String DISK_MODELS_DIR = "voice-models";

    // Verrou protégeant recognizer/stream (initialisation, inférence, release).
    private final Object engineLock = new Object();

    /** Langue demandée au dernier initialize() réussi ("fr" ou "bci"), null sinon. */
    private volatile String engineLanguage = null;
    /** Initialisation d'un moteur en cours (garde-fou anti double-load). */
    private volatile boolean loading = false;

    // --- Moteur français (sherpa-onnx) — mode batch sur buffer enregistré ---
    private OnlineRecognizer recognizer = null;
    private OnlineStream stream = null;

    // --- Moteur Baoulé (sherpa-onnx OfflineRecognizer, omnilingual CTC) ---
    private OfflineRecognizer baouleRecognizer = null;

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
        if (!"fr".equals(language) && !"bci".equals(language) && !"dyu".equals(language)) {
            call.reject("ENGINE_ERROR: langue non prise en charge \"" + language
                + "\" (langues disponibles : fr, bci, dyu)");
            return;
        }

        // Omnilingual ASR (1 600 langues) : 'bci' (baoulé) ET 'dyu' (dioula)
        // routent vers le MÊME moteur — le modèle n'est pas langue-spécifique.
        if ("bci".equals(language) || "dyu".equals(language)) {
            // Garde explicite (MODE-953) : modèle omnilingual absent des
            // assets ET du disque → erreur dédiée immédiate (jamais de
            // fallback silencieux vers le fr). Un build allégé sans le pack
            // annonce l'ACTION utilisateur (installer le pack), pas une
            // panne vague.
            if (!isModelAvailableInternal(new String[] {
                    DEFAULT_BCI_MODEL_PATH + "/model.int8.onnx",
                    DEFAULT_BCI_MODEL_PATH + "/tokens.txt",
                })) {
                call.reject("PACK_MISSING: modèle omnilingual (bci/dyu) absent "
                    + "des assets ET du disque — installez le pack « Dictée "
                    + "baoulé & dioula » dans Réglages → Voix & Langue "
                    + "(téléchargement unique, recommandé en Wi-Fi)");
                return;
            }

            // Idempotent si déjà chargé — et le moteur étant IDENTIQUE pour
            // bci et dyu, un simple basculement d'étiquette suffit.
            if (baouleRecognizer != null
                    && ("bci".equals(engineLanguage) || "dyu".equals(engineLanguage))) {
                engineLanguage = language;
                JSObject status = statusObject();
                status.put("initialized", true);
                call.resolve(status);
                return;
            }
            if (loading) {
                call.reject("ENGINE_ERROR: initialisation du moteur déjà en cours");
                return;
            }

            loading = true;
            // Chargement sur thread dédié : le CTC 300M int8 prend quelques
            // secondes et plusieurs centaines de Mo de RAM au premier load.
            new Thread(() -> {
                try {
                    OfflineRecognizer fresh = buildBaouleRecognizer(DEFAULT_BCI_MODEL_PATH);
                    synchronized (engineLock) {
                        releaseBaouleEngineLocked();
                        baouleRecognizer = fresh;
                    }
                    engineLanguage = language;
                    Log.i(TAG, "Moteur omnilingual prêt pour " + language
                        + " (sherpa-onnx omnilingual CTC, " + DEFAULT_BCI_MODEL_PATH + ")");
                    JSObject status = statusObject();
                    status.put("initialized", true);
                    call.resolve(status);
                } catch (Exception e) {
                    Log.e(TAG, "Échec du chargement du moteur omnilingual", e);
                    String msg = e.getMessage() == null ? "" : e.getMessage();
                    if (msg.contains("PACK_MISSING")) {
                        call.reject(msg);
                    } else {
                        call.reject("ENGINE_ERROR: échec du chargement du moteur omnilingual : "
                            + msg);
                    }
                } finally {
                    loading = false;
                }
            }, "voice-service-init-omni").start();
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
                String msg = e.getMessage() == null ? "" : e.getMessage();
                if (msg.contains("PACK_MISSING")) {
                    call.reject(msg);
                } else {
                    call.reject("ENGINE_ERROR: échec du chargement du moteur français : "
                        + msg);
                }
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
    // isModelAvailable — sonde MODE-953 (SANS chargement du moteur)
    // ------------------------------------------------------------------

    @PluginMethod
    public void isModelAvailable(PluginCall call) {
        String language = call.getString("language", "fr");
        String[] probeFiles;
        if ("fr".equals(language)) {
            probeFiles = new String[] {
                DEFAULT_FR_MODEL_PATH + "/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx",
                DEFAULT_FR_MODEL_PATH + "/tokens.txt",
            };
        } else if ("bci".equals(language) || "dyu".equals(language)) {
            // Omnilingual : bci et dyu partagent le MÊME modèle.
            probeFiles = new String[] {
                DEFAULT_BCI_MODEL_PATH + "/model.int8.onnx",
                DEFAULT_BCI_MODEL_PATH + "/tokens.txt",
            };
        } else {
            call.reject("ENGINE_ERROR: langue non prise en charge \"" + language
                + "\" (langues disponibles : fr, bci, dyu)");
            return;
        }
        JSObject result = new JSObject();
        result.put("language", language);
        // Priorité d'annonce : assets (build full) sinon disque (pack installé).
        boolean allInAssets = true;
        for (String p : probeFiles) { if (!assetExists(p)) { allInAssets = false; break; } }
        boolean allOnDisk = true;
        for (String p : probeFiles) { if (!diskFileExists(p)) { allOnDisk = false; break; } }
        if (allInAssets) {
            result.put("available", true);
            result.put("source", "assets");
        } else if (allOnDisk) {
            result.put("available", true);
            result.put("source", "disk");
        } else {
            result.put("available", false);
            result.put("source", "none");
        }
        call.resolve(result);
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
            if (getActivity() == null) {
                call.reject("MIC_UNAVAILABLE: activité Android indisponible");
                return;
            }
            if (ActivityCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                call.reject("PERMISSION_DENIED: permission microphone refusée");
                return;
            }

            AudioManager audioManager =
                (AudioManager) getActivity().getSystemService(android.content.Context.AUDIO_SERVICE);
            if (audioManager != null && audioManager.isMicrophoneMute()) {
                call.reject("MIC_UNAVAILABLE: microphone désactivé au niveau du système");
                return;
            }

            int minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (minBuffer <= 0 || minBuffer == AudioRecord.ERROR
                || minBuffer == AudioRecord.ERROR_BAD_VALUE) {
                minBuffer = SAMPLE_RATE;
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
                call.reject("MIC_UNAVAILABLE: AudioRecord n'a pas pu être initialisé "
                    + "(micro occupé, entrée audio indisponible ou configuration non supportée)");
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

            if (audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                recording = false;
                try { audioRecord.release(); } catch (Exception ignored) { }
                audioRecord = null;
                call.reject("MIC_UNAVAILABLE: le microphone n'est pas passé en état d'enregistrement");
                return;
            }

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
        final String language = call.getString("language", engineLanguage);
        if (language == null) {
            call.reject("ENGINE_NOT_INITIALIZED: appeler d'abord initialize()");
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

        if ("bci".equals(language) || "dyu".equals(language)) {
            transcribeOmni(call, language, pcm, audioDurationMs);
        } else {
            transcribeFr(call, language, pcm, audioDurationMs);
        }
    }

    /**
     * Inférence française : OnlineRecognizer zipformer utilisé en batch
     * (une utterance complète par buffer, endpoint désactivé).
     */
    private void transcribeFr(PluginCall call, String language, float[] pcm, long audioDurationMs) {
        synchronized (engineLock) {
            if (recognizer == null || stream == null) {
                call.reject("ENGINE_NOT_INITIALIZED: moteur français non chargé — appeler "
                    + "initialize({ language: 'fr' })");
                return;
            }
        }

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
                resolveTranscription(call, language, text, audioDurationMs,
                    SystemClock.elapsedRealtime() - start);
            } catch (Exception e) {
                Log.e(TAG, "Échec de la transcription", e);
                call.reject("ENGINE_ERROR: " + e.getMessage());
            }
        }, "voice-service-infer").start();
    }

    /**
     * Inférence omnilingual (baoulé ET dioula) : OfflineRecognizer CTC
     * (batch pur — le modèle ne décode qu'une utterance complète, pas de
     * stream continu). Le MÊME moteur couvre bci_Latn et dyu_Latn.
     */
    private void transcribeOmni(PluginCall call, String language, float[] pcm, long audioDurationMs) {
        synchronized (engineLock) {
            if (baouleRecognizer == null) {
                call.reject("BAOULE_NOT_READY: moteur omnilingual non chargé — appeler "
                    + "initialize({ language: '" + language + "' }) ; si l'erreur persiste, "
                    + "le modèle n'est pas embarqué dans ce build");
                return;
            }
        }

        new Thread(() -> {
            try {
                long start = SystemClock.elapsedRealtime();
                String text;
                synchronized (engineLock) {
                    if (baouleRecognizer == null) {
                        call.reject("BAOULE_NOT_READY: moteur relâché pendant "
                            + "l'inférence — appeler initialize({ language: '" + language + "' })");
                        return;
                    }
                    OfflineStream stream = baouleRecognizer.createStream();
                    try {
                        stream.acceptWaveform(pcm, SAMPLE_RATE);
                        baouleRecognizer.decode(stream);
                        text = baouleRecognizer.getResult(stream).getText();
                    } finally {
                        try { stream.release(); } catch (Exception ignored) { }
                    }
                }
                resolveTranscription(call, language, text, audioDurationMs,
                    SystemClock.elapsedRealtime() - start);
            } catch (Exception e) {
                Log.e(TAG, "Échec de la transcription omnilingual", e);
                call.reject("ENGINE_ERROR: " + e.getMessage());
            }
        }, "voice-service-infer-omni").start();
    }

    /** Résolution commune : texte + métriques (champs mission §6). */
    private void resolveTranscription(PluginCall call, String language, String text,
        long audioDurationMs, long inferenceDurationMs) {
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
            releaseBaouleEngineLocked();
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
        } else if (("bci".equals(engineLanguage) || "dyu".equals(engineLanguage))
                && baouleRecognizer != null) {
            status.put("ready", true);
            status.put("language", engineLanguage);
            status.put("engine", "omnilingual-asr-300M-ctc-int8-2025-11-12");
        } else if ("bci".equals(engineLanguage) || "dyu".equals(engineLanguage)) {
            status.put("ready", false);
            status.put("language", engineLanguage);
            status.put("engine", "omnilingual-asr-300M-ctc-int8 (modèle non chargé)");
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

    private OnlineRecognizer buildFrenchRecognizer(String modelPath) throws java.io.IOException {
        String encoderPath = resolveModelFile(modelPath
            + "/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
        String decoderPath = resolveModelFile(modelPath
            + "/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
        String joinerPath = resolveModelFile(modelPath
            + "/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx");
        String tokensPath = resolveModelFile(modelPath + "/tokens.txt");

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

    private void releaseBaouleEngineLocked() {
        if (baouleRecognizer != null) {
            try { baouleRecognizer.release(); } catch (Exception ignored) { }
            baouleRecognizer = null;
        }
    }

    /**
     * BaouleRecognizer : sherpa-onnx OfflineRecognizer sur Omnilingual ASR
     * (Meta, 1600 langues, CTC 300M int8) — bci_Latn est une des langues
     * supportées par le vocabulaire (9812 tokens sous-mots).
     */
    private OfflineRecognizer buildBaouleRecognizer(String modelPath) throws java.io.IOException {
        String modelPathInt8 = resolveModelFile(modelPath + "/model.int8.onnx");
        String tokensPath = resolveModelFile(modelPath + "/tokens.txt");

        OfflineOmnilingualAsrCtcModelConfig omniConfig = new OfflineOmnilingualAsrCtcModelConfig();
        omniConfig.setModel(modelPathInt8);

        OfflineModelConfig modelConfig = new OfflineModelConfig();
        modelConfig.setOmnilingual(omniConfig);
        modelConfig.setTokens(tokensPath);
        modelConfig.setNumThreads(2);
        modelConfig.setDebug(false);
        modelConfig.setModelType("omnilingual");

        FeatureConfig featConfig = new FeatureConfig();
        featConfig.setSampleRate(SAMPLE_RATE);
        featConfig.setFeatureDim(80);

        OfflineRecognizerConfig config = new OfflineRecognizerConfig();
        config.setFeatConfig(featConfig);
        config.setModelConfig(modelConfig);
        config.setDecodingMethod("greedy_search");

        return new OfflineRecognizer(getContext().getAssets(), config);
    }

    /**
     * Le AAR sherpa-onnx attend des chemins filesystem : copie l'asset vers
     * le cache (même approche éprouvée que SherpaSttPlugin). Copie STREAMING
     * par blocs de 256 Ko — indispensable pour le modèle Baoulé (349 Mo, un
     * buffer mémoire complet déclencherait un OOM sur appareil d'entrée de
     * gamme). Lève IOException si l'asset est absent (erreur explicite).
     */
    private String loadAssetFile(String path) throws java.io.IOException {
        if (getContext() == null) {
            throw new java.io.IOException("contexte Android indisponible pour l'asset " + path);
        }
        java.io.InputStream is = getContext().getAssets().open(path); // throw si absent
        // AUDIT-005 : `path` provient du bridge (modelPath) — l'écriture
        // cache est contenue dans cacheDir (refus des .. et chemins absolus).
        java.io.File file = PluginGuards.containedFile(getContext().getCacheDir(), path);
        file.getParentFile().mkdirs();
        java.io.FileOutputStream fos = new java.io.FileOutputStream(file);
        byte[] buffer = new byte[256 * 1024];
        try {
            int read;
            while ((read = is.read(buffer)) != -1) {
                fos.write(buffer, 0, read);
            }
        } finally {
            try { is.close(); } catch (Exception ignored) { }
            try { fos.close(); } catch (Exception ignored) { }
        }
        return file.getAbsolutePath();
    }

    /** MODE-953 — l'asset existe-t-il dans l'APK ? (sonde, sans copie) */
    private boolean assetExists(String relPath) {
        try {
            if (getContext() == null) return false;
            getContext().getAssets().open(relPath).close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** MODE-953 — le pack a-t-il été téléchargé sur le disque ? */
    private boolean diskFileExists(String relPath) {
        if (getContext() == null) return false;
        java.io.File f = new java.io.File(getContext().getFilesDir(),
            DISK_MODELS_DIR + java.io.File.separator + relPath);
        return f.isFile() && f.length() > 0;
    }

    /** Tous les fichiers de sonde sont-ils disponibles (assets OU disque) ? */
    private boolean isModelAvailableInternal(String[] relPaths) {
        for (String p : relPaths) {
            if (!assetExists(p) && !diskFileExists(p)) return false;
        }
        return true;
    }

    /**
     * MODE-953 — résout un fichier de modèle vers un CHEMIN FILESYSTEM :
     *  1. version TÉLÉCHARGÉE prioritaire (filesDir/voice-models/<path> —
     *     un pack installé par l'utilisateur prime sur l'asset du build,
     *     ce qui permet de mettre à jour un modèle sans republier l'APK) ;
     *  2. asset embarqué copié vers le cache (comportement historique,
     *     streaming 256 Ko) ;
     *  3. absent des deux → IOException "PACK_MISSING: ..." — le build
     *     allégé sans le pack annonce l'action utilisateur.
     */
    private String resolveModelFile(String path) throws java.io.IOException {
        if (getContext() == null) {
            throw new java.io.IOException("PACK_MISSING: contexte Android indisponible pour "
                + path);
        }
        // AUDIT-005 : `path` (modelPath du bridge + nom de fichier) est
        // contenu sous filesDir/voice-models — un modelPath avec .. est
        // refusé au lieu de lire hors du répertoire des packs.
        PluginGuards.containedFile(
            new java.io.File(getContext().getFilesDir(), DISK_MODELS_DIR), path);
        java.io.File disk = new java.io.File(getContext().getFilesDir(),
            DISK_MODELS_DIR + java.io.File.separator + path);
        if (disk.isFile() && disk.length() > 0) {
            return PluginGuards.requirePrivatePath(disk.getAbsolutePath(), getContext());
        }
        try {
            return loadAssetFile(path);
        } catch (java.io.IOException e) {
            throw new java.io.IOException("PACK_MISSING: " + path
                + " absent des assets ET du disque — installez le pack vocal dans "
                + "Réglages → Voix & Langue (build allégé) ou reconstruisez l'APK "
                + "complet via scripts/fetch-android-deps.sh");
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
            releaseBaouleEngineLocked();
        }
        engineLanguage = null;
    }
}
