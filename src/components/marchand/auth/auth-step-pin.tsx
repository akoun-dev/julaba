"use client"

/**
 * Étapes PIN de l'auth unifié (ex auth-screen.tsx) — MODE-987 (DET-001
 * tranche 1), extraction SANS changement de comportement : le bloc
 * `isPinStep` (login-pin / confirm / recovery-pin / recovery-confirm) est
 * repris VERBATIM ; l'état et les handlers restent dans auth-screen.tsx.
 */
import {
    ArrowLeft,
    Check,
    Delete,
    Eye,
    EyeOff,
    Fingerprint,
    Mic,
    MicOff,
    X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
    AccountRole,
} from "@/lib/auth-multi"
import type { AuthStep, PinInputMode } from "@/lib/auth-login-flow"

export function AuthPinStep({
    step,
    mode,
    pin,
    pinDisplay,
    confirmPin,
    showPin,
    onToggleShowPin,
    onDigit,
    onDelete,
    biometricAvailable,
    onBiometricUnlock,
    isProcessing,
    voiceEnabled,
    sttAvailable,
    micChecked,
    isListening,
    onStartListening,
    onConfirmLogin,
    onVoiceRetry,
    onBackToPhone,
    accountRole,
    onRecovery,
    error,
    soleilMode,
    pinInputMode,
}: {
    step: AuthStep
    mode: "login" | "recovery"
    pin: string
    pinDisplay: string[]
    confirmPin: string
    showPin: boolean
    onToggleShowPin: () => void
    onDigit: (digit: string) => void
    onDelete: () => void
    biometricAvailable: boolean
    onBiometricUnlock: () => void
    isProcessing: boolean
    voiceEnabled: boolean
    sttAvailable: boolean
    micChecked: boolean
    isListening: boolean
    onStartListening: () => void
    onConfirmLogin: () => void
    onVoiceRetry: () => void
    onBackToPhone: () => void
    accountRole: AccountRole | null
    onRecovery: () => void
    error: string
    soleilMode: boolean
    pinInputMode: PinInputMode
}) {
    return (
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
                                        soleilMode && "text-2xl"
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
                    onClick={onToggleShowPin}
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
                        onClick={() => onDigit(num.toString())}
                        className={cn(
                            "h-16 rounded-2xl border border-[#F0E4D3] bg-card text-xl font-semibold text-[#3D2314] shadow-[0_1px_3px_rgba(122,62,29,0.08)] transition-transform active:scale-95",
                            soleilMode && "text-2xl"
                        )}
                    >
                        {num}
                    </button>
                ))}
                {biometricAvailable && mode !== "recovery" ? (
                    <button
                        type="button"
                        onClick={onBiometricUnlock}
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
                        onClick={onStartListening}
                        disabled={
                            mode === "recovery" ||
                            !voiceEnabled ||
                            isListening ||
                            !sttAvailable ||
                            !micChecked
                        }
                        className={cn(
                            "flex h-16 items-center justify-center rounded-2xl transition-all active:scale-95",
                            // Signature d'écoute unifiée (style vente rapide).
                            isListening &&
                                "shadow-md shadow-[var(--vl-marchand-shadow)] ring-4 ring-[var(--vl-marchand-ring)]"
                        )}
                        aria-label="Dicter le code"
                    >
                        {isListening ? (
                            <Mic className="h-6 w-6 animate-pulse text-[var(--vl-marchand)]" />
                        ) : voiceEnabled && sttAvailable && micChecked ? (
                            <Mic className="h-6 w-6 text-[#8C7B6B]" />
                        ) : (
                            <MicOff className="h-6 w-6 text-[#8C7B6B]/40" />
                        )}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onDigit("0")}
                    className={cn(
                        "h-16 rounded-2xl border border-[#F0E4D3] bg-card text-xl font-semibold text-[#3D2314] shadow-[0_1px_3px_rgba(122,62,29,0.08)] transition-transform active:scale-95",
                        soleilMode && "text-2xl"
                    )}
                >
                    0
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label="Effacer"
                    className="flex h-16 items-center justify-center rounded-2xl text-[#8C7B6B] transition-transform active:scale-95"
                >
                    <Delete className="h-6 w-6" />
                </button>
            </div>

            {step === "confirm" && pinInputMode === "voice" && (
                <div className="mt-2 flex gap-2">
                    <Button
                        className="h-12 flex-1 gap-1.5 rounded-2xl bg-[#2E8B57] text-white hover:bg-[#27754A]"
                        onClick={onConfirmLogin}
                        disabled={isProcessing}
                    >
                        <Check className="h-4 w-4" />{" "}
                        Oui
                    </Button>
                    <Button
                        variant="outline"
                        className="h-12 flex-1 gap-1.5 rounded-2xl border-destructive text-destructive"
                        onClick={onVoiceRetry}
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
                        onClick={onBackToPhone}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Numéro incorrect ? Modifier le
                        numéro
                    </button>
                    {accountRole === "marchand" && (
                        <button
                            type="button"
                            className="w-full text-center text-sm font-semibold text-[#B4531F] underline-offset-4 hover:underline"
                            onClick={onRecovery}
                        >
                            Code oublié ?
                        </button>
                    )}
                    {accountRole !== "marchand" && (
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
    )
}
