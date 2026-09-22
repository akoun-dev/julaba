'use client'

/**
 * MODE-976 (AUDIT-007 G3/G10) — FICHE MEMBRE drill-down : le premier
 * sous-écran de détail de l'espace coopérative (l'AUDIT-007 constatait
 * que l'union coop ne comptait que 7 routes de 1ᵉʳ niveau — aucun
 * drill-down, contrairement au BO et à ses 39 écrans).
 *
 *  - la fiche lit le membre depuis `membres` par `membreSelectionneId`
 *    (persisté — G10 : le retour matériel Android ne perd plus le
 *    contexte) ; données réelles du dernier chargement, aucune invention ;
 *  - actions contextuelles par statut (mêmes actions du store que la
 *    liste : valider, refuser, chef de groupe, suspendre, réactiver,
 *    exclure) — un motif de 3-200 caractères reste requis pour les
 *    sanctions (traçabilité, pattern de la liste) ;
 *  - retour explicite vers la liste (bouton + navigation) : la fiche est
 *    un sous-écran, elle ne vit jamais sous les doigts sans issue.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect, useState } from 'react'
import {
  ArrowLeft, BadgeCheck, Building2, ChevronRight, Crown, Phone,
  ShieldCheck, ShieldOff, Trash2, UserCheck, UserX, UserRound,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type MembreCoop } from '@/lib/stores/cooperative-store'
import { ScoreRing } from '@/components/ui/score-ring'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CoopScreenShell } from './coop-shell'
import { CoopEmptyState, CoopSkeleton, messageDecisionCoop } from './coop-ui'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

const STATUT_LIBELLE: Record<MembreCoop['statut'], string> = {
  actif: 'Membre actif',
  suspendu: 'Membre suspendu',
  en_attente: 'Adhésion en attente',
  exclu: 'Membre exclu',
}

const STATUT_COULEUR: Record<MembreCoop['statut'], string> = {
  actif: '#15803D',
  suspendu: '#B45309',
  en_attente: '#B45309',
  exclu: '#78716C',
}

function initialesDu(membre: MembreCoop): string {
  const p = membre.prenom?.trim()?.[0] ?? ''
  const n = membre.nom?.trim()?.[0] ?? ''
  return (p + n).toUpperCase() || 'M'
}

export function CoopMembreDetailScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const membreSelectionneId = useCooperativeStore((s) => s.membreSelectionneId)
  const membres = useCooperativeStore((s) => s.membres)
  const cooperative = useCooperativeStore((s) => s.cooperative)
  const loading = useCooperativeStore((s) => s.loading)
  const changerStatutMembre = useCooperativeStore((s) => s.changerStatutMembre)
  const changerRoleMembre = useCooperativeStore((s) => s.changerRoleMembre)
  const exclureMembre = useCooperativeStore((s) => s.exclureMembre)
  const selectionnerMembre = useCooperativeStore((s) => s.selectionnerMembre)
  const chargerEspaceCooperateur = useCooperativeStore((s) => s.chargerEspaceCooperateur)

  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sanction, setSanction] = useState<{ statut: 'suspendu' | 'exclu' } | null>(null)
  const [motif, setMotif] = useState('')
  const [erreurMotif, setErreurMotif] = useState(false)

  // Chargement sectionné : la fiche n'a besoin ni du stock ni des besoins.
  useEffect(() => {
    if (merchantId) void chargerEspaceCooperateur(merchantId, ['membres', 'resume'])
  }, [merchantId, chargerEspaceCooperateur])

  const membre = membres.find((m) => m.id === membreSelectionneId) ?? null

  const annoncer = (texte: string) => {
    setMessage(texte)
    window.setTimeout(() => setMessage(null), 4000)
  }

  const retourListe = () => {
    selectionnerMembre(null)
    navigate('coop-membres')
  }

  const appliquerStatut = async (statut: MembreCoop['statut'], motifValue?: string) => {
    if (!merchantId || !membre) return
    setBusy(true)
    try {
      const statutSync = await changerStatutMembre(merchantId, membre.id, statut, motifValue)
      annoncer(
        messageDecisionCoop(
          statutSync,
          statut === 'actif' ? 'Membre réactivé.' : statut === 'suspendu' ? 'Membre suspendu.' : 'Membre exclu.',
        ),
      )
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const refuserDemande = async () => {
    if (!merchantId || !membre) return
    setBusy(true)
    try {
      const statutSync = await exclureMembre(merchantId, membre.id)
      annoncer(messageDecisionCoop(statutSync, 'Demande refusée.'))
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const changerRole = async () => {
    if (!merchantId || !membre) return
    const nouveauRole = membre.role === 'president' ? 'membre' : 'president'
    setBusy(true)
    try {
      const statutSync = await changerRoleMembre(merchantId, membre.id, nouveauRole)
      annoncer(messageDecisionCoop(statutSync, nouveauRole === 'president' ? 'Promu chef de groupe.' : 'Redevenu membre.'))
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const confirmerSanction = async () => {
    const motifTrim = motif.trim()
    if (!sanction) return
    if (motifTrim.length < 3) {
      setErreurMotif(true)
      return
    }
    await appliquerStatut(sanction.statut, motifTrim)
    setSanction(null)
    setMotif('')
    setErreurMotif(false)
  }

  // Le retour (bouton ou goBack) sans fiche identifiable → repli honnête :
  // la liste des membres, jamais un écran blanc.
  if (!loading && !membre) {
    return (
      <CoopScreenShell>
        <header className="px-4 pt-5 pb-2">
          <h1 className="text-xl font-bold text-stone-900">Fiche membre</h1>
        </header>
        <div className="px-4 mt-2">
          <CoopEmptyState
            icon={UserRound}
            title="Fiche indisponible"
            description="Ce membre n'apparaît plus dans la liste (adhésion retirée ou données rechargées)."
            action={
              <button
                onClick={retourListe}
                className="rounded-full px-4 py-2 text-xs font-semibold text-white min-h-[44px]"
                style={{ backgroundColor: COOP_COLOR }}
              >
                Retour aux membres
              </button>
            }
          />
        </div>
      </CoopScreenShell>
    )
  }

  if (!membre) {
    return (
      <CoopScreenShell>
        <div className="px-4 mt-5"><CoopSkeleton lignes={5} /></div>
      </CoopScreenShell>
    )
  }

  return (
    <CoopScreenShell>
      {/* En-tête de sous-écran : retour explicite (le shell n'a pas de bouton
          retour — c'est la fiche qui porte son issue) */}
      <header className="px-2 pt-3 pb-1 flex items-center gap-1">
        <button
          onClick={retourListe}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-900/5 shrink-0"
          aria-label="Retour à la liste des membres"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-stone-900 truncate">Fiche membre</h1>
        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" aria-hidden="true" />
        <p className="text-sm text-stone-600 truncate">
          {membre.prenom ?? 'Marchand'} {membre.nom ?? ''}
        </p>
      </header>

      {message && (
        <p role="status" className="mx-4 mt-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      )}

      {/* Identité */}
      <section className="px-4 mt-3" aria-label="Identité du membre">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{ backgroundColor: `${COOP_COLOR}15`, color: COOP_COLOR }}
                aria-hidden="true"
              >
                {initialesDu(membre)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-stone-900 truncate">
                  {membre.prenom ?? 'Marchand'} {membre.nom ?? ''}
                </p>
                <p className="text-xs text-stone-500 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {membre.telephone ?? 'Numéro inconnu'}
                </p>
              </div>
              <ScoreRing score={membre.scoreJulaba?.score ?? 0} taille={52} epaisseur={5} />
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: `${STATUT_COULEUR[membre.statut]}15`, color: STATUT_COULEUR[membre.statut] }}
              >
                {STATUT_LIBELLE[membre.statut]}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: `${COOP_COLOR}12`, color: COOP_COLOR }}
              >
                {membre.role === 'president' ? 'Chef de groupe' : 'Membre'}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Faits réels : cotisations, adhésion, coopérative */}
      <section className="px-4 mt-3 grid grid-cols-1 gap-3" aria-label="Informations d'adhésion">
        <Card>
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">Cotisations cumulées</p>
              <p className="text-sm font-semibold text-stone-900">
                {membre.totalCotisations.toLocaleString('fr-FR')} FCFA
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">Cotisation courante</p>
              <p className="text-sm font-medium flex items-center gap-1">
                {membre.cotisationPayee ? (
                  <>
                    <BadgeCheck className="w-4 h-4 text-green-600" />
                    <span className="text-green-700">à jour</span>
                  </>
                ) : (
                  <span className="text-amber-700">non payée</span>
                )}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">Membre depuis</p>
              <p className="text-sm font-medium text-stone-900">
                {membre.dateAdhesion
                  ? new Date(membre.dateAdhesion).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">Coopérative</p>
              <p className="text-sm font-medium text-stone-900 flex items-center gap-1 min-w-0">
                <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: COOP_COLOR }} />
                <span className="truncate">{cooperative?.nom ?? '—'}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Actions contextuelles par statut — mêmes actions que la liste */}
      <section className="px-4 mt-4" aria-label="Actions sur ce membre">
        <h2 className="text-sm font-semibold text-stone-700 px-1 mb-2">Actions</h2>
        <div className="space-y-2">
          {membre.statut === 'en_attente' && (
            <>
              <button
                onClick={() => void appliquerStatut('actif')}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-white min-h-[48px] disabled:opacity-50"
                style={{ backgroundColor: COOP_COLOR }}
              >
                <UserCheck className="w-4 h-4" />
                Accepter l&apos;adhésion
              </button>
              <button
                onClick={() => void refuserDemande()}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-3 py-3 text-sm font-medium text-red-800 min-h-[48px] hover:bg-red-50 disabled:opacity-50"
              >
                <UserX className="w-4 h-4" />
                Refuser la demande
              </button>
            </>
          )}
          {membre.statut === 'actif' && (
            <>
              <button
                onClick={() => void changerRole()}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-sm font-medium text-stone-800 min-h-[48px] hover:bg-muted disabled:opacity-50"
              >
                <Crown className="w-4 h-4" style={{ color: COOP_COLOR }} />
                {membre.role === 'president' ? 'Rétrograder en membre' : 'Promouvoir chef de groupe'}
              </button>
              <button
                onClick={() => { setMotif(''); setErreurMotif(false); setSanction({ statut: 'suspendu' }) }}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 px-3 py-3 text-sm font-medium text-amber-800 min-h-[48px] hover:bg-amber-50 disabled:opacity-50"
              >
                <ShieldOff className="w-4 h-4" />
                Suspendre (motif requis)
              </button>
              <button
                onClick={() => { setMotif(''); setErreurMotif(false); setSanction({ statut: 'exclu' }) }}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-3 py-3 text-sm font-medium text-red-800 min-h-[48px] hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Exclure de la coopérative
              </button>
            </>
          )}
          {membre.statut === 'suspendu' && (
            <>
              <button
                onClick={() => void appliquerStatut('actif')}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-green-400 px-3 py-3 text-sm font-medium text-green-800 min-h-[48px] hover:bg-green-50 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                Réactiver
              </button>
              <button
                onClick={() => { setMotif(''); setErreurMotif(false); setSanction({ statut: 'exclu' }) }}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-3 py-3 text-sm font-medium text-red-800 min-h-[48px] hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Exclure de la coopérative
              </button>
            </>
          )}
          {membre.statut === 'exclu' && (
            <p className="text-xs text-stone-400 px-1">
              Ce membre est exclu — aucune action disponible depuis la fiche.
            </p>
          )}
        </div>
      </section>

      {/* Modal sanction (motif obligatoire — même contrat que la liste) */}
      <AlertDialog open={sanction !== null} onOpenChange={(open) => { if (!open) { setSanction(null); setMotif(''); setErreurMotif(false) } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sanction?.statut === 'suspendu' ? 'Suspendre ce membre ?' : 'Exclure ce membre ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Un motif de 3 à 200 caractères est requis — une sanction sans pourquoi n&apos;est pas traçable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={motif}
            onChange={(e) => { setMotif(e.target.value); setErreurMotif(false) }}
            placeholder="Motif (ex : cotisations impayées depuis 3 mois)"
            aria-label="Motif de la sanction"
            maxLength={200}
          />
          {erreurMotif && <p className="text-xs text-red-600">Le motif est requis (3 caractères minimum).</p>}
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: sanction?.statut === 'suspendu' ? '#b45309' : '#b91c1c' }}
              onClick={(e) => { e.preventDefault(); void confirmerSanction() }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CoopScreenShell>
  )
}
