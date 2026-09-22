/**
 * Flux « téléphone & navigation » de l'auth unifié (ex auth-screen.tsx) —
 * MODE-988 (DET-001 tranche 2), extraction SANS changement de
 * comportement : chaque fonction reprend VERBATIM le corps du callback
 * d'origine, les lectures d'état devenant ctx.<champ> (mêmes closures que
 * le rendu d'origine) et les refs/setters étant injectés.
 */
import {
    loadStoredAccount,
    normalizeAuthPhone as normalizePhone,
} from "@/lib/auth-multi"
import { haptic, tataSpeak } from "@/lib/voice/tata-tts"
import {
    checkUnifiedAccount,
    VISUAL_LOGIN_LENGTH,
    type AuthMethod,
} from "@/lib/auth-login-flow"
import type { AuthFlowContext } from "@/lib/auth-flow-context"

/** Dicté du numéro : chiffres directs (≥ 8) ou mots-nombres français. */
export const parseVoicePhone = (transcript: string): string | null => {
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
export const routeToLoginStepFlow = (
    ctx: AuthFlowContext,
    method: AuthMethod,
    name: string
) => {
    if (method === "pattern") {
        ctx.setAuthMethod("pattern")
        ctx.setStep("pattern-login")
        ctx.stepRef.current = "pattern-login"
        tataSpeak(`Bonjour ${name} ! Dessinez votre schéma.`)
    } else if (method === "visual") {
        ctx.setAuthMethod("visual")
        ctx.setStep("visual-login")
        ctx.stepRef.current = "visual-login"
        tataSpeak(
            `Bonjour ${name} ! Touchez vos ${VISUAL_LOGIN_LENGTH} symboles.`
        )
    } else {
        ctx.setAuthMethod("pin")
        ctx.setStep("login-pin")
        ctx.stepRef.current = "login-pin"
        tataSpeak(`Bonjour ${name} ! Entrez votre code à 4 chiffres.`)
    }
}

// Permet de corriger un numéro mal saisi depuis n'importe quel écran de
// saisie du code (PIN / schéma / visuel) : on revient à l'étape téléphone
// avec le numéro pré-rempli (modifiable) et on réinitialise tout l'état
// transitoire de connexion (code, erreurs, tentatives schéma/visuel).
export const goBackToPhoneFlow = (ctx: AuthFlowContext) => {
    ctx.setError("")
    ctx.setPin("")
    ctx.setPinDisplay([])
    ctx.setConfirmPin("")
    ctx.setPatternError(false)
    ctx.setPatternSuccess(false)
    ctx.setVisualError(false)
    ctx.setVisualSuccess(false)
    ctx.pinRef.current = ""
    ctx.setStep("name")
    ctx.stepRef.current = "name"
    tataSpeak("Modifiez votre numéro de téléphone.")
}

// Only an identificateur creates accounts now (see checkUnifiedAccount),
// so there's no more "account not found → register" branch here: a phone
// with no local cache and no server record just can't log in.
export const submitPhoneFlow = async (
    ctx: AuthFlowContext,
    phoneValue: string
) => {
    const normalizedPhone = normalizePhone(phoneValue)
    if (normalizedPhone.length < 8) {
        ctx.setError("Entrez un numéro valide.")
        return
    }
    ctx.setPhone(normalizedPhone)
    ctx.phoneRef.current = normalizedPhone
    ctx.setError("")
    ctx.setMode("login")
    ctx.modeRef.current = "login"

    // 1) Cache local unifié : le rôle de ce compte est déjà connu, on
    // route directement vers le bon écran de code (marchand ET
    // producteur, sans réseau).
    const stored = loadStoredAccount(normalizedPhone)
    if (stored) {
        ctx.setAccountRole(stored.role)
        ctx.accountRoleRef.current = stored.role
        ctx.setFirstName(stored.firstName)
        ctx.firstNameRef.current = stored.firstName
        // Toutes les méthodes prouvées par ce compte sur cet appareil —
        // le hash principal d'abord (ordre d'affichage : METHOD_TABS).
        const cachedMethods: AuthMethod[] = [stored.authMethod]
        if (stored.patternHash && !cachedMethods.includes("pattern"))
            cachedMethods.push("pattern")
        if (stored.visualCodeHash && !cachedMethods.includes("visual"))
            cachedMethods.push("visual")
        ctx.setAvailableMethods(cachedMethods)
        routeToLoginStepFlow(ctx, stored.authMethod, stored.firstName)
        haptic("light")
        return
    }

    // 2) Découverte serveur multi-utilisateur : le même numéro sert aux
    // marchands et aux producteurs, c'est la base qui tranche le rôle.
    ctx.setIsProcessing(true)
    const server = await checkUnifiedAccount(normalizedPhone)
    ctx.setIsProcessing(false)
    if (server) {
        ctx.setAccountRole(server.role)
        ctx.accountRoleRef.current = server.role
        ctx.setFirstName(server.firstName)
        ctx.firstNameRef.current = server.firstName
        ctx.setAvailableMethods(server.authMethods)
        routeToLoginStepFlow(ctx, server.authMethod, server.firstName)
        haptic("light")
    } else {
        ctx.setError(
            "Compte non trouvé. Demandez à un identificateur de créer votre compte."
        )
        tataSpeak(
            "Compte introuvable. Demandez à un identificateur de créer votre compte."
        )
        haptic("error")
    }
}
