"use client"

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/stores/app-store"
import { tataSpeak, tataStop, playBeep, haptic } from "@/lib/voice/tata-tts"
import { parseVoicePin } from "@/lib/voice/localIntent"
import {
    isAnySTTAvailable as isSTTAvailable,
    createSmartSingleShotSTT,
    describeSTTError,
    initSherpaModel,
    type STTSession,
} from "@/lib/voice/stt-factory"
import {
    isBiometricUnlockAvailable,
    unlockWithBiometrics,
} from "@/lib/biometric-auth"
import {
    loadStoredAccount,
    normalizeAuthPhone as normalizePhone,
    type AccountRole,
} from "@/lib/auth-multi"
import { visualCodeToHash } from "@/components/marchand/visual-code-grid"
import { getPinHash } from "@/lib/secure-storage"
import { queuePendingSync } from "@/lib/offline-db"
import {
    instructionFor,
    patternToHash,
    persistAccount,
    checkUnifiedAccount,
    loadStoredPinHash,
    secureKeysFor,
    simpleHash,
    verifyServerLogin,
    VISUAL_LOGIN_LENGTH,
    type AuthMethod,
    type AuthStep,
    type PinInputMode,
} from "@/lib/auth-login-flow"
import {
    AuthProfileHeader,
    AuthRoleMenu,
    AuthSecurityFooter,
    AuthTabsNav,
    AuthTataCard,
} from "@/components/marchand/auth/auth-parts"
import { AuthNameStep } from "@/components/marchand/auth/auth-step-name"
import { AuthPinStep } from "@/components/marchand/auth/auth-step-pin"
import {
    AuthPatternStep,
    AuthVisualStep,
} from "@/components/marchand/auth/auth-step-pattern-visual"
import { AuthRecoveryStep } from "@/components/marchand/auth/auth-step-recovery"


