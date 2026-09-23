'use client'

// Carte d'un dossier d'enrôlement de l'écran Enrôlement back-office
// (DET-001 tranche 12, MODE-1001) — JSX verbatim depuis
// bo-enrolement-screen.tsx : en-tête (dossier, acteur, type, classification
// marchand, zone, statut), sous-en-tête (identificateur, date, téléphone),
// badges photo/GPS, actions Valider/Rejeter/Demander info pour les dossiers
// en attente ou statut traité pour les autres.

import {
  CheckCircle2,
  XCircle,
  Check,
  X,
  Info,
  Clock,
  Camera,
  MapPin,
  Phone,
  User,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  useBackofficeStore,
  STATUS_LABELS,
  STATUS_COLORS,
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
} from '@/lib/stores/backoffice-store'
import { MARCHAND_CATEGORIES_META } from '@/lib/marchand-categories'
import { formatDate } from '@/lib/backoffice/enrolement-logic'
import type { BoEnrolment } from '@/lib/backoffice/bo-models'

// ============== ENROLMENT CARD ==============

interface EnrolmentCardProps {
  enrolment: BoEnrolment
  onValidate: (enrolment: BoEnrolment) => void
  onReject: (enrolment: BoEnrolment) => void
  onRequestInfo: (enrolment: BoEnrolment) => void
}

export function EnrolmentCard({
  enrolment,
  onValidate,
  onReject,
  onRequestInfo,
}: EnrolmentCardProps) {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'
  const isPending = enrolment.status === 'en_attente'
  return (
    <Card className={`gap-0 overflow-hidden rounded-2xl py-0 shadow-sm transition-[box-shadow,border-color] duration-150 hover:shadow-md ${isDark ? 'border-slate-700 bg-slate-800 hover:border-slate-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      {/* Header row */}
      <CardHeader className="gap-4 p-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Dossier ID badge */}
            <Badge
              variant="secondary"
              className="bg-slate-900 font-mono text-xs text-white"
            >
              {enrolment.dossierId}
            </Badge>

            {/* Actor name */}
            <span className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {enrolment.actorName}
            </span>

            {/* Actor type */}
            <span className={`inline-flex items-center gap-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span>{(() => { const Icon = ACTOR_TYPE_ICONS[enrolment.actorType]; return Icon ? <Icon className="h-4 w-4" /> : null })()}</span>
              <span>{ACTOR_TYPE_LABELS[enrolment.actorType]}</span>
            </span>

            {/* Classification marchand (détaillant / semi-grossiste / grossiste).
                Non affichée pour les dossiers antérieurs à la classification. */}
            {enrolment.categorieMarchand && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MARCHAND_CATEGORIES_META[enrolment.categorieMarchand]?.badgeClass ?? 'bg-slate-100 text-slate-700'}`}>
                {MARCHAND_CATEGORIES_META[enrolment.categorieMarchand]?.label ?? enrolment.categorieMarchand}
              </span>
            )}
          </div>

          {/* Zone + Status badge */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${isDark ? 'text-slate-400' : 'text-[#333333]/60'}`}>
              <MapPin className="mr-1 h-3 w-3" />
              {enrolment.zone}
            </Badge>
            <Badge className={STATUS_COLORS[enrolment.status]}>
              {STATUS_LABELS[enrolment.status]}
            </Badge>
          </div>
        </div>

        {/* Subheader: identificateur, date, phone */}
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-xs ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {enrolment.identificateurName}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {formatDate(enrolment.submittedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {enrolment.phone}
          </span>
        </div>

        {/* Badges: Photo & GPS */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              enrolment.hasPhoto
                ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                : isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'
            }`}
          >
            <Camera className="h-3 w-3" />
            Photo {enrolment.hasPhoto ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              enrolment.hasGps
                ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                : isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'
            }`}
          >
            <MapPin className="h-3 w-3" />
            GPS {enrolment.hasGps ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
        </div>
      </CardHeader>

      <Separator />

      {/* Footer */}
      <CardFooter className={`flex flex-wrap gap-2 px-5 py-3.5 ${isDark ? 'bg-slate-900/30' : 'bg-slate-50/70'}`}>
        {isPending ? (
          /* Action buttons for pending enrolments */
          <>
            <Button
              size="sm"
              onClick={() => onValidate(enrolment)}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Valider
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReject(enrolment)}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Rejeter
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRequestInfo(enrolment)}
              className={isDark ? 'border-slate-600 text-slate-100' : 'text-slate-700'}
            >
              <Info className="mr-1.5 h-4 w-4" />
              Demander info
            </Button>
          </>
        ) : (
          /* Status info for processed enrolments */
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${isDark ? 'text-slate-400' : 'text-[#333333]/70'}`}>
            <Badge className={STATUS_COLORS[enrolment.status]}>
              {STATUS_LABELS[enrolment.status]}
            </Badge>
            {enrolment.validatedBy && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Par {enrolment.validatedBy}
              </span>
            )}
            {enrolment.validatedAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(enrolment.validatedAt)}
              </span>
            )}
            {enrolment.status === 'info_demandee' && enrolment.infoRequestReason && (
              <span className={`inline-flex items-center gap-1 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                <Info className="h-3.5 w-3.5" />
                {enrolment.infoRequestReason}
              </span>
            )}
            {enrolment.rejectReason && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {enrolment.rejectReason}
              </span>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
