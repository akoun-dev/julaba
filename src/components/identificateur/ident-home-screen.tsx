'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import {
  Bell, Settings, Search, Plus, FileEdit, Clock,
  CheckCircle2, XCircle, Users, BarChart3, FileText,
  Shield, ChevronRight, Target
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'
import type { ScreenRoute } from '@/lib/stores/app-store'

const IDENT_COLOR = '#9F8170'

export function IdentHomeScreen() {
  const { navigate, goBack, merchantName, soleilMode } = useAppStore()
  const {
    dossiers,
    agentZone,
    agentMarche,
    mission,
    screenSensitive,
    toggleScreenSensitive,
    setCurrentDraftId,
  } = useIdentificateurStore()

  // Counts by status
  const brouillons = dossiers.filter((d) => d.status === 'brouillon')
  const enAttente = dossiers.filter((d) => d.status === 'en_attente')
  const valides = dossiers.filter((d) => d.status === 'valide')
  const rejetes = dossiers.filter((d) => d.status === 'rejete')

  // KPIs
  const totalActeurs = valides.length + enAttente.length
  const tauxValidation = totalActeurs > 0
    ? Math.round((valides.length / totalActeurs) * 100)
    : 0

  // Breakdown by actor type
  const validesMarchands = valides.filter((d) => d.actorType === 'marchand').length
  const validesProducteurs = valides.filter((d) => d.actorType === 'producteur').length
  const validesCooperatives = valides.filter((d) => d.actorType === 'cooperative').length

  // Mission progress
  const missionProgress = mission.target > 0
    ? Math.round((valides.length / mission.target) * 100)
    : 0
  const missionRemaining = Math.max(0, mission.target - valides.length)

  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-lg' : 'text-base'
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'
  const labelClass = soleilMode ? 'text-xs font-semibold' : 'text-[10px]'

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 17 ? 'Bon après-midi' : 'Bonsoir'

  // Counter cards
  const counterCards = [
    {
      icon: FileEdit,
      label: 'Brouillon',
      count: brouillons.length,
      screen: 'ident-brouillons' as ScreenRoute,
      color: 'bg-amber-100 text-amber-700',
    },
    {
      icon: Clock,
      label: 'En attente',
      count: enAttente.length,
      screen: 'ident-suivi' as ScreenRoute,
      color: 'bg-blue-100 text-blue-700',
    },
    {
      icon: CheckCircle2,
      label: 'Validé',
      count: valides.length,
      screen: 'ident-acteurs' as ScreenRoute,
      color: 'bg-green-100 text-green-700',
    },
    {
      icon: XCircle,
      label: 'Rejété',
      count: rejetes.length,
      screen: 'ident-suivi' as ScreenRoute,
      color: 'bg-red-100 text-red-700',
    },
  ]

  // Quick access items
  const quickAccess = [
    {
      label: `Brouillons (${brouillons.length})`,
      screen: 'ident-brouillons' as ScreenRoute,
      icon: FileEdit,
    },
    {
      label: `En attente (${enAttente.length})`,
      screen: 'ident-suivi' as ScreenRoute,
      icon: Clock,
    },
    {
      label: 'Statistiques',
      screen: 'ident-statistiques' as ScreenRoute,
      icon: BarChart3,
    },
    {
      label: 'Rapports',
      screen: 'ident-rapports' as ScreenRoute,
      icon: FileText,
    },
  ]

  return (
    <div className="screen-enter pb-24">
      {/* Top bar */}
      <div
        className="px-4 py-3 flex items-center justify-between rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <span className="text-white font-bold text-sm tracking-wider">
          IDENTIFICATEUR
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9"
          >
            <Bell className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9"
            onClick={() => navigate('ident-parametres')}
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Greeting & zone info */}
      <div className="px-4 pt-4 pb-2">
        <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
          👋 {greeting} {merchantName || 'Agent'}
        </p>
        <p className={cn('text-xs text-muted-foreground mt-0.5', soleilMode && 'text-sm')}>
          📍 Zone : {agentZone} · {agentMarche}
        </p>
      </div>

      {/* Search bar */}
      <div className="px-4 mt-2">
        <div
          className="flex items-center gap-2 h-11 px-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => { setCurrentDraftId(null); navigate('ident-identification') }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setCurrentDraftId(null); navigate('ident-identification') }
          }}
        >
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Trouver ou créer un acteur
          </span>
        </div>
      </div>

      {/* Nouveau dossier card */}
      <div className="px-4 mt-3">
        <Card
          className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98] border-2"
          style={{ borderColor: `${IDENT_COLOR}30` }}
          onClick={() => { setCurrentDraftId(null); navigate('ident-identification') }}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${IDENT_COLOR}15` }}
              >
                <Plus className="w-5 h-5" style={{ color: IDENT_COLOR }} />
              </div>
              <div>
                <p className={cn('font-semibold text-sm', textClass)}>Nouveau dossier</p>
                <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                  Enregistrer un nouvel acteur
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Counter cards - 4 in a row */}
      <div className="px-4 mt-4">
        <h2 className={cn('font-semibold mb-2', textClass, headingClass)}>
          Dossiers
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {counterCards.map((card) => (
            <Card
              key={card.label}
              className="cursor-pointer hover:shadow-sm transition-all active:scale-[0.97]"
              onClick={() => navigate(card.screen)}
            >
              <CardContent className="p-2.5 flex flex-col items-center text-center">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-1.5', card.color)}>
                  <card.icon className="w-4 h-4" />
                </div>
                <span className={cn('font-bold', soleilMode ? 'text-xl' : 'text-lg', textClass)}>
                  {card.count}
                </span>
                <span className={cn('text-muted-foreground leading-tight', labelClass)}>
                  {card.label}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Mon territoire section */}
      <div className="px-4 mt-5">
        <h2 className={cn('font-semibold mb-2', textClass, headingClass)}>
          🗺️ Mon territoire
        </h2>
        <Card>
          <CardContent className="p-4 space-y-3">
          {/* Total acteurs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>
                Total acteurs identifiés
              </span>
            </div>
            <span className={cn('font-bold', soleilMode ? 'text-lg' : 'text-base')} style={{ color: IDENT_COLOR }}>
              {totalActeurs}
            </span>
          </div>

          {/* Taux de validation */}
          <div className="flex items-center justify-between">
            <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>
              Taux de validation
            </span>
            <span className={cn('font-bold', soleilMode ? 'text-lg' : 'text-base')} style={{ color: IDENT_COLOR }}>
              {tauxValidation}%
            </span>
          </div>

          {/* Breakdown */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                Dont marchands
              </span>
              <span className={cn('font-semibold text-sm', textClass)}>
                {validesMarchands}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                Dont producteurs
              </span>
              <span className={cn('font-semibold text-sm', textClass)}>
                {validesProducteurs}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                Dont coopératives
              </span>
              <span className={cn('font-semibold text-sm', textClass)}>
                {validesCooperatives}
              </span>
            </div>
          </div>
          </CardContent>
        </Card>
      </div>

      {/* Ma mission du mois */}
      <div className="px-4 mt-5">
        <h2 className={cn('font-semibold mb-2', textClass, headingClass)}>
          🎯 Ma mission du mois
        </h2>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: IDENT_COLOR }} />
                <span className={cn('text-sm font-medium', textClass, soleilMode && 'text-base')}>
                  Objectif : {mission.target}
                </span>
              </div>
              <span className={cn('font-bold', soleilMode ? 'text-lg' : 'text-base')} style={{ color: IDENT_COLOR }}>
                {missionProgress}%
              </span>
            </div>
            <Progress value={missionProgress} className="h-3 mb-3" />
            <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
              {valides.length} / {mission.target} validés
              {missionRemaining > 0 && (
                <span className="font-medium text-muted-foreground">
                  {' '}— Il t&rsquo;en faut {missionRemaining} de plus !
                </span>
              )}
              {missionRemaining === 0 && (
                <span className="font-medium text-green-600">
                  {' '}— Objectif atteint ! 🎉
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accès rapides */}
      <div className="px-4 mt-5">
        <h2 className={cn('font-semibold mb-2', textClass, headingClass)}>
          ⚡ Accès rapides
        </h2>
        <div className="space-y-2">
          {quickAccess.map((item) => (
            <Card
              key={item.label}
              className="cursor-pointer hover:shadow-sm transition-all active:scale-[0.98]"
              onClick={() => navigate(item.screen)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4" style={{ color: IDENT_COLOR }} />
                  <span className={cn('text-sm font-medium', textClass, soleilMode && 'text-base')}>
                    {item.label}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Alerte sécurité card */}
      <div className="px-4 mt-5 mb-4">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Shield className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <p className={cn('text-sm font-medium', textClass)}>🔒 Alerte sécurité</p>
                <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                  {screenSensitive ? 'Écran sensible activé' : 'Écran sensible désactivé'}
                </p>
              </div>
            </div>
            <Switch
              checked={screenSensitive}
              onCheckedChange={() => {
                toggleScreenSensitive()
                navigate('ident-parametres')
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
