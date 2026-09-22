/**
 * Flux « identification par schéma / symboles » de l'auth unifié (ex
 * auth-screen.tsx) — MODE-988 (DET-001 tranche 2), scission de
 * auth-code-flows pour rester sous la barre DET-001 (500 l.) : mêmes
 * sémantiques verbatim (cache local dabord, serveur en repli, refus
 * honnête), contexte injecté.
 */
import { loadStoredAccount, type AccountRole } from "@/lib/auth-multi"
import { playBeep, haptic, tataSpeak } from "@/lib/voice/tata-tts"
import { getPinHash } from "@/lib/secure-storage"
import { visualCodeToHash } from "@/components/marchand/visual-code-grid"
import {
    patternToHash,
    persistAccount,
    secureKeysFor,
    verifyServerLogin,
} from "@/lib/auth-login-flow"
import type { AuthFlowContext } from "@/lib/auth-flow-context"

// --- Pattern login --- (local cache first, server verify on a device's
// first login for this account — see verifyServerLogin; a stale cache
// also falls back to the server before refusing, since the server stays
// the source of truth in multi-user/multi-device setups)
export const verifyPatternFlow = async (ctx: AuthFlowContext, pattern: number[]) => {
    const phone = ctx.phone
    const stored = loadStoredAccount(phone)
    const role: AccountRole =
        stored?.role ?? ctx.accountRoleRef.current ?? "marchand"
    const hash = patternToHash(pattern)
    if (stored) {
        const storedPatternHash = await getPinHash(
            secureKeysFor(stored.role, phone).pattern
        ).catch(() => null)
        if (storedPatternHash && storedPatternHash === hash) {
            haptic("success")
            ctx.setPatternSuccess(true)
            playBeep("success")
            setTimeout(
                () =>
                    ctx.doLogin(
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
            ctx.setPatternSuccess(true)
            playBeep("success")
            setTimeout(
                () =>
                    ctx.doLogin(
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
            ctx.setError(result.serverError)
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
            ctx.setPatternSuccess(true)
            playBeep("success")
            setTimeout(
                () =>
                    ctx.doLogin(
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
            ctx.setError(result.serverError)
            return
        }
    }
    haptic("error")
    playBeep("error")
    ctx.setPatternError(true)
    ctx.setError("Schéma incorrect.")
    tataSpeak("Schéma incorrect. Réessayez.")
    setTimeout(() => ctx.setPatternError(false), 1200)
}

// --- Visual code login --- (marchand-only method; same local-first /
// server-fallback shape as verifyPatternFlow above)
export const verifyVisualFlow = async (ctx: AuthFlowContext, sequence: string[]) => {
    const phone = ctx.phone
    const stored = loadStoredAccount(phone)
    const role: AccountRole = stored?.role ?? "marchand"
    const hash = visualCodeToHash(sequence)
    if (stored) {
        const storedVisualHash = await getPinHash(
            secureKeysFor(stored.role, phone).visual
        ).catch(() => null)
        if (storedVisualHash && storedVisualHash === hash) {
            haptic("success")
            ctx.setVisualSuccess(true)
            playBeep("success")
            setTimeout(
                () =>
                    ctx.doLogin(
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
            ctx.setVisualSuccess(true)
            playBeep("success")
            setTimeout(
                () =>
                    ctx.doLogin(
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
            ctx.setError(result.serverError)
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
            ctx.setVisualSuccess(true)
            playBeep("success")
            setTimeout(
                () =>
                    ctx.doLogin(
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
            ctx.setError(result.serverError)
            return
        }
    }
    haptic("error")
    playBeep("error")
    ctx.setVisualError(true)
    ctx.setError("Symboles incorrects.")
    tataSpeak("Mauvaise séquence. Réessayez.")
    setTimeout(() => ctx.setVisualError(false), 1200)
}
