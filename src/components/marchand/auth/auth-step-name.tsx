"use client"

/**
 * Étape « name » de l'auth unifié (ex auth-screen.tsx) — MODE-987
 * (DET-001 tranche 1), extraction SANS changement de comportement : le JSX
 * est repris VERBATIM (héros, carte connexion, micro, carte Tata, « Nouvel
 * étal », indicateur d'écoute) ; l'état et les handlers restent dans
 * auth-screen.tsx et descendent par props.
 */
import { ArrowRight, Lock, Mic, MicOff, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { VoiceListeningIndicator } from "@/components/shared/voice-listening-indicator"
import { formatPhoneDisplay, instructionFor } from "@/lib/auth-login-flow"
import { tataSpeak, tataStop } from "@/lib/voice/tata-tts"
import { AuthTataCard } from "./auth-parts"

export function AuthNameStep({
    phone,
    onPhoneChange,
    onPhoneSubmit,
    error,
    soleilMode,
    voiceEnabled,
    sttAvailable,
    micChecked,
    isListening,
    onToggleListening,
    onStopListening,
}: {
    phone: string
    onPhoneChange: (value: string) => void
    onPhoneSubmit: () => void
    error: string
    soleilMode: boolean
    voiceEnabled: boolean
    sttAvailable: boolean
    micChecked: boolean
    isListening: boolean
    onToggleListening: () => void
    onStopListening: () => void
}) {
    const phoneDigits = phone.replace(/\D/g, "")
    return (
        <>
            {/* Héros : avatar cerclé d'orange, badge caisse, titre */}
            <div className="mb-5 text-center">
                <div className="relative mx-auto mb-3 h-24 w-24">
                    <div className="h-full w-full overflow-hidden rounded-full bg-card p-1.5 shadow-[0_6px_20px_rgba(122,62,29,0.18)] ring-[3px] ring-[var(--vl-marchand)]">
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
                    <ShoppingCart className="h-3.5 w-3.5 text-[var(--vl-marchand)]" />
                    Caisse autonome &amp; 100% hors-ligne
                </div>
            </div>

            {/* Carte Connexion à votre espace */}
            <Card className="rounded-3xl border-0 bg-card shadow-[0_10px_40px_rgba(122,62,29,0.12)]">
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
                        <div className="flex items-center gap-2 rounded-full border-2 border-[var(--vl-marchand)] bg-card py-2 pl-2 pr-1.5 shadow-sm transition-shadow focus-within:ring-4 focus-within:ring-[var(--vl-marchand-ring)]">
                            <Input
                                id="auth-phone"
                                type="tel"
                                inputMode="numeric"
                                placeholder="   07 07 08 45 12"
                                value={phone}
                                onChange={e =>
                                    onPhoneChange(
                                        formatPhoneDisplay(e.target.value)
                                    )
                                }
                                className={cn(
                                    "h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-lg font-bold tracking-[0.12em] text-[#241509] placeholder:font-medium placeholder:tracking-normal placeholder:text-[#B3A493]",
                                    soleilMode && "text-xl",
                                    "focus-visible:ring-0"
                                )}
                                onKeyDown={e =>
                                    e.key === "Enter" && onPhoneSubmit()
                                }
                                autoFocus
                            />
                            {voiceEnabled && sttAvailable && micChecked && (
                                <button
                                    type="button"
                                    aria-label={
                                        isListening
                                            ? "Arrêter l'écoute"
                                            : "Cliquer pour dicter"
                                    }
                                    aria-pressed={isListening}
                                    className={cn(
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--vl-marchand)] text-white shadow-md transition-all touch-target",
                                        isListening &&
                                            "animate-pulse ring-4 ring-[var(--vl-marchand-ring)] shadow-lg shadow-[var(--vl-marchand-shadow)]"
                                    )}
                                    onClick={onToggleListening}
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
                    </div>
                    {voiceEnabled && (!sttAvailable || !micChecked) && (
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
                        onClick={onPhoneSubmit}
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
            <div className="mt-4">
                <AuthTataCard
                    instruction={instructionFor("name")}
                    soleilMode={soleilMode}
                />
            </div>

            {/* Nouvel étal — orientation enregistrement (Tata explique) */}
            <NouvelEtalHint voiceEnabled={voiceEnabled} />

            {isListening && (
                <VoiceListeningIndicator
                    subtitle="Dites votre numéro chiffre par chiffre à voix haute"
                    onStop={onStopListening}
                />
            )}
        </>
    )
}

// Orientation enregistrement — Tata explique où créer un nouvel étal.
function NouvelEtalHint({ voiceEnabled }: { voiceEnabled: boolean }) {
    return (
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
            <ShoppingCart className="h-4 w-4 shrink-0 text-[var(--vl-marchand)]" />
            <span>
                Nouvel étal ?{" "}
                <span className="font-bold text-[var(--vl-marchand)]">
                    S&apos;enregistrer auprès des identificateur
                </span>
            </span>
        </button>
    )
}
