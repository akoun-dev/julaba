package ci.julaba.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
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

/**
 * Fully offline speech-to-text via sherpa-onnx for the Jùlaba spec.
 *
 * Uses the official sherpa-onnx Android AAR (com.k2fsa.sherpa.onnx) which
 * bundles native libs for all ABIs and exposes OnlineRecognizer / OnlineStream
 * in Java.
 *
 * Required dependency in android/app/build.gradle:
 *   implementation 'com.k2fsa.sherpa.onnx:sherpa-onnx-android:1.13.2'
 *
 * Model: sherpa-onnx-streaming-zipformer-fr-2023-04-14 (int8 quantized)
 * Bundled in: android/app/src/main/assets/models/
 */
@CapacitorPlugin(
    name = "SherpaStt",
    permissions = {
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "audio")
    }
)
public class SherpaSttPlugin extends Plugin {

    private static final String TAG = "SherpaStt";
    // Packs vocaux installés par VoicePackPlugin — MÊME racine que
    // VoiceServicePlugin (filesDir/voice-models/<arborescence assets>) : le
    // mot d'appel doit retrouver un modèle téléchargé in-app, pas seulement
    // un modèle embarqué à la construction.
    private static final String DISK_MODELS_DIR = "voice-models";
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;

    private boolean modelLoaded = false;
    private volatile boolean isRecording = false;
    private AudioRecord audioRecord = null;
    private Thread recognitionThread = null;
    private OnlineRecognizer recognizer = null;
    private OnlineStream stream = null;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        // The sherpa-onnx AAR is available if this class loaded successfully
        result.put("available", true);
        result.put("modelLoaded", modelLoaded);
        call.resolve(result);
    }

    @PluginMethod
    public void initModel(PluginCall call) {
        String modelPath = call.getString("modelPath", "models/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8");

        final String encoderPath;
        final String decoderPath;
        final String joinerPath;
        final String tokensPath;
        try {
            // Garde stricte (crash corrigé) : ne JAMAIS construire un
            // OnlineRecognizer sur des fichiers absents. sherpa-onnx natif
            // appelle exit() sur un modèle illisible — l'app entière se
            // tuait (« l'APK sort automatiquement » au premier essai vocal
            // sur les builds lite sans modèle embarqué). Chaque fichier est
            // résolu AVANT (pack disque puis assets) sinon rejet propre.
            encoderPath = resolveModelFile(modelPath + "/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
            decoderPath = resolveModelFile(modelPath + "/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
            joinerPath = resolveModelFile(modelPath + "/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx");
            tokensPath = resolveModelFile(modelPath + "/tokens.txt");
        } catch (java.io.IOException e) {
            Log.w(TAG, "Modèle STT indisponible : " + e.getMessage());
            call.reject(e.getMessage());
            return;
        } catch (IllegalArgumentException guardError) {
            call.reject("PLUGIN_INVALID_PATH: " + guardError.getMessage());
            return;
        }

        try {
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
            config.setEnableEndpoint(true);
            config.setDecodingMethod("greedy_search");

            // resolveModelFile retourne toujours des chemins absolus (cache
            // ou pack disque) : assetManager = null obligatoire — sherpa-onnx
            // appelle exit(255) sur un chemin absolu avec assetManager non
            // null.
            boolean cached = encoderPath.startsWith("/");
            recognizer = new OnlineRecognizer(cached ? null : getContext().getAssets(), config);
            stream = recognizer.createStream("");

            modelLoaded = true;

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Throwable t) {
            Log.e(TAG, "Failed to init model", t);
            call.reject("Failed to initialize model: " + t.getMessage());
        }
    }

    @PluginMethod
    public void startRecognition(PluginCall call) {
        if (!modelLoaded || recognizer == null) {
            call.reject("Model not initialized. Call initModel first.");
            return;
        }

        if (isRecording) {
            call.reject("Already recording.");
            return;
        }

        if (getActivity() != null &&
            ActivityCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED) {
            saveCall(call);
            requestPermissionForAlias("audio", call, "audioPermissionCallback");
            return;
        }

        startAudioCapture(call);
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        if (call == null) return;

        if (ActivityCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED) {
            startAudioCapture(call);
        } else {
            call.reject("Audio permission denied.");
        }
    }

    private void startAudioCapture(PluginCall call) {
        try {
            if (getActivity() == null) {
                call.reject("MIC_UNAVAILABLE: activity unavailable");
                return;
            }

            if (ActivityCompat.checkSelfPermission(getActivity(), Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED) {
                call.reject("PERMISSION_DENIED: microphone permission not granted");
                return;
            }

            AudioManager audioManager = (AudioManager) getActivity().getSystemService(android.content.Context.AUDIO_SERVICE);
            if (audioManager != null && audioManager.isMicrophoneMute()) {
                call.reject("MIC_UNAVAILABLE: system microphone is muted");
                return;
            }

            int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
                bufferSize = SAMPLE_RATE * 2;
            }

            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize * 2
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                try { audioRecord.release(); } catch (Exception ignored) {}
                audioRecord = null;
                call.reject("MIC_UNAVAILABLE: AudioRecord could not be initialized");
                return;
            }

            audioRecord.startRecording();

            if (audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                try { audioRecord.release(); } catch (Exception ignored) {}
                audioRecord = null;
                call.reject("MIC_UNAVAILABLE: AudioRecord did not enter recording state");
                return;
            }

            isRecording = true;

            // Reset stream for a new utterance
            if (stream != null) {
                recognizer.reset(stream);
            }

            recognitionThread = new Thread(this::recognitionLoop);
            recognitionThread.start();

            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start audio capture", e);
            isRecording = false;
            if (audioRecord != null) {
                try { audioRecord.release(); } catch (Exception ignored) {}
                audioRecord = null;
            }
            call.reject("MIC_UNAVAILABLE: failed to start audio capture: " + e.getMessage());
        }
    }

    private void recognitionLoop() {
        if (recognizer == null || stream == null) {
            Log.e(TAG, "Recognition loop started without initialized model");
            isRecording = false;
            return;
        }

        try {
            int chunkSize = SAMPLE_RATE / 10; // 100 ms chunks
            short[] audioBuffer = new short[chunkSize];

            while (isRecording) {
                int read = audioRecord.read(audioBuffer, 0, chunkSize);
                if (read <= 0) continue;

                // Convert int16 PCM to float32 normalised [-1, 1]
                float[] floatSamples = new float[read];
                for (int i = 0; i < read; i++) {
                    floatSamples[i] = audioBuffer[i] / 32768.0f;
                }

                // Feed audio to sherpa-onnx stream
                stream.acceptWaveform(floatSamples, SAMPLE_RATE);

                // Decode all available frames
                while (recognizer.isReady(stream)) {
                    recognizer.decode(stream);
                }

                // Get partial result
                String partialText = recognizer.getResult(stream).getText();
                if (partialText != null && !partialText.isEmpty()) {
                    JSObject data = new JSObject();
                    data.put("transcript", partialText);
                    data.put("isFinal", false);
                    notifyListeners("sttResult", data);
                }

                // Check for endpoint (end of utterance)
                if (recognizer.isEndpoint(stream)) {
                    // Get final result
                    String finalText = recognizer.getResult(stream).getText();
                    JSObject data = new JSObject();
                    data.put("transcript", finalText != null ? finalText : "");
                    data.put("isFinal", true);
                    notifyListeners("sttResult", data);

                    // Reset for next utterance
                    recognizer.reset(stream);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Recognition loop error", e);
            JSObject data = new JSObject();
            data.put("transcript", "");
            data.put("isFinal", true);
            notifyListeners("sttResult", data);
        }
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        isRecording = false;

        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping AudioRecord", e);
            }
            audioRecord = null;
        }

        if (recognitionThread != null) {
            try {
                recognitionThread.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            recognitionThread = null;
        }

        // Send final empty result to signal end
        JSObject data = new JSObject();
        data.put("transcript", "");
        data.put("isFinal", true);
        notifyListeners("sttResult", data);

        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    /**
     * Résout un fichier de modèle STRICTEMENT : pack installé sur disque
     * (filesDir/voice-models — packs téléchargés in-app) d'abord, puis
     * assets du build (variante full, copiés vers le cache). Lève
     * IOException (message PACK_MISSING formulé pour l'UI) si le fichier
     * n'existe nulle part — jamais de chemin fantôme vers un recognizer.
     */
    private String resolveModelFile(String relPath) throws java.io.IOException {
        android.content.Context ctx = getContext();
        if (ctx == null) {
            throw new java.io.IOException("PACK_MISSING: contexte Android indisponible pour " + relPath);
        }
        // AUDIT-005 : `relPath` (modelPath du bridge + nom de fichier) reste
        // contenu dans les répertoires privés — .. et chemins absolus refusés.
        PluginGuards.containedFile(new java.io.File(ctx.getFilesDir(), DISK_MODELS_DIR), relPath);
        java.io.File disk = new java.io.File(ctx.getFilesDir(),
            DISK_MODELS_DIR + java.io.File.separator + relPath);
        if (disk.isFile() && disk.length() > 0) {
            return PluginGuards.requirePrivatePath(disk.getAbsolutePath(), ctx);
        }
        java.io.File cache = PluginGuards.containedFile(ctx.getCacheDir(), relPath);
        if (cache.isFile() && cache.length() > 0) {
            return cache.getAbsolutePath();
        }
        java.io.InputStream is = null;
        try {
            is = ctx.getAssets().open(relPath);
            java.io.File parent = cache.getParentFile();
            if (parent != null) parent.mkdirs();
            java.io.FileOutputStream fos = new java.io.FileOutputStream(cache);
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) { fos.write(buf, 0, n); }
            fos.close();
            return cache.getAbsolutePath();
        } catch (java.io.IOException e) {
            throw new java.io.IOException("PACK_MISSING: " + relPath
                + " absent des assets ET du disque — installez le pack vocal dans "
                + "Réglages → Voix & Langue, ou reconstruisez l'APK avec le modèle "
                + "embarqué (JULABA_BUNDLE_FR_STT=1 scripts/fetch-android-deps.sh)");
        } finally {
            if (is != null) {
                try { is.close(); } catch (Exception ignored) { }
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        isRecording = false;
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) { /* ignore */ }
            audioRecord = null;
        }
        if (stream != null) {
            try { stream.release(); } catch (Exception e) { /* ignore */ }
            stream = null;
        }
        if (recognizer != null) {
            try { recognizer.release(); } catch (Exception e) { /* ignore */ }
            recognizer = null;
        }
    }
}
