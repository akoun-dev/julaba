package ci.julaba.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
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
import com.k2fsa.sherpa.onnx.FeatConfig;

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

        try {
            String encoderPath = loadAssetFile(modelPath + "/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
            String decoderPath = loadAssetFile(modelPath + "/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx");
            String joinerPath = loadAssetFile(modelPath + "/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx");
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

            FeatConfig featConfig = new FeatConfig();
            featConfig.setSampleRate(SAMPLE_RATE);
            featConfig.setFeatureDim(80);

            OnlineRecognizerConfig config = new OnlineRecognizerConfig();
            config.setFeatConfig(featConfig);
            config.setModelConfig(modelConfig);
            config.setEnableEndpoint(true);
            config.setDecodingMethod("greedy_search");

            recognizer = new OnlineRecognizer(config);
            stream = recognizer.createStream();

            modelLoaded = true;

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to init model", e);
            call.reject("Failed to initialize model: " + e.getMessage());
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
            activity.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, 100);
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
                call.reject("Failed to initialize AudioRecord");
                return;
            }

            isRecording = true;
            audioRecord.startRecording();

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
            call.reject("Failed to start audio capture: " + e.getMessage());
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
            Log.w(TAG, "Could not load asset: " + path, e);
            return path;
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
