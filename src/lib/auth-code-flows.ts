/**
 * Flux « vérification du code » de l'auth unifié (ex auth-screen.tsx) —
 * MODE-988 (DET-001 tranche 2), extraction SANS changement de
 * comportement : doLogin, biométrie, PIN (saisie, confirmation vocale,
 * tentative, récupération), schéma et symboles. Chaque fonction reprend
 * VERBATIM le corps du callback d'origine, les lectures d'état devenant
 * ctx.<champ> (mêmes closures que le rendu d'origine) et les
 * refs/setters étant injectés.
 */
import { loadStoredAccount, type AccountRole } from "@/lib/auth-multi"
import { playBeep, haptic, tataSpeak } from "@/lib/voice/tata-tts"
import { parseVoicePin } from "@/lib/voice/localIntent"
import { unlockWithBiometrics } from "@/lib/biometric-auth"
import { queuePendingSync } from "@/lib/offline-db"
import {
    persistAccount,
    loadStoredPinHash,
    simpleHash,
    verifyServerLogin,
} from "@/lib/auth-login-flow"
import {
    parseVoicePhone,
    submitPhoneFlow,
} from "@/lib/auth-phone-flows"
import type { AuthFlowContext } from "@/lib/auth-flow-context"

// --- Login logic ---
// Le rôle DOIT être posé avant setAuth : la redirection post-login
// (homeScreenForRole) lit le rôle courant du store — marchand → accueil
// marché, producteur → accueil récoltes.
export const doLoginFlow = (
    ctx: AuthFlowContext,
    phoneVal: string,
    nameVal: string,
    role: AccountRole,
    merchantId?: string,
    sexe?: "masculin" | "feminin" | "autre" | null,
    categorie?: "detaillant" | "semi_grossiste" | "grossiste" | null
) => {
    ctx.setIsProcessing(true)
    ctx.setError("")
    try {
        const id = merchantId || crypto.randomUUID()
        playBeep("success")
        haptic("success")
        tataSpeak(`Bonjour ${nameVal} ! Bienvenue sur Jùlaba.`)
        ctx.setUserRole(role)
        ctx.setAuth(id, nameVal, phoneVal, sexe, categorie)
    } catch {
        ctx.setError("Erreur de connexion.")
        playBeep("error")
    } finally {
        ctx.setIsProcessing(false)
    }
}

export const biometricUnlockFlow = async (ctx: AuthFlowContext) => {
    const stored = loadStoredAccount(ctx.phoneRef.current || "demo")
    if (!stored) return
    const ok = await unlockWithBiometrics(
        `Déverrouiller le compte de ${stored.firstName}`
    )
    if (ok) {
        ctx.doLogin(
            stored.phone,
            stored.firstName,
            stored.role,
            stored.id,
            stored.sexe
        )
    }
}

export const biometricRecoveryFlow = async (ctx: AuthFlowContext) => {
    const stored = loadStoredAccount(ctx.phoneRef.current || "demo")
    if (!stored) return
    if (stored.role !== "marchand") {
        ctx.setError(
            "Réinitialisation disponible pour les comptes marchands. Contactez un agent Jùlaba."
        )
        return
    }
    const ok = await unlockWithBiometrics(
        `Réinitialiser le code de ${stored.firstName}`
    )
    if (!ok) return
    ctx.setMode("recovery")
    ctx.setPin("")
    ctx.setPinDisplay([])
    ctx.setConfirmPin("")
    ctx.setStep("recovery-pin")
    ctx.stepRef.current = "recovery-pin"
    tataSpeak("Créez votre nouveau code secret à 4 chiffres.")
}

// --- PIN logic ---
export const handlePinDigitFlow = async (ctx: AuthFlowContext, digit: string) => {
    const pin = ctx.pin
    if (pin.length >= 4) return
    ctx.setPinInputMode("keyboard")
    ctx.pinInputModeRef.current = "keyboard"
    const newPin = pin + digit
    ctx.setPin(newPin)
    ctx.setPinDisplay([...ctx.pinDisplay, "•"])
    haptic("light")
    if (newPin.length === 4) {
        if (ctx.mode === "recovery") {
            if (!ctx.confirmPin) {
                ctx.setConfirmPin(newPin)
                ctx.setPin("")
                ctx.setPinDisplay([])
                ctx.setStep("recovery-confirm")
                tataSpeak("Confirmez votre nouveau code.")
            } else if (newPin === ctx.confirmPin) {
                void completeRecoveryFlow(ctx, newPin)
            } else {
                ctx.setError("Les codes ne correspondent pas.")
                tataSpeak("Les codes ne sont pas les mêmes. Réessayez.")
                ctx.setPin("")
                ctx.setPinDisplay([])
                ctx.setConfirmPin("")
                ctx.setStep("recovery-pin")
                playBeep("error")
            }
        } else {
            void attemptLoginFlow(ctx, newPin)
        }
    }
}

