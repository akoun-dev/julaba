"use client"

/**
 * Fragments d'interface partagés de l'écran d'authentification unifié
 * (ex auth-screen.tsx) — MODE-987 (DET-001 tranche 1), extraction SANS
 * changement de comportement : chaque composant reprend VERBATIM le JSX
 * des variables internes (menu de rôle, profileHeader, tabsNav, tataCard,
 * openCaisseCta, helpSection, securityFooter) ; l'état vivant reste dans
 * auth-screen.tsx et descend ici uniquement par props / callbacks.
 */
import {
    ArrowRight,
    BadgeCheck,
    Hash,
    Headphones,
    LifeBuoy,
    Monitor,
    Play,
    RotateCcw,
    ClipboardList,
    Shapes,
    ShieldCheck,
    Store,
    Users,
    Waypoints,
    Wheat,
    Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/stores/app-store"
import { tataSpeak, tataStop } from "@/lib/voice/tata-tts"
import type { AuthMethod } from "@/lib/auth-login-flow"

// Menu de rôle (barre supérieure, verbatim) : identificateur et backoffice
// ont leurs entrées dédiées ; marchands et producteurs passent tous par
// l'écran d'auth unifié (rôle détecté au numéro).
export function AuthRoleMenu() {
    const { setUserRole } = useAppStore()
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Choisir un rôle"
                    className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#2D1B0E] px-3 text-xs font-bold tracking-wide text-white shadow-sm transition-transform duration-150 ease-out hover:bg-[#55311C] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BC5A2E] focus-visible:ring-offset-2"
                >
                    &lt;&gt;
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem
                    onSelect={() => {
                        setUserRole("identificateur")
                        useAppStore.getState().navigate("ident-auth")
                    }}
                    className="gap-2 py-2.5"
                >
                    <ClipboardList className="h-4 w-4 text-[#9F8170]" />
                    <span>Identificateur</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => {
                        setUserRole("backoffice")
                        useAppStore.getState().navigate("bo-auth")
                    }}
                    className="gap-2 py-2.5"
                >
                    <Monitor className="h-4 w-4 text-[#3D2314]" />
                    <span>BackOffice</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => {
                        setUserRole("cooperateur")
                        useAppStore.getState().navigate("coop-auth")
                    }}
                    className="gap-2 py-2.5"
                >
                    <Users className="h-4 w-4 text-[#2072AF]" />
                    <span>Espace coopérative</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => {
                        setUserRole("institution")
                        useAppStore.getState().navigate("ins-auth")
                    }}
                    className="gap-2 py-2.5"
                >
                    <Building2 className="h-4 w-4 text-[#0F172A]" />
                    <span>Espace institution</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// En-tête profil (maquette, verbatim) : avatar initiales, nom vérifié,
// téléphone, pastille d'espace détecté (marché ou récoltes).
export function AuthProfileHeader({
    firstName,
    phone,
    accountRole,
    soleilMode,
}: {
    firstName: string
    phone: string
    accountRole: "marchand" | "producteur" | "cooperateur" | null
    soleilMode: boolean
}) {
    const initials = (firstName || "?")
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w.charAt(0).toUpperCase())
        .join("")

    if (!firstName) return null
    return (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/70 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7A3E1D] text-sm font-bold text-white">
                {initials}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p
                        className={cn(
                            "truncate text-sm font-bold text-[#3D2314]",
                            soleilMode && "text-base text-black"
                        )}
                    >
                        {firstName}
                    </p>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-[#BC5A2E]" />
                </div>
                <p className="truncate text-xs text-[#8C7B6B]">{phone}</p>
            </div>
            {accountRole && (
                <span
                    className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        accountRole === "producteur"
                            ? "bg-[#2E8B57]/10 text-[#2E8B57]"
                            : accountRole === "cooperateur"
                              ? "bg-[#2072AF]/10 text-[#2072AF]"
                              : "bg-[#BC5A2E]/10 text-[#BC5A2E]"
                    )}
                >
                    {accountRole === "producteur" ? (
                        <Wheat className="h-3 w-3" />
                    ) : accountRole === "cooperateur" ? (
                        <Users className="h-3 w-3" />
                    ) : (
                        <Store className="h-3 w-3" />
                    )}
                    {accountRole === "producteur" ? "Producteur" : accountRole === "cooperateur" ? "Coopérative" : "Marchand"}
                </span>
            )}
        </div>
    )
}

// Onglets de méthode — seules les méthodes réellement disponibles pour
// le compte sont proposées (verbatim, masqués pendant la récupération).
const METHOD_TABS: {
    method: AuthMethod
    label: string
    Icon: typeof Hash
}[] = [
    { method: "pin", label: "Code PIN", Icon: Hash },
    { method: "pattern", label: "Schéma", Icon: Waypoints },
    { method: "visual", label: "Symboles", Icon: Shapes },
]

