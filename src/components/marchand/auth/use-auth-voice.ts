"use client"

/**
 * Infrastructure vocale de l'auth unifié (ex auth-screen.tsx) — MODE-988
 * (DET-001 tranche 2), extraction SANS changement de comportement : sonde
 * micro au montage, préchargement différé du modèle Sherpa, session STT
 * single-shot française, écoute démarrable/arrêtable. Le routage du dicté
 * par étape vit dans auth-code-flows.handleVoiceResultFlow et est injecté
 * ici ; l'état vivant du flux (erreur, PIN…) reste dans l'écran.
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { tataSpeak, tataStop, playBeep } from "@/lib/voice/tata-tts"
import {
    isAnySTTAvailable as isSTTAvailable,
    createSmartSingleShotSTT,
    describeSTTError,
    initSherpaModel,
    type STTSession,
} from "@/lib/voice/stt-factory"

export function useAuthVoice({
    voiceEnabled,
    setError,
    handleVoiceResult,
}: {
    voiceEnabled: boolean
    setError: (v: string) => void
    handleVoiceResult: (transcript: string) => void | Promise<void>
}) {
    const [sttAvailable, setSttAvailable] = useState(
        () => typeof window !== "undefined" && isSTTAvailable()
    )
    const [micChecked, setMicChecked] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const sttSessionRef = useRef<STTSession | null>(null)

    // Check mic access on mount (async, non-blocking)
    useEffect(() => {
        if (!sttAvailable || !voiceEnabled) {
            setMicChecked(true)
            return
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setSttAvailable(false)
            setMicChecked(true)
            return
        }
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then(stream => {
                // Mic works — release immediately
                stream.getTracks().forEach(t => t.stop())
                setMicChecked(true)
            })
            .catch(() => {
                setSttAvailable(false)
                setMicChecked(true)
            })
    }, [])

    // Load the offline recognizer before the user presses the voice button.
    // Deferred 3 s to avoid competing with splash/biometric/notification init
    // on low-end devices; the factory caches the model so first-use latency
    // is only paid once.
    useEffect(() => {
        if (!voiceEnabled) return
        const t = setTimeout(() => {
            initSherpaModel().catch(() => {})
        }, 3000)
        return () => clearTimeout(t)
    }, [voiceEnabled])

    useEffect(
        () => () => {
            sttSessionRef.current?.abort()
        },
        []
    )

    const micCheckedRef = useRef(micChecked)
    micCheckedRef.current = micChecked
    const startListening = useCallback(async () => {
        if (
            !voiceEnabled ||
            isListening ||
            !sttAvailable ||
            !micCheckedRef.current
        )
            return
        tataStop()
        setIsListening(true)
        setError("")
        playBeep("start")
        // Authentification francophone uniquement : la langue Baoulé du
        // sélecteur global (persistée depuis la modale vocale) est ignorée
        // ici — { lang: "fr" } force la route français (Web Speech sur
        // web, VoiceService/Sherpa sur natif), jamais la route bci dédiée.
        // Le Baoulé reste disponible dans les modales vocales APRÈS connexion.
        sttSessionRef.current = await createSmartSingleShotSTT(
            {
                onResult: result => {
                    playBeep("stop")
                    setIsListening(false)
                    handleVoiceResult(result.transcript)
                },
                onError: err => {
                    setIsListening(false)
                    if (err === "no-speech") {
                        tataSpeak("Je n'ai rien entendu. Réessayez.")
                        setError("Aucune parole détectée.")
                    } else if (err === "aborted") {
                        /* silent */
                    } else {
                        // Task 32 : seuls les problèmes micro FATAUX
                        // désactivent la voix ici ; les autres messages
                        // (déjà formulés — VoiceService, Baoulé non prêt…)
                        // sont affichés tels quels.
                        if (
                            err === "not-allowed" ||
                            err === "service-not-allowed" ||
                            err === "audio-capture"
                        ) {
                            setSttAvailable(false)
                        }
                        if (err === "not-allowed") {
                            setError("Micro non autorisé. Utilisez le clavier.")
                        } else if (err === "audio-capture") {
                            setError("Aucun micro détecté.")
                        } else if (err === "network") {
                            // Cas « réseau » explicite (audit P1) : la Web
                            // Speech API exige internet — expliquer au lieu
                            // d'un « micro non disponible » trompeur.
                            playBeep("error")
                            setError(
                                "Connexion internet nécessaire pour la reconnaissance vocale. Utilisez le clavier."
                            )
                        } else {
                            playBeep("error")
                            setError(describeSTTError(err))
                        }
                    }
                },
                onEnd: () => {
                    setIsListening(false)
                },
            },
            { lang: "fr" }
        )
        sttSessionRef.current.start()
    }, [voiceEnabled, isListening, sttAvailable, handleVoiceResult, setError])

    const stopListening = useCallback(() => {
        sttSessionRef.current?.stop()
    }, [])

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening()
        } else {
            void startListening()
        }
    }, [isListening, startListening, stopListening])

    return {
        sttAvailable,
        micChecked,
        isListening,
        startListening,
        stopListening,
        toggleListening,
    }
}