export const handleDeletePinFlow = (ctx: AuthFlowContext) => {
    if (ctx.pin.length === 0) return
    ctx.setPin(ctx.pin.slice(0, -1))
    ctx.setPinDisplay(ctx.pinDisplay.slice(0, -1))
}

export const attemptLoginFlow = async (ctx: AuthFlowContext, pinValue?: string) => {
    const pin = pinValue ?? ctx.pin
    ctx.setIsProcessing(true)
    const phoneValue = ctx.phoneRef.current || "demo"
    const stored = loadStoredAccount(phoneValue)
    const role: AccountRole =
        stored?.role ?? ctx.accountRoleRef.current ?? "marchand"
    const hash = simpleHash(pin)
    let success = false
    if (stored) {
        const storedPinHash = await loadStoredPinHash(
            stored.role,
            phoneValue
        )
        if (hash === storedPinHash) {
            ctx.doLogin(
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
                pin,
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
                ctx.doLogin(
                    phoneValue,
                    result.firstName,
                    stored.role,
                    result.id,
                    result.sexe,
                    result.categorie ?? undefined
                )
                success = true
            } else if (result && "serverError" in result) {
                ctx.setError(result.serverError)
                tataSpeak("Connexion refusée. Réessayez.")
                playBeep("error")
                haptic("error")
                ctx.setPin("")
                ctx.pinRef.current = ""
                ctx.setPinDisplay([])
                ctx.setIsProcessing(false)
                return
            }
        }
    } else {
        // No local cache — first login on this device for this account,
        // verify server-side (see verifyServerLogin) and cache on success.
        const result = await verifyServerLogin(
            phoneValue,
            "pin",
            pin,
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
            ctx.doLogin(
                phoneValue,
                result.firstName,
                role,
                result.id,
                result.sexe,
                result.categorie ?? undefined
            )
            success = true
        } else if (result && "serverError" in result) {
            ctx.setError(result.serverError)
            tataSpeak("Connexion refusée. Réessayez.")
            playBeep("error")
            haptic("error")
            ctx.setPin("")
            ctx.pinRef.current = ""
            ctx.setPinDisplay([])
            ctx.setIsProcessing(false)
            return
        }
    }
    if (!success) {
        // CRITICAL FIX: block login on wrong PIN
        playBeep("error")
        haptic("error")
        ctx.setError("Code incorrect. Réessayez.")
        tataSpeak("Code incorrect.")
        ctx.setPin("")
        ctx.pinRef.current = ""
        ctx.setPinDisplay([])
    }
    ctx.setIsProcessing(false)
}

export const completeRecoveryFlow = async (ctx: AuthFlowContext, newPin: string) => {
    const stored = loadStoredAccount(ctx.phoneRef.current || "demo")
    if (!stored) {
        ctx.setError("Compte introuvable. Réessayez.")
        return
    }
    if (stored.role !== "marchand") {
        // La réinitialisation serveur (PATCH /api/merchant) n'existe que
        // pour les marchands ; un producteur passe par un agent Jùlaba.
        ctx.setError(
            "Réinitialisation disponible pour les comptes marchands. Contactez un agent Jùlaba."
        )
        return
    }
    ctx.setIsProcessing(true)
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
        ctx.doLogin(
            stored.phone,
            stored.firstName,
            stored.role,
            stored.id,
            stored.sexe
        )
    } catch {
        ctx.setError("Impossible de réinitialiser le code. Réessayez.")
        playBeep("error")
    } finally {
        ctx.setIsProcessing(false)
    }
}

