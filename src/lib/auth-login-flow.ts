/**
 * Couche « flux de login » de l'écran d'authentification unifié
 * (marchands + producteurs + coopérateurs, ex auth-screen.tsx).
 *
 * MODE-987 (DET-001 tranche 1) — extraction SANS changement de comportement :
 * ce module porte les types d'étapes, les helpers de hachage local (djb2,
 * UNIQUEMENT pour le cache hors ligne de l'appareil — le hachage scrypt et
 * le lockout restent serveur, cf. auth-pin / auth-login-server), les clés
 * SecureStorage par rôle, la persistance du compte, la découverte
 * multi-utilisateurs (lookup) et la vérification serveur du login.
 *
 * La partie React (états, callbacks, écrans) reste dans
 * src/components/marchand/auth-screen.tsx, qui importe tout d'ici.
 */
import {
    saveStoredAccount,
    normalizeAuthPhone as normalizePhone,
    type AccountRole,
    type StoredAccount,
} from "@/lib/auth-multi"
import { savePinHash, getPinHash } from "@/lib/secure-storage"

export type AuthMethod = "pin" | "pattern" | "visual"
export type AuthStep =
    | "name"
    | "confirm"
    | "login-pin"
    | "recovery"
    | "recovery-pin"
    | "recovery-confirm"
    | "pattern-login"
    | "visual-login"
export type PinInputMode = "keyboard" | "voice"

// Hash local djb2 — NE JAMAIS l'utiliser côté serveur (voir simple-hash-seed
// .test.ts et auth-pin.ts : le serveur vérifie scrypt/legacy + lockout).
export const simpleHash = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash |= 0
    }
    return hash.toString()
}

export const patternToHash = (pattern: number[]) => simpleHash(pattern.join("-"))

// Design auth (maquettes) : le code symboles est une suite de 3 — aligné
// avec l'enrôlement identificateur (voir ident-identification-screen).
export const VISUAL_LOGIN_LENGTH = 3

// Affichage du numéro en paires (« 07 08 45 12 ») — maquette première
// vue. La soumission reste normalisée par normalizeAuthPhone (les
// espaces sont retirés) ; 10 chiffres max (numéro ivoirien).
export const formatPhoneDisplay = (value: string) =>
    value
        .replace(/\D/g, "")
        .slice(0, 10)
        .replace(/(\d{2})(?=\d)/g, "$1 ")

// Préfixes SecureStorage par rôle — mêmes clés que les écrans historiques
// (marchand : "merchant-*", producteur : "prod-*") pour rester compatible
// avec les changements de code depuis les écrans de profil.
export const secureKeysFor = (role: AccountRole, phone: string) => {
    const p = normalizePhone(phone)
    // MODE-921 — préfixe 'coop' pour l'espace coopérative (mêmes clés que
    // l'écran coop-auth de repli, qui utilise savePinHash('coop-pin-…')).
    const prefix = role === "producteur" ? "prod" : role === "cooperateur" ? "coop" : "merchant"
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
export const persistAccount = async (data: StoredAccount) => {
    saveStoredAccount(data)
    const keys = secureKeysFor(data.role, data.phone)
    if (data.pinHash) await savePinHash(keys.pin, data.pinHash).catch(() => {})
    if (data.patternHash)
        await savePinHash(keys.pattern, data.patternHash).catch(() => {})
    if (data.visualCodeHash)
        await savePinHash(keys.visual, data.visualCodeHash).catch(() => {})
}

export const loadStoredPinHash = async (
    role: AccountRole,
    phone: string
): Promise<string | null> => {
    return await getPinHash(secureKeysFor(role, phone).pin).catch(() => null)
}

// Découverte multi-utilisateur : un seul point d'entrée téléphone pour les
// marchands ET les producteurs (voir /api/auth/lookup). Le rôle renvoyé
// pilote la route de vérification du code ET la redirection post-login —
// plus besoin de choisir son profil avant de taper son numéro.
export const checkUnifiedAccount = async (
    phone: string
): Promise<{
    role: AccountRole
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
export const verifyServerLogin = async (
    phone: string,
    method: AuthMethod,
    code: string,
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
    // MODE-936 (S-03) : le code BRUT part sur le fil (HTTPS) — le hachage
    // scrypt et le lockout sont serveur. Le djb2 local ne sert plus qu'au
    // login hors ligne sur cet appareil (cache persistAccount).
    try {
        const res = await fetch(
            role === "producteur"
                ? "/api/producteur/login"
                : role === "cooperateur"
                  ? "/api/cooperatives/cooperateurs/login"
                  : "/api/merchant/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, method, code }),
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

// Instruction vocale rejouable via le bouton « Écouter » de la carte Tata.
export const instructionFor = (s: AuthStep): string => {
    if (s === "name") return "Faut taper ton muméro oubien, appuis sur le micro pour parler."
    if (s === "confirm")
        return "C'est ton code ? Dites oui ou non."
    if (s === "recovery")
        return "Vérifiez votre identité pour créer un nouveau code."
    if (s === "recovery-pin")
        return "Créez votre nouveau code secret à 4 chiffres."
    if (s === "recovery-confirm")
        return "Confirmez votre nouveau code secret."
    if (s === "pattern-login") return "Faut dessinez ton schéma."
    if (s === "visual-login") return "Touchez vos symboles dans l'ordre."
    return "Tapez votre code secret à 4 chiffres."
}
