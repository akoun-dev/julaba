import Foundation
import Capacitor
import AVFoundation
import SherpaOnnx

/**
 * Fully offline speech-to-text via sherpa-onnx for the Jùlaba spec.
 *
 * Uses the official sherpa-onnx SPM package which provides OnlineRecognizer
 * and OnlineStream in Swift.
 *
 * Required in ios/App/CapApp-SPM/Package.swift:
 *   .package(url: "https://github.com/k2-fsa/sherpa-onnx.git", from: "1.13.2")
 *
 * Model: sherpa-onnx-streaming-zipformer-fr-2023-04-14 (int8 quantized)
 * Bundled in: ios/App/App/Models/
 */
@objc(SherpaSttPlugin)
public class SherpaSttPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SherpaSttPlugin"
    public let jsName = "SherpaStt"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "initModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecognition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecognition", returnType: CAPPluginReturnPromise)
    ]

    private var modelLoaded = false
    private var isRecording = false
    private var audioEngine: AVAudioEngine?
    private var recognizer: OnlineRecognizer?
    private var stream: OnlineStream?

    @objc func isAvailable(_ call: CAPPluginCall) {
        var available = false
        #if canImport(sherpa_onnx)
            available = true
        #endif

        call.resolve([
            "available": available,
            "modelLoaded": modelLoaded
        ])
    }

    @objc func initModel(_ call: CAPPluginCall) {
        guard let modelPath = call.getString("modelPath") else {
            call.reject("modelPath is required")
            return
        }

        // Resolve the model path from the app bundle
        let bundlePath: String
        if let resourcePath = Bundle.main.path(forResource: modelPath, ofType: nil) {
            bundlePath = resourcePath
        } else if let resourceURL = Bundle.main.url(forResource: modelPath, withExtension: nil) {
            bundlePath = resourceURL.path
        } else {
            let documentsPath = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)[0]
            let fullPath = (documentsPath as NSString).appendingPathComponent(modelPath)
            if FileManager.default.fileExists(atPath: fullPath) {
                bundlePath = fullPath
            } else {
                call.reject("Model not found at path: \(modelPath)")
                return
            }
        }

        // Verify model files exist
        let encoderPath = (bundlePath as NSString).appendingPathComponent("encoder-epoch-29-avg-9-with-averaged-model.int8.onnx")
        let decoderPath = (bundlePath as NSString).appendingPathComponent("decoder-epoch-29-avg-9-with-averaged-model.int8.onnx")
        let joinerPath = (bundlePath as NSString).appendingPathComponent("joiner-epoch-29-avg-9-with-averaged-model.int8.onnx")
        let tokensPath = (bundlePath as NSString).appendingPathComponent("tokens.txt")

        guard FileManager.default.fileExists(atPath: encoderPath),
              FileManager.default.fileExists(atPath: decoderPath),
              FileManager.default.fileExists(atPath: joinerPath),
              FileManager.default.fileExists(atPath: tokensPath) else {
            call.reject("Model files not found at: \(bundlePath)")
            return
        }

        // Build OnlineRecognizerConfig
        let transducerConfig = OnlineTransducerModelConfig(
            encoder: encoderPath,
            decoder: decoderPath,
            joiner: joinerPath
        )

        let modelConfig = OnlineModelConfig(
            transducer: transducerConfig,
            tokens: tokensPath,
            numThreads: 2,
            debug: false
        )

        let featConfig = FeatConfig(
            sampleRate: Int32(16000),
            featureDim: Int32(80)
        )

        let config = OnlineRecognizerConfig(
            featConfig: featConfig,
            modelConfig: modelConfig,
            enableEndpoint: true,
            decodingMethod: "greedy_search"
        )

        recognizer = OnlineRecognizer(config)
        stream = recognizer?.createStream()

        modelLoaded = true
        call.resolve([
            "success": true
        ])
    }

    @objc func startRecognition(_ call: CAPPluginCall) {
        guard modelLoaded, let recognizer = recognizer else {
            call.reject("Model not initialized. Call initModel first.")
            return
        }

        guard !isRecording else {
            call.reject("Already recording.")
            return
        }

        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            guard let self = self else { return }

            guard granted else {
                call.reject("Audio permission denied.")
                return
            }

            DispatchQueue.main.async {
                self.startAudioCapture(call)
            }
        }
    }

    private func startAudioCapture(_ call: CAPPluginCall) {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Failed to set up audio session: \(error.localizedDescription)")
            return
        }

        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else {
            call.reject("Failed to create audio engine")
            return
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.processAudioBuffer(buffer)
        }

        do {
            // Reset stream for new utterance
            recognizer?.reset(stream)
            try audioEngine.start()
            isRecording = true
            call.resolve(["started": true])
        } catch {
            call.reject("Failed to start audio engine: \(error.localizedDescription)")
        }
    }

    private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        guard isRecording, let recognizer = recognizer, let stream = stream else { return }

        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frameLength = Int(buffer.frameLength)

        // Convert to 16kHz mono if needed (the tap gives us whatever format the mic provides)
        // Feed directly to sherpa-onnx — it handles resampling internally
        let samples = Array(UnsafeBufferPointer(start: channelData, count: frameLength))

        stream.acceptWaveform(samples, sampleRate: 16000)

        // Decode all available frames
        while recognizer.isReady(stream) {
            recognizer.decode(stream)
        }

        // Get partial result
        let result = recognizer.getResult(stream)
        if let text = result.text, !text.isEmpty {
            let data: [String: Any] = [
                "transcript": text,
                "isFinal": false
            ]
            notifyListeners("sttResult", data: data)
        }

        // Check for endpoint
        if recognizer.isEndpoint(stream) {
            let finalResult = recognizer.getResult(stream)
            let data: [String: Any] = [
                "transcript": finalResult.text ?? "",
                "isFinal": true
            ]
            notifyListeners("sttResult", data: data)
            recognizer.reset(stream)
        }
    }

    @objc func stopRecognition(_ call: CAPPluginCall) {
        isRecording = false

        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil

        try? AVAudioSession.sharedInstance().setActive(false)

        // Send final empty result
        let data: [String: Any] = [
            "transcript": "",
            "isFinal": true
        ]
        notifyListeners("sttResult", data: data)

        call.resolve(["stopped": true])
    }
}
