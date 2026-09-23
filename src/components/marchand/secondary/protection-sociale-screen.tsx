'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Building2, Shield, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'

// ============================================================
// PROTECTION SOCIALE SCREEN - CNPS/CMU info
// ============================================================

export function ProtectionSocialeScreen() {
  const { soleilMode, goBack } = useAppStore()

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Protection sociale</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          CNPS, CMU et assurances
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* CNPS Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-bold ${soleilMode ? 'text-black text-base' : ''}`}>CNPS - Caisse Nationale de Prévoyance Sociale</h3>
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  La CNPS vous protège en cas de maladie, de maternité, d'accident du travail et pour la retraite.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="secondary" className="text-[10px]">Maladie</Badge>
                  <Badge variant="secondary" className="text-[10px]">Maternité</Badge>
                  <Badge variant="secondary" className="text-[10px]">Retraite</Badge>
                  <Badge variant="secondary" className="text-[10px]">Accidents</Badge>
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs" disabled>
                  En savoir plus
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CMU Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-bold ${soleilMode ? 'text-black text-base' : ''}`}>CMU - Couverture Maladie Universelle</h3>
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  La CMU permet l'accès aux soins de santé pour tous. Renseignez-vous dans votre centre de santé le plus proche.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className={`text-xs ${soleilMode ? 'text-base' : ''}`}>Gratuit pour les indigents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className={`text-xs ${soleilMode ? 'text-base' : ''}`}>Famille couverte</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs" disabled>
                  Vérifier mon éligibilité
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/40">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300 mt-0.5 shrink-0" />
              <div>
                <p className={`text-sm font-medium text-amber-800 dark:text-amber-200 ${soleilMode ? 'text-base text-black' : ''}`}>Information</p>
                <p className={`text-xs text-amber-700 dark:text-amber-300 mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  Ces services nécessitent une connexion internet pour vérifier votre immatriculation et statut.
                  Rendez-vous à la CNPS ou à votre centre de santé pour plus d'informations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
