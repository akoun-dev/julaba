import Foundation
import Capacitor
import AVFoundation

/**
 * Fully offline speech-to-text via sherpa-onnx for the Jùlaba spec.
 *
 * This plugin uses sherpa-onnx Swift Package for on-device STT.
 * The model must be bundled as an app resource.
 *
 * Required in ios/App/CapApp-SPM/Package.swift:
 *   .package(url: "https://github.com/k2-fsa/sherpa-onnx.git", from: "1.10.34")
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
    private var recognitionRequest: Any? // SPS streaming recognizer
    private var recognitionTask: Any?

    @objc func isAvailable(_ call: CAPPluginCall) {
        // Check if sherpa-onnx framework is available
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
            // Try to find in Documents directory (for downloaded models)
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

        guard FileManager.default.fileExists(atPath: encoderPath),
              FileManager.default.fileExists(atPath: decoderPath),
              FileManager.default.fileExists(atPath: joinerPath) else {
            call.reject("Model files not found at: \(bundlePath)")
            return
        }

        // TODO: Initialize sherpa-onnx OnlineRecognizer with the model
        // This requires importing sherpa_onnx and creating:
        //   let config = OnlineRecognizerConfig(...)
        //   let recognizer = OnlineRecognizer(config)

        modelLoaded = true
        call.resolve([
            "success": true
        ])
    }

    @objc func startRecognition(_ call: CAPPluginCall) {
        guard modelLoaded else {
            call.reject("Model not initialized. Call initModel first.")
            return
        }

        guard !isRecording else {
            call.reject("Already recording.")
            return
        }

        // Request microphone permission
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
        let recordingFormatAV = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16000,
            channels: 1,
            interleaved: true
        )

        guard let recordingFormatAV = recordingFormatAV else {
            call.reject("Failed to create audio format")
            return
        }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.processAudioBuffer(buffer)
        }

        do {
            try audioEngine.start()
            isRecording = true
            call.resolve(["started": true])
        } catch {
            call.reject("Failed to start audio engine: \(error.localizedDescription)")
        }
    }

    private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        guard isRecording else { return }

        // Convert buffer to Int16 samples for sherpa-onnx
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frameLength = Int(buffer.frameLength)

        // Convert Float32 to Int16
        var samples = [Int16](repeating: 0, count: frameLength)
        for i in 0..<frameLength {
            let sample = channelData[i]
            samples[i] = Int16(max(-32768, min(32767, sample * 32767)))
        }

        // TODO: Feed samples to sherpa-onnx recognizer
        // This requires:
        //   recognizer.acceptWaveform(samples: samples, sampleRate: 16000)
        //   while recognizer.isReady() { recognizer.decode() }
        //   let text = recognizer.getResult().text
        //   if !text.isEmpty {
        //       notifyListeners("sttResult", data: ["transcript": text, "isFinal": false])
        //   }

        // Placeholder: send partial result
        let data: [String: Any] = [
            "transcript": "",
            "isFinal": false
        ]
        notifyListeners("sttResult", data: data)
    }

    @objc func stopRecognition(_ call: CAPPluginCall) {
        isRecording = false

        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil

        try? AVAudioSession.sharedInstance().setActive(false)

        // TODO: Get final result from sherpa-onnx recognizer
        // let finalText = recognizer.getResult().text
        // notifyListeners("sttResult", data: ["transcript": finalText, "isFinal": true])

        call.resolve(["stopped": true])
    }
}
