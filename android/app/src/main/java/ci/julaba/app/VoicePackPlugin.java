package ci.julaba.app;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Private-storage manager for versioned TTS voice packs.
 *
 * The plugin deliberately does not execute arbitrary files from the manifest.
 * Only the allowlisted model/runtime artifacts are downloaded, hashed and activated.
 */
@CapacitorPlugin(name = "VoicePack")
public class VoicePackPlugin extends Plugin {
    private static final String TAG = "VoicePack";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile String activeOperationId = null;
    private volatile OfflineTts activeTts = null;
    private volatile AudioTrack activeAudioTrack = null;

    private File packsRoot() {
        File root = new File(getContext().getFilesDir(), "voice-packs");
        if (!root.exists()) root.mkdirs();
        return root;
    }

    private File packDir(String packId, String version) {
        return new File(new File(packsRoot(), safeSegment(packId)), safeSegment(version));
    }

    private String safeSegment(String value) {
        if (value == null || !value.matches("[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("VOICE_PACK_INVALID_PATH");
        }
        return value;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("native", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getInstalledPacks(PluginCall call) {
        JSObject result = new JSObject();
        com.getcapacitor.JSArray packs = new com.getcapacitor.JSArray();
        File[] ids = packsRoot().listFiles();
        if (ids != null) {
            for (File id : ids) {
                if (!id.isDirectory()) continue;
                File[] versions = id.listFiles();
                if (versions == null) continue;
                for (File version : versions) {
                    File marker = new File(version, ".active");
                    if (!version.isDirectory() || !marker.isFile()
                            || !new File(version, "model.onnx").isFile()
                            || !new File(version, "tokens.txt").isFile()
                            || !new File(version, "espeak-ng-data").isDirectory()) continue;
                    JSObject item = new JSObject();
                    item.put("packId", id.getName());
                    item.put("version", version.getName());
                    item.put("ready", true);
                    item.put("path", new File(version, "model.onnx").getAbsolutePath());
                    packs.put(item);
                }
            }
        }
        result.put("packs", packs);
        call.resolve(result);
    }

    @PluginMethod
    public void getStorageInfo(PluginCall call) {
        long required = call.getLong("requiredBytes", 0L);
        long available = getContext().getFilesDir().getUsableSpace();
        JSObject result = new JSObject();
        result.put("availableBytes", available);
        result.put("enough", available >= required);
        call.resolve(result);
    }

    @PluginMethod
    public void installPack(PluginCall call) {
        String packId = call.getString("packId", "");
        String version = call.getString("version", "");
        String modelUrl = call.getString("modelUrl", "");
        String lexiconUrl = call.getString("lexiconUrl", "");
        String rulesUrl = call.getString("pronunciationRulesUrl", "");
        String tokensUrl = call.getString("tokensUrl", "");
        String espeakDataUrl = call.getString("espeakDataUrl", "");
        String modelSha = call.getString("modelSha256", "").toLowerCase(Locale.ROOT);
        String lexiconSha = call.getString("lexiconSha256", "").toLowerCase(Locale.ROOT);
        String rulesSha = call.getString("pronunciationRulesSha256", "").toLowerCase(Locale.ROOT);
        String tokensSha = call.getString("tokensSha256", "").toLowerCase(Locale.ROOT);
        String espeakDataSha = call.getString("espeakDataSha256", "").toLowerCase(Locale.ROOT);
        long modelBytes = call.getLong("modelBytes", 0L);
        long tokensBytes = call.getLong("tokensBytes", 0L);
        long espeakDataBytes = call.getLong("espeakDataBytes", 0L);
        long requiredBytes = call.getLong("requiredBytes", modelBytes);

        try {
            safeSegment(packId);
            safeSegment(version);
            validateUrl(modelUrl);
            validateUrl(lexiconUrl);
            validateUrl(rulesUrl);
            validateUrl(tokensUrl);
            validateUrl(espeakDataUrl);
            validateSha(modelSha);
            validateSha(lexiconSha);
            validateSha(rulesSha);
            validateSha(tokensSha);
            validateSha(espeakDataSha);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "VOICE_PACK_INVALID_MANIFEST" : error.getMessage());
            return;
        }

        long available = getContext().getFilesDir().getUsableSpace();
        if (available < requiredBytes) {
            call.reject("VOICE_PACK_INSUFFICIENT_STORAGE");
            return;
        }

        final String operationId = UUID.randomUUID().toString();
        final File destination = packDir(packId, version);
        final File temporary = new File(packsRoot(), "." + packId + "-" + version + "-" + operationId);
        cancelled = false;
        activeOperationId = operationId;
        JSObject accepted = new JSObject();
        accepted.put("operationId", operationId);
        call.resolve(accepted);

        executor.execute(() -> {
            try {
                if (!temporary.mkdirs()) throw new IllegalStateException("VOICE_PACK_INSTALL_DIRECTORY_FAILED");
                notifyState(operationId, "downloading", null);
                downloadArtifact(modelUrl, new File(temporary, "model.onnx"), modelSha, modelBytes, operationId);
                downloadArtifact(tokensUrl, new File(temporary, "tokens.txt"), tokensSha, tokensBytes, operationId);
                downloadArtifact(lexiconUrl, new File(temporary, "lexicon.json"), lexiconSha, 0L, operationId);
                downloadArtifact(rulesUrl, new File(temporary, "pronunciation-rules.json"), rulesSha, 0L, operationId);
                File dataArchive = new File(temporary, "espeak-ng-data.zip");
                downloadArtifact(espeakDataUrl, dataArchive, espeakDataSha, espeakDataBytes, operationId);
                unzipDataDirectory(dataArchive, new File(temporary, "espeak-ng-data"));
                if (!dataArchive.delete()) throw new IllegalStateException("VOICE_PACK_DATA_CLEANUP_FAILED");
                notifyState(operationId, "installing", null);
                writeText(new File(temporary, "install.json"), "{\"packId\":\"" + packId + "\",\"version\":\"" + version + "\",\"modelSha256Verified\":true,\"tokensSha256Verified\":true,\"espeakDataSha256Verified\":true,\"offlineReady\":true}");
                if (cancelled) throw new IllegalStateException("VOICE_PACK_DOWNLOAD_CANCELLED");
                deleteRecursively(destination);
                if (!temporary.renameTo(destination)) throw new IllegalStateException("VOICE_PACK_INSTALL_FINALIZE_FAILED");
                writeText(new File(destination, ".active"), operationId);
                notifyState(operationId, "ready", null);
                notifyProgress(operationId, 100, 100);
            } catch (Exception error) {
                deleteRecursively(temporary);
                String message = error.getMessage() == null ? "VOICE_PACK_INSTALL_FAILED" : error.getMessage();
                notifyState(operationId, message.contains("CANCELLED") ? "cancelled" : "error", message);
            } finally {
                activeOperationId = null;
            }
        });
    }

    private void downloadArtifact(String source, File destination, String expectedSha, long expectedBytes, String operationId) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        try {
            connection.connect();
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("VOICE_PACK_SOURCE_HTTP_" + status);
            long total = connection.getContentLengthLong() > 0 ? connection.getContentLengthLong() : expectedBytes;
            long downloaded = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(destination, false)) {
                byte[] buffer = new byte[1024 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (cancelled) throw new IllegalStateException("VOICE_PACK_DOWNLOAD_CANCELLED");
                    output.write(buffer, 0, read);
                    downloaded += read;
                    notifyProgress(operationId, downloaded, total);
                }
            }
            if (expectedBytes > 0 && destination.length() != expectedBytes) throw new IllegalStateException("VOICE_PACK_SIZE_MISMATCH");
            if (!sha256(destination).equals(expectedSha)) throw new IllegalStateException("VOICE_PACK_CHECKSUM_MISMATCH");
        } finally {
            connection.disconnect();
        }
    }