export function AuthScreen() {
    const { setAuth, soleilMode, voiceEnabled, setUserRole } = useAppStore()

    // --- State ---
    const [step, setStep] = useState<AuthStep>("name")
    const [mode, setMode] = useState<"login" | "recovery">("login")
    const [authMethod, setAuthMethod] = useState<AuthMethod>("pattern")
    const [availableMethods, setAvailableMethods] = useState<AuthMethod[]>([])
    const [firstName, setFirstName] = useState("")
    const [phone, setPhone] = useState("")
    const [pin, setPin] = useState("")
    const [pinDisplay, setPinDisplay] = useState<string[]>([])
    const [pinInputMode, setPinInputMode] = useState<PinInputMode>("keyboard")
    const [confirmPin, setConfirmPin] = useState("")
    const [showPin, setShowPin] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [error, setError] = useState("")
    const [voiceAttempts, setVoiceAttempts] = useState(0)
    const [isProcessing, setIsProcessing] = useState(false)
    const [patternError, setPatternError] = useState(false)
    const [patternSuccess, setPatternSuccess] = useState(false)
    const [visualError, setVisualError] = useState(false)
    const [visualSuccess, setVisualSuccess] = useState(false)
    // Design « Ouvrir ma caisse » : le schéma et la suite de symboles
    // restent affichés jusqu'au CTA (mode contrôlé) — ces états portent la
    // saisie courante, les clés de reset remontent les composants.
    const [patternSelection, setPatternSelection] = useState<number[]>([])
    const [visualSelection, setVisualSelection] = useState<string[]>([])
    const [patternResetKey, setPatternResetKey] = useState(0)
    const [visualResetKey, setVisualResetKey] = useState(0)
    // Rôle détecté pour le numéro en cours (marchand | producteur). Pilote
    // la route de vérification, le badge « Espace … » et la redirection
    // post-login via setUserRole dans doLogin.
    const [accountRole, setAccountRole] = useState<AccountRole | null>(null)
    const accountRoleRef = useRef<AccountRole | null>(null)
    accountRoleRef.current = accountRole

    // NOTE — parité d'authentification vocale (audit P2/F12) : la voix ci-
    // dessous (sonde micro, PIN dicté, désactivation progressive après
    // échecs) n'est volontairement gated par AUCUN rôle. C'est le point
    // d'entrée unifié multi-utilisateurs, donc le producteur qui se connecte
    // ici bénéficie exactement du même PIN dicté que le marchand — l'ancien
    // écran prod-auth (repli hors menu, clavier seul) n'est plus le chemin
    // d'entrée des producteurs.

    const [sttAvailable, setSttAvailable] = useState(
        () => typeof window !== "undefined" && isSTTAvailable()
    )
    const [micChecked, setMicChecked] = useState(false)
    const [biometricAvailable, setBiometricAvailable] = useState(false)
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

    // Offer fingerprint/Face ID quick-unlock when running as the native app
    useEffect(() => {
        isBiometricUnlockAvailable().then(setBiometricAvailable)
    }, [])

    // Refs for STT callbacks
    const phoneRef = useRef(phone)
    const firstNameRef = useRef(firstName)
    const pinRef = useRef(pin)
    const pinInputModeRef = useRef<PinInputMode>(pinInputMode)
    const stepRef = useRef(step)
    const modeRef = useRef(mode)
    const confirmPinRef = useRef(confirmPin)
    const voiceAttemptsRef = useRef(voiceAttempts)

    phoneRef.current = phone
    firstNameRef.current = firstName
    pinRef.current = pin
    pinInputModeRef.current = pinInputMode
    stepRef.current = step
    modeRef.current = mode
    confirmPinRef.current = confirmPin
    voiceAttemptsRef.current = voiceAttempts

    // --- Login logic ---
    const doLogin = useCallback(
        (
            phoneVal: string,
            nameVal: string,
            role: AccountRole,
            merchantId?: string,
            sexe?: "masculin" | "feminin" | "autre" | null,
            categorie?: "detaillant" | "semi_grossiste" | "grossiste" | null
        ) => {
            setIsProcessing(true)
            setError("")
            try {
                const id = merchantId || crypto.randomUUID()
                playBeep("success")
                haptic("success")
                tataSpeak(`Bonjour ${nameVal} ! Bienvenue sur Jùlaba.`)
                // Le rôle DOIT être posé avant setAuth : la redirection
                // post-login (homeScreenForRole) lit le rôle courant du
                // store — marchand → accueil marché, producteur → accueil
                // récoltes.
                setUserRole(role)
                setAuth(id, nameVal, phoneVal, sexe, categorie)
            } catch {
                setError("Erreur de connexion.")
                playBeep("error")
            } finally {
                setIsProcessing(false)
            }
        },
        [setAuth, setUserRole]
    )

    const handleBiometricUnlock = useCallback(async () => {
        const stored = loadStoredAccount(phoneRef.current || "demo")
        if (!stored) return
        const ok = await unlockWithBiometrics(
            `Déverrouiller le compte de ${stored.firstName}`
        )
        if (ok) {
            doLogin(
                stored.phone,
                stored.firstName,
                stored.role,
                stored.id,
                stored.sexe
            )
        }
    }, [doLogin])

    const handleBiometricRecovery = useCallback(async () => {
        const stored = loadStoredAccount(phoneRef.current || "demo")
        if (!stored) return
        if (stored.role !== "marchand") {
            setError(
                "Réinitialisation disponible pour les comptes marchands. Contactez un agent Jùlaba."
            )
            return
        }
        const ok = await unlockWithBiometrics(
            `Réinitialiser le code de ${stored.firstName}`
        )
        if (!ok) return
        setMode("recovery")
        setPin("")
        setPinDisplay([])
        setConfirmPin("")
        setStep("recovery-pin")
        stepRef.current = "recovery-pin"
        tataSpeak("Créez votre nouveau code secret à 4 chiffres.")
    }, [])

    const parseVoicePhone = (transcript: string): string | null => {
        const lower = transcript.toLowerCase()
        const directDigits = lower.match(/\d/g)?.join("") || ""
        if (directDigits.length >= 8) return directDigits

        const digitWords: Record<string, string> = {
            zéro: "0",
            zero: "0",
            un: "1",
            une: "1",
            deux: "2",
            trois: "3",
            quatre: "4",
            cinq: "5",
            six: "6",
            sept: "7",
            huit: "8",
            neuf: "9",
        }
        const digits = lower
            .replace(/[,.!?]/g, " ")
            .split(/\s+/)
            .map(word => digitWords[word])
            .filter((digit): digit is string => Boolean(digit))
            .join("")
        return digits.length >= 8 ? digits : null
    }

    // Routes to the login step matching an account's auth method — shared by
    // the local-cache hit and the server-checked path below, since both end
    // up needing the exact same navigation once a name + method are known.
    const routeToLoginStep = (
        method: "pin" | "pattern" | "visual",
        name: string
    ) => {
        if (method === "pattern") {
            setAuthMethod("pattern")
            setStep("pattern-login")
            stepRef.current = "pattern-login"
            tataSpeak(`Bonjour ${name} ! Dessinez votre schéma.`)
        } else if (method === "visual") {
            setAuthMethod("visual")
            setStep("visual-login")
            stepRef.current = "visual-login"
            tataSpeak(
                `Bonjour ${name} ! Touchez vos ${VISUAL_LOGIN_LENGTH} symboles.`
            )
        } else {
            setAuthMethod("pin")
            setStep("login-pin")
            stepRef.current = "login-pin"
            tataSpeak(`Bonjour ${name} ! Entrez votre code à 4 chiffres.`)
        }
    }

    // Permet de corriger un numéro mal saisi depuis n'importe quel écran de
    // saisie du code (PIN / schéma / visuel) : on revient à l'étape téléphone
    // avec le numéro pré-rempli (modifiable) et on réinitialise tout l'état
    // transitoire de connexion (code, erreurs, tentatives schéma/visuel).
    const goBackToPhone = () => {
        setError("")
        setPin("")
        setPinDisplay([])
        setConfirmPin("")
        setPatternError(false)
        setPatternSuccess(false)
        setVisualError(false)
        setVisualSuccess(false)
        pinRef.current = ""
        setStep("name")
        stepRef.current = "name"
        tataSpeak("Modifiez votre numéro de téléphone.")
    }

    // Only an identificateur creates accounts now (see checkUnifiedAccount),
    // so there's no more "account not found → register" branch here: a phone
    // with no local cache and no server record just can't log in.
    const submitPhone = async (phoneValue: string) => {
        const normalizedPhone = normalizePhone(phoneValue)
        if (normalizedPhone.length < 8) {
            setError("Entrez un numéro valide.")
            return
        }
        setPhone(normalizedPhone)
        phoneRef.current = normalizedPhone
        setError("")
        setMode("login")
        modeRef.current = "login"

        // 1) Cache local unifié : le rôle de ce compte est déjà connu, on
        // route directement vers le bon écran de code (marchand ET
        // producteur, sans réseau).
        const stored = loadStoredAccount(normalizedPhone)
        if (stored) {
            setAccountRole(stored.role)
            accountRoleRef.current = stored.role
            setFirstName(stored.firstName)
            firstNameRef.current = stored.firstName
            // Toutes les méthodes prouvées par ce compte sur cet appareil —
            // le hash principal d'abord (ordre d'affichage : METHOD_TABS).
            const cachedMethods: AuthMethod[] = [stored.authMethod]
            if (stored.patternHash && !cachedMethods.includes("pattern"))
                cachedMethods.push("pattern")
            if (stored.visualCodeHash && !cachedMethods.includes("visual"))
                cachedMethods.push("visual")
            setAvailableMethods(cachedMethods)
            routeToLoginStep(stored.authMethod, stored.firstName)
            haptic("light")
            return
        }

        // 2) Découverte serveur multi-utilisateur : le même numéro sert aux
        // marchands et aux producteurs, c'est la base qui tranche le rôle.
        setIsProcessing(true)
        const server = await checkUnifiedAccount(normalizedPhone)
        setIsProcessing(false)
        if (server) {
            setAccountRole(server.role)
            accountRoleRef.current = server.role
            setFirstName(server.firstName)
            firstNameRef.current = server.firstName
            setAvailableMethods(server.authMethods)
            routeToLoginStep(server.authMethod, server.firstName)
            haptic("light")
        } else {
            setError(
                "Compte non trouvé. Demandez à un identificateur de créer votre compte."
            )
            tataSpeak(
                "Compte introuvable. Demandez à un identificateur de créer votre compte."
            )
            haptic("error")
        }
    }

    // --- Voice ---
    const handleVoiceResult = useCallback(
        async (transcript: string) => {
            const lower = transcript.toLowerCase().trim()
            const currentStep = stepRef.current

            if (currentStep === "name") {
                const phoneValue = parseVoicePhone(transcript)
                if (phoneValue) {
                    void submitPhone(phoneValue)
                } else {
                    setError("Je n'ai pas compris le numéro. Réessayez.")
                    tataSpeak("Je n'ai pas bien compris. Répétez votre numéro.")
                }
            } else if (currentStep === "login-pin") {
                const pinDigits = parseVoicePin(transcript)
                if (pinDigits) {
                    setPinInputMode("voice")
                    pinInputModeRef.current = "voice"
                    setPin(pinDigits.join(""))
                    pinRef.current = pinDigits.join("")
                    setPinDisplay(pinDigits.map(() => "•"))
                    tataSpeak(
                        `Votre code est ${pinDigits.join("-")}, c'est bien ça ?`
                    )
                    haptic("light")
                    setStep("confirm")
                    stepRef.current = "confirm"
                    setError("")
                } else {
                    const newAttempts = voiceAttemptsRef.current + 1
                    setVoiceAttempts(newAttempts)
                    voiceAttemptsRef.current = newAttempts
                    if (newAttempts >= 2) {
                        tataSpeak("Utilisez le pavé numérique.")
                        setError(
                            "Trop de tantatives vocales. Utilisez le pavé."
                        )
                    } else {
                        tataSpeak("Je n'ai pas entendu 4 chiffres. Répétez ?")
                        setError("Dites exactement 4 chiffres.")
                    }
                }
            } else if (currentStep === "confirm") {
                if (/^(oui|c\'?est (?:ça|ca)|exact|c\'?est bon)/i.test(lower)) {
                    // validate and login — local cache first, server fallback
                    // on a device's first login (see attemptLogin)
                    setIsProcessing(true)
                    const stored = loadStoredAccount(phoneRef.current || "demo")
                    let success = false
                    let serverError = ""
                    if (stored) {
                        const storedPinHash = await loadStoredPinHash(
                            stored.role,
                            phoneRef.current || "demo"
                        )
                        if (simpleHash(pinRef.current) === storedPinHash) {
                            doLogin(
                                stored.phone,
                                stored.firstName,
                                stored.role,
                                stored.id,
                                stored.sexe
                            )
                            success = true
                        }
                    } else {
                        const hash = simpleHash(pinRef.current)
                        const role = accountRoleRef.current ?? "marchand"
                        const result = await verifyServerLogin(
                            phoneRef.current || "demo",
                            "pin",
                            pinRef.current,
                            role
                        )
                        if (result && !("serverError" in result)) {
                            await persistAccount({
                                role,
                                id: result.id,
                                firstName: result.firstName,
                                phone: phoneRef.current || "demo",
                                pinHash: hash,
                                authMethod: "pin",
                            })
                            doLogin(
                                phoneRef.current || "demo",
                                result.firstName,
                                role,
                                result.id,
                                result.sexe,
                                result.categorie ?? undefined
                            )
                            success = true
                        } else if (result && "serverError" in result) {
                            serverError = result.serverError
                        }
                    }
                    setIsProcessing(false)
                    if (!success) {
                        // CRITICAL FIX: do NOT login on wrong PIN
                        tataSpeak(
                            serverError
                                ? "Connexion refusée. Réessayez."
                                : "Code incorrect. Réessayez."
                        )
                        setError(serverError || "Code incorrect.")
                        playBeep("error")
                        haptic("error")
                        setPin("")
                        pinRef.current = ""
                        setPinDisplay([])
                        setStep("login-pin")
                        stepRef.current = "login-pin"
                    }
                } else if (/^non/i.test(lower)) {
                    tataSpeak("D'accord, réentrez votre code.")
                    setPin("")
                    pinRef.current = ""
                    setPinDisplay([])
                    setStep("login-pin")
                    stepRef.current = "login-pin"
                }
            }
        },
        [doLogin, submitPhone]
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
    }, [voiceEnabled, isListening, sttAvailable, handleVoiceResult])

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

    // --- Phone submit ---
    const handlePhoneSubmit = () => submitPhone(phone)


    // --- Method choice ---
    // --- Pattern login --- (local cache first, server verify on a device's
    // first login for this account — see verifyServerLogin; a stale cache
    // also falls back to the server before refusing, since the server stays
    // the source of truth in multi-user/multi-device setups)
    const handlePatternLogin = async (pattern: number[]) => {
        const stored = loadStoredAccount(phone)
        const role: AccountRole =
            stored?.role ?? accountRoleRef.current ?? "marchand"
        const hash = patternToHash(pattern)
        if (stored) {
            const storedPatternHash = await getPinHash(
                secureKeysFor(stored.role, phone).pattern
            ).catch(() => null)
            if (storedPatternHash && storedPatternHash === hash) {
                haptic("success")
                setPatternSuccess(true)
                playBeep("success")
                setTimeout(
                    () =>
                        doLogin(
                            phone,
                            stored.firstName,
                            stored.role,
                            stored.id,
                            stored.sexe
                        ),
                    400
                )
                return
            }
            // Cache périmé → le serveur tranche avant de refuser.
            const result = await verifyServerLogin(phone, "pattern", pattern.join("-"), role)
            if (result && !("serverError" in result)) {
                await persistAccount({
                    role: stored.role,
                    id: result.id,
                    firstName: result.firstName,
                    phone,
                    pinHash: "",
                    patternHash: hash,
                    authMethod: "pattern",
                })
                haptic("success")
                setPatternSuccess(true)
                playBeep("success")
                setTimeout(
                    () =>
                        doLogin(
                            phone,
                            result.firstName,
                            stored.role,
                            result.id,
                            result.sexe
                        ),
                    400
                )
                return
            }
            if (result && "serverError" in result) {
                haptic("error")
                playBeep("error")
                setError(result.serverError)
                return
            }
        } else {
            const result = await verifyServerLogin(phone, "pattern", pattern.join("-"), role)
            if (result && !("serverError" in result)) {
                await persistAccount({
                    role,
                    id: result.id,
                    firstName: result.firstName,
                    phone,
                    pinHash: "",
                    patternHash: hash,
                    authMethod: "pattern",
                })
                haptic("success")
                setPatternSuccess(true)
                playBeep("success")
                setTimeout(
                    () =>
                        doLogin(
                            phone,
                            result.firstName,
                            role,
                            result.id,
                            result.sexe
                        ),
                    400
                )
                return
            }
            if (result && "serverError" in result) {
                haptic("error")
                playBeep("error")
                setError(result.serverError)
                return
            }
        }
        haptic("error")
        playBeep("error")
        setPatternError(true)
        setError("Schéma incorrect.")
        tataSpeak("Schéma incorrect. Réessayez.")
        setTimeout(() => setPatternError(false), 1200)
    }

    // --- Visual code login --- (marchand-only method; same local-first /
    // server-fallback shape as handlePatternLogin above)
    const handleVisualLogin = async (sequence: string[]) => {
        const stored = loadStoredAccount(phone)
        const role: AccountRole = stored?.role ?? "marchand"
        const hash = visualCodeToHash(sequence)
        if (stored) {
            const storedVisualHash = await getPinHash(
                secureKeysFor(stored.role, phone).visual
            ).catch(() => null)
            if (storedVisualHash && storedVisualHash === hash) {
                haptic("success")
                setVisualSuccess(true)
                playBeep("success")
                setTimeout(
                    () =>
                        doLogin(
                            phone,
                            stored.firstName,
                            stored.role,
                            stored.id,
                            stored.sexe
                        ),
                    400
                )
                return
            }
            // Cache périmé → le serveur tranche avant de refuser.
            const result = await verifyServerLogin(phone, "visual", sequence.join(">"), role)
            if (result && !("serverError" in result)) {
                await persistAccount({
                    role: stored.role,
                    id: result.id,
                    firstName: result.firstName,
                    phone,
                    pinHash: "",
                    visualCodeHash: hash,
                    authMethod: "visual",
                })
                haptic("success")
                setVisualSuccess(true)
                playBeep("success")
                setTimeout(
                    () =>
                        doLogin(
                            phone,
                            result.firstName,
                            stored.role,
                            result.id,
                            result.sexe
                        ),
                    400
                )
                return
            }
            if (result && "serverError" in result) {
                haptic("error")
                playBeep("error")
                setError(result.serverError)
                return
            }
        } else {
            const result = await verifyServerLogin(phone, "visual", sequence.join(">"), role)
            if (result && !("serverError" in result)) {
                await persistAccount({
                    role,
                    id: result.id,
                    firstName: result.firstName,
                    phone,
                    pinHash: "",
                    visualCodeHash: hash,
                    authMethod: "visual",
                })
                haptic("success")
                setVisualSuccess(true)
                playBeep("success")
                setTimeout(
                    () =>
                        doLogin(
                            phone,
                            result.firstName,
                            role,
                            result.id,
                            result.sexe
                        ),
                    400
                )
                return
            }
            if (result && "serverError" in result) {
                haptic("error")
                playBeep("error")
                setError(result.serverError)
                return
            }
        }
        haptic("error")
        playBeep("error")
        setVisualError(true)
        setError("Symboles incorrects.")
        tataSpeak("Mauvaise séquence. Réessayez.")
        setTimeout(() => setVisualError(false), 1200)
    }

    // --- PIN logic ---
    const handlePinDigit = async (digit: string) => {
        if (pin.length >= 4) return
        setPinInputMode("keyboard")
        pinInputModeRef.current = "keyboard"
        const newPin = pin + digit
        setPin(newPin)
        setPinDisplay([...pinDisplay, "•"])
        haptic("light")
        if (newPin.length === 4) {
            if (mode === "recovery") {
                if (!confirmPin) {
                    setConfirmPin(newPin)
                    setPin("")
                    setPinDisplay([])
                    setStep("recovery-confirm")
                    tataSpeak("Confirmez votre nouveau code.")
                } else if (newPin === confirmPin) {
                    void completeRecovery(newPin)
                } else {
                    setError("Les codes ne correspondent pas.")
                    tataSpeak("Les codes ne sont pas les mêmes. Réessayez.")
                    setPin("")
                    setPinDisplay([])
                    setConfirmPin("")
                    setStep("recovery-pin")
                    playBeep("error")
                }
            } else {
                void attemptLogin(newPin)
            }
        }
    }

    const handleDeletePin = () => {
        if (pin.length === 0) return
        setPin(pin.slice(0, -1))
        setPinDisplay(pinDisplay.slice(0, -1))
    }

    const attemptLogin = async (pinValue = pin) => {
        setIsProcessing(true)
        const phoneValue = phoneRef.current || "demo"
        const stored = loadStoredAccount(phoneValue)
        const role: AccountRole =
            stored?.role ?? accountRoleRef.current ?? "marchand"
        const hash = simpleHash(pinValue)
        let success = false
        if (stored) {
            const storedPinHash = await loadStoredPinHash(
                stored.role,
                phoneValue
            )
            if (hash === storedPinHash) {
                doLogin(
                    stored.phone,
                    stored.firstName,
                    stored.role,
                    stored.id,
                    stored.sexe
                )
                success = true
            } else {
                // Cache périmé (code changé ailleurs, plusieurs comptes sur
                // cet appareil…) → le serveur reste la source de vérité avant
                // de refuser la connexion.
                const result = await verifyServerLogin(
                    phoneValue,
                    "pin",
                    pinValue,
                    role
                )
                if (result && !("serverError" in result)) {
                    await persistAccount({
                        role: stored.role,
                        id: result.id,
                        firstName: result.firstName,
                        phone: phoneValue,
                        pinHash: hash,
                        authMethod: "pin",
                    })
                    doLogin(
                        phoneValue,
                        result.firstName,
                        stored.role,
                        result.id,
                        result.sexe,
                        result.categorie ?? undefined
                    )
                    success = true
                } else if (result && "serverError" in result) {
                    setError(result.serverError)
                    tataSpeak("Connexion refusée. Réessayez.")
                    playBeep("error")
                    haptic("error")
                    setPin("")
                    pinRef.current = ""
                    setPinDisplay([])
                    setIsProcessing(false)
                    return
                }
            }
        } else {
            // No local cache — first login on this device for this account,
            // verify server-side (see verifyServerLogin) and cache on success.
            const result = await verifyServerLogin(
                phoneValue,
                "pin",
                pinValue,
                role
            )
            if (result && !("serverError" in result)) {
                await persistAccount({
                    role,
                    id: result.id,
                    firstName: result.firstName,
                    phone: phoneValue,
                    pinHash: hash,
                    authMethod: "pin",
                })
                doLogin(
                    phoneValue,
                    result.firstName,
                    role,
                    result.id,
                    result.sexe,
                    result.categorie ?? undefined
                )
                success = true
            } else if (result && "serverError" in result) {
                setError(result.serverError)
                tataSpeak("Connexion refusée. Réessayez.")
                playBeep("error")
                haptic("error")
                setPin("")
                pinRef.current = ""
                setPinDisplay([])
                setIsProcessing(false)
                return
            }
        }
        if (!success) {
            // CRITICAL FIX: block login on wrong PIN
            playBeep("error")
            haptic("error")
            setError("Code incorrect. Réessayez.")
            tataSpeak("Code incorrect.")
            setPin("")
            pinRef.current = ""
            setPinDisplay([])
        }
        setIsProcessing(false)
    }

    const completeRecovery = async (newPin: string) => {
        const stored = loadStoredAccount(phoneRef.current || "demo")
        if (!stored) {
            setError("Compte introuvable. Réessayez.")
            return
        }
        if (stored.role !== "marchand") {
            // La réinitialisation serveur (PATCH /api/merchant) n'existe que
            // pour les marchands ; un producteur passe par un agent Jùlaba.
            setError(
                "Réinitialisation disponible pour les comptes marchands. Contactez un agent Jùlaba."
            )
            return
        }
        setIsProcessing(true)
        try {
            const newHash = simpleHash(newPin)
            await persistAccount({
                role: stored.role,
                id: stored.id,
                firstName: stored.firstName,
                phone: stored.phone,
                pinHash: newHash,
                authMethod: "pin",
            })
            // Sync new credential to server so other devices stay in sync.
            // Best-effort: if offline, queue for later sync.
            // MODE-936 (S-03) : le NOUVEAU code part en brut — hachage
            // scrypt serveur (PATCH /api/merchant).
            const payload = {
                phone: stored.phone,
                authMethod: "pin",
                pin: newPin,
            }
            try {
                const res = await fetch("/api/merchant", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
                if (!res.ok && res.status !== 404)
                    throw new Error(`Erreur ${res.status}`)
            } catch {
                await queuePendingSync("merchant-update", payload)
            }
            playBeep("success")
            haptic("success")
            tataSpeak(
                `Votre code est réinitialisé. Bonjour ${stored.firstName} !`
            )
            doLogin(
                stored.phone,
                stored.firstName,
                stored.role,
                stored.id,
                stored.sexe
            )
        } catch {
            setError("Impossible de réinitialiser le code. Réessayez.")
            playBeep("error")
        } finally {
            setIsProcessing(false)
        }
    }

    // --- Effects ---
    useEffect(() => {
        // Changement d'étape : les saisies schéma/symboles repartent de
        // zéro (les composants sont remontés via leur clé de reset).
        setPatternSelection([])
        setVisualSelection([])
        setPatternResetKey(k => k + 1)
        setVisualResetKey(k => k + 1)
    }, [step])

    useEffect(() => {
        if (voiceEnabled) {
            const t = setTimeout(() => {
                tataSpeak(
                    "Bonjour ! Bienvenue sur Jùlaba. Faut taper ton muméro oubien, appuis sur le micro pour parler."
                )
            }, 500)
            return () => clearTimeout(t)
        }
    }, [])

    useEffect(
        () => () => {
            sttSessionRef.current?.abort()
        },
        []
    )

    // --- Render ---
    const isPinStep =
        step === "login-pin" ||
        step === "confirm" ||
        step === "recovery-pin" ||
        step === "recovery-confirm"

    // Soumissions CTA des modes contrôlés (schéma / symboles).
    const handlePatternSubmit = () => {
        if (patternSelection.length >= 4 && !isProcessing) {
            void handlePatternLogin(patternSelection)
        }
    }
    const handleVisualSubmit = () => {
        if (visualSelection.length >= VISUAL_LOGIN_LENGTH && !isProcessing) {
            void handleVisualLogin(visualSelection)
        }
    }

    // Aides des écrans schéma/symboles — gardes d'affichage identiques à
    // l'original (canUsePin / marchand seul), closures recréées au rendu
    // comme avant l'extraction.
    const helpProps = {
        canUsePin: availableMethods.includes("pin") && authMethod !== "pin",
        isMerchant: accountRole === "marchand",
        onPin: () => routeToLoginStep("pin", firstName),
        onRecovery: () => {
            setError("")
            setStep("recovery")
            stepRef.current = "recovery"
        },
    }

    return (
        <div
            className={cn(
                "min-h-dvh flex flex-col items-center justify-center p-4",
                step === "name" ? "bg-[#FAF1E6]" : "bg-[#FAF4EB]"
            )}
        >
            <div className="w-full max-w-sm">
                {/* Barre supérieure — statut marché (première vue) + aide
                    vocale + sélecteur de rôle. Identificateur et backoffice
                    ont leurs entrées dédiées ; marchands et producteurs
                    passent tous par CET écran (rôle détecté au numéro). */}
                <div className="mb-5 flex items-center justify-end gap-2">
                    <div className="flex items-center gap-2">
                        {step === "name" && voiceEnabled && (
                            <button
                                type="button"
                                onClick={() => {
                                    tataStop()
                                    tataSpeak(instructionFor("name"))
                                }}
                                className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-xs font-bold text-[#3D2314] shadow-[0_1px_4px_rgba(122,62,29,0.12)] transition-transform active:scale-95"
                            >
                                <Volume2 className="h-4 w-4 text-[#C66A2C]" />
                                Aide vocale
                            </button>
                        )}
                        <AuthRoleMenu />
                    </div>
                </div>

                {/* ===== STEP: Name / Phone — maquette « Connexion à votre espace » ===== */}
                {step === "name" && (
                    <AuthNameStep
                        phone={phone}
                        onPhoneChange={setPhone}
                        onPhoneSubmit={handlePhoneSubmit}
                        error={error}
                        soleilMode={soleilMode}
                        voiceEnabled={voiceEnabled}
                        sttAvailable={sttAvailable}
                        micChecked={micChecked}
                        isListening={isListening}
                        onToggleListening={toggleListening}
                        onStopListening={stopListening}
                    />
                )}

                {/* ===== Shell connexion : profil + onglets + Tata + contenu =====
                    (toutes les étapes de saisie du code, recovery PIN inclus) */}
                {step !== "name" && step !== "recovery" && (
                    <>
                        <AuthProfileHeader
                            firstName={firstName}
                            phone={phone}
                            accountRole={accountRole}
                            soleilMode={soleilMode}
                        />
                        <AuthTabsNav
                            availableMethods={availableMethods}
                            authMethod={authMethod}
                            mode={mode}
                            firstName={firstName}
                            onRoute={routeToLoginStep}
                        />
                        <AuthTataCard
                            instruction={instructionFor(step)}
                            soleilMode={soleilMode}
                        />

                        {/* ----- Code PIN ----- */}
                        {isPinStep && (
                            <AuthPinStep
                                step={step}
                                mode={mode}
                                pin={pin}
                                pinDisplay={pinDisplay}
                                confirmPin={confirmPin}
                                showPin={showPin}
                                onToggleShowPin={() => setShowPin(!showPin)}
                                onDigit={handlePinDigit}
                                onDelete={handleDeletePin}
                                biometricAvailable={biometricAvailable}
                                onBiometricUnlock={handleBiometricUnlock}
                                isProcessing={isProcessing}
                                voiceEnabled={voiceEnabled}
                                sttAvailable={sttAvailable}
                                micChecked={micChecked}
                                isListening={isListening}
                                onStartListening={() => void startListening()}
                                onConfirmLogin={() => attemptLogin()}
                                onVoiceRetry={() => {
                                    tataSpeak("D'accord, réentrez.")
                                    setPin("")
                                    setPinDisplay([])
                                    setStep("login-pin")
                                }}
                                onBackToPhone={goBackToPhone}
                                accountRole={accountRole}
                                onRecovery={helpProps.onRecovery}
                                error={error}
                                soleilMode={soleilMode}
                                pinInputMode={pinInputMode}
                            />
                        )}

                        {/* ----- Schéma ----- */}
                        {step === "pattern-login" && (
                            <AuthPatternStep
                                patternSelection={patternSelection}
                                onChangeSelection={setPatternSelection}
                                onErase={() => {
                                    setPatternSelection([])
                                    setPatternResetKey(k => k + 1)
                                }}
                                patternResetKey={patternResetKey}
                                onComplete={handlePatternLogin}
                                isProcessing={isProcessing}
                                patternError={patternError}
                                patternSuccess={patternSuccess}
                                onSubmit={handlePatternSubmit}
                                error={error}
                                onBackToPhone={goBackToPhone}
                                soleilMode={soleilMode}
                                help={helpProps}
                            />
                        )}

                        {/* ----- Symboles ----- */}
                        {step === "visual-login" && (
                            <AuthVisualStep
                                visualSelection={visualSelection}
                                onChangeSelection={setVisualSelection}
                                visualResetKey={visualResetKey}
                                onComplete={handleVisualLogin}
                                isProcessing={isProcessing}
                                visualError={visualError}
                                visualSuccess={visualSuccess}
                                onSubmit={handleVisualSubmit}
                                error={error}
                                onBackToPhone={goBackToPhone}
                                soleilMode={soleilMode}
                                help={helpProps}
                            />
                        )}

                        <AuthSecurityFooter />
                    </>
                )}

                {/* ===== STEP: Account recovery ===== */}
                {step === "recovery" && (
                    <AuthRecoveryStep
                        soleilMode={soleilMode}
                        biometricAvailable={biometricAvailable}
                        isProcessing={isProcessing}
                        onBiometricRecovery={handleBiometricRecovery}
                        onBackToLogin={() => {
                            setMode("login")
                            modeRef.current = "login"
                            setStep("login-pin")
                            stepRef.current = "login-pin"
                        }}
                        error={error}
                    />
                )}
            </div>
        </div>
    )
}
