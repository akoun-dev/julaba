"use client"

/**
 * Étape « récupération de code » de l'auth unifié (ex auth-screen.tsx) —
 * MODE-987 (DET-001 tranche 1), extraction SANS changement de
 * comportement : JSX repris VERBATIM (carte Code oublié ? : empreinte ou
 * contact agent, retour connexion) ; l'état reste dans auth-screen.tsx.
 */
import { Fingerprint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function AuthRecoveryStep({
    soleilMode,
    biometricAvailable,
    isProcessing,
    onBiometricRecovery,
    onBackToLogin,
    error,
}: {
    soleilMode: boolean
    biometricAvailable: boolean
    isProcessing: boolean
    onBiometricRecovery: () => void
    onBackToLogin: () => void
    error: string
}) {
    // Verbatim : textClass = soleilMode ? "text-black text-lg" : "text-foreground"
    const textClass = soleilMode ? "text-black text-lg" : "text-foreground"
    return (
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
                        onClick={onBiometricRecovery}
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
                    onClick={onBackToLogin}
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
    )
}