    @PluginMethod
    public void cancelInstall(PluginCall call) {
        String operationId = call.getString("operationId", "");
        if (operationId.isEmpty() || operationId.equals(activeOperationId)) cancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void activatePack(PluginCall call) {
        String packId = call.getString("packId", "");
        String version = call.getString("version", "");
        boolean accepted = call.getBoolean("licenseAccepted", false);
        if (!accepted) {
            call.reject("VOICE_PACK_LICENSE_NOT_ACCEPTED");
            return;
        }
        try {
            File directory = packDir(packId, version);
            File model = new File(directory, "model.onnx");
            if (!new File(directory, ".active").isFile() || !model.isFile()) throw new IllegalStateException("VOICE_PACK_NOT_READY");
            JSObject result = new JSObject();
            result.put("path", model.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "VOICE_PACK_NOT_READY" : error.getMessage());
        }
    }

    /** Generate and play speech entirely on-device through Sherpa-ONNX VITS/Piper. */
    @PluginMethod
    public void synthesize(PluginCall call) {
        String packId = call.getString("packId", "");
        String version = call.getString("version", "");
        String text = call.getString("text", "");
        double requestedSpeed = call.getDouble("speed", 1.0);
        if (text.trim().isEmpty()) { call.reject("VOICE_PACK_EMPTY_TEXT"); return; }
        if (text.length() > 500) { call.reject("VOICE_PACK_TEXT_TOO_LONG"); return; }
        final File directory;
        try { directory = packDir(packId, version); } catch (Exception error) { call.reject("VOICE_PACK_INVALID_PATH"); return; }
        final File model = new File(directory, "model.onnx");
        final File tokens = new File(directory, "tokens.txt");
        final File dataDir = new File(directory, "espeak-ng-data");
        if (!new File(directory, ".active").isFile() || !model.isFile() || !tokens.isFile() || !dataDir.isDirectory()) {
            call.reject("VOICE_PACK_TTS_RUNTIME_NOT_READY");
            return;
        }
        call.resolve();
        executor.execute(() -> {
            OfflineTts tts = null;
            AudioTrack track = null;
            try {
                OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
                vits.setModel(model.getAbsolutePath());
                vits.setTokens(tokens.getAbsolutePath());
                vits.setDataDir(dataDir.getAbsolutePath());
                OfflineTtsModelConfig modelConfig = new OfflineTtsModelConfig();
                modelConfig.setVits(vits);
                modelConfig.setNumThreads(1);
                modelConfig.setDebug(false);
                modelConfig.setProvider("cpu");
                OfflineTtsConfig ttsConfig = new OfflineTtsConfig();
                ttsConfig.setModel(modelConfig);
                tts = new OfflineTts(null, ttsConfig);
                activeTts = tts;
                float speed = (float) Math.max(0.7, Math.min(1.3, requestedSpeed));
                GeneratedAudio audio = tts.generate(text, 0, speed);
                float[] samples = audio.getSamples();
                int sampleRate = audio.getSampleRate();
                int minBuffer = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
                track = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        .setAudioFormat(new AudioFormat.Builder().setSampleRate(sampleRate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                        .setBufferSizeInBytes(Math.max(minBuffer, 4096)).setTransferMode(AudioTrack.MODE_STREAM).build();
                activeAudioTrack = track;
                short[] pcm = new short[Math.min(samples.length, 4096)];
                track.play();
                for (int offset = 0; offset < samples.length && track.getPlayState() != AudioTrack.PLAYSTATE_STOPPED; offset += pcm.length) {
                    int length = Math.min(pcm.length, samples.length - offset);
                    for (int i = 0; i < length; i++) pcm[i] = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, Math.round(samples[offset + i] * 32767f)));
                    track.write(pcm, 0, length);
                }
                track.stop();
            } catch (Throwable error) {
                notifyState("tts", "error", "VOICE_PACK_TTS_SYNTHESIS_FAILED");
            } finally {
                if (track != null) track.release();
                if (tts != null) tts.release();
                activeAudioTrack = null;
                activeTts = null;
            }
        });
    }

    @PluginMethod
    public void deletePack(PluginCall call) {
        try {
            deleteRecursively(packDir(call.getString("packId", ""), call.getString("version", "")));
            call.resolve();
        } catch (Exception error) {
            call.reject("VOICE_PACK_DELETE_FAILED");
        }
    }

    @PluginMethod
    public void releaseEngine(PluginCall call) {
        AudioTrack track = activeAudioTrack;
        if (track != null) {
            try { track.stop(); } catch (Exception ignored) {}
            track.release();
            activeAudioTrack = null;
        }
        OfflineTts tts = activeTts;
        if (tts != null) {
            tts.release();
            activeTts = null;
        }
        call.resolve();
    }

    private void unzipDataDirectory(File archive, File destination) throws Exception {
        if (!destination.mkdirs()) throw new IllegalStateException("VOICE_PACK_DATA_DIRECTORY_FAILED");
        String root = destination.getCanonicalPath() + File.separator;
        try (ZipInputStream input = new ZipInputStream(new FileInputStream(archive))) {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = input.getNextEntry()) != null) {
                String name = entry.getName().replace('\\', '/');
                File output = new File(destination, name);
                if (!output.getCanonicalPath().startsWith(root)) throw new IllegalStateException("VOICE_PACK_ARCHIVE_PATH_INVALID");
                if (entry.isDirectory()) {
                    if (!output.mkdirs() && !output.isDirectory()) throw new IllegalStateException("VOICE_PACK_DATA_DIRECTORY_FAILED");
                } else {
                    File parent = output.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (FileOutputStream stream = new FileOutputStream(output)) {
                        int read;
                        while ((read = input.read(buffer)) != -1) stream.write(buffer, 0, read);
                    }
                }
            }
        }
    }

    private void validateUrl(String value) {
        if (value == null || !(value.startsWith("https://") || value.startsWith("http://localhost") || value.startsWith("http://10.") || value.startsWith("http://192.168."))) throw new IllegalArgumentException("VOICE_PACK_URL_NOT_ALLOWED");
    }

    private void validateSha(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("VOICE_PACK_INVALID_CHECKSUM");
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
    }

    private void writeText(File file, String text) throws Exception {
        try (FileOutputStream output = new FileOutputStream(file, false)) { output.write(text.getBytes("UTF-8")); }
    }

    private void notifyProgress(String operationId, long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("operationId", operationId);
        data.put("downloadedBytes", downloaded);
        data.put("totalBytes", total);
        data.put("percent", total > 0 ? Math.min(100, Math.round(downloaded * 100f / total)) : 0);
        notifyListeners("installProgress", data);
    }

    private void notifyState(String operationId, String state, String message) {
        JSObject data = new JSObject();
        data.put("operationId", operationId);
        data.put("state", state);
        if (message != null) data.put("message", message);
        notifyListeners("installState", data);
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }
}
