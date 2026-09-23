'use client'

import type { ReactNode } from 'react'
import { LogOut, Building2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useInstitutionStore } from '@/lib/stores/institution-store'
import { cn } from '@/lib/utils'
import { InsAuthScreen } from './ins-auth-screen'

const INS_NAV = [
  { route: 'ins-dashboard' as const, label: 'Tableau de bord' },
  { route: 'ins-acteurs' as const, label: 'Acteurs' },
  { route: 'ins-supervision' as const, label: 'Supervision' },
  { route: 'ins-audit' as const, label: 'Audit' },
]

export function InsLayout({ children }: { children: ReactNode }) {
  const insUser = useInstitutionStore((s) => s.insUser)
  const insSessionChecked = useInstitutionStore((s) => s.insSessionChecked)
  const insLogout = useInstitutionStore((s) => s.insLogout)
  const { currentScreen, navigate, logout } = useAppStore()

  // Garde de surface : on ne rend RIEN de l'univers institution avant que la
  // session serveur (cookie httpOnly) soit confirmée — même principe que BoGate.
  if (!insSessionChecked) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#3B82F6]" />
      </div>
    )
  }

  if (!insUser) {
    return <InsAuthScreen />
  }

  const handleLogout = async () => {
    await insLogout()
    logout()
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC]">
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-6">
          <div className="flex shrink-0 items-center gap-2.5">
            <img src="/icon-only.png" alt="Jùlaba" className="h-8 w-8 object-contain" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-[#0F172A]">Jùlaba</p>
              <p className="flex items-center gap-1 text-[11px] text-[#3B82F6]">
                <Building2 size={11} />
                Espace institution
              </p>
            </div>
          </div>

          <nav aria-label="Navigation institution" className="ml-2 flex flex-1 items-center gap-0.5 overflow-x-auto">
            {INS_NAV.map((item) => {
              const isActive = currentScreen === item.route
              return (
                <button
                  key={item.route}
                  onClick={() => navigate(item.route)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-[#3B82F6]/10 text-[#1D4ED8]'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right leading-tight md:block">
              <p className="text-sm font-semibold text-[#0F172A]">{insUser.name}</p>
              <p className="text-[11px] text-[#64748B]">{insUser.email}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-[#475569] transition-colors hover:bg-slate-100 hover:text-[#0F172A]"
            >
              <LogOut size={16} />
              <span className="hidden lg:inline">Se déconnecter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  )
}