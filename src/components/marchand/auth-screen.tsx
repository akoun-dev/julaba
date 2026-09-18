"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
    ArrowLeft,
    ArrowRight,
    Eye,
    EyeOff,
    Mic,
    MicOff,
    Fingerprint,
    Check,
    X,
    Wheat,
    Store,
    Hash,
    Waypoints,
    Shapes,
    Delete,
    Headphones,
    BadgeCheck,
    Lock,
    LockOpen,
    Eraser,
    ShieldCheck,
    Volume2,
    Play,
    ShoppingCart,
    LifeBuoy,
    RotateCcw,
    ClipboardList,
    Monitor,
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
    createSmartSingleShotSTT,
    describeSTTError,
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

// Design auth (maquettes) : le code symboles est une suite de 3 — aligné
// avec l'enrôlement identificateur (voir ident-identification-screen).
const VISUAL_LOGIN_LENGTH = 3

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
    if (data.pinHash) await savePinHash(keys.pin, data.pinHash).catch(() => {})
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
            authMethods: (data.authMethods?.length
                ? data.authMethods
                : [data.authMethod]) as AuthMethod[],
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
): Promise<
    | {
          id: string
          firstName: string
          sexe?: "masculin" | "feminin" | "autre" | null
          categorie?: "detaillant" | "semi_grossiste" | "grossiste" | null
      }
    | { serverError: string }
    | null
