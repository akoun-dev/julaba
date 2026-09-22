"use client"

"use client"

import { useState, useEffect, useRef } from "react"
import { Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/stores/app-store"
import { tataSpeak, tataStop } from "@/lib/voice/tata-tts"
import { isBiometricUnlockAvailable } from "@/lib/biometric-auth"
import { type AccountRole } from "@/lib/auth-multi"
import {
    instructionFor,
    VISUAL_LOGIN_LENGTH,
    type AuthMethod,
    type AuthStep,
    type PinInputMode,
} from "@/lib/auth-login-flow"
import type { AuthFlowContext } from "@/lib/auth-flow-context"
import {
    submitPhoneFlow,
    routeToLoginStepFlow,
    goBackToPhoneFlow,
} from "@/lib/auth-phone-flows"
import {
    doLoginFlow,
    biometricUnlockFlow,
    biometricRecoveryFlow,
    attemptLoginFlow,
    handlePinDigitFlow,
    handleDeletePinFlow,
    handleVoiceResultFlow,
} from "@/lib/auth-code-flows"
import {
    verifyPatternFlow,
    verifyVisualFlow,
} from "@/lib/auth-credential-flows"
import { useAuthVoice } from "@/components/marchand/auth/use-auth-voice"
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

    const [biometricAvailable, setBiometricAvailable] = useState(false)


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

    // --- Voix : routage du dicté par étape + infrastructure STT extraite
    // (sonde micro, modèle Sherpa, session single-shot : use-auth-voice) —
    // le contexte des flux est référencé à l'appel, jamais à la définition.
    const handleVoiceResult = (transcript: string) =>
        handleVoiceResultFlow(flowCtx, transcript)
    const {
        sttAvailable,
        micChecked,
        isListening,
        startListening,
        stopListening,
        toggleListening,
    } = useAuthVoice({ voiceEnabled, setError, handleVoiceResult })

    // --- Contexte des flux (recréé à chaque rendu : mêmes closures que
    // l'original, où les callbacks lisaient l'état du rendu courant) ---
    const flowCtx: AuthFlowContext = {
        phone,
        pin,
        pinDisplay,
        mode,
        confirmPin,
        stepRef,
        modeRef,
        phoneRef,
        pinRef,
        firstNameRef,
        accountRoleRef,
        pinInputModeRef,
        voiceAttemptsRef,
        setPhone,
        setError,
        setIsProcessing,
        setMode,
        setAccountRole,
        setFirstName,
        setAvailableMethods,
        setAuthMethod,
        setStep,
        setPin,
        setPinDisplay,
        setConfirmPin,
        setPinInputMode,
        setVoiceAttempts,
        setPatternSuccess,
        setPatternError,
        setVisualSuccess,
        setVisualError,
        setAuth,
        setUserRole,
        doLogin: (phoneVal, nameVal, role, merchantId, sexe, categorie) =>
            doLoginFlow(flowCtx, phoneVal, nameVal, role, merchantId, sexe, categorie),
    }

    // --- Flux extraits — wrappers de mêmes noms que l'original : le JSX
    // du render reste inchangé, les corps vivent dans les modules flows.
    const handlePhoneSubmit = () => submitPhoneFlow(flowCtx, phone)
    const handleBiometricUnlock = () => biometricUnlockFlow(flowCtx)
    const handleBiometricRecovery = () => biometricRecoveryFlow(flowCtx)
    const handlePinDigit = (digit: string) => handlePinDigitFlow(flowCtx, digit)
    const handleDeletePin = () => handleDeletePinFlow(flowCtx)
    const handlePatternLogin = (pattern: number[]) => verifyPatternFlow(flowCtx, pattern)
    const handleVisualLogin = (sequence: string[]) => verifyVisualFlow(flowCtx, sequence)
    const goBackToPhone = () => goBackToPhoneFlow(flowCtx)
    const routeToLoginStep = (method: AuthMethod, name: string) =>
        routeToLoginStepFlow(flowCtx, method, name)
    const attemptLogin = (pinValue?: string) => attemptLoginFlow(flowCtx, pinValue)


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
