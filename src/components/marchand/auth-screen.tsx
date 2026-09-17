"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
    ArrowLeft,
    Eye,
    EyeOff,
    Mic,
    MicOff,
    Phone,
    User,
    Shield,
    Info,
    Grid3X3,
    ImageIcon,
    ClipboardList,
    Monitor,
    Fingerprint,
    Check,
    X,
    Wheat,
    Store,
} from "lucide-react"
import {
    loadStoredAccount,
    saveStoredAccount,
    normalizeAuthPhone as normalizePhone,
    type AccountRole,
    type StoredAccount,
} from "@/lib/auth-multi"
import {
    VisualCodeGrid,
    visualCodeToHash,
} from "@/components/marchand/visual-code-grid"
import { useAppStore } from "@/lib/stores/app-store"
import { tataSpeak, tataStop, playBeep, haptic } from "@/lib/voice/tata-tts"
import { parseVoicePin } from "@/lib/voice/localIntent"
import {
    isAnySTTAvailable as isSTTAvailable,
    createSmartSingleShotSTT as createSingleShotSTT,
    initSherpaModel,
    type STTSession,
} from "@/lib/voice/stt-factory"
import {
    isBiometricUnlockAvailable,
    unlockWithBiometrics,
} from "@/lib/biometric-auth"
import { PatternLock } from "@/components/marchand/pattern-lock"
import { cn } from "@/lib/utils"
import { queuePendingSync } from "@/lib/offline-db"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type AuthMethod = "pin" | "pattern" | "visual"
type AuthStep =
    | "name"
    | "confirm"
    | "login-pin"
    | "recovery"
    | "recovery-pin"
    | "recovery-confirm"
    | "pattern-login"
    | "visual-login"
type PinInputMode = "keyboard" | "voice"

const simpleHash = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash |= 0
    }
    return hash.toString()
}

import { savePinHash, getPinHash } from "@/lib/secure-storage"

const patternToHash = (pattern: number[]) => simpleHash(pattern.join("-"))

// Préfixes SecureStorage par rôle — mêmes clés que les écrans historiques
// (marchand : "merchant-*", producteur : "prod-*") pour rester compatible
// avec les changements de code depuis les écrans de profil.
const secureKeysFor = (role: AccountRole, phone: string) => {
    const p = normalizePhone(phone)
    const prefix = role === "producteur" ? "prod" : "merchant"
    return {
        pin: `${prefix}-pin-${p}`,
        pattern: `${prefix}-pattern-${p}`,
        visual: `${prefix}-visual-${p}`,
    }
}

// Met le compte en cache après un premier login réussi : cache unifié
// (localStorage, porte le rôle détecté → routing + redirection hors ligne)
// + hashes dans le SecureStorage de l'appareil. Le prochain login de CE
// compte sur CET appareil peut alors se faire sans réseau.
const persistAccount = async (data: StoredAccount) => {
    saveStoredAccount(data)
    const keys = secureKeysFor(data.role, data.phone)
    if (data.pinHash)
        await savePinHash(keys.pin, data.pinHash).catch(() => {})
    if (data.patternHash)
        await savePinHash(keys.pattern, data.patternHash).catch(() => {})
    if (data.visualCodeHash)
        await savePinHash(keys.visual, data.visualCodeHash).catch(() => {})
}

const loadStoredPinHash = async (
    role: AccountRole,
    phone: string
): Promise<string | null> => {
    return await getPinHash(secureKeysFor(role, phone).pin).catch(() => null)
}

// Découverte multi-utilisateur : un seul point d'entrée téléphone pour les
// marchands ET les producteurs (voir /api/auth/lookup). Le rôle renvoyé
// pilote la route de vérification du code ET la redirection post-login —
// plus besoin de choisir son profil avant de taper son numéro.
const checkUnifiedAccount = async (
    phone: string
): Promise<{
    role: AccountRole
    id: string
    firstName: string
    authMethod: AuthMethod
    authMethods: AuthMethod[]
    sexe?: "masculin" | "feminin" | "autre" | null
} | null> => {
    try {
        const res = await fetch(
            `/api/auth/lookup?phone=${encodeURIComponent(phone)}`
        )
        if (!res.ok) return null
        const data = await res.json()
        if (data?.found !== true) return null
        return {
            role: data.role,
            id: data.id,
            firstName: data.firstName,
            authMethod: data.authMethod,
            authMethods: (data.authMethods?.length ? data.authMethods : [data.authMethod]) as AuthMethod[],
            sexe: data.sexe ?? undefined,
        }
    } catch {
        return null
    }
}

