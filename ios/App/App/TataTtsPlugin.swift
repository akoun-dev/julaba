import Foundation
import AVFoundation
import Capacitor

/**
 * Sortie voix native pour « Tata Nanti Lou » (iOS).
 *
 * La WKWebView n'expose pas de Web Speech API fiable pour la synthèse
 * (voix absente, blocage autoplay hors geste utilisateur) — ce plugin
 * enveloppe AVSpeechSynthesizer, le moteur TTS système d'iOS, qui parle
 * français et fonctionne hors ligne. C'est le pendant, côté sortie, du
 * pont STT SherpaSttPlugin (même limitation WebView côté micro).
 *
 * CONTRAT : speak() résout exactement une fois par énoncé —
 * ["spoken": true] quand la synthèse est terminée, ["spoken": false] en
 * cas d'échec ou d'interruption (cf. tata-tts.ts : callback unique
 * 'done'/'error' sur lequel les appelants chaînent leurs actions).
 */
@objc(TataTtsPlugin)
public class TataTtsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TataTtsPlugin"
    public let jsName = "TataTts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let synthesizer = AVSpeechSynthesizer()
    private var pendingCall: CAPPluginCall?
    private var audioSessionConfigured = false

    public override func load() {
        super.load()
        synthesizer.delegate = self
    }

    public override func handleOnDestroy() {
        finishPending(spoken: false)
        synthesizer.stopSpeaking(at: .immediate)
        super.handleOnDestroy()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true, "ready": true])
    }

    @objc func speak(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.trimmingCharacters(in: .whitespaces).isEmpty else {
            call.resolve(["spoken": false, "reason": "texte_vide"])
            return
        }

        configureAudioSession()
        // Un nouvel énoncé remplace l'énoncé en cours (miroir de QUEUE_FLUSH
        // côté Android).
        finishPending(spoken: false)

        let utterance = AVSpeechUtterance(string: text)
        if let frenchVoice = AVSpeechSynthesisVoice(language: "fr-FR") {
            utterance.voice = frenchVoice
        }
        // Côté JS, rate 1.0 = débit normal Web Speech ; AVSpeech l'exprime
        // en multiples de AVSpeechUtteranceDefaultSpeechRate.
        let rate = call.getDouble("rate") ?? 0.9
        utterance.rate = max(0.1, min(2.0, Float(rate))) * AVSpeechUtteranceDefaultSpeechRate
        utterance.volume = max(0.0, min(1.0, Float(call.getDouble("volume") ?? 1.0)))
        utterance.pitchMultiplier = 1.1

        call.keepAlive = true
        pendingCall = call
        synthesizer.speak(utterance)
    }

    @objc func stop(_ call: CAPPluginCall) {
        synthesizer.stopSpeaking(at: .word)
        finishPending(spoken: false)
        call.resolve()
    }

    /// L'assistant doit rester audible même si le téléphone est en mode
    /// silencieux : la catégorie .playback l'emporte sur le interrupteur
    /// physique, .duckOthers baisse la musique en fond pendant la voix.
    private func configureAudioSession() {
        guard !audioSessionConfigured else { return }
        audioSessionConfigured = true
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback, mode: .spokenAudio, options: [.duckOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("[TataTts] Configuration AVAudioSession échouée : \(error)")
        }
    }

    private func finishPending(spoken: Bool) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        DispatchQueue.main.async {
            call.resolve(["spoken": spoken])
        }
    }
}

extension TataTtsPlugin: AVSpeechSynthesizerDelegate {
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finishPending(spoken: true)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finishPending(spoken: false)
    }
}
