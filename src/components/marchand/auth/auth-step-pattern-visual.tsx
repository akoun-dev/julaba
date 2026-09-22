"use client"

/**
 * Étapes « schéma » et « symboles » de l'auth unifié (ex auth-screen.tsx)
 * — MODE-987 (DET-001 tranche 1), extraction SANS changement de
 * comportement : JSX repris VERBATIM (puce Déverrouillage Caisse, verrous
 * PatternLock/VisualCodeGrid en mode contrôlé, CTA, aide, retour numéro) ;
 * l'état et les handlers restent dans auth-screen.tsx.
 */
import { ArrowLeft, Check, Eraser, LockOpen } from "lucide-react"
import { PatternLock } from "@/components/marchand/pattern-lock"
import {
    VisualCodeGrid,
} from "@/components/marchand/visual-code-grid"
import { cn } from "@/lib/utils"
import { VISUAL_LOGIN_LENGTH } from "@/lib/auth-login-flow"
import {
    AuthHelpSection,
    AuthOpenCaisseCta,
} from "./auth-parts"

// Props d'aide partagées des écrans schéma/symboles (les gardes
// d'affichage sont calculées par le parent, exactement comme l'original).
export interface AuthHelpProps {
    canUsePin: boolean
    isMerchant: boolean
    onPin: () => void
    onRecovery: () => void
}

export function AuthPatternStep({
    patternSelection,
    onChangeSelection,
    onErase,
    patternResetKey,
    onComplete,
    isProcessing,
    patternError,
    patternSuccess,
    onSubmit,
    error,
    onBackToPhone,
    soleilMode,
    help,
}: {
    patternSelection: number[]
    onChangeSelection: (selection: number[]) => void
    onErase: () => void
    patternResetKey: number
    onComplete: (pattern: number[]) => void
    isProcessing: boolean
    patternError: boolean
    patternSuccess: boolean
    onSubmit: () => void
    error: string
    onBackToPhone: () => void
    soleilMode: boolean
    help: AuthHelpProps
}) {
    return (
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
                    onComplete={onComplete}
                    submitOnRelease={false}
                    onChange={onChangeSelection}
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
                    onClick={onErase}
                    className="flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-card px-3 py-1.5 text-xs font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40"
                >
                    <Eraser className="h-3.5 w-3.5" />
                    Effacer le tracé
                </button>
            </div>

            <AuthOpenCaisseCta
                onClick={onSubmit}
                disabled={patternSelection.length < 4 || isProcessing}
            />

            {error && (
                <p className="text-center text-sm text-destructive">
                    {error}
                </p>
            )}

            <AuthHelpSection
                label="Problème avec votre schéma ?"
                canUsePin={help.canUsePin}
                isMerchant={help.isMerchant}
                onPin={help.onPin}
                onRecovery={help.onRecovery}
            />

            <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-[#8C7B6B] underline-offset-4 hover:underline"
                onClick={onBackToPhone}
            >
                <ArrowLeft className="h-4 w-4" />
                Numéro incorrect ? Modifier le numéro
            </button>
        </div>
    )
}

export function AuthVisualStep({
    visualSelection,
    onChangeSelection,
    visualResetKey,
    onComplete,
    isProcessing,
    visualError,
    visualSuccess,
    onSubmit,
    error,
    onBackToPhone,
    soleilMode,
    help,
}: {
    visualSelection: string[]
    onChangeSelection: (selection: string[]) => void
    visualResetKey: number
    onComplete: (sequence: string[]) => void
    isProcessing: boolean
    visualError: boolean
    visualSuccess: boolean
    onSubmit: () => void
    error: string
    onBackToPhone: () => void
    soleilMode: boolean
    help: AuthHelpProps
}) {
    return (
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
                    onComplete={onComplete}
                    autoSubmit={false}
                    onChange={onChangeSelection}
                    disabled={isProcessing}
                    error={visualError}
                    success={visualSuccess}
                    requiredLength={VISUAL_LOGIN_LENGTH}
                    gridSize={3}
                    soleilMode={soleilMode}
                />
            </div>

            <AuthOpenCaisseCta
                onClick={onSubmit}
                disabled={
                    visualSelection.length < VISUAL_LOGIN_LENGTH || isProcessing
                }
            />

            {error && (
                <p className="text-center text-sm text-destructive">
                    {error}
                </p>
            )}

            <AuthHelpSection
                label="Problème de symboles ?"
                canUsePin={help.canUsePin}
                isMerchant={help.isMerchant}
                onPin={help.onPin}
                onRecovery={help.onRecovery}
            />

            <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-[#8C7B6B] underline-offset-4 hover:underline"
                onClick={onBackToPhone}
            >
                <ArrowLeft className="h-4 w-4" />
                Numéro incorrect ? Modifier le numéro
            </button>
        </div>
    )
}
