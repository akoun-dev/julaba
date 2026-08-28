package ci.julaba.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Scaffold for on-device, fully offline speech-to-text via sherpa-onnx, as
 * required by the Jùlaba spec ("Voice-first", 100% offline STT). There is no
 * official Capacitor plugin for sherpa-onnx, so this is a local plugin
 * (registered directly in MainActivity, not published to npm) rather than a
 * community package.
 *
 * NOT FUNCTIONAL YET. Every method below is a stub — wiring the actual
 * sherpa-onnx JNI bindings requires:
 *   1. Adding the sherpa-onnx Android AAR (or building it from source) as a
 *      dependency in android/app/build.gradle.
 *   2. Bundling an offline STT model (e.g. a small streaming Zipformer or
 *      Paraformer model) as an Android asset — these run tens to hundreds of
 *      MB and must be chosen deliberately for the target devices (entry-level
 *      phones common in Côte d'Ivoire).
 *   3. Implementing the actual OnlineRecognizer session lifecycle here.
 *
 * Until that's done, the app's voice input keeps using the Web Speech API
 * (src/lib/voice/stt.ts), which works inside the WebView but is NOT offline.
 * See CAPACITOR.md and src/lib/voice/sherpa-stt.ts for the TypeScript side
 * of this bridge.
 */
@CapacitorPlugin(name = "SherpaStt")
public class SherpaSttPlugin extends Plugin {

    private boolean modelLoaded = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        // Always false until the native implementation above is completed.
        result.put("available", false);
        result.put("modelLoaded", modelLoaded);
        call.resolve(result);
    }

    @PluginMethod
    public void initModel(PluginCall call) {
        // String modelPath = call.getString("modelPath");
        call.reject("SherpaStt.initModel is not implemented yet — see the class doc for what's needed.");
    }

    @PluginMethod
    public void startRecognition(PluginCall call) {
        call.reject("SherpaStt.startRecognition is not implemented yet.");
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        call.reject("SherpaStt.stopRecognition is not implemented yet.");
    }
}
