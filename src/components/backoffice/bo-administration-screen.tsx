'use client'

import { Settings, ArrowRight, ShieldAlert } from 'lucide-react'
import { useBackofficeStore, ADMINISTRATION_ITEMS, hasModuleAccess, type BoScreenRoute } from '@/lib/stores/backoffice-store'
import { IconProxy } from './bo-icon-proxy'
import { BoPageHeader } from './bo-ui'

export function BoAdministrationScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const boUserRole = useBackofficeStore((s) => s.boUserRole)
  const boNavigate = useBackofficeStore((s) => s.boNavigate)
  const isDark = boTheme === 'dark'
  const accessibleItems = ADMINISTRATION_ITEMS.filter((item) =>
    hasModuleAccess(boUserRole, item.id.replace('bo-', '') as Parameters<typeof hasModuleAccess>[1])
  )

  return (
    <div className={`screen-enter min-h-full p-6 lg:p-8 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <BoPageHeader
        title="Administration"
        description="Gérez les accès, la configuration et les outils système de la plateforme."
      />

      {accessibleItems.length === 0 ? (
        <div className={`mt-6 flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-300 bg-white'}`}>
          <ShieldAlert className={isDark ? 'h-8 w-8 text-slate-500' : 'h-8 w-8 text-slate-400'} />
          <h2 className={`mt-4 text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Accès non autorisé</h2>
          <p className={`mt-1 max-w-sm text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Votre rôle ne permet pas d’accéder aux modules d’administration.
          </p>
        </div>
      ) : (
        <section className="mt-6">
          <div className="mb-4 flex items-center gap-2">
            <Settings className={isDark ? 'h-4 w-4 text-blue-400' : 'h-4 w-4 text-blue-600'} />
            <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Modules disponibles</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accessibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => boNavigate(item.id as BoScreenRoute)}
                className={`group flex min-h-[132px] flex-col justify-between rounded-2xl border p-5 text-left transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${isDark ? 'border-slate-700 bg-slate-800 hover:border-blue-500/60' : 'border-slate-200 bg-white hover:border-blue-300'}`}
              >
                <span className="flex items-start justify-between gap-4">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                    <IconProxy name={item.icon} className="h-5 w-5" />
                  </span>
                  <ArrowRight className={`h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.label}</span>
                  <span className={`mt-1 block text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ouvrir le module</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
