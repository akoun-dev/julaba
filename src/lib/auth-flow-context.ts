/**
 * Contexte injecté des flux de connexion de l'auth unifié — MODE-988
 * (DET-001 tranche 2).
 *
 * Les flux (submitPhone, attemptLogin, vérification schéma/symboles,
 * recovery…) vivent dans des modules purs (auth-phone-flows /
 * auth-code-flows) et reçoivent ICI tout ce qui touche au React : l'état
 * courant AU MOMENT DU RENDU (mêmes closures que l'original), les refs de
 * lecture fraîche des callbacks STT, et les setters. Aucune dépendance à
 * React dans ces modules — les flux sont testables en vitest avec un
 * contexte factice.
 */
import type { AccountRole } from "@/lib/auth-multi"
import type { AuthMethod, AuthStep, PinInputMode } from "@/lib/auth-login-flow"

/** Signature de la connexion réussie (pose le rôle AVANT setAuth — la redirection post-login lit le rôle courant du store). */
export type DoLoginFn = (
    phoneVal: string,
    nameVal: string,
    role: AccountRole,
    merchantId?: string,
    sexe?: "masculin" | "feminin" | "autre" | null,
    categorie?: "detaillant" | "semi_grossiste" | "grossiste" | null
) => void

export interface AuthFlowContext {
    // --- État lu au moment du rendu (closures identiques à l'original) ---
    phone: string
    pin: string
    pinDisplay: string[]
    mode: "login" | "recovery"
    confirmPin: string

    // --- Refs (lecture fraîche dans les callbacks async/vocaux) ---
    stepRef: { current: AuthStep }
    modeRef: { current: "login" | "recovery" }
    phoneRef: { current: string }
    pinRef: { current: string }
    firstNameRef: { current: string }
    accountRoleRef: { current: AccountRole | null }
    pinInputModeRef: { current: PinInputMode }
    voiceAttemptsRef: { current: number }

    // --- Setters ---
    setPhone: (v: string) => void
    setError: (v: string) => void
    setIsProcessing: (v: boolean) => void
    setMode: (v: "login" | "recovery") => void
    setAccountRole: (r: AccountRole) => void
    setFirstName: (v: string) => void
    setAvailableMethods: (m: AuthMethod[]) => void
    setAuthMethod: (m: AuthMethod) => void
    setStep: (s: AuthStep) => void
    setPin: (v: string) => void
    setPinDisplay: (v: string[]) => void
    setConfirmPin: (v: string) => void
    setPinInputMode: (m: PinInputMode) => void
    setVoiceAttempts: (n: number) => void
    setPatternSuccess: (v: boolean) => void
    setPatternError: (v: boolean) => void
    setVisualSuccess: (v: boolean) => void
    setVisualError: (v: boolean) => void
    setAuth: (
        id: string,
        name: string,
        phone: string,
        sexe?: "masculin" | "feminin" | "autre" | null,
        categorie?: "detaillant" | "semi_grossiste" | "grossiste" | null
    ) => void
    setUserRole: (role: AccountRole) => void

    // --- Connexion réussie (flux auth-code-flows.doLoginFlow) ---
    doLogin: DoLoginFn
}
