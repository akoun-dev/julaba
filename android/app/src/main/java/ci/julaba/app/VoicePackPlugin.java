package ci.julaba.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
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
 * Only the three allowlisted artifacts are downloaded, hashed and activated.
 */
@CapacitorPlugin(name = "VoicePack")
public class VoicePackPlugin extends Plugin {
    private static final String TAG = "VoicePack";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile String activeOperationId = null;

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
                    if (!version.isDirectory() || !marker.isFile()) continue;
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
        String modelSha = call.getString("modelSha256", "").toLowerCase(Locale.ROOT);
        String lexiconSha = call.getString("lexiconSha256", "").toLowerCase(Locale.ROOT);
        String rulesSha = call.getString("pronunciationRulesSha256", "").toLowerCase(Locale.ROOT);
        long modelBytes = call.getLong("modelBytes", 0L);
        long requiredBytes = call.getLong("requiredBytes", modelBytes);

        try {
            safeSegment(packId);
            safeSegment(version);
            validateUrl(modelUrl);
            validateUrl(lexiconUrl);
            validateUrl(rulesUrl);
            validateSha(modelSha);
            validateSha(lexiconSha);
            validateSha(rulesSha);
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
                downloadArtifact(lexiconUrl, new File(temporary, "lexicon.json"), lexiconSha, 0L, operationId);
                downloadArtifact(rulesUrl, new File(temporary, "pronunciation-rules.json"), rulesSha, 0L, operationId);
                notifyState(operationId, "installing", null);
                writeText(new File(temporary, "install.json"), "{\"packId\":\"" + packId + "\",\"version\":\"" + version + "\",\"modelSha256Verified\":true,\"lexiconSha256Verified\":true,\"offlineReady\":true}");
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
        call.resolve();
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
