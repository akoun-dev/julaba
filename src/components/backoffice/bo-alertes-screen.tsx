'use client'

/**
 * Alertes & seuils — rend le back-office proactif.
 *
 * Quatre règles paramétrables (seuil + activation) alimentent le moteur
 * d'alertes : dossiers en attente (heures), identificateur inactif
 * (jours), chute de ventes (%) et objectif mensuel en retard (%).
 * « Évaluer maintenant » exécute le moteur contre les données réelles du
 * jour et écrit les alertes nouvelles dans legacy_bo_alerts — elles
 * remontent immédiatement dans la cloche du header et ci-dessous, avec
 * déduplication par jour (type + référence).
 */

import { useState, useMemo, useEffect } from 'react'
import {
  BellRing,
  Play,
  Loader2,
  Clock,
  UserX,
  TrendingDown,
  Target,
  CheckCheck,
  AlertTriangle,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useBackofficeStore, type BoAlertRule } from '@/lib/stores/backoffice-store'
import { DEFAULT_ALERT_RULES, ALERT_RULE_LABELS, type AlertRuleType } from '@/lib/alertes-moteur'
import { BoPageHeader, BoStatCard, BoErrorBanner } from './bo-ui'

const RULE_ICONS: Record<AlertRuleType, React.ElementType> = {
  dossiers_en_attente: Clock,
  identificateur_inactif: UserX,
  chute_ventes: TrendingDown,
  objectif_en_retard: Target,
}

const SEVERITY_BADGES: Record<string, string> = {
  haute: 'bg-red-100 text-red-800 border-red-200',
  moyenne: 'bg-amber-100 text-amber-800 border-amber-200',
  basse: 'bg-slate-100 text-slate-700 border-slate-200',
}

interface EditableRule {
  threshold: string
  enabled: boolean
}

function defaultRulesFromDefaults(): Record<AlertRuleType, EditableRule> {
  return {
    dossiers_en_attente: { threshold: String(DEFAULT_ALERT_RULES.dossiers_en_attente.threshold), enabled: true },
    identificateur_inactif: { threshold: String(DEFAULT_ALERT_RULES.identificateur_inactif.threshold), enabled: true },
    chute_ventes: { threshold: String(DEFAULT_ALERT_RULES.chute_ventes.threshold), enabled: true },
    objectif_en_retard: { threshold: String(DEFAULT_ALERT_RULES.objectif_en_retard.threshold), enabled: true },
  }
}

