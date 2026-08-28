import Foundation
import Capacitor

/**
 * Scaffold for on-device, fully offline speech-to-text via sherpa-onnx (see
 * the matching Android scaffold, SherpaSttPlugin.java, for the full context
 * and why this is a local plugin rather than an npm package).
 *
 * NOT FUNCTIONAL YET — every method rejects. See SHERPA_ONNX.md (repo root)
 * for the exact remaining steps: sherpa-onnx publishes an official Swift
 * Package (add it to ios/App/CapApp-SPM/Package.swift), bundling an offline
 * STT model as an app resource, and an AVAudioEngine capture loop — with a
 * working reference implementation from the official Android example
 * translated to the same OnlineRecognizer/OnlineStream API.
 *
 * IMPORTANT — unlike the Android scaffold, this file is NOT picked up
 * automatically: this Xcode project (ios/App/App.xcodeproj) uses the classic
 * explicit file-list format, not folder-synchronized groups, so a plugin
 * source file has to be added to the App target from within Xcode ("Add
 * Files to App…") before it compiles. This file is left ready to add, but
 * hand-editing project.pbxproj outside Xcode is exactly the kind of change
 * that's easy to get subtly wrong without being able to open the project —
 * so add it via Xcode rather than by patching the pbxproj directly.
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

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": false,
            "modelLoaded": modelLoaded
        ])
    }

    @objc func initModel(_ call: CAPPluginCall) {
        call.reject("SherpaStt.initModel is not implemented yet — see the class doc for what's needed.")
    }

    @objc func startRecognition(_ call: CAPPluginCall) {
        call.reject("SherpaStt.startRecognition is not implemented yet.")
    }

    @objc func stopRecognition(_ call: CAPPluginCall) {
        call.reject("SherpaStt.stopRecognition is not implemented yet.")
    }
}
