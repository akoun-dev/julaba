'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Ban,
  UserX,
  AlertOctagon,
  ShieldAlert,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Flag,
  User,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useBackofficeStore, BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type ReportSeverity = 'critique' | 'haute' | 'moyenne' | 'basse'
type ReportStatus = 'nouveau' | 'en_cours' | 'resolu'

interface ModerationReport {
  id: string
  reporterName: string
  reporterRole: string
  actorName: string
  actorId: string
  actorType: string
  reason: string
  description: string
  severity: ReportSeverity
  status: ReportStatus
  createdAt: string
  resolvedAt?: string
  resolutionNote?: string
}

// ============== MOCK DATA ==============

const INITIAL_REPORTS: ModerationReport[] = [
  {
    id: 'rep-1', reporterName: 'Kouadio Jean', reporterRole: 'Identificateur',
    actorName: 'Awa KOUASSI', actorId: 'M-0845', actorType: 'marchand',
    reason: 'Documents falsifiés', description: 'Le certificat de commerce semble être un faux. Numéro de référence introuvable dans le registre officiel du Ministère du Commerce.',
    severity: 'critique', status: 'nouveau', createdAt: '2026-08-27T14:20:00Z',
  },
  {
    id: 'rep-2', reporterName: 'Fatou SORO', reporterRole: 'Gestionnaire Zone',
    actorName: 'Ibrahim DIABY', actorId: 'P-0872', actorType: 'producteur',
    reason: 'Double compte détecté', description: 'Deux profils avec le même numéro de téléphone (+225 07 89 12 34) et des noms similaires détectés dans les zones Adjamé et Cocody.',
    severity: 'haute', status: 'en_cours', createdAt: '2026-08-27T13:45:00Z',
  },
  {
    id: 'rep-3', reporterName: 'Soro Marie', reporterRole: 'Identificateur',
    actorName: 'Paul BAMBA', actorId: 'M-0890', actorType: 'marchand',
    reason: 'Activité suspecte', description: 'Multiples transactions de haut montant (> 500 000 FCFA) en très peu de temps. Le profil a été créé il y a 3 jours seulement.',
    severity: 'haute', status: 'nouveau', createdAt: '2026-08-27T12:30:00Z',
  },
  {
    id: 'rep-4', reporterName: 'Diaby Ibrahim', reporterRole: 'Identificateur',
    actorName: 'Coopérative Akwaba', actorId: 'C-0801', actorType: 'cooperatif',
    reason: 'Informations incohérentes', description: "L'adresse déclarée ne correspond pas à la localisation GPS. L'écart est de 12 km ce qui est anormalement élevé.",
    severity: 'moyenne', status: 'resolu', createdAt: '2026-08-26T16:00:00Z', resolvedAt: '2026-08-27T09:00:00Z',
    resolutionNote: 'Adresse corrigée après vérification terrain. Le GPS était décalé.',
  },
  {
    id: 'rep-5', reporterName: 'Bamba Fatou', reporterRole: 'Identificateur',
    actorName: 'Kouadio Aminata', actorId: 'M-0912', actorType: 'marchand',
    reason: 'Photo non conforme', description: "La photo de profil est celle d'une autre personne. Le document d'identité ne correspond pas au visage présenté.",
    severity: 'moyenne', status: 'en_cours', createdAt: '2026-08-27T11:15:00Z',
  },
  {
    id: 'rep-6', reporterName: 'Jean KOUADIO', reporterRole: 'Opérateur Terrain',
    actorName: 'Traoré Moussa', actorId: 'P-0855', actorType: 'producteur',
    reason: 'Harcèlement signalé', description: 'Plusieurs marchands ont signalé un comportement agressif et des tentatives d\'extorsion lors des visites terrain dans la zone de Bouaké.',
    severity: 'critique', status: 'nouveau', createdAt: '2026-08-27T10:00:00Z',
  },
  {
    id: 'rep-7', reporterName: 'Affi COULIBALY', reporterRole: 'Gestionnaire Zone',
    actorName: 'Ouattara Yao', actorId: 'M-0878', actorType: 'marchand',
    reason: 'Vente de produits non autorisés', description: 'Le marchand vend des produits ne figurant pas dans son registre officiel. Vérification effectuée par les agents de la DGE.',
    severity: 'basse', status: 'resolu', createdAt: '2026-08-25T14:00:00Z', resolvedAt: '2026-08-26T10:00:00Z',
    resolutionNote: 'Avertissement formel envoyé. Le marchand a retiré les produits non conformes.',
  },
  {
    id: 'rep-8', reporterName: 'Moussa TRAORÉ', reporterRole: 'Admin National',
    actorName: 'Koné Bamba', actorId: 'M-0930', actorType: 'marchand',
    reason: 'Tentative de fraude au score', description: 'Manipulation détectée du système de scoring financier. Création de fausses transactions pour améliorer le score de crédit.',
    severity: 'critique', status: 'en_cours', createdAt: '2026-08-26T09:00:00Z',
  },
]