export function AuthTabsNav({
    availableMethods,
    authMethod,
    mode,
    firstName,
    onRoute,
}: {
    availableMethods: AuthMethod[]
    authMethod: AuthMethod
    mode: "login" | "recovery"
    firstName: string
    onRoute: (method: AuthMethod, name: string) => void
}) {
    const visibleTabs = METHOD_TABS.filter(t =>
        availableMethods.includes(t.method)
    )
    if (!(visibleTabs.length > 1 && mode !== "recovery")) return null
    return (
        <div
            className="mb-3 grid gap-1 rounded-2xl bg-[#F3E9DC] p-1.5"
            style={{
                gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
            }}
        >
            {visibleTabs.map(({ method, label, Icon }) => {
                const active = authMethod === method
                return (
                    <button
                        key={method}
                        type="button"
                        onClick={() => onRoute(method, firstName)}
                        aria-pressed={active}
                        className={cn(
                            "flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all",
                            active
                                ? "bg-card text-[#7A3E1D] shadow-[0_1px_3px_rgba(122,62,29,0.15)]"
                                : "text-[#8C7B6B]"
                        )}
                    >
                        <Icon
                            className={cn(
                                "h-4 w-4",
                                active && "text-[#BC5A2E]"
                            )}
                        />
                        {label}
                    </button>
                )
            })}
        </div>
    )
}

// Carte Assistance Vocale Tata — « Écouter » rejoue l'instruction de
// l'étape courante (même voix offline que le reste du flux). Verbatim :
// l'instruction est calculée par le parent (instructionFor(step)).
export function AuthTataCard({
    instruction,
    soleilMode,
}: {
    instruction: string
    soleilMode: boolean
}) {
    return (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#F0E4D3] bg-card p-3 shadow-[0_1px_3px_rgba(122,62,29,0.05)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C66A2C]/15">
                <Headphones className="h-5 w-5 text-[#C66A2C]" />
            </div>
            <div className="min-w-0 flex-1">
                <p
                    className={cn(
                        "whitespace-nowrap text-[13px] font-bold text-[#3D2314]",
                        soleilMode && "text-base text-black"
                    )}
                >
                    Assistance Vocale Tata
                </p>
                <p className="text-xs text-[#8C7B6B]">Français • Baoulé</p>
            </div>
            <button
                type="button"
                onClick={() => {
                    tataStop()
                    tataSpeak(instruction)
                }}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#F6E7D8] px-3 text-[11px] font-semibold text-[#B4531F] transition-transform active:scale-95"
            >
                <Play className="h-4 w-4 fill-current" />
                Écouter
            </button>
        </div>
    )
}

// CTA brun des écrans schéma/symboles (maquette « Ouvrir ma caisse »).
export function AuthOpenCaisseCta({
    onClick,
    disabled,
}: {
    onClick: () => void
    disabled: boolean
}) {
    return (
        <Button
            className="h-14 w-full gap-2 rounded-2xl bg-[#7A3E1D] text-base text-white shadow-lg shadow-[#7A3E1D]/25 hover:bg-[#6B3517]"
            onClick={onClick}
            disabled={disabled}
        >
            Ouvrir ma caisse Jùlaba
            <ArrowRight className="h-5 w-5" />
        </Button>
    )
}

// Section d'aide des écrans schéma/symboles (maquette « Problème… ») :
// bascule vers le PIN quand le compte en possède un, sinon récupération.
// Les gardes d'affichage (canUsePin) restent calculées côté parent pour
// refléter exactement les conditions d'origine.
export function AuthHelpSection({
    label,
    canUsePin,
    isMerchant,
    onPin,
    onRecovery,
}: {
    label: string
    canUsePin: boolean
    isMerchant: boolean
    onPin: () => void
    onRecovery: () => void
}) {
    return (
        <div className="mt-2 rounded-2xl border border-[#F0E4D3] bg-white/80 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#7A4A2B]">
                <LifeBuoy className="h-3.5 w-3.5 text-[#BC5A2E]" />
                {label}
            </p>
            <div className="flex flex-wrap gap-2">
                {canUsePin && (
                    <button
                        type="button"
                        onClick={onPin}
                        className="flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-card px-3 py-1.5 text-xs font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40"
                    >
                        <Hash className="h-3.5 w-3.5" />
                        Entrer le code PIN
                    </button>
                )}
                {isMerchant ? (
                    <button
                        type="button"
                        onClick={onRecovery}
                        className="flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-card px-3 py-1.5 text-xs font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Code oublié ?
                    </button>
                ) : (
                    <span className="flex items-center text-xs text-[#8C7B6B]">
                        Code oublié ? Contactez un agent Jùlaba.
                    </span>
                )}
            </div>
        </div>
    )
}

// Pied de page sécurité (maquette, verbatim).
export function AuthSecurityFooter() {
    return (
        <div className="mt-5 flex items-start justify-center gap-2 px-2 text-center">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#BC5A2E]" />
            <div>
                <p className="text-xs font-bold text-[#7A4A2B]">
                    Garanti sans commission cachée • Sécurité UEMOA
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#8C7B6B]">
                    Vos transactions journalières et votre tontine sont
                    protégées sous code sécurisé Jùlaba.
                </p>
            </div>
        </div>
    )
}
