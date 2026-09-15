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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Downloads the versioned LiteRT-LM artifact into private app storage. */
@CapacitorPlugin(name = "LiteRtModel")
public class LiteRtModelPlugin extends Plugin {
    private static final String TAG = "LiteRtModel";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private File tempFile;

    private File modelDirectory() {
        File directory = new File(getContext().getFilesDir(), "models/gemma");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private File modelFile(String version) {
        return new File(modelDirectory(), version + ".litertlm");
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("modelReady", modelFile("Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096").isFile());
        call.resolve(result);
    }

    @PluginMethod
    public void getLocalInfo(PluginCall call) {
        File file = modelFile(call.getString("version", "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096"));
        JSObject result = new JSObject();
        result.put("bytes", file.isFile() ? file.length() : 0);
        result.put("expectedBytes", call.getInt("expectedBytes", 0));
        result.put("version", call.getString("version", "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096"));
        call.resolve(result);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String urlString = call.getString("url", "");
        String version = call.getString("version", "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096");
        String expectedSha = call.getString("sha256", "").toLowerCase(Locale.ROOT);
        int expectedBytes = call.getInt("expectedBytes", 0);

        if (urlString.isEmpty() || expectedSha.isEmpty()) {
            call.reject("[CONFIGURATION_MISSING] Model URL and SHA-256 are required");
            return;
        }
        File destination = modelFile(version);
        if (destination.isFile() && destination.length() == expectedBytes) {
            notifyState("ready", null, null);
            call.resolve();
            return;
        }

        cancelled = false;
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(urlString);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(60_000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                    throw new IllegalStateException("[SOURCE_UNAVAILABLE] HTTP " + connection.getResponseCode());
                }

                notifyState("downloading", null, null);
                tempFile = new File(modelDirectory(), version + ".download");
                long total = connection.getContentLengthLong() > 0 ? connection.getContentLengthLong() : expectedBytes;
                long downloaded = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(tempFile, false)) {
                    byte[] buffer = new byte[1024 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (cancelled) throw new IllegalStateException("[DOWNLOAD_CANCELLED]");
                        output.write(buffer, 0, read);
                        downloaded += read;
                        notifyProgress(downloaded, total);
                    }
                }

                notifyState("verifying", null, null);
                if (expectedBytes > 0 && tempFile.length() != expectedBytes) {
                    throw new IllegalStateException("[CORRUPTED_FILE] Unexpected model size");
                }
                if (!sha256(tempFile).equals(expectedSha)) {
                    throw new IllegalStateException("[CHECKSUM_MISMATCH] SHA-256 mismatch");
                }
                if (destination.exists() && !destination.delete()) {
                    throw new IllegalStateException("[PERMISSION_DENIED] Cannot replace model");
                }
                if (!tempFile.renameTo(destination)) {
                    throw new IllegalStateException("[CORRUPTED_FILE] Cannot finalize model");
                }
                tempFile = null;
                notifyState("ready", null, null);
                call.resolve();
            } catch (Exception error) {
                if (tempFile != null && tempFile.exists() && error.getMessage() != null && error.getMessage().contains("DOWNLOAD_CANCELLED")) tempFile.delete();
                String message = error.getMessage() == null ? "[UNKNOWN] Download failed" : error.getMessage();
                notifyState("error", message, message);
                call.reject(message);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        notifyState("cancelled", "[DOWNLOAD_CANCELLED]", "Téléchargement annulé.");
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        File directory = modelDirectory();
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) file.delete();
        call.resolve();
    }

    @PluginMethod
    public void generate(PluginCall call) {
        // The LiteRT-LM runtime is supplied by the native distribution. Keep
        // the bridge contract explicit until the runtime dependency is added
        // to the Android target; never fall back to a network inference.
        call.reject("[MODEL_LOAD_FAILED] LiteRT-LM runtime unavailable");
    }

    private void notifyProgress(long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("downloadedBytes", downloaded);
        data.put("totalBytes", total);
        data.put("percent", total > 0 ? Math.min(100, Math.round(downloaded * 100f / total)) : 0);
        notifyListeners("downloadProgress", data);
    }

    private void notifyState(String state, String errorCode, String message) {
        JSObject data = new JSObject();
        data.put("state", state);
        if (errorCode != null) data.put("errorCode", errorCode);
        if (message != null) data.put("message", message);
        notifyListeners("downloadState", data);
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
}
