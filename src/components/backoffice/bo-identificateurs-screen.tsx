'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  IdCard,
  UserCheck,
  SearchX,
  MapPin,
  Phone,
  Mail,
  Plus,
  Search,
  Loader2,
  Inbox,
  RefreshCw,
  Copy,
  Check,
  UserX,
  KeyRound,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useBackofficeStore,
  type BoIdentificateur,
} from '@/lib/stores/backoffice-store'
import { ZONES } from '@/lib/stores/identificateur-store'
import { BoPageHeader, BoErrorBanner, BoEmptyState } from './bo-ui'

// ============== SUMMARY CARD ==============

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  return (
    <Card className={`${isDark ? 'bg-slate-800 border-slate-700' : 'border-slate-200'}`}>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}
        >
          <Icon className={`h-5 w-5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'} truncate`}>{label}</p>
          <p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
          </p>
          {sub && (
            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'} truncate`}>{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============== AGENT ROW ==============

function AgentRow({
  agent,
  onToggleActive,
  toggling,
  onIssueLiaisonCode,
  issuing,
}: {
  agent: BoIdentificateur
  onToggleActive: (agent: BoIdentificateur) => void
  toggling: boolean
  onIssueLiaisonCode: (agent: BoIdentificateur) => void
  issuing: boolean
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const initials = (agent.firstName || agent.name)
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}
    >
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${agent.isActive ? 'bg-blue-100 text-blue-700' : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-400'}`}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`truncate text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {agent.name}
            </p>
            {agent.agentCode && (
              <Badge
                variant="secondary"
                className={`font-mono text-[10px] tracking-wide ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-900 text-white'}`}
                title="Code agent unique"
              >
                {agent.agentCode}
              </Badge>
            )}
          </div>
          <div className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {agent.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {agent.phone.replace(/(\d{2})(?=\d)/g, '$1 ').trim()}
              </span>
            )}
            {agent.email && (
              <span className="flex min-w-0 items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{agent.email}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zone + status + action */}
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {agent.zone ? (
          <Badge variant="secondary" className={`shrink-0 text-[11px] font-medium ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
            <MapPin className="mr-1 h-3 w-3" />
            {agent.zone}
          </Badge>
        ) : (
          <span className={`shrink-0 text-[11px] italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sans zone</span>
        )}
        <Badge
          variant="secondary"
          className={`shrink-0 text-[11px] font-medium ${agent.isActive ? 'bg-emerald-100 text-emerald-700' : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
        >
          {agent.isActive ? 'Actif' : 'Désactivé'}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!agent.isActive || issuing}
          onClick={() => onIssueLiaisonCode(agent)}
          title={!agent.isActive ? 'Compte désactivé' : 'Émettre un code de liaison appareil (30 jours)'}
          className={`shrink-0 gap-1.5 text-xs ${isDark ? 'border-slate-600' : ''}`}
        >
          {issuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Code de liaison
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={toggling}
          onClick={() => onToggleActive(agent)}
          className={`shrink-0 gap-1.5 text-xs ${agent.isActive ? 'text-red-600 hover:bg-red-50 hover:text-red-700' : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'} ${isDark ? 'border-slate-600' : ''}`}
        >
          {toggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : agent.isActive ? (
            <UserX className="h-3.5 w-3.5" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          {agent.isActive ? 'Désactiver' : 'Activer'}
        </Button>
      </div>
    </div>
  )
}

// ============== CREATE DIALOG ==============

function CreateIdentificateurDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const { boTheme, createIdentificateur } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [zone, setZone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [created, setCreated] = useState<BoIdentificateur | null>(null)
  const [copied, setCopied] = useState(false)

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    phone.replace(/\D/g, '').length === 10 &&
    !submitting

  const resetForm = () => {
    setFirstName('')
    setLastName('')
    setPhone('')
    setEmail('')
    setZone('')
    setFormError('')
    setCreated(null)
    setCopied(false)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setFormError('')
    setSubmitting(true)
    const result = await createIdentificateur({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      zone: zone || undefined,
    })
    setSubmitting(false)
    if (!result) {
      setFormError('Création refusée — vérifiez les informations (numéro déjà pris ?).')
      return
    }
    setCreated(result)
    onCreated()
  }

  const copyCode = async () => {
    if (!created?.agentCode) return
    try {
      await navigator.clipboard.writeText(created.agentCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const formatPhone = (value: string) =>
    value.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 ').trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          // Laisse le temps de voir le code agent avant de réinitialiser.
          setTimeout(resetForm, 200)
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Identificateur créé
              </DialogTitle>
              <DialogDescription>
                Communiquez ces identifiants à l'agent : il se connectera avec
                son numéro (ou ce code) et créera son code PIN à la première
                ouverture de l'application.
              </DialogDescription>
            </DialogHeader>

            <div className={`rounded-xl border-2 border-dashed p-4 text-center ${isDark ? 'border-slate-600 bg-slate-800/60' : 'border-slate-300 bg-slate-50'}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Code agent unique
              </p>
              <p className={`mt-1 font-mono text-3xl font-bold tracking-widest ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {created.agentCode}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyCode}
                className={`mt-3 gap-1.5 text-xs ${isDark ? 'border-slate-600' : ''}`}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copié' : 'Copier le code'}
              </Button>
              <div className={`mt-3 space-y-1 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <p className="font-semibold">{created.name}</p>
                {created.phone && <p>Tél : {formatPhone(created.phone)}</p>}
                {created.zone && <p>Zone : {created.zone}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className={isDark ? 'border-slate-700' : 'border-slate-200'} onClick={() => onOpenChange(false)}>
                Terminer
              </Button>
              <Button
                onClick={() => {
                  resetForm()
                  // Réouvre direct sur le formulaire pour un second agent.
                  onOpenChange(false)
                  setTimeout(() => onOpenChange(true), 50)
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Créer un autre
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Nouvel identificateur
              </DialogTitle>
              <DialogDescription>
                Les comptes identificateurs sont créés exclusivement ici, par
                le back-office. Le code agent unique est généré
                automatiquement.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Prénom</Label>
                  <Input
                    placeholder="Ex: Kouamé"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={isDark ? 'border-slate-700' : 'border-slate-200'}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Nom</Label>
                  <Input
                    placeholder="Ex: Yao"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={isDark ? 'border-slate-700' : 'border-slate-200'}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Téléphone (identifiant de connexion)
                </Label>
                <div className="flex gap-2">
                  <div className={`flex items-center px-3 rounded-md text-sm font-medium ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                    +225
                  </div>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="05 55 55 55 55"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`flex-1 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Email (optionnel)
                </Label>
                <Input
                  type="email"
                  placeholder="agent@julaba.ci"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={isDark ? 'border-slate-700' : 'border-slate-200'}
                />
              </div>

              <div className="space-y-2">
                <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Zone d'affectation
                </Label>
                <Select value={zone} onValueChange={setZone}>
                  <SelectTrigger className={`w-full ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <SelectValue placeholder="Sélectionner une zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {ZONES.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formError && (
                <p className="text-xs text-red-600">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  className={isDark ? 'border-slate-700' : 'border-slate-200'}
                  onClick={() => onOpenChange(false)}
                >
                  Annuler
                </Button>
                <Button disabled={!canSubmit} onClick={handleSubmit}>
                  {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Créer l'identificateur
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============== MAIN COMPONENT ==============

export function BoIdentificateursScreen() {
  const { identificateurs, boTheme, loading, errors, fetchIdentificateurs, updateIdentificateur, issueIdentificateurLiaisonCode } = useBackofficeStore()
  const error = errors.missions ?? null
  const isDark = boTheme === 'dark'

  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState<string>('toutes')
  const [createOpen, setCreateOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [issuingLiaisonId, setIssuingLiaisonId] = useState<string | null>(null)
  // Code de liaison fraîchement émis (nom de l'agent + code) — le code en
  // clair n'est affiché qu'ici, une seule fois (one-shot côté serveur).
  const [liaisonIssued, setLiaisonIssued] = useState<{ name: string; code: string } | null>(null)
  const [liaisonCopied, setLiaisonCopied] = useState(false)

  // Le roster est rechargé à l'entrée sur l'écran (fraîcheur des statuts).
  useEffect(() => {
    fetchIdentificateurs()
  }, [])

  const zonesAvailable = useMemo(() => {
    const set = new Set(identificateurs.map((i) => i.zone).filter(Boolean) as string[])
    ZONES.forEach((z) => set.add(z))
    return Array.from(set).sort()
  }, [identificateurs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return identificateurs.filter((i) => {
      if (zoneFilter !== 'toutes' && i.zone !== zoneFilter) return false
      if (!q) return true
      return [i.name, i.agentCode, i.phone, i.email, i.zone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [identificateurs, search, zoneFilter])

  const summary = useMemo(
    () => ({
      total: identificateurs.length,
      active: identificateurs.filter((i) => i.isActive).length,
      zones: new Set(identificateurs.filter((i) => i.isActive && i.zone).map((i) => i.zone)).size,
    }),
    [identificateurs]
  )

  const handleToggleActive = async (agent: BoIdentificateur) => {
    setTogglingId(agent.id)
    await updateIdentificateur(agent.id, { isActive: !agent.isActive })
    setTogglingId(null)
  }

  // MODE-937 : émission d'un code de liaison 30 j — l'écran affiche le code
  // une seule fois (one-shot), l'agent le saisit à l'ouverture de son app.
  const handleIssueLiaisonCode = async (agent: BoIdentificateur) => {
    setIssuingLiaisonId(agent.id)
    setLiaisonCopied(false)
    const code = await issueIdentificateurLiaisonCode(agent.id)
    setIssuingLiaisonId(null)
    if (code) setLiaisonIssued({ name: agent.name, code })
  }

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      <BoPageHeader
        title="Identificateurs"
        description="Comptes agents créés exclusivement par le back-office — nom, prénom, téléphone, email et code agent unique"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="text-white self-start">
            <Plus className="mr-1.5 h-4 w-4" />
            Nouvel identificateur
          </Button>
        }
      />

      {error && <BoErrorBanner message={error} onRetry={() => fetchIdentificateurs()} />}

      {identificateurs.length === 0 && loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement du roster...</p>
        </div>
      ) : identificateurs.length === 0 && !loading ? (
        <BoEmptyState
          icon={Inbox}
          title="Aucun identificateur"
          description="Créez le premier compte agent : il pourra ensuite se connecter à l'application avec son numéro ou son code agent."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setCreateOpen(true)} className="text-white gap-2">
                <Plus className="h-4 w-4" />
                Nouvel identificateur
              </Button>
              <Button variant="outline" onClick={() => fetchIdentificateurs()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryCard icon={IdCard} label="Total agents" value={summary.total} sub="roster complet" />
            <SummaryCard icon={UserCheck} label="Agents actifs" value={summary.active} sub={`${summary.total - summary.active} désactivé(s)`} />
            <SummaryCard icon={MapPin} label="Zones couvertes" value={summary.zones} sub="agents actifs affectés" />
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <Input
                aria-label="Rechercher un identificateur"
                placeholder="Nom, code agent, téléphone, email, zone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`pl-9 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white'}`}
              />
            </div>
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className={`w-full sm:w-56 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white'}`}>
                <SelectValue placeholder="Toutes les zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toutes">Toutes les zones</SelectItem>
                {zonesAvailable.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Roster */}
          <div>
            <h2 className={`text-base font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Roster ({filtered.length} agent{filtered.length > 1 ? 's' : ''})
            </h2>
            <div className="space-y-2.5">
              {filtered.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  onToggleActive={handleToggleActive}
                  toggling={togglingId === agent.id}
                  onIssueLiaisonCode={handleIssueLiaisonCode}
                  issuing={issuingLiaisonId === agent.id}
                />
              ))}
              {filtered.length === 0 && (
                <BoEmptyState
                  icon={SearchX}
                  title="Aucun agent trouvé"
                  description="Aucun identificateur ne correspond à votre recherche ou au filtre de zone."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch('')
                        setZoneFilter('toutes')
                      }}
                    >
                      Réinitialiser les filtres
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        </>
      )}

      <CreateIdentificateurDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => fetchIdentificateurs()}
      />

      {/* MODE-937 — code de liaison émis : affichage one-shot + copie. */}
      <Dialog
        open={liaisonIssued !== null}
        onOpenChange={(v) => {
          if (!v) setLiaisonIssued(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Code de liaison émis
            </DialogTitle>
            <DialogDescription>
              Communiquez ce code à {liaisonIssued?.name ?? 'l’agent'} : il le saisira
              à l’ouverture de l’application pour lier son appareil. Usage
              UNIQUE — il ne fonctionne qu’une seule fois, dans les 30 jours.
            </DialogDescription>
          </DialogHeader>
          <div className={`rounded-xl border-2 border-dashed p-4 text-center ${isDark ? 'border-slate-600 bg-slate-800/60' : 'border-slate-300 bg-slate-50'}`}>
            <p className={`font-mono text-3xl font-bold tracking-widest ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {liaisonIssued?.code}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!liaisonIssued) return
                await navigator.clipboard.writeText(liaisonIssued.code).catch(() => {})
                setLiaisonCopied(true)
              }}
              className={`mt-3 gap-1.5 text-xs ${isDark ? 'border-slate-600' : ''}`}
            >
              {liaisonCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {liaisonCopied ? 'Copié' : 'Copier le code'}
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" className={isDark ? 'border-slate-700' : 'border-slate-200'} onClick={() => setLiaisonIssued(null)}>
              Terminer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