// Verifies a login attempt server-side on the role's own route
// (/api/merchant/login or /api/producteur/login) — only the already-computed
// hash is sent, never the raw PIN/pattern/images. A server refusal returns
// { serverError } so the real reason (wrong code, account already bound to
// another device…) can be shown instead of a generic "Code incorrect". On
// success the caller caches the account locally (persistAccount) so the
// device can keep logging in fully offline afterwards, exactly as before.
const verifyServerLogin = async (
    phone: string,
    method: AuthMethod,
    hash: string,
    role: AccountRole
): Promise<{
    id: string
    firstName: string
    sexe?: "masculin" | "feminin" | "autre" | null
    categorie?: "detaillant" | "semi_grossiste" | "grossiste" | null
} | { serverError: string } | null> => {
    try {
        const res = await fetch(
            role === "producteur" ? "/api/producteur/login" : "/api/merchant/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, method, hash }),
            }
        )
        if (!res.ok) {
            const data = await res.json().catch(() => null)
            return data?.error ? { serverError: data.error as string } : null
        }
        return await res.json()
    } catch {
        return null
    }
}

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
    // Rôle détecté pour le numéro en cours (marchand | producteur). Pilote
    // la route de vérification, le badge « Espace … » et la redirection
    // post-login via setUserRole dans doLogin.
    const [accountRole, setAccountRole] = useState<AccountRole | null>(null)
    const accountRoleRef = useRef<AccountRole | null>(null)
    accountRoleRef.current = accountRole

    const [sttAvailable, setSttAvailable] = useState(
        () => typeof window !== "undefined" && isSTTAvailable()
    )
    const [micChecked, setMicChecked] = useState(false)
    const [biometricAvailable, setBiometricAvailable] = useState(false)
    const sttSessionRef = useRef<STTSession | null>(null)
    const voicePressActiveRef = useRef(false)

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
    // The factory caches the model, so this removes first-use model startup from
    // the visible listening interaction while keeping the fallback unchanged.
    useEffect(() => {
        if (voiceEnabled) void initSherpaModel()
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
            doLogin(stored.phone, stored.firstName, stored.role, stored.id, stored.sexe)
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
            tataSpeak(`Bonjour ${name} ! Touchez vos 4 images.`)
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
            setAvailableMethods([stored.authMethod])
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
                            doLogin(stored.phone, stored.firstName, stored.role, stored.id, stored.sexe)
                            success = true
                        }
                    } else {
                        const hash = simpleHash(pinRef.current)
                        const role = accountRoleRef.current ?? "marchand"
                        const result = await verifyServerLogin(
                            phoneRef.current || "demo",
                            "pin",
                            hash,
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
    const startListening = useCallback(
        async (holdToTalk = false) => {
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
            sttSessionRef.current = await createSingleShotSTT({
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
                        // Any other error (not-allowed, audio-capture, network, service-not-available, etc.)
                        // → disable voice for this session to avoid repeated failures
                        setSttAvailable(false)
                        if (err === "not-allowed") {
                            setError("Micro non autorisé. Utilisez le clavier.")
                        } else if (err === "audio-capture") {
                            setError("Aucun micro détecté.")
                        } else {
                            playBeep("error")
                            setError(
                                "Micro non disponible. Utilisez le clavier."
                            )
                        }
                    }
                },
                onEnd: () => {
                    setIsListening(false)
                },
            })
            sttSessionRef.current.start()
            if (holdToTalk && !voicePressActiveRef.current) {
                sttSessionRef.current.stop()
            }
        },
        [voiceEnabled, isListening, sttAvailable, handleVoiceResult]
    )

    const stopListening = useCallback(() => {
        voicePressActiveRef.current = false
        sttSessionRef.current?.stop()
    }, [])

    const handleVoicePressStart = useCallback(
        (event: React.PointerEvent<HTMLButtonElement>) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            voicePressActiveRef.current = true
            void startListening(true)
        },
        [startListening]
    )

    const handleVoicePressEnd = useCallback(() => {
        stopListening()
    }, [stopListening])

    // --- Phone submit ---
    const handlePhoneSubmit = () => submitPhone(phone)

    // --- Method choice ---
    // --- Pattern login --- (local cache first, server verify on a device's
    // first login for this account — see verifyServerLogin; a stale cache
    // also falls back to the server before refusing, since the server stays
    // the source of truth in multi-user/multi-device setups)
    const handlePatternLogin = async (pattern: number[]) => {
        const stored = loadStoredAccount(phone)
        const role: AccountRole = stored?.role ?? accountRoleRef.current ?? "marchand"
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
            const result = await verifyServerLogin(phone, "pattern", hash, role)
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
            const result = await verifyServerLogin(phone, "pattern", hash, role)
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
            const result = await verifyServerLogin(phone, "visual", hash, role)
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
            const result = await verifyServerLogin(phone, "visual", hash, role)
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
        setError("Image incorrecte.")
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
        const role: AccountRole = stored?.role ?? accountRoleRef.current ?? "marchand"
        const hash = simpleHash(pinValue)
        let success = false
        if (stored) {
            const storedPinHash = await loadStoredPinHash(stored.role, phoneValue)
            if (hash === storedPinHash) {
                doLogin(stored.phone, stored.firstName, stored.role, stored.id, stored.sexe)
                success = true
            } else {
                // Cache périmé (code changé ailleurs, plusieurs comptes sur
                // cet appareil…) → le serveur reste la source de vérité avant
                // de refuser la connexion.
                const result = await verifyServerLogin(phoneValue, "pin", hash, role)
                if (result && !("serverError" in result)) {
                    await persistAccount({
                        role: stored.role,
                        id: result.id,
                        firstName: result.firstName,
                        phone: phoneValue,
                        pinHash: hash,
                        authMethod: "pin",
                    })
                    doLogin(phoneValue, result.firstName, stored.role, result.id, result.sexe, result.categorie ?? undefined)
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
            const result = await verifyServerLogin(phoneValue, "pin", hash, role)
            if (result && !("serverError" in result)) {
                await persistAccount({
                    role,
                    id: result.id,
                    firstName: result.firstName,
                    phone: phoneValue,
                    pinHash: hash,
                    authMethod: "pin",
                })
                doLogin(phoneValue, result.firstName, role, result.id, result.sexe, result.categorie ?? undefined)
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
            const payload = { phone: stored.phone, authMethod: "pin", pinHash: newHash }
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
            doLogin(stored.phone, stored.firstName, stored.role, stored.id, stored.sexe)
        } catch {
            setError("Impossible de réinitialiser le code. Réessayez.")
            playBeep("error")
        } finally {
            setIsProcessing(false)
        }
    }

    // --- Effects ---
    useEffect(() => {
        if (voiceEnabled) {
            const t = setTimeout(() => {
                tataSpeak(
                    "Bonjour ! Bienvenue sur Jùlaba. Entrez ou dites votre numéro."
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
    const textClass = soleilMode ? "text-black text-lg" : "text-foreground"
    const methodPicker = availableMethods.length > 1 ? (
        <div className="rounded-lg border bg-muted/40 p-2">
            <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Choisissez votre méthode de connexion</p>
            <div className="grid grid-cols-3 gap-1">
                {availableMethods.map(method => (
                    <Button key={method} type="button" size="sm" variant={authMethod === method ? "secondary" : "ghost"} className="h-9 text-xs" onClick={() => routeToLoginStep(method, firstName)}>
                        {method === "pin" ? "PIN" : method === "pattern" ? "Schéma" : "Visuel"}
                    </Button>
                ))}
            </div>
        </div>
    ) : null

    // Pastille d'espace détecté : dès que le rôle du numéro est connu, on
    // montre clairement où la connexion mène (marché ou récoltes) — c'est la
    // redirection post-login qui fait le reste automatiquement.
    const roleBadge = accountRole ? (
        <div className="flex justify-center">
            <span
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                    accountRole === "producteur"
                        ? "bg-[#2E8B57]/10 text-[#2E8B57]"
                        : "bg-[#C66A2C]/10 text-[#C66A2C]"
                )}
            >
                {accountRole === "producteur" ? (
                    <Wheat className="w-3.5 h-3.5" />
                ) : (
                    <Store className="w-3.5 h-3.5" />
                )}
                {accountRole === "producteur"
                    ? "Espace Producteur"
                    : "Espace Marchand"}
            </span>
        </div>
    ) : null

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]">
            <div className="w-full max-w-sm">
                {/* Secondary role selection — identificateur et backoffice
                    ont leurs entrées dédiées ; marchands et producteurs
                    passent tous par CET écran (rôle détecté au numéro). */}
                <div className="flex justify-end mb-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Choisir un rôle"
                                className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#333333] px-3 text-sm font-bold tracking-wide text-white shadow-sm transition-transform duration-150 ease-out hover:bg-[#444444] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C66A2C] focus-visible:ring-offset-2"
                            >
                                &lt;&gt;
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                            <DropdownMenuItem
                                onSelect={() => {
                                    setUserRole("identificateur")
                                    useAppStore
                                        .getState()
                                        .navigate("ident-auth")
                                }}
                                className="gap-2 py-2.5"
                            >
                                <ClipboardList className="h-4 w-4 text-[#9F8170]" />
                                <span>Identificateur</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    setUserRole("backoffice")
                                    useAppStore.getState().navigate("bo-auth")
                                }}
                                className="gap-2 py-2.5"
                            >
                                <Monitor className="h-4 w-4 text-[#333333]" />
                                <span>BackOffice</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg overflow-hidden">
                        <img
                            src="/icon-only.png"
                            alt="Jùlaba"
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <h1
                        className={cn(
                            "text-3xl font-bold text-[#C66A2C]",
                            soleilMode && "text-2xl"
                        )}
                    >
                        Jùlaba
                    </h1>
                    <p className={cn("text-sm mt-1", textClass, "opacity-70")}>
                        Marchands &amp; producteurs
                    </p>
                </div>

                {/* ===== STEP: Name / Phone ===== */}
                {step === "name" && (
                    <Card
                        className={cn(
                            "border-2 border-[#C66A2C]/20",
                            soleilMode && "shadow-2xl border-[#C66A2C]/40"
                        )}
                    >
                        <CardContent className="p-6 space-y-4">
                            <div className="text-center mb-2">
                                <User className="w-10 h-10 mx-auto text-[#C66A2C] mb-2" />
                                <h2
                                    className={cn(
                                        "text-xl font-semibold",
                                        textClass
                                    )}
                                >
                                    Connexion
                                </h2>
                                <p
                                    className={cn(
                                        "text-sm",
                                        textClass,
                                        "opacity-70 mt-1"
                                    )}
                                >
                                    Entrez votre numéro de téléphone
                                </p>
                            </div>
                            <div className="relative flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                                <Phone className="w-5 h-5 text-muted-foreground" />
                                <Input
                                    type="tel"
                                    placeholder="Ex: 07 01 02 03 04"
                                    value={phone}
                                    onChange={e =>
                                        setPhone(
                                            e.target.value.replace(
                                                /[^\d\s]/g,
                                                ""
                                            )
                                        )
                                    }
                                    className={cn(
                                        "border-0 bg-transparent text-lg pr-12",
                                        soleilMode && "text-xl",
                                        "p-0 h-auto focus-visible:ring-0"
                                    )}
                                    onKeyDown={e =>
                                        e.key === "Enter" && handlePhoneSubmit()
                                    }
                                    autoFocus
                                />
                                {voiceEnabled && sttAvailable && micChecked && (
                                    <button
                                        type="button"
                                        aria-label={
                                            isListening
                                                ? "Relâcher pour arrêter l’écoute"
                                                : "Maintenir pour parler"
                                        }
                                        aria-pressed={isListening}
                                        className={cn(
                                            "absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full transition-colors touch-target",
                                            isListening
                                                ? "bg-[#C66A2C]/15 text-[#C66A2C] ring-4 ring-[#C66A2C]/20 animate-pulse"
                                                : "text-muted-foreground hover:bg-background active:bg-[#C66A2C]/10"
                                        )}
                                        onPointerDown={handleVoicePressStart}
                                        onPointerUp={handleVoicePressEnd}
                                        onPointerCancel={handleVoicePressEnd}
                                        onPointerLeave={handleVoicePressEnd}
                                        onKeyDown={event => {
                                            if (
                                                (event.key === "Enter" ||
                                                    event.key === " ") &&
                                                !event.repeat
                                            ) {
                                                event.preventDefault()
                                                voicePressActiveRef.current =
                                                    true
                                                void startListening(true)
                                            }
                                        }}
                                        onKeyUp={event => {
                                            if (
                                                event.key === "Enter" ||
                                                event.key === " "
                                            ) {
                                                event.preventDefault()
                                                handleVoicePressEnd()
                                            }
                                        }}
                                    >
                                        <Mic
                                            className={cn(
                                                "h-5 w-5",
                                                isListening && "animate-pulse"
                                            )}
                                        />
                                    </button>
                                )}
                            </div>
                            {voiceEnabled && (!sttAvailable || !micChecked) && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                                    <MicOff className="w-4 h-4 shrink-0" />
                                    <span>
                                        {!micChecked
                                            ? "Vérification du micro..."
                                            : "Micro non disponible. Utilisez le clavier."}
                                    </span>
                                </div>
                            )}
                            <Button
                                className="w-full h-14 text-base bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                                onClick={handlePhoneSubmit}
                                disabled={phone.length < 8}
                            >
                                Continuer
                            </Button>
                            {error && (
                                <p className="text-destructive text-sm text-center">
                                    {error}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ===== STEP: Account recovery ===== */}
                {step === "recovery" && (
                    <Card
                        className={cn(
                            "border-2 border-[#C66A2C]/20",
                            soleilMode && "shadow-2xl border-[#C66A2C]/40"
                        )}
                    >
                        <CardContent className="p-6 space-y-4">
                            <div className="text-center mb-2">
                                <Fingerprint className="w-10 h-10 mx-auto text-[#C66A2C] mb-2" />
                                <h2
                                    className={cn(
                                        "text-xl font-semibold",
                                        textClass
                                    )}
                                >
                                    Code oublié ?
                                </h2>
                                <p
                                    className={cn(
                                        "text-sm",
                                        textClass,
                                        "opacity-70 mt-1"
                                    )}
                                >
                                    Vérifiez votre identité pour créer un
                                    nouveau code.
                                </p>
                            </div>
                            {biometricAvailable ? (
                                <Button
                                    className="w-full h-14 gap-2 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                                    onClick={handleBiometricRecovery}
                                    disabled={isProcessing}
                                >
                                    <Fingerprint className="w-5 h-5" />
                                    Réinitialiser avec l&apos;empreinte
                                </Button>
                            ) : (
                                <div className="rounded-xl bg-muted p-4 text-center space-y-2">
                                    <p
                                        className={cn(
                                            "text-sm font-medium",
                                            textClass
                                        )}
                                    >
                                        Empreinte non disponible sur cet
                                        appareil.
                                    </p>
                                    <p
                                        className={cn(
                                            "text-xs",
                                            textClass,
                                            "opacity-70"
                                        )}
                                    >
                                        Contactez un agent Jùlaba pour récupérer
                                        votre compte.
                                    </p>
                                </div>
                            )}
                            <Button
                                variant="ghost"
                                className="w-full h-11"
                                onClick={() => {
                                    setMode("login")
                                    modeRef.current = "login"
                                    setStep("login-pin")
                                    stepRef.current = "login-pin"
                                }}
                            >
                                Retour à la connexion
                            </Button>
                            {error && (
                                <p className="text-destructive text-sm text-center">
                                    {error}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ===== STEP: PIN entry / login ===== */}
                {(step === "login-pin" ||
                    step === "confirm" ||
                    step === "recovery-pin" ||
                    step === "recovery-confirm") && (
                    <Card
                        className={cn(
                            "border-2 border-[#C66A2C]/20",
                            soleilMode && "shadow-2xl border-[#C66A2C]/40"
                        )}
                    >
                        <CardContent className="p-4 space-y-3">
                            {roleBadge}
                            {methodPicker}
                            <div className="text-center mb-1">
                                <Shield className="w-8 h-8 mx-auto text-[#C66A2C] mb-1" />
                                <h2
                                    className={cn(
                                        "text-lg font-semibold",
                                        textClass
                                    )}
                                >
                                    {mode === "recovery"
                                        ? confirmPin
                                            ? "Confirmez votre nouveau code"
                                            : "Nouveau code PIN"
                                        : "Entrez votre code"}
                                </h2>
                                <p
                                    className={cn(
                                        "text-xs",
                                        textClass,
                                        "opacity-70 mt-1"
                                    )}
                                >
                                    Code à 4 chiffres
                                </p>
                            </div>
                            {step === "login-pin" && biometricAvailable && (
                                <Button
                                    variant="outline"
                                    className="w-full h-11 gap-2 border-[#C66A2C]/40 text-[#C66A2C]"
                                    onClick={handleBiometricUnlock}
                                    disabled={isProcessing}
                                >
                                    <Fingerprint className="w-5 h-5" />
                                    <span className="font-medium">
                                        Se connecter avec l&apos;empreinte
                                    </span>
                                </Button>
                            )}
                            <div className="flex justify-center gap-2 my-2">
                                {[0, 1, 2, 3].map(i => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-11 h-11 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all",
                                            i < pinDisplay.length
                                                ? "border-[#C66A2C] bg-[#C66A2C]/10 text-[#C66A2C]"
                                                : "border-border",
                                            soleilMode && "w-12 h-12 text-xl"
                                        )}
                                    >
                                        {showPin && i < pin.length
                                            ? pin[i]
                                            : pinDisplay[i] || ""}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowPin(!showPin)}
                                >
                                    {showPin ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                    <Button
                                        key={num}
                                        variant="outline"
                                        className={cn(
                                            "h-12 text-lg font-semibold touch-target",
                                            soleilMode && "text-xl h-14"
                                        )}
                                        onClick={() =>
                                            handlePinDigit(num.toString())
                                        }
                                    >
                                        {num}
                                    </Button>
                                ))}
                                <Button
                                    variant="ghost"
                                    className="h-12 touch-target"
                                    onClick={() => void startListening()}
                                    disabled={
                                        mode === "recovery" ||
                                        !voiceEnabled ||
                                        isListening ||
                                        !sttAvailable ||
                                        !micChecked
                                    }
                                >
                                    {isListening ? (
                                        <Mic className="w-6 h-6 text-[#C66A2C] animate-pulse" />
                                    ) : mode !== "recovery" &&
                                      sttAvailable &&
                                      micChecked ? (
                                        <Mic className="w-6 h-6 text-muted-foreground" />
                                    ) : (
                                        <MicOff className="w-6 h-6 text-muted-foreground/30" />
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "h-12 text-lg font-semibold touch-target",
                                        soleilMode && "text-xl h-14"
                                    )}
                                    onClick={() => handlePinDigit("0")}
                                >
                                    {0}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="h-12 touch-target"
                                    onClick={handleDeletePin}
                                >
                                    <span
                                        className={cn(
                                            "text-sm font-medium",
                                            textClass,
                                            "opacity-60"
                                        )}
                                    >
                                        Effacer
                                    </span>
                                </Button>
                            </div>
                            {step === "confirm" && pinInputMode === "voice" && (
                                <div className="flex gap-2 mt-2">
                                    <Button
                                        className="flex-1 h-12 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => attemptLogin()}
                                        disabled={isProcessing}
                                    >
                                        <Check className="w-4 h-4" /> Oui
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1 h-12 gap-1.5 border-destructive text-destructive"
                                        onClick={() => {
                                            tataSpeak("D'accord, réentrez.")
                                            setPin("")
                                            setPinDisplay([])
                                            setStep("login-pin")
                                        }}
                                    >
                                        <X className="w-4 h-4" /> Non
                                    </Button>
                                </div>
                            )}
                            {step === "login-pin" && (
                                <>
                                    <button
                                        type="button"
                                        className="w-full flex items-center justify-center gap-1.5 text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                                        onClick={goBackToPhone}
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Numéro incorrect ? Modifier le numéro
                                    </button>
                                    {accountRole !== "producteur" && (
                                        <button
                                            type="button"
                                            className="w-full text-center text-sm font-medium text-[#C66A2C] underline-offset-4 hover:underline"
                                            onClick={() => {
                                                setError("")
                                                setStep("recovery")
                                                stepRef.current = "recovery"
                                            }}
                                        >
                                            Code oublié ?
                                        </button>
                                    )}
                                    {accountRole === "producteur" && (
                                        <p className="text-center text-xs text-muted-foreground opacity-70">
                                            Code oublié ? Contactez un agent Jùlaba.
                                        </p>
                                    )}
                                </>
                            )}
                            {error && (
                                <p className="text-destructive text-sm text-center">
                                    {error}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ===== STEP: Pattern Login ===== */}
                {step === "pattern-login" && (
                    <Card
                        className={cn(
                            "border-2 border-[#C66A2C]/20",
                            soleilMode && "shadow-2xl border-[#C66A2C]/40"
                        )}
                    >
                        <CardContent className="p-6 space-y-4">
                            {roleBadge}
                            {methodPicker}
                            <div className="text-center mb-2">
                                <Grid3X3 className="w-10 h-10 mx-auto text-[#C66A2C] mb-2" />
                                <h2
                                    className={cn(
                                        "text-xl font-semibold",
                                        textClass
                                    )}
                                >
                                    Dessinez pour vous connecter
                                </h2>
                                <p
                                    className={cn(
                                        "text-sm",
                                        textClass,
                                        "opacity-70 mt-1"
                                    )}
                                >
                                    Reproduisez votre schéma secret
                                </p>
                            </div>

                            <div className="flex justify-center py-2">
                                <PatternLock
                                    onComplete={handlePatternLogin}
                                    disabled={isProcessing}
                                    error={patternError}
                                    success={patternSuccess}
                                    size={soleilMode ? 290 : 260}
                                />
                            </div>

                            {error && (
                                <p className="text-destructive text-sm text-center">
                                    {error}
                                </p>
                            )}

                            <button
                                type="button"
                                className="w-full flex items-center justify-center gap-1.5 text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                                onClick={goBackToPhone}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Numéro incorrect ? Modifier le numéro
                            </button>
                            {accountRole !== "producteur" && (
                                <button
                                    type="button"
                                    className="w-full text-center text-sm font-medium text-[#C66A2C] underline-offset-4 hover:underline"
                                    onClick={() => {
                                        setError("")
                                        setStep("recovery")
                                        stepRef.current = "recovery"
                                    }}
                                >
                                    Méthode oubliée ?
                                </button>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ===== STEP: Visual Code Login ===== */}
                {step === "visual-login" && (
                    <Card
                        className={cn(
                            "border-2 border-[#C66A2C]/20",
                            soleilMode && "shadow-2xl border-[#C66A2C]/40"
                        )}
                    >
                        <CardContent className="p-6 space-y-4">
                            {roleBadge}
                            {methodPicker}
                            <div className="text-center mb-2">
                                <div className="w-10 h-10 mx-auto text-[#C66A2C] mb-2 flex items-center justify-center">
                                    <ImageIcon className="w-6 h-6" />
                                </div>
                                <h2
                                    className={cn(
                                        "text-xl font-semibold",
                                        textClass
                                    )}
                                >
                                    Retrouvez les 4 images
                                </h2>
                                <p
                                    className={cn(
                                        "text-sm",
                                        textClass,
                                        "opacity-70 mt-1"
                                    )}
                                >
                                    Touchez les images dans le bon ordre
                                </p>
                            </div>

                            <div className="flex justify-center py-2">
                                <VisualCodeGrid
                                    key={step}
                                    onComplete={handleVisualLogin}
                                    disabled={isProcessing}
                                    error={visualError}
                                    success={visualSuccess}
                                    requiredLength={4}
                                    gridSize={3}
                                    soleilMode={soleilMode}
                                />
                            </div>

                            {error && (
                                <p className="text-destructive text-sm text-center">
                                    {error}
                                </p>
                            )}

                            <button
                                type="button"
                                className="w-full flex items-center justify-center gap-1.5 text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                                onClick={goBackToPhone}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Numéro incorrect ? Modifier le numéro
                            </button>
                            {accountRole !== "producteur" && (
                                <button
                                    type="button"
                                    className="w-full text-center text-sm font-medium text-[#C66A2C] underline-offset-4 hover:underline"
                                    onClick={() => {
                                        setError("")
                                        setStep("recovery")
                                        stepRef.current = "recovery"
                                    }}
                                >
                                    Méthode oubliée ?
                                </button>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