export function BoAlertesScreen() {
  const {
    alerts,
    alertRules,
    fetchAlertRules,
    fetchAlerts,
    saveAlertRules,
    evaluateAlerts,
    acknowledgeAlert,
    errors,
    setDomainError,
    boTheme,
  } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [rules, setRules] = useState<Record<AlertRuleType, EditableRule>>(defaultRulesFromDefaults)
  const [saving, setSaving] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [seuilModifie, setSeuilModifie] = useState(false)

  // Charge les seuils puis les alertes générées.
  useEffect(() => {
    fetchAlertRules()
    fetchAlerts()
     
  }, [])

  // Synchronise l'édition locale quand la base répond.
  useEffect(() => {
    if (alertRules.length === 0) return
    const next = { ...defaultRulesFromDefaults() }
    for (const r of alertRules as BoAlertRule[]) {
      if (!RULE_ICONS[r.ruleType]) continue
      next[r.ruleType] = { threshold: String(r.threshold), enabled: r.enabled }
    }
    setRules(next)
    setSeuilModifie(false)
  }, [alertRules])

  const handleEvaluate = async () => {
    setEvaluating(true)
    const result = await evaluateAlerts()
    setEvaluating(false)
    if (!result) {
      toast.error('Évaluation impossible — voir le message en haut de la page.')
      return
    }
    if (result.generated === 0) {
      toast.info('Aucune nouvelle alerte — tout est dans les seuils.')
    } else {
      toast.success(`${result.generated} alerte(s) nouvelle(s) générée(s).`)
    }
    if (result.skipped.length > 0) {
      toast.info(`Règle ignorée (données indisponibles) : ${result.skipped.join(', ')}.`)
    }
  }

  const handleSaveSeuils = async () => {
    const payload: { ruleType: BoAlertRule['ruleType']; threshold: number; enabled: boolean }[] = []
    for (const [ruleType, r] of Object.entries(rules) as [AlertRuleType, EditableRule][]) {
      const threshold = Number(r.threshold)
      if (!Number.isFinite(threshold) || threshold < 0) {
        toast.error(`Seuil invalide pour « ${ALERT_RULE_LABELS[ruleType].title} ».`)
        return
      }
      payload.push({ ruleType, threshold, enabled: r.enabled })
    }
    setSaving(true)
    const ok = await saveAlertRules(payload)
    setSaving(false)
    if (ok) {
      setSeuilModifie(false)
      toast.success('Seuils enregistrés — le moteur les appliquera à la prochaine évaluation.')
    } else {
      toast.error('Enregistrement impossible — voir le message en haut de la page.')
    }
  }

  const unacknowledged = useMemo(() => alerts.filter((a) => !a.acknowledged), [alerts])
  const hautes = useMemo(() => unacknowledged.filter((a) => a.severity === 'haute').length, [unacknowledged])
  const moyennes = useMemo(() => unacknowledged.filter((a) => a.severity === 'moyenne').length, [unacknowledged])
  const basses = useMemo(() => unacknowledged.filter((a) => a.severity === 'basse').length, [unacknowledged])

  const error = errors.alertRules ?? errors.alerts ?? null

  return (
    <div className={`min-h-full p-4 sm:p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      <BoPageHeader
        title="Alertes & seuils"
        description="Définissez les seuils qui déclenchent des alertes automatiques — le back-office devient proactif au lieu de consultatif."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveSeuils}
              disabled={saving || !seuilModifie}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Enregistrer les seuils
            </Button>
            <Button type="button" onClick={handleEvaluate} disabled={evaluating} className="gap-1.5">
              {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Évaluer maintenant
            </Button>
          </>
        }
      />

      {error && (
        <BoErrorBanner
          message={error}
          onRetry={() => { setDomainError('alertRules', null); setDomainError('alerts', null); fetchAlertRules(); fetchAlerts() }}
        />
      )}

      {/* Statistiques alertes non lues */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BoStatCard icon={BellRing} label="Alertes non lues" value={unacknowledged.length} tone={unacknowledged.length > 0 ? 'blue' : 'emerald'} />
        <BoStatCard icon={ShieldAlert} label="Sévérité haute" value={hautes} tone={hautes > 0 ? 'red' : 'default'} />
        <BoStatCard icon={AlertTriangle} label="Sévérité moyenne" value={moyennes} tone={moyennes > 0 ? 'amber' : 'default'} />
        <BoStatCard icon={Info} label="Sévérité basse" value={basses} />
      </div>

      {/* Seuils configurables */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Seuils du moteur
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(ALERT_RULE_LABELS) as AlertRuleType[]).map((ruleType) => {
            const Icon = RULE_ICONS[ruleType]
            const def = ALERT_RULE_LABELS[ruleType]
            const unit = DEFAULT_ALERT_RULES[ruleType].unit
            const r = rules[ruleType]
            return (
              <Card key={ruleType} className={`bg-white dark:bg-slate-800 dark:border-slate-700 ${!r.enabled ? 'opacity-70' : ''}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                        <Icon className="size-5 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100">{def.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(checked) => {
                        setRules((s) => ({ ...s, [ruleType]: { ...s[ruleType], enabled: checked } }))
                        setSeuilModifie(true)
                      }}
                      aria-label={`Activer la règle ${def.title}`}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-32 space-y-1">
                      <Label htmlFor={`seuil-${ruleType}`} className="text-xs text-slate-500 dark:text-slate-400">
                        Seuil
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          id={`seuil-${ruleType}`}
                          type="number"
                          min={0}
                          step={1}
                          value={r.threshold}
                          disabled={!r.enabled}
                          onChange={(e) => {
                            setRules((s) => ({ ...s, [ruleType]: { ...s[ruleType], threshold: e.target.value } }))
                            setSeuilModifie(true)
                          }}
                        />
                        <span className="pb-2 text-sm font-medium text-slate-500 dark:text-slate-400">{unit}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Alertes générées */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Alertes générées ({unacknowledged.length} non lue{unacknowledged.length > 1 ? 's' : ''})
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Dédupliquées par jour — « Évaluer maintenant » ou un cron planifié.
          </p>
        </div>
        {alerts.length === 0 ? (
          <Card className="bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center">
              <BellRing className="h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune alerte — lancez une première évaluation du moteur.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 30).map((a) => (
              <Card
                key={a.id}
                className={`bg-white dark:bg-slate-800 dark:border-slate-700 ${!a.acknowledged ? 'border-l-4' : 'opacity-75'} ${
                  !a.acknowledged
                    ? a.severity === 'haute'
                      ? 'border-l-red-500'
                      : a.severity === 'moyenne'
                        ? 'border-l-amber-500'
                        : 'border-l-slate-400'
                    : ''
                }`}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={`border capitalize ${SEVERITY_BADGES[a.severity] || SEVERITY_BADGES.basse}`}>
                        {a.severity}
                      </Badge>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{a.title}</p>
                      {!a.acknowledged && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          Nouveau
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{a.message}</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      module {a.module} ·{' '}
                      {new Date(a.timestamp).toLocaleString('fr-FR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {!a.acknowledged && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await acknowledgeAlert(a.id)
                        toast.success('Alerte prise en compte.')
                      }}
                      className="gap-1.5"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Prendre en compte
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