> => {
    try {
        const res = await fetch(
            role === "producteur"
                ? "/api/producteur/login"
                : "/api/merchant/login",
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

    // Affichage du numéro en paires (« 07 08 45 12 ») — maquette première
    // vue. La soumission reste normalisée par normalizeAuthPhone (les
    // espaces sont retirés) ; 10 chiffres max (numéro ivoirien).
    const formatPhoneDisplay = (value: string) =>
        value
            .replace(/\D/g, "")
            .slice(0, 10)
            .replace(/(\d{2})(?=\d)/g, "$1 ")
    const phoneDigits = phone.replace(/\D/g, "")

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
                    hash,
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
                hash,
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
            const payload = {
                phone: stored.phone,
                authMethod: "pin",
                pinHash: newHash,
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

    // ----- Design auth « terre » (maquettes) : shell profil + onglets + Tata -----
    const isPinStep =
        step === "login-pin" ||
        step === "confirm" ||
        step === "recovery-pin" ||
        step === "recovery-confirm"

    // Instruction vocale rejouable via le bouton « Écouter » de la carte Tata.
    const instructionFor = (s: AuthStep): string => {
        if (s === "name") return "Entrez ou dites votre numéro de téléphone."
        if (s === "confirm")
            return "Votre code est-il correct ? Dites oui ou non."
        if (s === "recovery")
            return "Vérifiez votre identité pour créer un nouveau code."
        if (s === "recovery-pin")
            return "Créez votre nouveau code secret à 4 chiffres."
        if (s === "recovery-confirm")
            return "Confirmez votre nouveau code secret."
        if (s === "pattern-login") return "Dessinez votre schéma secret."
        if (s === "visual-login") return "Touchez vos symboles dans l'ordre."
        return "Tapez votre code secret à 4 chiffres."
    }

    const initials = (firstName || "?")
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w.charAt(0).toUpperCase())
        .join("")

    // Onglets de méthode — seules les méthodes réellement disponibles pour
    // le compte sont proposées.
    const METHOD_TABS: {
        method: AuthMethod
        label: string
        Icon: typeof Hash
    }[] = [
        { method: "pin", label: "Code PIN", Icon: Hash },
        { method: "pattern", label: "Schéma", Icon: Waypoints },
        { method: "visual", label: "Symboles", Icon: Shapes },
    ]
    const visibleTabs = METHOD_TABS.filter(t =>
        availableMethods.includes(t.method)
    )

    // En-tête profil (maquette) : avatar initiales, nom vérifié, téléphone,
    // pastille d'espace détecté (marché ou récoltes).
    const profileHeader = firstName ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/70 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7A3E1D] text-sm font-bold text-white">
                {initials}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p
                        className={cn(
                            "truncate text-sm font-bold text-[#3D2314]",
                            soleilMode && "text-base text-black"
                        )}
                    >
                        {firstName}
                    </p>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-[#BC5A2E]" />
                </div>
                <p className="truncate text-xs text-[#8C7B6B]">{phone}</p>
            </div>
            {accountRole && (
                <span
                    className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        accountRole === "producteur"
                            ? "bg-[#2E8B57]/10 text-[#2E8B57]"
                            : "bg-[#BC5A2E]/10 text-[#BC5A2E]"
                    )}
                >
                    {accountRole === "producteur" ? (
                        <Wheat className="h-3 w-3" />
                    ) : (
                        <Store className="h-3 w-3" />
                    )}
                    {accountRole === "producteur" ? "Producteur" : "Marchand"}
                </span>
            )}
        </div>
    ) : null

    // Segmented control des méthodes — masqué pendant la récupération de code.
    const tabsNav =
        visibleTabs.length > 1 && mode !== "recovery" ? (
            <div
                className="mb-3 grid gap-1 rounded-2xl bg-[#F3E9DC] p-1.5"
                style={{
                    gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
                }}
            >
                {visibleTabs.map(({ method, label, Icon }) => {
                    const active = authMethod === method
                    return (
                        <button
                            key={method}
                            type="button"
                            onClick={() => routeToLoginStep(method, firstName)}
                            aria-pressed={active}
                            className={cn(
                                "flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all",
                                active
                                    ? "bg-white text-[#7A3E1D] shadow-[0_1px_3px_rgba(122,62,29,0.15)]"
                                    : "text-[#8C7B6B]"
                            )}
                        >
                            <Icon
                                className={cn(
                                    "h-4 w-4",
                                    active && "text-[#BC5A2E]"
                                )}
                            />
                            {label}
                        </button>
                    )
                })}
            </div>
        ) : null

    // Carte Assistance Vocale Tata — « Écouter » rejoue l'instruction de
    // l'étape courante (même voix offline que le reste du flux).
    const tataCard = (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#F0E4D3] bg-white p-3 shadow-[0_1px_3px_rgba(122,62,29,0.05)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C66A2C]/15">
                <Headphones className="h-5 w-5 text-[#C66A2C]" />
            </div>
            <div className="min-w-0 flex-1">
                <p
                    className={cn(
                        "whitespace-nowrap text-[13px] font-bold text-[#3D2314]",
                        soleilMode && "text-base text-black"
                    )}
                >
                    Assistance Vocale Tata
                </p>
                <p className="text-xs text-[#8C7B6B]">Français • Baoulé</p>
            </div>
            <button
                type="button"
                onClick={() => {
                    tataStop()
                    tataSpeak(instructionFor(step))
                }}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#F6E7D8] px-3 text-[11px] font-semibold text-[#B4531F] transition-transform active:scale-95"
            >
                <Play className="h-4 w-4 fill-current" />
                Écouter
            </button>
        </div>
    )

    // CTA brun des écrans schéma/symboles (maquette « Ouvrir ma caisse »).
    const openCaisseCta = (onClick: () => void, disabled: boolean) => (
        <Button
            className="h-14 w-full gap-2 rounded-2xl bg-[#7A3E1D] text-base text-white shadow-lg shadow-[#7A3E1D]/25 hover:bg-[#6B3517]"
            onClick={onClick}
            disabled={disabled}
        >
            Ouvrir ma caisse Jùlaba
            <ArrowRight className="h-5 w-5" />
        </Button>
    )

    // Section d'aide des écrans schéma/symboles (maquette « Problème… ») :
    // bascule vers le PIN quand le compte en possède un, sinon récupération.
    const helpSection = (label: string) => (
        <div className="mt-2 rounded-2xl border border-[#F0E4D3] bg-white/80 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#7A4A2B]">
                <LifeBuoy className="h-3.5 w-3.5 text-[#BC5A2E]" />
                {label}
            </p>
            <div className="flex flex-wrap gap-2">
                {availableMethods.includes("pin") && authMethod !== "pin" && (
                    <button
                        type="button"
                        onClick={() => routeToLoginStep("pin", firstName)}
                        className="flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-white px-3 py-1.5 text-xs font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40"
                    >
                        <Hash className="h-3.5 w-3.5" />
                        Entrer le code PIN
                    </button>
                )}
                {accountRole !== "producteur" ? (
                    <button
                        type="button"
                        onClick={() => {
                            setError("")
                            setStep("recovery")
                            stepRef.current = "recovery"
                        }}
                        className="flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-white px-3 py-1.5 text-xs font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Code oublié ?
                    </button>
                ) : (
                    <span className="flex items-center text-xs text-[#8C7B6B]">
                        Code oublié ? Contactez un agent Jùlaba.
                    </span>
                )}
            </div>
        </div>
    )

    // Pied de page sécurité (maquette).
    const securityFooter = (
        <div className="mt-5 flex items-start justify-center gap-2 px-2 text-center">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#BC5A2E]" />
            <div>
                <p className="text-xs font-bold text-[#7A4A2B]">
                    Garanti sans commission cachée • Sécurité UEMOA
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#8C7B6B]">
                    Vos transactions journalières et votre tontine sont
                    protégées sous code sécurisé Jùlaba.
                </p>
            </div>
        </div>
    )

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
                <div className="mb-5 flex items-center justify-between gap-2">
                    {step === "name" ? (
                        <div className="flex items-center gap-1.5 rounded-full bg-[#2D1B0E] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/90 shadow-sm">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E8833A]" />
                            Mode marché actif
                        </div>
                    ) : (
                        <span aria-hidden />
                    )}
                    <div className="flex items-center gap-2">
                        {step === "name" && voiceEnabled && (
                            <button
                                type="button"
                                onClick={() => {
                                    tataStop()
                                    tataSpeak(instructionFor("name"))
                                }}
                                className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-bold text-[#3D2314] shadow-[0_1px_4px_rgba(122,62,29,0.12)] transition-transform active:scale-95"
                            >
                                <Volume2 className="h-4 w-4 text-[#C66A2C]" />
                                Aide vocale
                            </button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Choisir un rôle"
                                    className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#2D1B0E] px-3 text-xs font-bold tracking-wide text-white shadow-sm transition-transform duration-150 ease-out hover:bg-[#55311C] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BC5A2E] focus-visible:ring-offset-2"
                                >
                                    &lt;&gt;
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="min-w-48"
                            >
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
                                        useAppStore
                                            .getState()
                                            .navigate("bo-auth")
                                    }}
                                    className="gap-2 py-2.5"
                                >
                                    <Monitor className="h-4 w-4 text-[#3D2314]" />
                                    <span>BackOffice</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* ===== STEP: Name / Phone — maquette « Connexion à votre espace » ===== */}
                {step === "name" && (
                    <>
                        {/* Héros : avatar cerclé d'orange, badge caisse, titre */}
                        <div className="mb-5 text-center">
                            <div className="relative mx-auto mb-3 h-24 w-24">
                                <div className="h-full w-full overflow-hidden rounded-full bg-white p-1.5 shadow-[0_6px_20px_rgba(122,62,29,0.18)] ring-[3px] ring-[#D2622A]">
                                    <img
                                        src="/icon-only.png"
                                        alt="Jùlaba"
                                        className="h-full w-full rounded-full object-contain"
                                    />
                                </div>
                            </div>
                            <h1
                                className={cn(
                                    "text-4xl font-extrabold tracking-tight text-[#241509]",
                                    soleilMode && "text-3xl text-black"
                                )}
                            >
                                Jùlaba
                            </h1>
                            <div className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-[#5C4A3A] shadow-sm">
                                <ShoppingCart className="h-3.5 w-3.5 text-[#D2622A]" />
                                Caisse autonome &amp; 100% hors-ligne
                            </div>
                        </div>

                        {/* Carte Connexion à votre espace */}
                        <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_40px_rgba(122,62,29,0.12)]">
                            <CardContent className="space-y-4 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2
                                            className={cn(
                                                "text-lg font-bold text-[#241509]",
                                                soleilMode && "text-black"
                                            )}
                                        >
                                            Connexion à votre espace
                                        </h2>
                                        <p className="mt-0.5 text-sm text-[#8C7B6B]">
                                            Ouvrez votre caisse quotidienne
                                        </p>
                                    </div>
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#D2691E] to-[#C05621] text-white shadow-sm">
                                        <Lock className="h-4 w-4" />
                                    </div>
                                </div>

                                <div>
                                    <label
                                        htmlFor="auth-phone"
                                        className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5C4A3A]"
                                    >
                                        Numéro de téléphone
                                    </label>
                                    <div className="flex items-center gap-2 rounded-full border-2 border-[#D2622A] bg-white py-1.5 pl-2 pr-1.5 shadow-sm transition-shadow focus-within:ring-4 focus-within:ring-[#D2622A]/15">
                                        <Input
                                            id="auth-phone"
                                            type="tel"
                                            inputMode="numeric"
                                            placeholder="Ex : 07 07 08 45 12"
                                            value={phone}
                                            onChange={e =>
                                                setPhone(
                                                    formatPhoneDisplay(
                                                        e.target.value
                                                    )
                                                )
                                            }
                                            className={cn(
                                                "h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-lg font-bold tracking-[0.12em] text-[#241509] placeholder:font-medium placeholder:tracking-normal placeholder:text-[#B3A493]",
                                                soleilMode && "text-xl",
                                                "focus-visible:ring-0"
                                            )}
                                            onKeyDown={e =>
                                                e.key === "Enter" &&
                                                handlePhoneSubmit()
                                            }
                                            autoFocus
                                        />
                                        {voiceEnabled &&
                                            sttAvailable &&
                                            micChecked && (
                                                <button
                                                    type="button"
                                                    aria-label={
                                                        isListening
                                                            ? "Arrêter l'écoute"
                                                            : "Cliquer pour dicter"
                                                    }
                                                    aria-pressed={isListening}
                                                    className={cn(
                                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D2622A] text-white shadow-md transition-all touch-target",
                                                        isListening &&
                                                            "animate-pulse ring-4 ring-[#D2622A]/25"
                                                    )}
                                                    onClick={toggleListening}
                                                >
                                                    <Mic
                                                        className={cn(
                                                            "h-5 w-5",
                                                            isListening &&
                                                                "animate-pulse"
                                                        )}
                                                    />
                                                </button>
                                            )}
                                    </div>
                                </div>
                                {voiceEnabled &&
                                    (!sttAvailable || !micChecked) && (
                                        <div className="flex items-center gap-2 rounded-2xl bg-[#FBE3D0]/70 p-3 text-xs text-[#8C7B6B]">
                                            <MicOff className="h-4 w-4 shrink-0 text-[#C66A2C]" />
                                            <span>
                                                {!micChecked
                                                    ? "Vérification du micro..."
                                                    : "Micro non disponible. Utilisez le clavier."}
                                            </span>
                                        </div>
                                    )}
                                <Button
                                    className="h-14 w-full gap-2 rounded-2xl bg-gradient-to-b from-[#D2691E] to-[#C05621] text-base font-bold text-white shadow-lg shadow-[#C05621]/30 transition-transform active:scale-[0.98]"
                                    onClick={handlePhoneSubmit}
                                    disabled={phoneDigits.length < 8}
                                >
                                    Continuer
                                    <ArrowRight className="h-5 w-5" />
                                </Button>
                                {error && (
                                    <p className="text-center text-sm font-medium text-destructive">
                                        {error}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Assistance vocale Tata (carte partagée du flux) */}
                        <div className="mt-4">{tataCard}</div>

                        {/* Nouvel étal — orientation enregistrement (Tata explique) */}
                        <button
                            type="button"
                            onClick={() => {
                                if (voiceEnabled) {
                                    tataStop()
                                    tataSpeak(
                                        "Pour créer un nouvel étal, présentez-vous auprès du délégué de votre marché."
                                    )
                                }
                            }}
                            className="mt-1 flex w-full items-center justify-center gap-1.5 text-center text-[13px] text-[#5C4A3A] transition-colors hover:text-[#7A4A2B]"
                        >
                            <ShoppingCart className="h-4 w-4 shrink-0 text-[#D2622A]" />
                            <span>
                                Nouvel étal ?{" "}
                                <span className="font-bold text-[#D2622A]">
                                    S&apos;enregistrer auprès du délégué
                                </span>
                            </span>
                        </button>

                        {/* Barre d'écoute sombre — dictée du numéro en cours */}
                        {isListening && (
                            <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-[#2A1608] p-3 shadow-2xl">
                                <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-[#D2622A] text-white">
                                    <Mic className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white">
                                        Tata vous écoute...
                                    </p>
                                    <p className="truncate text-xs text-white/60">
                                        Dites votre numéro chiffre par chiffre à
                                        voix haute
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Arrêter l'écoute"
                                    onClick={stopListening}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ===== Shell connexion : profil + onglets + Tata + contenu =====
                    (toutes les étapes de saisie du code, recovery PIN inclus) */}
                {step !== "name" && step !== "recovery" && (
                    <>
                        {profileHeader}
                        {tabsNav}
                        {tataCard}

                        {/* ----- Code PIN ----- */}
                        {isPinStep && (
                            <div className="space-y-3">
                                <div className="text-center">
                                    <h2
                                        className={cn(
                                            "text-xl font-bold text-[#3D2314]",
                                            soleilMode && "text-2xl text-black"
                                        )}
                                    >
                                        {mode === "recovery"
                                            ? confirmPin
                                                ? "Confirmez votre nouveau code"
                                                : "Créez votre nouveau code"
                                            : "Tapez votre code secret"}
                                    </h2>
                                    <p className="mt-1 text-xs text-[#8C7B6B]">
                                        Code confidentiel à 4 chiffres
                                    </p>
                                </div>

                                <div className="my-3 flex items-center justify-center gap-4">
                                    {[0, 1, 2, 3].map(i => {
                                        const filled = i < pinDisplay.length
                                        return (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "flex h-11 w-11 items-center justify-center rounded-full",
                                                    soleilMode && "h-12 w-12"
                                                )}
                                            >
                                                {showPin && i < pin.length ? (
                                                    <span
                                                        className={cn(
                                                            "text-xl font-bold text-[#3D2314]",
                                                            soleilMode &&
                                                                "text-2xl"
                                                        )}
                                                    >
                                                        {pin[i]}
                                                    </span>
                                                ) : (
                                                    <div
                                                        className={cn(
                                                            "rounded-full transition-all",
                                                            filled
                                                                ? "h-4 w-4 bg-[#7A3E1D]"
                                                                : "h-3.5 w-3.5 bg-[#E9DCC9]"
                                                        )}
                                                    />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowPin(!showPin)}
                                        className="flex items-center gap-1.5 text-sm font-medium text-[#8C7B6B] transition-colors hover:text-[#B4531F]"
                                    >
                                        {showPin ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                        {showPin
                                            ? "Masquer le code"
                                            : "Afficher le code"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-2.5">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() =>
                                                handlePinDigit(num.toString())
                                            }
                                            className={cn(
                                                "h-16 rounded-2xl border border-[#F0E4D3] bg-white text-xl font-semibold text-[#3D2314] shadow-[0_1px_3px_rgba(122,62,29,0.08)] transition-transform active:scale-95",
                                                soleilMode && "text-2xl"
                                            )}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                    {biometricAvailable &&
                                    mode !== "recovery" ? (
                                        <button
                                            type="button"
                                            onClick={handleBiometricUnlock}
                                            disabled={isProcessing}
                                            className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#F6E7D8] text-[#B4531F] transition-transform active:scale-95"
                                        >
                                            <Fingerprint className="h-6 w-6" />
                                            <span className="text-[10px] font-semibold">
                                                Empreinte
                                            </span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void startListening()
                                            }
                                            disabled={
                                                mode === "recovery" ||
                                                !voiceEnabled ||
                                                isListening ||
                                                !sttAvailable ||
                                                !micChecked
                                            }
                                            className="flex h-16 items-center justify-center rounded-2xl transition-transform active:scale-95"
                                            aria-label="Dicter le code"
                                        >
                                            {isListening ? (
                                                <Mic className="h-6 w-6 animate-pulse text-[#BC5A2E]" />
                                            ) : voiceEnabled &&
                                              sttAvailable &&
                                              micChecked ? (
                                                <Mic className="h-6 w-6 text-[#8C7B6B]" />
                                            ) : (
                                                <MicOff className="h-6 w-6 text-[#8C7B6B]/40" />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handlePinDigit("0")}
                                        className={cn(
                                            "h-16 rounded-2xl border border-[#F0E4D3] bg-white text-xl font-semibold text-[#3D2314] shadow-[0_1px_3px_rgba(122,62,29,0.08)] transition-transform active:scale-95",
                                            soleilMode && "text-2xl"
                                        )}
                                    >
                                        0
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeletePin}
                                        aria-label="Effacer"
                                        className="flex h-16 items-center justify-center rounded-2xl text-[#8C7B6B] transition-transform active:scale-95"
                                    >
                                        <Delete className="h-6 w-6" />
                                    </button>
                                </div>

                                {step === "confirm" &&
                                    pinInputMode === "voice" && (
                                        <div className="mt-2 flex gap-2">
                                            <Button
                                                className="h-12 flex-1 gap-1.5 rounded-2xl bg-[#2E8B57] text-white hover:bg-[#27754A]"
                                                onClick={() => attemptLogin()}
                                                disabled={isProcessing}
                                            >
                                                <Check className="h-4 w-4" />{" "}
                                                Oui
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="h-12 flex-1 gap-1.5 rounded-2xl border-destructive text-destructive"
                                                onClick={() => {
                                                    tataSpeak(
                                                        "D'accord, réentrez."
                                                    )
                                                    setPin("")
                                                    setPinDisplay([])
                                                    setStep("login-pin")
                                                }}
                                            >
                                                <X className="h-4 w-4" /> Non
                                            </Button>
                                        </div>
                                    )}

                                {step === "login-pin" && (
                                    <div className="mt-1 space-y-1.5 text-center">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-[#8C7B6B] underline-offset-4 hover:underline"
                                            onClick={goBackToPhone}
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                            Numéro incorrect ? Modifier le
                                            numéro
                                        </button>
                                        {accountRole !== "producteur" && (
                                            <button
                                                type="button"
                                                className="w-full text-center text-sm font-semibold text-[#B4531F] underline-offset-4 hover:underline"
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
                                            <p className="text-center text-xs text-[#8C7B6B] opacity-70">
                                                Code oublié ? Contactez un agent
                                                Jùlaba.
                                            </p>
                                        )}
                                    </div>
                                )}
                                {error && (
                                    <p className="text-center text-sm text-destructive">
                                        {error}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ----- Schéma ----- */}
                        {step === "pattern-login" && (
                            <div className="space-y-3">
                                <div className="flex justify-center">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F6E7D8] px-3 py-1 text-[11px] font-semibold text-[#7A4A2B]">
                                        <LockOpen className="h-3.5 w-3.5" />
                                        Déverrouillage Caisse
                                    </span>
                                </div>
                                <div className="text-center">
                                    <h2
                                        className={cn(
                                            "text-xl font-bold text-[#3D2314]",
                                            soleilMode && "text-2xl text-black"
                                        )}
                                    >
                                        Dessinez votre schéma secret
                                    </h2>
                                    <p className="mt-1 text-xs text-[#8C7B6B]">
                                        Reliez au moins 4 points en glissant
                                        votre doigt.
                                    </p>
                                </div>

                                <div className="flex justify-center py-1">
                                    <PatternLock
                                        key={patternResetKey}
                                        onComplete={handlePatternLogin}
                                        submitOnRelease={false}
                                        onChange={setPatternSelection}
                                        disabled={isProcessing}
                                        error={patternError}
                                        success={patternSuccess}
                                        size={soleilMode ? 290 : 260}
                                    />
                                </div>

                                <div className="flex items-center justify-center gap-3">
                                    <span
                                        className={cn(
                                            "flex items-center gap-1 text-xs font-semibold",
                                            patternSelection.length >= 4
                                                ? "text-[#2E8B57]"
                                                : "text-[#8C7B6B]"
                                        )}
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                        {patternSelection.length} points reliés
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPatternSelection([])
                                            setPatternResetKey(k => k + 1)
                                        }}
                                        className="flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-white px-3 py-1.5 text-xs font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40"
                                    >
                                        <Eraser className="h-3.5 w-3.5" />
                                        Effacer le tracé
                                    </button>
                                </div>

                                {openCaisseCta(
                                    handlePatternSubmit,
                                    patternSelection.length < 4 || isProcessing
                                )}

                                {error && (
                                    <p className="text-center text-sm text-destructive">
                                        {error}
                                    </p>
                                )}

                                {helpSection("Problème avec votre schéma ?")}

                                <button
                                    type="button"
                                    className="flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-[#8C7B6B] underline-offset-4 hover:underline"
                                    onClick={goBackToPhone}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Numéro incorrect ? Modifier le numéro
                                </button>
                            </div>
                        )}

                        {/* ----- Symboles ----- */}
                        {step === "visual-login" && (
                            <div className="space-y-3">
                                <div className="flex justify-center">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F6E7D8] px-3 py-1 text-[11px] font-semibold text-[#7A4A2B]">
                                        <LockOpen className="h-3.5 w-3.5" />
                                        Déverrouillage Caisse
                                    </span>
                                </div>
                                <div className="text-center">
                                    <h2
                                        className={cn(
                                            "text-xl font-bold text-[#3D2314]",
                                            soleilMode && "text-2xl text-black"
                                        )}
                                    >
                                        Touchez vos symboles
                                    </h2>
                                    <p className="mt-1 text-xs text-[#8C7B6B]">
                                        Composez votre suite secrète (
                                        {VISUAL_LOGIN_LENGTH} symboles requis)
                                    </p>
                                </div>

                                <div className="flex justify-center py-1">
                                    <VisualCodeGrid
                                        key={`visual-${visualResetKey}`}
                                        onComplete={handleVisualLogin}
                                        autoSubmit={false}
                                        onChange={setVisualSelection}
                                        disabled={isProcessing}
                                        error={visualError}
                                        success={visualSuccess}
                                        requiredLength={VISUAL_LOGIN_LENGTH}
                                        gridSize={3}
                                        soleilMode={soleilMode}
                                    />
                                </div>

                                {openCaisseCta(
                                    handleVisualSubmit,
                                    visualSelection.length <
                                        VISUAL_LOGIN_LENGTH || isProcessing
                                )}

                                {error && (
                                    <p className="text-center text-sm text-destructive">
                                        {error}
                                    </p>
                                )}

                                {helpSection("Problème de symboles ?")}

                                <button
                                    type="button"
                                    className="flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-[#8C7B6B] underline-offset-4 hover:underline"
                                    onClick={goBackToPhone}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Numéro incorrect ? Modifier le numéro
                                </button>
                            </div>
                        )}

                        {securityFooter}
                    </>
                )}

                {/* ===== STEP: Account recovery ===== */}
                {step === "recovery" && (
                    <Card className="rounded-3xl border-2 border-[#F0E4D3] shadow-[0_2px_12px_rgba(122,62,29,0.06)]">
                        <CardContent className="space-y-4 p-6">
                            <div className="mb-2 text-center">
                                <Fingerprint className="mx-auto mb-2 h-10 w-10 text-[#C66A2C]" />
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
                                        "mt-1 text-sm",
                                        textClass,
                                        "opacity-70"
                                    )}
                                >
                                    Vérifiez votre identité pour créer un
                                    nouveau code.
                                </p>
                            </div>
                            {biometricAvailable ? (
                                <Button
                                    className="h-14 w-full gap-2 rounded-2xl bg-[#7A3E1D] text-white shadow-lg shadow-[#7A3E1D]/25 hover:bg-[#6B3517]"
                                    onClick={handleBiometricRecovery}
                                    disabled={isProcessing}
                                >
                                    <Fingerprint className="h-5 w-5" />
                                    Réinitialiser avec l&apos;empreinte
                                </Button>
                            ) : (
                                <div className="space-y-2 rounded-2xl bg-[#F6E7D8]/60 p-4 text-center">
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
                                className="h-11 w-full"
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
                                <p className="text-center text-sm text-destructive">
                                    {error}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