const SEVERITY_CONFIG: Record<ReportSeverity, { label: string; color: string; dotColor: string; icon: React.ReactNode }> = {
  critique: { label: 'Critique', color: 'bg-red-50 border-red-200', dotColor: 'bg-red-500', icon: <AlertOctagon className="h-3.5 w-3.5" /> },
  haute: { label: 'Haute', color: 'bg-orange-50 border-orange-200', dotColor: 'bg-orange-500', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  moyenne: { label: 'Moyenne', color: 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  basse: { label: 'Basse', color: 'bg-gray-50 border-gray-200', dotColor: 'bg-gray-400', icon: <Eye className="h-3.5 w-3.5" /> },
}

const SEVERITY_BADGE: Record<ReportSeverity, string> = {
  critique: 'bg-red-100 text-red-700',
  haute: 'bg-orange-100 text-orange-700',
  moyenne: 'bg-amber-100 text-amber-700',
  basse: 'bg-gray-100 text-gray-600',
}

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; icon: React.ReactNode }> = {
  nouveau: { label: 'Nouveau', color: 'bg-red-100 text-red-600', icon: <AlertTriangle className="h-3 w-3" /> },
  en_cours: { label: 'En cours', color: 'bg-amber-100 text-amber-600', icon: <Clock className="h-3 w-3" /> },
  resolu: { label: 'Résolu', color: 'bg-emerald-100 text-emerald-600', icon: <CheckCircle2 className="h-3 w-3" /> },
}

// ============== MAIN COMPONENT ==============

export function BoModerationScreen() {
  const { searchQuery, setSearchQuery } = useBackofficeStore()
  const [severityFilter, setSeverityFilter] = useState<string>('tous')
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [reports, setReports] = useState<ModerationReport[]>(INITIAL_REPORTS)
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const matchSearch = !searchQuery ||
        r.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reporterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.actorId.toLowerCase().includes(searchQuery.toLowerCase())
      const matchSev = severityFilter === 'tous' || r.severity === severityFilter
      const matchStatus = statusFilter === 'tous' || r.status === statusFilter
      return matchSearch && matchSev && matchStatus
    })
  }, [reports, searchQuery, severityFilter, statusFilter])

  const stats = useMemo(() => ({
    total: reports.length,
    nouveaux: reports.filter((r) => r.status === 'nouveau').length,
    enCours: reports.filter((r) => r.status === 'en_cours').length,
    resolus: reports.filter((r) => r.status === 'resolu').length,
    critiques: reports.filter((r) => r.severity === 'critique' && r.status !== 'resolu').length,
  }), [reports])

  const handleTraiter = (id: string) => {
    setReports((prev) => prev.map((r) => r.id === id ? { ...r, status: 'en_cours' as const } : r))
  }

  const handleResoudre = (id: string, note?: string) => {
    setReports((prev) => prev.map((r) => r.id === id ? {
      ...r, status: 'resolu' as const, resolvedAt: new Date().toISOString(), resolutionNote: note || '',
    } : r))
    setNoteTarget(null)
    setNoteText('')
    setShowNoteDialog(false)
  }

  const handleSuspendre = (id: string) => {
    setReports((prev) => prev.map((r) => r.id === id ? {
      ...r, status: 'resolu' as const, resolvedAt: new Date().toISOString(), resolutionNote: 'Acteur suspendu suite au signalement.',
    } : r))
    setSuspendTarget(null)
  }

  const openNoteDialog = (id: string) => {
    setNoteTarget(id)
    setNoteText('')
    setShowNoteDialog(true)
  }

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: BO_COLOR }}>
          <span className="inline-flex items-center gap-2"><AlertTriangle className="h-6 w-6" />MODÉRATION</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Signalements et gestion des comportements inappropriés
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Total</p>
                <p className="text-2xl font-bold mt-1" style={{ color: BO_COLOR }}>{stats.total}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <Flag className="h-4 w-4 text-gray-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Nouveaux</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{stats.nouveaux}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">En cours</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">{stats.enCours}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Résolus</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.resolus}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Critiques</p>
                <p className="text-2xl font-bold mt-1 text-red-700">{stats.critiques}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertOctagon className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par acteur, rapporteur, motif..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Toutes sévérités</SelectItem>
            <SelectItem value="critique">Critique</SelectItem>
            <SelectItem value="haute">Haute</SelectItem>
            <SelectItem value="moyenne">Moyenne</SelectItem>
            <SelectItem value="basse">Basse</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous statuts</SelectItem>
            <SelectItem value="nouveau">Nouveau</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="resolu">Résolu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reports List */}
      <div className="space-y-3">
        {filtered.map((report) => {
          const sevConfig = SEVERITY_CONFIG[report.severity]
          const statusConfig = STATUS_CONFIG[report.status]
          const isExpanded = expandedId === report.id
          return (
            <Card key={report.id} className={`border-l-4 shadow-sm transition-all ${sevConfig.color}`}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Left: Report info */}
                  <div className="flex-1 space-y-2.5">
                    {/* Top badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${SEVERITY_BADGE[report.severity]}`}>
                        {sevConfig.icon}
                        <span className="ml-1">{sevConfig.label}</span>
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${statusConfig.color}`}>
                        {statusConfig.icon}
                        <span className="ml-1">{statusConfig.label}</span>
                      </Badge>
                      <span className="text-[11px] text-gray-400 font-mono">#{report.id}</span>
                    </div>

                    {/* Reason title */}
                    <p className="font-semibold text-sm" style={{ color: BO_COLOR }}>{report.reason}</p>

                    {/* Collapsible description */}
                    <p className={`text-xs text-gray-600 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                      {report.description}
                    </p>
                    <button
                      className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    >
                      {isExpanded ? <><ChevronUp className="h-3 w-3" /> Réduire</> : <><ChevronDown className="h-3 w-3" /> Voir plus</>}
                    </button>

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span>Signalé par <strong className="text-gray-700">{report.reporterName}</strong></span>
                        <span className="text-gray-400">({report.reporterRole})</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span>Acteur : <strong className="text-gray-700">{report.actorName}</strong></span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{report.actorId}</Badge>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(report.createdAt)}
                      </span>
                    </div>

                    {/* Resolution note */}
                    {report.status === 'resolu' && report.resolutionNote && (
                      <div className="mt-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                        <p className="text-[11px] font-medium text-emerald-700 mb-0.5">Résolution</p>
                        <p className="text-xs text-emerald-600">{report.resolutionNote}</p>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col gap-2 shrink-0 lg:ml-4">
                    {report.status === 'nouveau' && (
                      <>
                        <Button size="sm" className="text-xs h-8 shadow-sm" onClick={() => handleTraiter(report.id)}>
                          <Eye className="h-3 w-3 mr-1.5" />
                          Prendre en charge
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openNoteDialog(report.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1.5" />
                          Résoudre
                        </Button>
                        <Button
                          size="sm" variant="destructive" className="text-xs h-8"
                          onClick={() => setSuspendTarget(report.id)}
                        >
                          <UserX className="h-3 w-3 mr-1.5" />
                          Suspendre
                        </Button>
                      </>
                    )}
                    {report.status === 'en_cours' && (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openNoteDialog(report.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1.5" />
                          Résoudre avec note
                        </Button>
                        <Button
                          size="sm" variant="destructive" className="text-xs h-8"
                          onClick={() => setSuspendTarget(report.id)}
                        >
                          <Ban className="h-3 w-3 mr-1.5" />
                          Suspendre l'acteur
                        </Button>
                      </>
                    )}
                    {report.status === 'resolu' && report.resolvedAt && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <div>
                          <p className="font-medium text-emerald-600">Résolu</p>
                          <p>{formatDate(report.resolvedAt)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <ShieldAlert className="h-14 w-14 mx-auto mb-4 opacity-30" />
            <p className="text-sm font-medium">Aucun signalement trouvé</p>
            <p className="text-xs mt-1">Modifiez vos filtres pour voir plus de résultats</p>
          </div>
        )}
      </div>

      {/* Suspend Dialog */}
      <AlertDialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-500" />
              Suspendre l&apos;acteur ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L&apos;acteur ne pourra plus accéder à la plateforme jusqu&apos;à réactivation manuelle par un administrateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => suspendTarget && handleSuspendre(suspendTarget)}
            >
              <Ban className="h-4 w-4 mr-2" />
              Confirmer la suspension
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resolve with Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              Résoudre le signalement
            </DialogTitle>
            <DialogDescription>Ajoutez une note de résolution pour documenter la décision.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Note de résolution</Label>
              <Textarea
                placeholder="Décrivez la résolution du signalement..."
                rows={4}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Annuler</Button>
            <Button onClick={() => noteTarget && handleResoudre(noteTarget, noteText)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Résoudre
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
