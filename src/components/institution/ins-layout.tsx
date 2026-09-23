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

  if (!insSessionChecked) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#3B82F6]" />
      </div>
    )
  }

  if (!insUser) return <InsAuthScreen />

  const handleLogout = async () => {
    await insLogout()
    logout()
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#F8FAFC]">
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl">
          <div className="flex min-h-14 items-center gap-3 px-3 py-2 sm:h-16 sm:px-4 sm:py-0 md:px-6">
            <div className="flex min-w-0 shrink-0 items-center gap-2.5">
              <img src="/icon-only.png" alt="Jùlaba" className="h-8 w-8 shrink-0 object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-bold text-[#0F172A]">Jùlaba</p>
                <p className="flex items-center gap-1 text-[10px] text-[#3B82F6] sm:text-[11px]">
                  <Building2 size={11} className="shrink-0" />
                  <span className="truncate">Espace institution</span>
                </p>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
              <div className="hidden text-right leading-tight md:block">
                <p className="max-w-48 truncate text-sm font-semibold text-[#0F172A]">{insUser.name}</p>
                <p className="max-w-56 truncate text-[11px] text-[#64748B]">{insUser.email}</p>
              </div>
              <button
                onClick={handleLogout}
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-100 hover:text-[#0F172A] sm:w-auto sm:gap-2 sm:px-3"
              >
                <LogOut size={16} />
                <span className="hidden lg:inline">Se déconnecter</span>
              </button>
            </div>
          </div>

          <nav
            aria-label="Navigation institution"
            className="scrollbar-none flex w-full items-center gap-1 overflow-x-auto border-t border-[#F1F5F9] px-2 py-1.5 sm:border-t-0 sm:px-4 sm:py-2 md:px-6"
          >
            {INS_NAV.map((item) => {
              const isActive = currentScreen === item.route
              return (
                <button
                  key={item.route}
                  onClick={() => navigate(item.route)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
                    isActive
                      ? 'bg-[#3B82F6]/10 text-[#1D4ED8]'
                      : 'text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]'
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
        {children}
      </main>
    </div>
  )
}