// Branche « oui » de la confirmation vocale du PIN (ex handleVoiceResult,
// étape confirm) : cache local d'abord, serveur en repli — les mêmes
// sémantiques qu'attemptLoginFlow avec le code courant du ref pinRef.
export const confirmVoicePinFlow = async (ctx: AuthFlowContext) => {
    ctx.setIsProcessing(true)
    const stored = loadStoredAccount(ctx.phoneRef.current || "demo")
    let success = false
    let serverError = ""
    if (stored) {
        const storedPinHash = await loadStoredPinHash(
            stored.role,
            ctx.phoneRef.current || "demo"
        )
        if (simpleHash(ctx.pinRef.current) === storedPinHash) {
            ctx.doLogin(
                stored.phone,
                stored.firstName,
                stored.role,
                stored.id,
                stored.sexe
            )
            success = true
        }
    } else {
        const hash = simpleHash(ctx.pinRef.current)
        const role = ctx.accountRoleRef.current ?? "marchand"
        const result = await verifyServerLogin(
            ctx.phoneRef.current || "demo",
            "pin",
            ctx.pinRef.current,
            role
        )
        if (result && !("serverError" in result)) {
            await persistAccount({
                role,
                id: result.id,
                firstName: result.firstName,
                phone: ctx.phoneRef.current || "demo",
                pinHash: hash,
                authMethod: "pin",
            })
            ctx.doLogin(
                ctx.phoneRef.current || "demo",
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
    ctx.setIsProcessing(false)
    if (!success) {
        // CRITICAL FIX: do NOT login on wrong PIN
        tataSpeak(
            serverError
                ? "Connexion refusée. Réessayez."
                : "Code incorrect. Réessayez."
        )
        ctx.setError(serverError || "Code incorrect.")
        playBeep("error")
        haptic("error")
        ctx.setPin("")
        ctx.pinRef.current = ""
        ctx.setPinDisplay([])
        ctx.setStep("login-pin")
        ctx.stepRef.current = "login-pin"
    }
}

// Orchestration vocale par étape (ex handleVoiceResult) : le dicté est
// routé selon l'étape courante (numéro, PIN, confirmation oui/non).
export const handleVoiceResultFlow = async (ctx: AuthFlowContext, transcript: string) => {
    const lower = transcript.toLowerCase().trim()
    const currentStep = ctx.stepRef.current

    if (currentStep === "name") {
        const phoneValue = parseVoicePhone(transcript)
        if (phoneValue) {
            void submitPhoneFlow(ctx, phoneValue)
        } else {
            ctx.setError("Je n'ai pas compris le numéro. Réessayez.")
            tataSpeak("Je n'ai pas bien compris. Répétez votre numéro.")
        }
    } else if (currentStep === "login-pin") {
        const pinDigits = parseVoicePin(transcript)
        if (pinDigits) {
            ctx.setPinInputMode("voice")
            ctx.pinInputModeRef.current = "voice"
            ctx.setPin(pinDigits.join(""))
            ctx.pinRef.current = pinDigits.join("")
            ctx.setPinDisplay(pinDigits.map(() => "•"))
            // Ne pas répéter le code secret à voix haute. La réponse oui/non
            // est captée automatiquement dès que l'instruction est terminée.
            tataSpeak("Dites oui ou non.", () => {
                void ctx.startVoiceListening?.()
            })
            haptic("light")
            ctx.setStep("confirm")
            ctx.stepRef.current = "confirm"
            ctx.setError("")
        } else {
            const newAttempts = ctx.voiceAttemptsRef.current + 1
            ctx.setVoiceAttempts(newAttempts)
            ctx.voiceAttemptsRef.current = newAttempts
            if (newAttempts >= 2) {
                tataSpeak("Utilisez le pavé numérique.")
                ctx.setError(
                    "Trop de tantatives vocales. Utilisez le pavé."
                )
            } else {
                tataSpeak("Je n'ai pas entendu 4 chiffres. Répétez ?")
                ctx.setError("Dites exactement 4 chiffres.")
            }
        }
    } else if (currentStep === "confirm") {
        if (/^(oui|c\'?est (?:ça|ca)|exact|c\'?est bon)/i.test(lower)) {
            // validate and login — local cache first, server fallback
            // on a device's first login (see confirmVoicePinFlow)
            await confirmVoicePinFlow(ctx)
        } else if (/^non/i.test(lower)) {
            tataSpeak("D'accord, réentrez votre code.")
            ctx.setPin("")
            ctx.pinRef.current = ""
            ctx.setPinDisplay([])
            ctx.setStep("login-pin")
            ctx.stepRef.current = "login-pin"
        }
    }
}
