'use client'

/**
 * Détail du dossier identificateur — maquette « vues du menu » : entête
 * retour + statut, carte acteur, alerte de correction (dossier rejeté),
 * parcours & traitement en 4 étapes, détails de l'acteur (téléphone, zone,
 * position GPS + mini-carte, agent assigné), actions bas de page.
 */

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  Download,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Settings,
  Smartphone,
  Trash2,
  UserCheck,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type Dossier, type DossierStatus } from '@/lib/stores/identificateur-store'
import { formatAbsoluteShort, formatRelativeTime } from '@/lib/relative-time'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const ACTOR_LABELS: Record<Dossier['actorType'], string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

function statusBadge(status: DossierStatus) {
  if (status === 'en_attente') return { label: 'En attente', className: 'bg-blue-50 text-blue-600' }
  if (status === 'valide') return { label: 'Validé', className: 'bg-green-50 text-green-600' }
  if (status === 'rejete') return { label: 'À corriger', className: 'bg-red-50 text-red-600' }
  return { label: 'Brouillon', className: 'bg-[#F5F0EB] text-[#78716C]' }
}

export function IdentDossierDetailScreen() {
  const { goBack, navigate, merchantName, soleilMode } = useAppStore()
  const {
    dossiers,
    agentZone,
    identDarkMode,
    dossierDetailId,
    setDossierDetailId,
    setCurrentDraftId,
    deleteDossier,
  } = useIdentificateurStore()
  const { toast } = useToast()

  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  const dossier = dossiers.find((d) => d.id === dossierDetailId)

  // Dossier absent (intent consommé, dossier supprimé…) : retour à la liste.
  useEffect(() => {
    if (!dossier) goBack()
  }, [dossier, goBack])

  if (!dossier) return null

  const openWizard = () => {
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleDelete = () => {
    deleteDossier(dossier.id)
    setDossierDetailId(null)
    toast({ title: 'Dossier supprimé', description: `${dossier.dossierNumber} a été supprimé.` })
    goBack()
  }

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'
  const badge = statusBadge(dossier.status)
  const actorName = `${dossier.firstName} ${dossier.lastName}`.trim()
  const agentName = dossier.agentName || merchantName || 'Vous'
  const agentInitials = agentName.split(' ').map((p) => p.charAt(0)).slice(0, 2).join('').toUpperCase()

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(2rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      {/* En-tête avec retour */}
      <header className={cn('flex items-center gap-2.5 border-b px-4 py-3', identDarkMode ? 'border-stone-800 bg-stone-950' : 'border-[#E7E0D8] bg-[#FAFAF7]')}>
        <button
          type="button"
          aria-label="Retour à la liste des dossiers"
          onClick={() => { setDossierDetailId(null); goBack() }}
          className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-200' : 'border-[#E7E0D8] bg-white text-[#57534E]')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-bold leading-tight', textClass)}>Détail du dossier</p>
          <p className={cn('mt-0.5 truncate text-[11px]', mutedClass)}>{online ? 'Synchronisé avec le serveur' : 'Mode hors ligne actif'}</p>
        </div>
        <button
          type="button"
          aria-label="Ouvrir les paramètres"
          onClick={() => navigate('ident-parametres')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170] focus-visible:ring-offset-2"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Numéro + statut */}
        <div className="flex items-center justify-between gap-2">
          <p className={cn('truncate text-[11px] font-bold uppercase tracking-wider', mutedClass)}>Dossier {dossier.dossierNumber}</p>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', badge.className)}>{badge.label}</span>
        </div>

        {/* Carte acteur */}
        <div className={cn('rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', cardClass)}>
          <div className="flex items-center gap-3">
            {dossier.photoBase64 ? (
              <img src={dossier.photoBase64} alt={`Photo de ${actorName}`} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-base font-bold', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>
                {(dossier.firstName.charAt(0) + dossier.lastName.charAt(0)).toUpperCase() || '?'}
              </span>
            )}
            <div className="min-w-0">
              <p className={cn('truncate text-lg font-bold leading-tight', textClass)}>{actorName}</p>
              <p className={cn('mt-1 truncate text-xs', mutedClass)}>
                {ACTOR_LABELS[dossier.actorType]}{dossier.typeCommerce === 'ambulant' ? ' ambulant' : ''} · {dossier.activite || dossier.nomCommerce || dossier.nomCooperative || 'Activité à préciser'}
              </p>
            </div>
          </div>
        </div>

        {/* Alerte de correction — dossiers rejetés */}
        {dossier.status === 'rejete' && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-900">Dossier à corriger avant validation</p>
                <p className="mt-1 text-xs leading-relaxed text-red-700/90">
                  La photo de la pièce d’identité ou du registre de commerce semble floue ou illisible. Veuillez reprendre la photo avant de relancer la validation.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openWizard}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-white p-2.5 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              {(dossier.cniRecto || dossier.photoBase64) ? (
                <img src={dossier.cniRecto || dossier.photoBase64!} alt="Justificatif rejeté" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
                  <Camera className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-stone-900">Photo du justificatif d’identité</span>
                <span className="mt-0.5 block truncate text-xs text-red-600">Rejeté : {dossier.rejectionReason || 'Résolution insuffisante'}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-red-400" />
            </button>
            <Button
              type="button"
              onClick={openWizard}
              className="mt-3 h-11 w-full gap-2 rounded-lg border-0 text-sm font-semibold text-white shadow-none hover:opacity-95 active:scale-[0.98]"
              style={{ backgroundColor: IDENT_COLOR }}
            >
              <Camera className="h-4 w-4" />
              Corriger la photo du dossier
            </Button>
          </div>
        )}

        {/* Parcours & Traitement */}
        <section className={cn('rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', cardClass)}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={cn('text-sm font-bold', textClass)}>Parcours &amp; Traitement</h2>
            <span className={cn('shrink-0 text-xs', mutedClass)}>Étape {parcoursStep(dossier)} sur 4</span>
          </div>
          <ol className="mt-4 space-y-0">
            <ParcoursRow
              done
              icon={<Check className="h-3.5 w-3.5" />}
              title="Dossier créé et enregistré"
              sub={`${formatAbsoluteShort(dossier.createdAt)} · Saisie terrain confirmée`}
              last={false}
              mutedClass={mutedClass}
              textClass={textClass}
              identDarkMode={identDarkMode}
            />
            <ParcoursRow
              done={dossier.status !== 'brouillon'}
              icon={dossier.status === 'brouillon' ? <Clock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              title="Synchronisé au serveur"
              sub={
                dossier.status === 'brouillon'
                  ? 'En attente d’envoi depuis le terrain'
                  : `${formatAbsoluteShort(dossier.submittedAt || dossier.updatedAt)} · Téléversement sécurisé`
              }
              last={false}
              mutedClass={mutedClass}
              textClass={textClass}
              identDarkMode={identDarkMode}
            />
            {dossier.status === 'rejete' ? (
              <ParcoursRow
                done
                alert
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                title="Refus de supervision"
                sub={`${formatAbsoluteShort(dossier.validatedAt || dossier.updatedAt)} · ${dossier.rejectionReason || 'Signalement reçu : photo illisible'}`}
                last={false}
                mutedClass={mutedClass}
                textClass={textClass}
                identDarkMode={identDarkMode}
              />
            ) : dossier.status === 'valide' ? (
              <ParcoursRow
                done
                success
                icon={<Check className="h-3.5 w-3.5" />}
                title="Validation supervision"
                sub={`${formatAbsoluteShort(dossier.validatedAt || dossier.updatedAt)} · Validé par ${dossier.validatedBy || 'la supervision'}`}
                last={false}
                mutedClass={mutedClass}
                textClass={textClass}
                identDarkMode={identDarkMode}
              />
            ) : (
              <ParcoursRow
                done={false}
                icon={<Clock3 className="h-3.5 w-3.5" />}
                title="Vérification supervision"
                sub={dossier.status === 'en_attente' ? 'Transmise · En cours de traitement' : 'Non transmise'}
                last={false}
                pending={dossier.status === 'en_attente'}
                mutedClass={mutedClass}
                textClass={textClass}
                identDarkMode={identDarkMode}
              />
            )}
            <ParcoursRow
              done={dossier.status === 'valide'}
              icon={<MapPin className="h-3.5 w-3.5" />}
              title="Attribution identifiant unique"
              sub="Génération de l’ID marchand national"
              last
              pending={dossier.status !== 'valide'}
              mutedClass={mutedClass}
              textClass={textClass}
              identDarkMode={identDarkMode}
            />
          </ol>
        </section>

        {/* Détails de l'acteur */}
        <section className={cn('rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', cardClass)}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={cn('text-sm font-bold', textClass)}>Détails de l’acteur</h2>
            <span className={cn('shrink-0 text-xs', mutedClass)}>Modifié {formatRelativeTime(dossier.updatedAt)}</span>
          </div>

          <div className="mt-2 divide-y divide-[#F0EAE2]">
            <DetailRow icon={<Smartphone className="h-4 w-4" />} label="Téléphone mobile" identDarkMode={identDarkMode}>
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-semibold', textClass)}>{dossier.phone}</span>
                {dossier.phone && (
                  <a
                    href={`tel:${dossier.phone.replace(/\s/g, '')}`}
                    aria-label={`Appeler ${actorName}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-green-600 transition-transform active:scale-95"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </DetailRow>

            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Zone d’opération" identDarkMode={identDarkMode}>
              <span className={cn('text-sm font-semibold', textClass)}>{dossier.zone || 'Non renseignée'}</span>
            </DetailRow>

            <DetailRow icon={<CalendarClock className="h-4 w-4" />} label="Positionnement mobile" identDarkMode={identDarkMode}>
              <span className={cn('text-sm font-semibold', textClass)}>
                {dossier.gps ? `${dossier.gps.lat.toFixed(4)}° N, ${Math.abs(dossier.gps.lon).toFixed(4)}° W` : 'Non capturée'}
              </span>
              {dossier.gps?.accuracy != null && (
                <span className={cn('mt-0.5 block text-right text-[11px]', mutedClass)}>± {Math.round(dossier.gps.accuracy)} m</span>
              )}
            </DetailRow>

            {dossier.gps && <MiniMap lat={dossier.gps.lat} lon={dossier.gps.lon} />}

            <DetailRow
              icon={<UserCheck className="h-4 w-4" />}
              label="Agent de terrain assigné"
              identDarkMode={identDarkMode}
              avatar={<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: IDENT_COLOR }}>{agentInitials}</span>}
            >
              <span className={cn('text-sm font-semibold', textClass)}>{agentName} (Vous)</span>
            </DetailRow>
          </div>
        </section>

        {/* Actions */}
        <div className="space-y-2.5">
          {dossier.status === 'brouillon' ? (
            <Button
              type="button"
              onClick={openWizard}
              className="h-12 w-full gap-2 rounded-xl border-0 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(159,129,112,0.35)] hover:opacity-95 active:scale-[0.98]"
              style={{ backgroundColor: IDENT_COLOR }}
            >
              <Pencil className="h-4 w-4" />
              Reprendre le dossier
            </Button>
          ) : (
            <Button
              type="button"
              onClick={openWizard}
              variant="outline"
              className={cn('h-12 w-full gap-2 rounded-xl border text-sm font-semibold active:scale-[0.98]', identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800' : 'border-[#E7E0D8] bg-white text-[#44403C] hover:bg-[#F5F0EB]')}
            >
              <Pencil className="h-4 w-4" />
              Modifier l’ensemble du dossier
            </Button>
          )}
          {dossier.status !== 'brouillon' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => toast({
                title: 'Attestation provisoire',
                description: `L’attestation de ${actorName} sera générée par le back-office après validation.`,
              })}
              className={cn('h-12 w-full gap-2 rounded-xl border text-sm font-semibold active:scale-[0.98]', identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800' : 'border-[#E7E0D8] bg-white text-[#44403C] hover:bg-[#F5F0EB]')}
            >
              <Download className="h-4 w-4" />
              Télécharger l’attestation provisoire
            </Button>
          )}
          {dossier.status === 'brouillon' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              className="h-12 w-full gap-2 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 active:scale-[0.98]"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer le dossier
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}

/** Numéro de l'étape courante (1-4) pour l'entête « Étape X sur 4 ». */
function parcoursStep(dossier: Dossier): number {
  if (dossier.status === 'valide') return 4
  if (dossier.status === 'rejete') return 3
  if (dossier.status === 'en_attente') return 3
  return 1
}

function ParcoursRow({
  done,
  alert,
  success,
  pending,
  icon,
  title,
  sub,
  last,
  mutedClass,
  textClass,
  identDarkMode,
}: {
  done: boolean
  alert?: boolean
  success?: boolean
  pending?: boolean
  icon: React.ReactNode
  title: string
  sub: string
  last: boolean
  mutedClass: string
  textClass: string
  identDarkMode: boolean
}) {
  const circleClass = alert
    ? 'bg-red-500 text-white'
    : done && success
      ? 'bg-green-500 text-white'
      : done
        ? 'text-white'
        : identDarkMode
          ? 'bg-stone-800 text-stone-400'
          : 'bg-[#F5F0EB] text-[#A8A29E]'
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && (
        <span
          className={cn('absolute left-[13px] top-8 h-[calc(100%-1.75rem)] w-px', identDarkMode ? 'bg-stone-800' : 'bg-[#E7E0D8]')}
          aria-hidden="true"
        />
      )}
      <span className={cn('z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', circleClass)} style={done && !alert && !success ? { backgroundColor: IDENT_COLOR } : undefined}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-[13px] font-semibold', alert ? 'text-red-700' : textClass)}>{title}</span>
          {pending && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#78716C]')}>En attente</span>}
        </span>
        <span className={cn('mt-0.5 block truncate text-xs', alert ? 'text-red-600/80' : mutedClass)}>{sub}</span>
      </span>
    </li>
  )
}

function DetailRow({
  icon,
  label,
  children,
  identDarkMode,
  avatar,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  identDarkMode: boolean
  avatar?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#6B584C]')}>
        {avatar ?? icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[11px]', identDarkMode ? 'text-stone-400' : 'text-[#78716C]')}>{label}</p>
        {children}
      </div>
    </div>
  )
}

/** Mini-carte décorative (hors-ligne friendly) : trame de rues + épingle GPS. */
function MiniMap({ lat, lon }: { lat: number; lon: number }) {
  return (
    <div className="relative mx-0 my-1 h-28 overflow-hidden rounded-xl border border-[#E7E0D8]" aria-hidden="true">
      <svg viewBox="0 0 320 112" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <rect width="320" height="112" fill="#EFEAE2" />
        <rect x="18" y="14" width="86" height="52" rx="6" fill="#E4E9DF" />
        <rect x="222" y="58" width="76" height="40" rx="6" fill="#E4E9DF" />
        <path d="M0 78 L320 64" stroke="#DCD3C6" strokeWidth="10" fill="none" />
        <path d="M0 78 L320 64" stroke="#F7F4EF" strokeWidth="1.5" strokeDasharray="8 7" fill="none" />
        <path d="M120 0 L138 112" stroke="#DCD3C6" strokeWidth="8" fill="none" />
        <path d="M232 0 L246 112" stroke="#DCD3C6" strokeWidth="6" fill="none" />
        <path d="M0 30 L320 22" stroke="#DCD3C6" strokeWidth="5" fill="none" />
        <circle cx="160" cy="56" r="22" fill="rgba(159,129,112,0.16)" />
        <path d="M160 42 c-6.6 0 -12 5.4 -12 12 c0 9 12 21 12 21 s12 -12 12 -21 c0 -6.6 -5.4 -12 -12 -12 z" fill="#9F8170" />
        <circle cx="160" cy="54.5" r="4" fill="#FFFFFF" />
      </svg>
      <span className="absolute bottom-1.5 right-2 rounded-md bg-white/85 px-1.5 py-0.5 font-mono text-[9px] text-[#6B584C]">
        {lat.toFixed(4)}, {lon.toFixed(4)}
      </span>
    </div>
  )
}
